import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocketServer } from 'ws';
import { CompanionRepository } from '../apps/desktop/src/lib/server/companion-repository';
import { HermesServeRunManager } from '../apps/desktop/src/lib/server/hermes-serve-runs';

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
  it('uses the Hermes serve RPC contract and releases the worktree writer after approval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-serve-run-'));
    const repository = new CompanionRepository(join(directory, 'state.json'));
    await repository.addWorktree({
      projectId: 'project-1', worktreeId: 'worktree-1', path: join(directory, 'worktree'), branch: 'thread/one',
      threadId: 'thread-1', writerRunId: null, createdAt: new Date().toISOString()
    });

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
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'session-1', payload: { text: 'Done' } } }));
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
});
