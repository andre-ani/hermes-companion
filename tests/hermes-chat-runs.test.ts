import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { setActiveHermesClient } from '../apps/desktop/src/lib/server/hermes-client';
import { cancelHermesChatTurn, cancelHermesSessionTurn, getHermesChatTurnRecovery, nextHermesChatTurn, respondHermesChatApproval, startHermesChatTurn } from '../apps/desktop/src/lib/server/hermes-chat-runs';

const servers: WebSocketServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('Hermes chat streaming', () => {
  it('keeps replaceable Hermes thinking status separate from cumulative model reasoning', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    let createParams: Record<string, unknown> | null = null;
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => socket.on('message', (raw) => {
      const request = JSON.parse(raw.toString()) as { id: number; method: string; params: Record<string, unknown> };
      if (request.method === 'session.create') {
        createParams = request.params;
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'session-live' } }));
      } else if (request.method === 'prompt.submit') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'ok' } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'thinking.delta', session_id: 'session-live', payload: { text: 'Checking' } } }));
        setTimeout(() => {
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'reasoning.delta', session_id: 'session-live', payload: { text: 'Considering' } } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'thinking.delta', session_id: 'session-live', payload: { text: '' } } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'session-live', payload: { text: 'Hello ' } } }));
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'session-live', payload: { text: 'Hello world' } } }));
        }, 20);
      }
    }));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    setActiveHermesClient({
      id: 'chat-test', name: 'Hermes', description: '', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null,
      serveUrl: null, serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: null
    });

    const requestId = crypto.randomUUID();
    let snapshot = await startHermesChatTurn({ requestId, message: 'Say hello', model: 'test/model', modelProvider: 'openrouter', cwd: '/remote/project' });
    snapshot = await nextHermesChatTurn(requestId, snapshot.sequence);
    expect(snapshot.message.thinkingStatus).toBe('Checking');
    expect(snapshot.message.reasoning).toBeNull();
    while (snapshot.status === 'streaming') snapshot = await nextHermesChatTurn(requestId, snapshot.sequence);

    expect(snapshot.status).toBe('completed');
    expect(snapshot.sessionId).toBe('session-live');
    expect(snapshot.message.text).toBe('Hello world');
    expect(snapshot.message.reasoning).toBe('Considering');
    expect(snapshot.message.thinkingStatus).toBeNull();
    expect(snapshot.sequence).toBeGreaterThanOrEqual(4);
    expect(createParams).toMatchObject({ source: 'desktop', model: 'test/model', provider: 'openrouter', cwd: '/remote/project' });
  });

  it('recovers a persisted assistant response when completion arrives without visible text', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => socket.on('message', (raw) => {
      const request = JSON.parse(raw.toString()) as { id: number; method: string; params: Record<string, unknown> };
      if (request.method === 'session.create') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'transport-live', stored_session_id: 'stored-session' } }));
      } else if (request.method === 'prompt.submit') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'ok' } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'transport-live', payload: { status: 'complete' } } }));
      } else if (request.method === 'session.resume') {
        expect(request.params).toMatchObject({ session_id: 'stored-session' });
        socket.send(JSON.stringify({
          jsonrpc: '2.0', id: request.id,
          result: { session_id: 'transport-live', messages: [{ role: 'user', text: 'Inspect image' }, { role: 'assistant', text: 'Recovered visual response' }] }
        }));
      }
    }));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    setActiveHermesClient({
      id: 'chat-recovery-test', name: 'Hermes', description: '', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null,
      serveUrl: null, serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: null
    });

    const requestId = crypto.randomUUID();
    let snapshot = await startHermesChatTurn({ requestId, message: 'Inspect image' });
    while (snapshot.status === 'streaming') snapshot = await nextHermesChatTurn(requestId, snapshot.sequence);

    expect(snapshot.status).toBe('completed');
    expect(snapshot.sessionId).toBe('stored-session');
    expect(snapshot.message.text).toBe('Recovered visual response');
  });

  it('keeps an intentional stop cancelled when Hermes emits interruption before acknowledging it', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => socket.on('message', (raw) => {
      const request = JSON.parse(raw.toString()) as { id: number; method: string };
      if (request.method === 'session.create') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'stop-race' } }));
      } else if (request.method === 'prompt.submit') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'ok' } }));
      } else if (request.method === 'session.interrupt') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'stop-race', payload: { status: 'interrupted' } } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { interrupted: true } }));
      }
    }));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    setActiveHermesClient({
      id: 'chat-stop-test', name: 'Hermes', description: '', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null,
      serveUrl: null, serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: null
    });

    const requestId = crypto.randomUUID();
    const initial = await startHermesChatTurn({ requestId, message: 'Keep working' });
    await expect(cancelHermesChatTurn(requestId)).resolves.toBe(true);
    const stopped = await nextHermesChatTurn(requestId, initial.sequence);

    expect(stopped.status).toBe('cancelled');
    expect(stopped.error).toBeNull();
    expect(stopped.message.generation).toMatchObject({ status: 'cancelled', error: null });
  });

  it('keeps foreground approvals on the same Hermes turn and resumes after a response', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    let approvalChoice = '';
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => socket.on('message', (raw) => {
      const request = JSON.parse(raw.toString()) as { id: number; method: string; params?: Record<string, unknown> };
      if (request.method === 'session.create') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'approval-live' } }));
      } else if (request.method === 'prompt.submit') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'ok' } }));
        setTimeout(() => socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'approval.request', session_id: 'approval-live', payload: { id: 'approval-1', description: 'Run git init', allow_permanent: true } } })), 10);
      } else if (request.method === 'approval.respond') {
        approvalChoice = String(request.params?.choice ?? '');
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { resolved: 1 } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'tool.start', session_id: 'approval-live', payload: { tool_id: 'tool-1', name: 'terminal', args: { command: 'git init' } } } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'tool.complete', session_id: 'approval-live', payload: { tool_id: 'tool-1', name: 'terminal', result: 'Initialized' } } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'approval-live', payload: { text: 'PROJECT_READY' } } }));
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'approval-live', payload: { status: 'complete' } } }));
      }
    }));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    setActiveHermesClient({
      id: 'chat-approval-test', name: 'Hermes', description: '', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null,
      serveUrl: null, serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: null
    });

    const requestId = crypto.randomUUID();
    let snapshot = await startHermesChatTurn({ requestId, message: 'Create the project' });
    while (!snapshot.approval) snapshot = await nextHermesChatTurn(requestId, snapshot.sequence);
    expect(snapshot.approval).toEqual({ id: 'approval-1', summary: 'Run git init', allowPermanent: true });

    snapshot = await respondHermesChatApproval(requestId, 'once');
    expect(snapshot.approval).toBeNull();
    while (snapshot.status === 'streaming') snapshot = await nextHermesChatTurn(requestId, snapshot.sequence);
    expect(approvalChoice).toBe('once');
    expect(snapshot.status).toBe('completed');
    expect(snapshot.message.text).toBe('PROJECT_READY');
    expect(snapshot.message.toolCalls).toEqual([expect.objectContaining({ id: 'tool-1', name: 'terminal', status: 'complete', result: 'Initialized' })]);
  });

  it('resumes the captured profile and current turn without replaying the prompt', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    let connectionCount = 0;
    let promptCount = 0;
    let resumeCount = 0;
    let resumedParams: Record<string, unknown> | null = null;
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
              session_id: 'transport-1', stored_session_id: 'stable-session', message_count: 2,
              messages: [{ role: 'user', text: 'Old prompt' }, { role: 'assistant', text: 'Old answer' }]
            }
          }));
        } else if (connectionNumber === 1 && request.method === 'prompt.submit') {
          promptCount += 1;
          socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'transport-1', payload: { text: 'Work' } } }));
          setActiveHermesClient({
            id: 'different-owner', name: 'Other Hermes', description: '', kind: 'remote', url: 'https://other.invalid', controlUrl: null,
            serveUrl: null, serveWsUrl: 'ws://127.0.0.1:1', bridgeUrl: null, hermesProfileId: 'other-profile'
          });
          setTimeout(() => socket.terminate(), 10);
        } else if (connectionNumber === 2 && request.method === 'session.resume') {
          resumeCount += 1;
          resumedParams ??= request.params;
          if (resumeCount > 1) {
            socket.send(JSON.stringify({
              jsonrpc: '2.0', id: request.id,
              result: {
                session_id: 'transport-2', session_key: 'stable-session', message_count: 4,
                messages: [
                  { role: 'user', text: 'Old prompt' }, { role: 'assistant', text: 'Old answer' },
                  { role: 'user', text: 'Current prompt' }, { role: 'assistant', text: 'Working complete' }
                ],
                running: false
              }
            }));
            return;
          }
          const resumed = JSON.stringify({
            jsonrpc: '2.0', id: request.id,
            result: {
              session_id: 'transport-2', session_key: 'stable-session', message_count: 2,
              messages: [{ role: 'user', text: 'Old prompt' }, { role: 'assistant', text: 'Old answer' }],
              running: true, inflight: { user: 'Current prompt', assistant: 'Working', streaming: true }
            }
          });
          const immediateDelta = JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'transport-2', payload: { text: ' complete' } } });
          socket.send(`${resumed}\n${immediateDelta}`);
        }
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    setActiveHermesClient({
      id: 'captured-owner', name: 'Hermes', description: '', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null,
      serveUrl: null, serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: 'hermes-code'
    });

    const requestId = crypto.randomUUID();
    let snapshot = await startHermesChatTurn({ requestId, message: 'Current prompt', recoveryProbeMs: 10 });
    while (snapshot.status === 'streaming') snapshot = await nextHermesChatTurn(requestId, snapshot.sequence);

    expect(snapshot.status).toBe('completed');
    expect(snapshot.message.text).toBe('Working complete');
    expect(snapshot.message.text).not.toContain('Old answer');
    expect(promptCount).toBe(1);
    expect(connectionCount).toBe(2);
    expect(resumedParams).toEqual({ session_id: 'stable-session', cols: 96, profile: 'hermes-code' });
  });

  it('recovers an owned active or just-finished turn and rejects a duplicate active response', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => socket.on('message', (raw) => {
      const request = JSON.parse(raw.toString()) as { id: number; method: string };
      if (request.method === 'session.resume') socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { session_id: 'transport-recovery', session_key: 'stable-recovery', messages: [] } }));
      else if (request.method === 'image.attach_bytes' || request.method === 'prompt.submit') socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'ok' } }));
      else if (request.method === 'session.interrupt') socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { interrupted: true } }));
    }));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    const owner = {
      id: 'recovery-owner', name: 'Hermes', description: '', kind: 'local' as const, url: 'http://127.0.0.1:8642', controlUrl: null,
      serveUrl: null, serveWsUrl: `ws://127.0.0.1:${address.port}`, bridgeUrl: null, hermesProfileId: 'hermes-code'
    };
    setActiveHermesClient(owner);

    const requestId = crypto.randomUUID();
    await startHermesChatTurn({ requestId, sessionId: 'stable-recovery', profileId: 'hermes-code', message: 'Inspect this image', attachments: [{ filename: 'screen.png', mediaType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }] });
    expect(getHermesChatTurnRecovery('stable-recovery', 'hermes-code')).toMatchObject({
      userMessage: { role: 'user', text: 'Inspect this image', attachments: [{ filename: 'screen.png', mediaType: 'image/png' }] },
      snapshot: { requestId, status: 'streaming', sessionId: 'stable-recovery' },
      baselineMessageCount: 0
    });
    expect(JSON.stringify(getHermesChatTurnRecovery('stable-recovery', 'hermes-code')?.userMessage)).not.toContain('data:image');
    expect(getHermesChatTurnRecovery('stable-recovery', 'other-profile')).toBeNull();

    await expect(startHermesChatTurn({ requestId: crypto.randomUUID(), sessionId: 'stable-recovery', profileId: 'hermes-code', message: 'Duplicate' })).rejects.toThrow('already has an active response');
    await expect(cancelHermesSessionTurn({ sessionId: 'stable-recovery', connectionId: 'other-connection', profileId: 'hermes-code' })).resolves.toBe(false);
    expect(getHermesChatTurnRecovery('stable-recovery', 'hermes-code')).toMatchObject({ snapshot: { requestId, status: 'streaming' } });
    await expect(cancelHermesSessionTurn({ sessionId: 'stable-recovery', connectionId: 'recovery-owner', profileId: 'hermes-code' })).resolves.toBe(true);
    expect(getHermesChatTurnRecovery('stable-recovery', 'hermes-code')).toBeNull();
    await expect(nextHermesChatTurn(requestId, 0)).resolves.toMatchObject({ requestId, status: 'cancelled' });

    const replacementId = crypto.randomUUID();
    await expect(startHermesChatTurn({ requestId: replacementId, sessionId: 'stable-recovery', profileId: 'hermes-code', message: 'Continue after stop' })).resolves.toMatchObject({ requestId: replacementId, status: 'streaming' });
    await cancelHermesChatTurn(replacementId);
  });
});
