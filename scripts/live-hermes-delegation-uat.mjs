import WebSocket from 'ws';

const origin = process.env.HERMES_SERVE_URL;
const username = process.env.HERMES_SERVE_USERNAME;
const password = process.env.HERMES_SERVE_PASSWORD;
const interruptFirst = process.env.HERMES_DELEGATION_INTERRUPT === '1';
const prompt = process.argv.slice(2).join(' ') || 'Use the delegate tool to ask one subagent to calculate 2 + 2. Wait for the subagent, then reply exactly: delegation verified.';

if (!origin || !username || !password) throw new Error('HERMES_SERVE_URL, HERMES_SERVE_USERNAME, and HERMES_SERVE_PASSWORD are required.');

const login = await fetch(new URL('/auth/password-login', origin), {
  method: 'POST',
  headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ provider: 'basic', username, password }),
  signal: AbortSignal.timeout(15_000)
});
if (!login.ok) throw new Error(`Serve login failed (${login.status}).`);
const cookie = login.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
const minted = await fetch(new URL('/api/auth/ws-ticket', origin), { method: 'POST', headers: { accept: 'application/json', cookie }, signal: AbortSignal.timeout(15_000) });
if (!minted.ok) throw new Error(`Ticket mint failed (${minted.status}).`);
const { ticket } = await minted.json();
if (typeof ticket !== 'string') throw new Error('Serve returned an invalid ticket.');

const websocketUrl = new URL('/api/ws', origin);
websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
websocketUrl.searchParams.set('ticket', ticket);

const result = await new Promise((resolve, reject) => {
  const socket = new WebSocket(websocketUrl, { origin });
  let nextId = 0;
  let sessionId = '';
  let pollTimer;
  let maxActive = 0;
  let observedParentLink = false;
  let interruptRequested = false;
  let interruptFound = false;
  const statuses = new Set();
  const eventTypes = new Set();
  const timer = setTimeout(() => finish(new Error('Timed out waiting for Hermes delegation UAT.')), 240_000);
  const send = (method, params) => {
    const id = ++nextId;
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    return id;
  };
  const createId = { value: 0 };
  const interruptIds = new Set();
  const statusIds = new Set();

  function finish(error, value) {
    clearTimeout(timer);
    if (pollTimer) clearTimeout(pollTimer);
    socket.close();
    if (error) reject(error); else resolve(value);
  }

  function poll() {
    if (socket.readyState !== WebSocket.OPEN) return;
    statusIds.add(send('delegation.status', {}));
    pollTimer = setTimeout(poll, 350);
  }

  socket.once('open', () => { createId.value = send('session.create', { cols: 96, source: 'companion-delegation-uat', profile: 'default' }); });
  socket.on('message', (raw) => {
    for (const line of raw.toString().split(/\r?\n/).filter(Boolean)) {
      const frame = JSON.parse(line);
      if (frame.id === createId.value) {
        if (frame.error) return finish(new Error(frame.error.message || 'session.create failed'));
        sessionId = frame.result?.session_id ?? '';
        if (!sessionId) return finish(new Error('session.create returned no session id.'));
        send('prompt.submit', { session_id: sessionId, text: prompt });
        poll();
        continue;
      }
      if (statusIds.has(frame.id)) {
        statusIds.delete(frame.id);
        if (frame.error) return finish(new Error(frame.error.message || 'delegation.status failed'));
        const active = Array.isArray(frame.result?.active) ? frame.result.active : [];
        maxActive = Math.max(maxActive, active.length);
        observedParentLink ||= active.some((item) => typeof item?.parent_id === 'string' && item.parent_id.length > 0);
        for (const item of active) if (typeof item?.status === 'string') statuses.add(item.status);
        if (interruptFirst && !interruptRequested && typeof active[0]?.subagent_id === 'string') {
          interruptRequested = true;
          interruptIds.add(send('subagent.interrupt', { subagent_id: active[0].subagent_id }));
        }
        continue;
      }
      if (interruptIds.has(frame.id)) {
        interruptIds.delete(frame.id);
        if (frame.error) return finish(new Error(frame.error.message || 'subagent.interrupt failed'));
        interruptFound ||= frame.result?.found === true;
        continue;
      }
      if (frame.error) return finish(new Error(frame.error.message || 'Hermes RPC failed.'));
      if (frame.method !== 'event') continue;
      const event = frame.params ?? {};
      if (event.session_id && event.session_id !== sessionId) continue;
      eventTypes.add(event.type);
      if (event.type === 'message.complete') finish(null, {
        loginStatus: login.status,
        ticketStatus: minted.status,
        websocket: 'connected',
        sessionCreated: true,
        maxActiveSubagents: maxActive,
        observedParentLink,
        interruptRequested,
        interruptFound,
        statuses: [...statuses],
        completed: true,
        eventTypes: [...eventTypes]
      });
      if (event.type === 'error') finish(new Error(event.payload?.message || 'Hermes emitted an error.'));
    }
  });
  socket.once('error', (error) => finish(error));
});

if (result.maxActiveSubagents < 1) throw new Error(`Hermes completed without exposing an active delegated child. Events: ${result.eventTypes.join(', ')}`);
if (interruptFirst && !result.interruptFound) throw new Error('Hermes did not confirm the live subagent interrupt.');
console.log(JSON.stringify(result, null, 2));
