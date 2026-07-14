import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import type { GatewayConnection } from '@hermes-companion/contracts';
import { CompanionRepository } from '../apps/desktop/src/lib/server/companion-repository';
import { HermesRunCoordinator } from '../apps/desktop/src/lib/server/hermes-run-coordinator';

const servers: WebSocketServer[] = [];
const coordinators: HermesRunCoordinator[] = [];

afterEach(async () => {
  for (const coordinator of coordinators.splice(0)) coordinator.dispose();
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

const waitFor = async (assertion: () => void | Promise<void>) => {
  const started = Date.now();
  while (true) {
    try { await assertion(); return; }
    catch (error) {
      if (Date.now() - started > 2_500) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
};

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-run-coordinator-'));
  const file = join(directory, 'state.json');
  const repository = new CompanionRepository(file);
  const worktree = {
    connectionId: 'railway', profileId: 'code', projectId: 'project-1', worktreeId: 'worktree-1',
    path: join(directory, 'worktree'), branch: 'codex/run-one', threadId: 'thread-1',
    parentWorktreeId: null, writerRunId: null, createdAt: new Date().toISOString()
  };
  await repository.addWorktree(worktree);
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('WebSocket server did not bind.');
  const connection: GatewayConnection = {
    id: 'railway', name: 'Railway', description: '', kind: 'local', url: 'http://127.0.0.1:8642',
    controlUrl: null, serveUrl: null, serveWsUrl: `ws://127.0.0.1:${address.port}`,
    bridgeUrl: null, hermesProfileId: 'code'
  };
  return { directory, file, repository, worktree, server, connection };
}

describe('Hermes run coordinator', () => {
  it('creates one durable coding session, submits once, and releases the writer once on completion', async () => {
    const { file, repository, worktree, server, connection } = await fixture();
    const received: Array<{ method: string; params: Record<string, unknown> }> = [];
    server.on('connection', (socket: WebSocket) => socket.on('message', (raw) => {
      const request = JSON.parse(raw.toString()) as { id: string; method: string; params: Record<string, unknown> };
      received.push({ method: request.method, params: request.params });
      if (request.method === 'session.create') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'transport-one', stored_session_id: 'durable-one', messages: [] } }));
      } else if (request.method === 'prompt.submit') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'streaming' } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'transport-one', payload: { text: 'Done' } } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'transport-one', payload: { text: 'Done' } } }));
      }
    }));
    const notify = vi.fn(async () => undefined);
    const coordinator = new HermesRunCoordinator(repository, { notify, reconnectDelaysMs: [0] });
    coordinators.push(coordinator);
    const run = await coordinator.start({
      harness: 'hermes', prompt: 'Implement the unique task',
      worktree: { projectId: worktree.projectId, worktreeId: worktree.worktreeId, path: worktree.path, branch: worktree.branch }
    }, connection);

    await waitFor(async () => {
      expect((await coordinator.events(run.id, 0, connection)).status).toBe('completed');
      expect((await repository.listWorktrees())[0].writerRunId).toBeNull();
    });
    expect(received.filter((item) => item.method === 'session.create')).toHaveLength(1);
    expect(received.filter((item) => item.method === 'prompt.submit')).toEqual([{
      method: 'prompt.submit', params: { session_id: 'transport-one', text: 'Implement the unique task' }
    }]);
    const persisted = await readFile(file, 'utf8');
    expect(persisted).toContain('durable-one');
    expect(persisted).not.toContain('transport-one');
    expect(persisted).not.toContain('Implement the unique task');
    expect(JSON.parse(persisted).audit.filter((item: { action: string }) => item.action === 'writer.released')).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('rehydrates after coordinator loss without replaying the prompt and routes approval through the new transport', async () => {
    const { file, repository, worktree, server, connection } = await fixture();
    let connections = 0;
    let prompts = 0;
    const approvalSessions: string[] = [];
    server.on('connection', (socket: WebSocket) => {
      connections += 1;
      const connectionNumber = connections;
      socket.on('message', (raw) => {
        const request = JSON.parse(raw.toString()) as { id: string; method: string; params: Record<string, unknown> };
        if (connectionNumber === 1 && request.method === 'session.create') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'transport-old', stored_session_id: 'durable-recover', messages: [] } }));
        } else if (connectionNumber === 1 && request.method === 'prompt.submit') {
          prompts += 1;
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'streaming' } }));
        } else if (connectionNumber === 2 && request.method === 'session.resume') {
          socket.send(JSON.stringify({
            jsonrpc: '2.0', id: request.id,
            result: {
              session_id: 'transport-current', resumed: 'durable-recover', running: true,
              messages: [
                { role: 'user', text: 'Implement safely' },
                { role: 'assistant', tool_calls: [{ id: 'tool-once', function: { name: 'terminal', arguments: '{"command":"verify"}' } }] },
                { role: 'tool', tool_call_id: 'tool-once', content: 'verified' }
              ],
              inflight: { user: 'Implement safely', assistant: 'Working', streaming: true }
            }
          }));
          setTimeout(() => socket.send(JSON.stringify({
            jsonrpc: '2.0', method: 'event',
            params: { type: 'approval.request', session_id: 'transport-current', payload: { description: 'Run verification', allow_permanent: false } }
          })), 5);
        } else if (connectionNumber === 2 && request.method === 'approval.respond') {
          approvalSessions.push(String(request.params.session_id));
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { resolved: 1 } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'transport-current', payload: { text: ' done' } } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'transport-current', payload: { text: 'Working done' } } }));
        }
      });
    });
    const first = new HermesRunCoordinator(repository, { notify: async () => undefined, reconnectDelaysMs: [0] });
    coordinators.push(first);
    const run = await first.start({
      harness: 'hermes', prompt: 'Implement safely',
      worktree: { projectId: worktree.projectId, worktreeId: worktree.worktreeId, path: worktree.path, branch: worktree.branch }
    }, connection);
    await waitFor(() => expect(prompts).toBe(1));
    first.dispose();
    coordinators.splice(coordinators.indexOf(first), 1);

    const second = new HermesRunCoordinator(repository, { notify: async () => undefined, reconnectDelaysMs: [0] });
    coordinators.push(second);
    expect(await second.activeForWorktree(worktree.worktreeId, connection)).toMatchObject({ id: run.id, status: 'running' });
    await waitFor(async () => expect(await second.pendingApprovals(connection)).toHaveLength(1));
    await second.approve(run.id, 'once', connection);
    await waitFor(async () => {
      expect((await second.events(run.id, 0, connection)).status).toBe('completed');
      expect((await repository.listWorktrees())[0].writerRunId).toBeNull();
    });
    await waitFor(async () => {
      const state = JSON.parse(await readFile(file, 'utf8'));
      expect(state.audit.filter((item: { action: string }) => item.action === 'writer.released')).toHaveLength(1);
    });

    expect(prompts).toBe(1);
    expect(approvalSessions).toEqual(['transport-current']);
    const recovered = await second.events(run.id, 0, connection);
    expect(recovered.events.filter((item) => item.event.type === 'tool' && item.event.tool.id === 'tool-once')).toHaveLength(1);
    const persisted = await readFile(file, 'utf8');
    expect(persisted).toContain('durable-recover');
    expect(persisted).not.toContain('transport-old');
    expect(persisted).not.toContain('transport-current');
    expect(persisted).not.toContain('Implement safely');
    expect(JSON.parse(persisted).audit.filter((item: { action: string }) => item.action === 'writer.released')).toHaveLength(1);
  });
});
