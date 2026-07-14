import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import {
  UpstreamHermesSessionController,
  type HermesDurableSessionId,
  type HermesSessionSnapshot
} from '@hermes-companion/hermes-adapter';

const servers: WebSocketServer[] = [];
const controllers: UpstreamHermesSessionController[] = [];

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.dispose();
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

const waitFor = async (read: () => HermesSessionSnapshot, predicate: (snapshot: HermesSessionSnapshot) => boolean) => {
  const started = Date.now();
  while (!predicate(read())) {
    if (Date.now() - started > 2_000) throw new Error(`Timed out waiting for snapshot: ${JSON.stringify(read())}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return read();
};

const listen = async (handler: Parameters<WebSocketServer['on']>[1]) => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  server.on('connection', handler as never);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('WebSocket server did not bind.');
  return `ws://127.0.0.1:${address.port}`;
};

describe('upstream Hermes session controller', () => {
  it('mints a fresh socket URL, resumes by durable id, reconciles completion, and never replays a prompt', async () => {
    let connections = 0;
    let tickets = 0;
    let prompts = 0;
    const methods: string[] = [];
    const origin = await listen((socket: WebSocket) => {
      connections += 1;
      const connection = connections;
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: string; method: string; params: Record<string, unknown> };
        methods.push(`${connection}:${request.method}`);
        if (request.method === 'session.create') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'transport-1', stored_session_id: 'durable-1', messages: [] } }));
        } else if (request.method === 'prompt.submit') {
          prompts += 1;
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'ok' } }));
          setTimeout(() => socket.close(), 5);
        } else if (request.method === 'session.resume') {
          expect(request.params.session_id).toBe('durable-1');
          socket.send(JSON.stringify({
            jsonrpc: '2.0', id: request.id,
            result: {
              session_id: 'transport-2', stored_session_id: 'durable-1',
              messages: [{ role: 'user', text: 'Do the work' }, { role: 'assistant', text: 'Recovered once' }],
              info: { model: 'hermes-test', running: false }
            }
          }));
        }
      });
    });
    let snapshot!: HermesSessionSnapshot;
    const controller = new UpstreamHermesSessionController({
      profileId: 'default',
      socketProvider: { getFreshSocketUrl: async () => `${origin}?ticket=${++tickets}` },
      socketFactory: (url) => new WebSocket(url) as never,
      reconnectDelaysMs: [0]
    });
    controllers.push(controller);
    controller.subscribe((value) => { snapshot = value; });

    const durable = await controller.create({ profileId: 'default' });
    expect(durable).toBe('durable-1');
    await controller.submit({ text: 'Do the work' });
    await waitFor(() => snapshot, (value) => value.status === 'completed' && value.connectionState === 'open');

    expect(snapshot.durableSessionId).toBe('durable-1');
    expect(snapshot.assistant.text).toBe('Recovered once');
    expect(snapshot.sessionInfo).toEqual({ model: 'hermes-test', running: false });
    expect(tickets).toBe(2);
    expect(prompts).toBe(1);
    expect(methods).toEqual(['1:session.create', '1:prompt.submit', '2:session.resume']);
    expect(JSON.stringify(snapshot)).not.toContain('transport-2');
  });

  it('keeps approval and cancellation commands on the current transport session', async () => {
    const received: Array<{ method: string; params: Record<string, unknown> }> = [];
    const origin = await listen((socket: WebSocket) => {
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: string; method: string; params: Record<string, unknown> };
        received.push({ method: request.method, params: request.params });
        if (request.method === 'session.resume') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'runtime-current', resumed: 'durable-current', info: { running: true }, inflight: { streaming: true } } }));
          setTimeout(() => socket.send(JSON.stringify({
            jsonrpc: '2.0', method: 'event',
            params: { type: 'approval.request', session_id: 'runtime-current', payload: { description: 'Run command', allow_permanent: false } }
          })), 5);
        } else if (request.method === 'approval.respond') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { resolved: 1 } }));
        } else if (request.method === 'session.interrupt') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { interrupted: true } }));
        }
      });
    });
    let snapshot!: HermesSessionSnapshot;
    const controller = new UpstreamHermesSessionController({
      profileId: 'default',
      socketProvider: { getFreshSocketUrl: async () => origin },
      socketFactory: (url) => new WebSocket(url) as never,
      reconnectDelaysMs: [0]
    });
    controllers.push(controller);
    controller.subscribe((value) => { snapshot = value; });

    await controller.resume('durable-current' as HermesDurableSessionId);
    await waitFor(() => snapshot, (value) => value.status === 'awaiting-input');
    expect(snapshot.approval).toEqual({ summary: 'Run command', allowPermanent: false });
    await controller.respondApproval('once');
    await controller.interrupt();

    expect(received.find((item) => item.method === 'approval.respond')?.params).toEqual({ session_id: 'runtime-current', choice: 'once' });
    expect(received.find((item) => item.method === 'session.interrupt')?.params).toEqual({ session_id: 'runtime-current' });
    expect(snapshot.status).toBe('interrupted');
  });

  it('rehydrates the same durable session after renderer controller recreation', async () => {
    let tickets = 0;
    let resumes = 0;
    const origin = await listen((socket: WebSocket) => {
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: string; method: string; params: Record<string, unknown> };
        if (request.method !== 'session.resume') return;
        resumes += 1;
        expect(request.params.session_id).toBe('durable-reload');
        socket.send(JSON.stringify({
          jsonrpc: '2.0', id: request.id,
          result: {
            session_id: `transport-${resumes}`,
            resumed: 'durable-reload',
            info: { model: 'hermes-reload', running: false },
            messages: [{ role: 'user', content: [{ type: 'text', text: 'Persist me' }] }, { role: 'assistant', content: 'Still here' }]
          }
        }));
      });
    });
    const createController = () => {
      const controller = new UpstreamHermesSessionController({
        profileId: 'default',
        socketProvider: { getFreshSocketUrl: async () => `${origin}?ticket=${++tickets}` },
        socketFactory: (url) => new WebSocket(url) as never,
        reconnectDelaysMs: [0]
      });
      controllers.push(controller);
      return controller;
    };
    const first = createController();
    await first.resume('durable-reload' as HermesDurableSessionId);
    first.dispose();
    const second = createController();
    let snapshot!: HermesSessionSnapshot;
    second.subscribe((value) => { snapshot = value; });
    await second.resume('durable-reload' as HermesDurableSessionId);

    expect(snapshot.durableSessionId).toBe('durable-reload');
    expect(snapshot.history).toHaveLength(2);
    expect(JSON.stringify(snapshot)).not.toContain('transport-2');
    expect(tickets).toBe(2);
    expect(resumes).toBe(2);
  });

  it('does not fabricate a lost approval when the pinned runtime cannot replay it', async () => {
    let connections = 0;
    const origin = await listen((socket: WebSocket) => {
      connections += 1;
      const connection = connections;
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: string; method: string };
        if (request.method !== 'session.resume') return;
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: `runtime-${connection}`, resumed: 'durable-approval', info: { running: true }, messages: [] } }));
        if (connection === 1) setTimeout(() => {
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'approval.request', session_id: 'runtime-1', payload: { description: 'Confirm once' } } }));
          setTimeout(() => socket.close(), 5);
        }, 5);
      });
    });
    let snapshot!: HermesSessionSnapshot;
    const controller = new UpstreamHermesSessionController({
      profileId: 'default',
      socketProvider: { getFreshSocketUrl: async () => origin },
      socketFactory: (url) => new WebSocket(url) as never,
      reconnectDelaysMs: [0]
    });
    controllers.push(controller);
    controller.subscribe((value) => { snapshot = value; });
    await controller.resume('durable-approval' as HermesDurableSessionId);
    await waitFor(() => snapshot, (value) => value.approval?.summary === 'Confirm once');
    await waitFor(() => snapshot, (value) => connections === 2 && value.connectionState === 'open' && value.approval === null && value.error !== null);

    expect(snapshot.status).toBe('awaiting-input');
    expect(snapshot.approval).toBeNull();
    expect(snapshot.error).toContain('cannot replay the pending approval');
  });
});
