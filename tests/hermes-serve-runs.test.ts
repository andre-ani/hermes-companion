import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocketServer } from 'ws';
import { CompanionRepository } from '../apps/desktop/src/lib/server/companion-repository';
import { HermesRpcSocket, HermesServeRunManager } from '../apps/desktop/src/lib/server/hermes-serve-runs';

const { invokeNative, bridgeInvoke, bridgeClient } = vi.hoisted(() => {
  const bridgeInvoke = vi.fn().mockResolvedValue({ ok: true });
  return { invokeNative: vi.fn().mockResolvedValue({ ok: true }), bridgeInvoke, bridgeClient: { invoke: bridgeInvoke } };
});
vi.mock('../apps/desktop/src/lib/server/native-client.js', () => ({ invokeNative }));
vi.mock('../apps/desktop/src/lib/server/bridge-client.js', () => ({ getBridgeClient: () => bridgeClient }));

const servers: WebSocketServer[] = [];

afterEach(async () => {
  invokeNative.mockClear();
  bridgeInvoke.mockClear();
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('HermesServeRunManager', () => {
  it('resolves a fresh WebSocket URL for every physical reconnect', async () => {
    const observedUrls: string[] = [];
    const states: string[] = [];
    let ticket = 0;
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket, request) => {
      observedUrls.push(request.url ?? '');
      if (observedUrls.length === 1) setTimeout(() => socket.terminate(), 25);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    const transport = new HermesRpcSocket(
      async () => `ws://127.0.0.1:${address.port}/api/ws?ticket=fresh-${++ticket}`,
      () => undefined,
      { reconnectDelaysMs: [0], onReconnect: async () => undefined, onStateChange: (state) => states.push(state) }
    );

    await transport.connect();
    await vi.waitFor(() => {
      expect(observedUrls).toEqual(['/api/ws?ticket=fresh-1', '/api/ws?ticket=fresh-2']);
      expect(transport.transportState()).toBe('connected');
    });
    expect(states).toEqual(expect.arrayContaining(['connecting', 'connected', 'reconnecting']));
    transport.close();
  });

  it('uses the Hermes serve RPC contract and releases the worktree writer after approval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-serve-run-'));
    const repository = new CompanionRepository(join(directory, 'state.json'));
    await repository.addWorktree({
      projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/one',
      threadId: 'thread-1', writerRunId: null, createdAt: new Date().toISOString()
    });
    const durableRelease = repository.releaseWriter.bind(repository);
    const releaseWriter = vi.spyOn(repository, 'releaseWriter');
    releaseWriter.mockRejectedValueOnce(new Error('temporary state write failure')).mockImplementation(durableRelease);

    const received: Array<{ method: string; params: Record<string, unknown> }> = [];
    let authorization: string | undefined;
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket, request) => {
      authorization = request.headers.authorization;
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: number; method: string; params: Record<string, unknown> };
        received.push({ method: request.method, params: request.params });
        if (request.method === 'session.create') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'session-1' } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'session.info', session_id: 'session-1', payload: {} } }));
        } else if (request.method === 'prompt.submit') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'ok' } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'session-1', payload: { text: 'Working' } } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'approval.request', session_id: 'session-1', payload: { command: 'git commit', description: 'Create commit', allow_permanent: false } } }));
        } else if (request.method === 'approval.respond') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { resolved: 1 } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'session-1', payload: { text: 'Working done' } } }));
        }
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');

    const manager = new HermesServeRunManager(repository);
    const run = await manager.start({
      harness: 'hermes', prompt: 'Implement the task',
      worktree: { projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/one' }
    }, {
      id: 'gateway-1', name: 'Hermes', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null, serveUrl: null,
      serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: null
    }, 'test-token');

    expect(received[0]).toEqual({ method: 'session.create', params: { cols: 96, cwd: join(directory, 'worktree'), source: 'desktop', profile: 'default' } });
    expect(authorization).toBeUndefined();
    expect(received[1]).toEqual({ method: 'prompt.submit', params: { session_id: 'session-1', text: 'Implement the task' } });
    await vi.waitFor(() => expect(manager.pendingApprovals()).toHaveLength(1));
    expect(manager.events(run.id).events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: expect.objectContaining({ type: 'text', text: 'Working' }) }),
      expect.objectContaining({ event: expect.objectContaining({ type: 'approval', allowPermanent: false, nativeFallback: false }) })
    ]));
    expect(manager.pendingApprovals()).toEqual([expect.objectContaining({ runId: run.id, worktreeId: 'worktree-1', allowPermanent: false })]);
    await vi.waitFor(() => expect(invokeNative).toHaveBeenCalledWith('notification.show', {
      title: 'Hermes approval required', body: 'thread/one · Create commit'
    }));

    await manager.approve(run.id, 'once');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received.at(-1)).toEqual({ method: 'approval.respond', params: { session_id: 'session-1', choice: 'once' } });
    expect(manager.events(run.id).status).toBe('completed');
    expect(manager.pendingApprovals()).toEqual([]);
    await vi.waitFor(async () => {
      expect(releaseWriter).toHaveBeenCalledTimes(2);
      const worktrees = await repository.listWorktrees();
      expect(worktrees[0].writerRunId).toBeNull();
    });
  });

  it('omits worktree path from session.create for remote write isolation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-serve-run-remote-'));
    const repository = new CompanionRepository(join(directory, 'state.json'));
    await repository.addWorktree({
      projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/one',
      threadId: 'thread-1', writerRunId: null, createdAt: new Date().toISOString()
    });

    const received: Array<{ method: string; params: Record<string, unknown> }> = [];
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: number; method: string; params: Record<string, unknown> };
        received.push({ method: request.method, params: request.params });
        if (request.method === 'session.create') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'session-1' } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'session.info', session_id: 'session-1', payload: {} } }));
        } else if (request.method === 'prompt.submit') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'ok' } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'session-1', payload: { text: 'done' } } }));
        }
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');

    const manager = new HermesServeRunManager(repository);
    const run = await manager.start({
      harness: 'hermes', prompt: 'Implement the task',
      worktree: { projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/one' }
    }, {
      id: 'gateway-remote-1', name: 'Hermes', kind: 'remote', url: 'http://127.0.0.1:8642', controlUrl: null, serveUrl: null,
      serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: null
    }, 'test-token');

    expect(received[0]).toEqual({
      method: 'session.create',
      params: { cols: 96, source: 'desktop', profile: 'default' }
    });
    expect(received[1]).toEqual({ method: 'prompt.submit', params: { session_id: 'session-1', text: 'Implement the task' } });
    expect(bridgeInvoke).not.toHaveBeenCalled();
    await vi.waitFor(async () => {
      expect(manager.events(run.id).status).toBe('completed');
      const worktrees = await repository.listWorktrees();
      expect(worktrees[0].writerRunId).toBeNull();
    });
  });

  it('recovers a running coding turn with the stable owner and without replaying its prompt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-serve-reconnect-'));
    const repository = new CompanionRepository(join(directory, 'state.json'));
    await repository.addWorktree({
      projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/reconnect',
      threadId: 'thread-1', writerRunId: null, createdAt: new Date().toISOString()
    });
    let connectionCount = 0;
    let promptCount = 0;
    let resumeCount = 0;
    let resumeParams: Record<string, unknown> | null = null;
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => {
      connectionCount += 1;
      const connectionNumber = connectionCount;
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: number; method: string; params: Record<string, unknown> };
        if (connectionNumber === 1 && request.method === 'session.create') {
          socket.send(JSON.stringify({
            jsonrpc: '2.0', id: request.id,
            result: {
              session_id: 'coding-transport-1', stored_session_id: 'coding-stable', info: {}, message_count: 2,
              messages: [{ role: 'user', text: 'Old coding prompt' }, { role: 'assistant', text: 'Old coding answer' }]
            }
          }));
        } else if (connectionNumber === 1 && request.method === 'prompt.submit') {
          promptCount += 1;
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'coding-transport-1', payload: { text: 'Work' } } }));
          setTimeout(() => socket.terminate(), 10);
        } else if (connectionNumber === 2 && request.method === 'session.resume') {
          resumeCount += 1;
          resumeParams ??= request.params;
          if (resumeCount > 1) {
            socket.send(JSON.stringify({
              jsonrpc: '2.0', id: request.id,
              result: {
                session_id: 'coding-transport-2', session_key: 'coding-stable', running: false, message_count: 4,
                messages: [
                  { role: 'user', text: 'Old coding prompt' }, { role: 'assistant', text: 'Old coding answer' },
                  { role: 'user', text: 'Implement safely' }, { role: 'assistant', text: 'Working done' }
                ]
              }
            }));
            return;
          }
          socket.send(JSON.stringify({
            jsonrpc: '2.0', id: request.id,
            result: {
              session_id: 'coding-transport-2', session_key: 'coding-stable', running: true, message_count: 2,
              messages: [{ role: 'user', text: 'Old coding prompt' }, { role: 'assistant', text: 'Old coding answer' }],
              inflight: { user: 'Implement safely', assistant: 'Working', streaming: true }
            }
          }));
        }
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    const manager = new HermesServeRunManager(repository, { reconnectDelaysMs: [0, 5], recoveryProbeMs: 10 });
    const run = await manager.start({
      harness: 'hermes', prompt: 'Implement safely',
      worktree: { projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/reconnect' }
    }, {
      id: 'gateway-owner', name: 'Hermes', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null, serveUrl: null,
      serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: 'hermes-code'
    });

    expect((await repository.listWorktrees())[0].writerRunId).toBe(run.id);
    await vi.waitFor(async () => {
      expect(manager.events(run.id).status).toBe('completed');
      expect((await repository.listWorktrees())[0].writerRunId).toBeNull();
    });
    const recoveredText = manager.events(run.id).events
      .filter((item) => item.event.type === 'text')
      .map((item) => item.event.type === 'text' ? item.event.text : '')
      .join('');
    expect(recoveredText).toBe('Working done');
    expect(promptCount).toBe(1);
    expect(connectionCount).toBe(2);
    expect(resumeParams).toEqual({ session_id: 'coding-stable', cols: 96, profile: 'hermes-code' });
  });

  it('fails terminally and releases the coding writer when reconnect attempts are exhausted', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-serve-exhausted-'));
    const repository = new CompanionRepository(join(directory, 'state.json'));
    await repository.addWorktree({
      projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/exhausted',
      threadId: 'thread-1', writerRunId: null, createdAt: new Date().toISOString()
    });
    let connectionCount = 0;
    let promptCount = 0;
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => {
      connectionCount += 1;
      const connectionNumber = connectionCount;
      if (connectionNumber > 1) {
        setTimeout(() => socket.terminate(), 5);
        return;
      }
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: number; method: string };
        if (request.method === 'session.create') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'exhausted-transport', stored_session_id: 'exhausted-stable', info: {} } }));
        } else if (request.method === 'prompt.submit') {
          promptCount += 1;
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'streaming' } }));
          setTimeout(() => socket.terminate(), 10);
        }
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    const manager = new HermesServeRunManager(repository, { reconnectDelaysMs: [0, 5], connectTimeoutMs: 100 });
    const run = await manager.start({
      harness: 'hermes', prompt: 'Do not replay me',
      worktree: { projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/exhausted' }
    }, {
      id: 'gateway-exhausted', name: 'Hermes', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null, serveUrl: null,
      serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: 'default'
    });

    await vi.waitFor(async () => {
      expect(manager.events(run.id).status).toBe('failed');
      expect((await repository.listWorktrees())[0].writerRunId).toBeNull();
    });
    const failedEvents = manager.events(run.id).events.filter((item) => item.event.type === 'status' && item.event.status === 'failed');
    expect(failedEvents).toHaveLength(1);
    expect(promptCount).toBe(1);
    expect(connectionCount).toBeGreaterThan(1);
    expect(invokeNative.mock.calls.filter(([method, payload]) => method === 'notification.show' && (payload as { title?: string }).title === 'Hermes run failed')).toHaveLength(1);
  });
});
