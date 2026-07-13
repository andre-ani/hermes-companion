import WebSocket from 'ws';

const origin = process.env.HERMES_SERVE_URL;
const username = process.env.HERMES_SERVE_USERNAME;
const password = process.env.HERMES_SERVE_PASSWORD;
const prompt = process.argv.slice(2).join(' ') || 'Reply with exactly: Hermes remote stream verified.';

if (!origin || !username || !password) {
  throw new Error('HERMES_SERVE_URL, HERMES_SERVE_USERNAME, and HERMES_SERVE_PASSWORD are required.');
}

const login = await fetch(new URL('/auth/password-login', origin), {
  method: 'POST',
  headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ provider: 'basic', username, password }),
  signal: AbortSignal.timeout(15_000)
});
if (!login.ok) throw new Error(`Serve login failed (${login.status}).`);

const cookie = login.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
const minted = await fetch(new URL('/api/auth/ws-ticket', origin), {
  method: 'POST', headers: { accept: 'application/json', cookie }, signal: AbortSignal.timeout(15_000)
});
if (!minted.ok) throw new Error(`Ticket mint failed (${minted.status}).`);
const ticketPayload = await minted.json();
if (typeof ticketPayload.ticket !== 'string') throw new Error('Serve returned an invalid ticket.');

const websocketUrl = new URL('/api/ws', origin);
websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
websocketUrl.searchParams.set('ticket', ticketPayload.ticket);

const result = await new Promise((resolve, reject) => {
  const socket = new WebSocket(websocketUrl, { origin });
  let sessionId = '';
  let messageDeltas = 0;
  let reasoningDeltas = 0;
  let toolEvents = 0;
  const eventTypes = new Set();
  const timer = setTimeout(() => {
    socket.terminate();
    reject(new Error(`Timed out waiting for Hermes stream (session ${sessionId || 'not-created'}).`));
  }, 180_000);
  const send = (id, method, params) => socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));

  socket.once('open', () => send(1, 'session.create', { cols: 96, source: 'companion-uat' }));
  socket.on('message', (raw) => {
    for (const line of raw.toString().split(/\r?\n/).filter(Boolean)) {
      const frame = JSON.parse(line);
      if (frame.id === 1) {
        if (frame.error) return reject(new Error(frame.error.message || 'session.create failed'));
        sessionId = frame.result?.session_id ?? '';
        if (!sessionId) return reject(new Error('session.create returned no session id.'));
        send(2, 'prompt.submit', { session_id: sessionId, text: prompt });
        continue;
      }
      if (frame.error) return reject(new Error(frame.error.message || 'Hermes RPC failed.'));
      if (frame.method !== 'event') continue;
      const event = frame.params ?? {};
      if (event.session_id && event.session_id !== sessionId) continue;
      eventTypes.add(event.type);
      if (event.type === 'message.delta') messageDeltas += 1;
      if (event.type === 'reasoning.delta' || event.type === 'thinking.delta') reasoningDeltas += 1;
      if (String(event.type).startsWith('tool.')) toolEvents += 1;
      if (event.type === 'message.complete') {
        clearTimeout(timer);
        socket.close();
        resolve({
          loginStatus: login.status,
          ticketStatus: minted.status,
          websocket: 'connected',
          sessionCreated: true,
          promptAccepted: true,
          messageDeltas,
          reasoningDeltas,
          toolEvents,
          completed: true,
          eventTypes: [...eventTypes]
        });
      }
      if (event.type === 'error') {
        clearTimeout(timer);
        socket.close();
        reject(new Error(event.payload?.message || 'Hermes emitted an error.'));
      }
    }
  });
  socket.once('error', (error) => { clearTimeout(timer); reject(error); });
  socket.once('close', () => {
    if (!eventTypes.has('message.complete')) {
      clearTimeout(timer);
      reject(new Error('Hermes WebSocket closed before message completion.'));
    }
  });
});

console.log(JSON.stringify(result, null, 2));
