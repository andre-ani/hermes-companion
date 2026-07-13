import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { HermesClient } from '../apps/desktop/src/lib/server/hermes-client';

let server: Server | null = null;
let observedRequests: Array<{ url: string; authorization: string | null; dashboardToken: string | null }> = [];
afterEach(() => { observedRequests = []; return new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve()); });

const gateway = async (apiToken = '', controlToken = '') => {
  server = createServer((request, response) => {
    observedRequests.push({ url: request.url ?? '', authorization: typeof request.headers.authorization === 'string' ? request.headers.authorization : null, dashboardToken: typeof request.headers['x-hermes-session-token'] === 'string' ? request.headers['x-hermes-session-token'] : null });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/capabilities') return response.end(JSON.stringify({
      object: 'hermes.api_server.capabilities',
      platform: 'hermes-agent',
      runtime: { mode: 'server_agent', tool_execution: 'server', split_runtime: false },
      features: { chat_completions: true, session_resources: true, session_chat_streaming: true, run_approval_response: true, skills_api: true },
      endpoints: {
        health: { method: 'GET', path: '/health' }, models: { method: 'GET', path: '/v1/models' },
        chat_completions: { method: 'POST', path: '/v1/chat/completions' }, sessions: { method: 'GET', path: '/api/sessions' },
        session_chat_stream: { method: 'POST', path: '/api/sessions/{session_id}/chat/stream' },
        run_approval: { method: 'POST', path: '/v1/runs/{run_id}/approval' }
      }
    }));
    if (request.url === '/health') return response.end(JSON.stringify({ status: 'ok' }));
    if (request.url === '/v1/models') return response.end(JSON.stringify({ data: [{ id: 'hermes-3', owned_by: 'nous' }] }));
    if (request.url === '/api/config') return response.end(JSON.stringify(request.method === 'PUT' ? { ok: true } : { model: { provider: 'nous' } }));
    if (request.url === '/api/config/schema') return response.end(JSON.stringify({ fields: { 'model.provider': { type: 'string' } } }));
    if (request.url === '/api/profiles') return response.end(JSON.stringify({ profiles: [] }));
    if (request.url === '/api/memory') return response.end(JSON.stringify({ active: 'builtin' }));
    if (request.url === '/api/skills') return response.end(JSON.stringify([]));
    if (request.url === '/api/mcp/servers') return response.end(JSON.stringify({ servers: [] }));
    if (request.url === '/api/analytics/usage?days=1') return response.end(JSON.stringify({ totals: {} }));
    if (request.url === '/api/status') return response.end(JSON.stringify({ status: 'ok' }));
    if (request.url === '/api/logs') return response.end(JSON.stringify({ lines: [] }));
    if (request.url === '/api/env') return response.end(JSON.stringify({}));
    if (request.url === '/api/tools/toolsets') return response.end(JSON.stringify([]));
    if (request.url === '/api/tools/computer-use/status') return response.end(JSON.stringify({ ready: true }));
    if (request.url === '/api/messaging/platforms') return response.end(JSON.stringify({ platforms: [] }));
    if (request.url === '/api/learning/graph') return response.end(JSON.stringify({ nodes: [], edges: [] }));
    if (request.url === '/api/curator') return response.end(JSON.stringify({ enabled: true }));
    if (request.url === '/api/hermes/update/check') return response.end(JSON.stringify({ update_available: false }));
    if (request.url === '/api/sessions/search?q=hello&limit=12') return response.end(JSON.stringify({ results: [{ session_id: 's-1', lineage_root: 'root-1', model: 'hermes-3', role: 'assistant', snippet: 'Hello world', source: 'desktop', session_started: 123 }] }));
    if (request.url?.startsWith('/api/sessions')) {
      if (request.method === 'POST' && request.url === '/api/sessions') return response.end(JSON.stringify({ object: 'hermes.session', session: { id: 's-2', title: 'Created' } }));
      if (request.url === '/api/sessions?limit=50&offset=0') return response.end(JSON.stringify({ object: 'list', data: [{ id: 's-1', title: 'Existing', message_count: 2, started_at: '2026-07-01T10:00:00Z', last_active: '2026-07-01T11:00:00Z', needs_approval: true }] }));
      if (request.method === 'GET' && request.url === '/api/sessions/s-1?profile=code') return response.end(JSON.stringify({ id: 's-1', title: 'Renamed', profile: 'code', message_count: 2 }));
      if (request.url === '/api/sessions/s-1/messages') return response.end(JSON.stringify({ object: 'list', session_id: 's-1', data: [{ id: 'm-1', role: 'assistant', content: 'Hello', timestamp: '2026-07-01T10:30:00Z' }] }));
      if (request.url === '/api/sessions/s-1/chat') return response.end(JSON.stringify({ session_id: 's-1-child', message: { id: 'm-2', role: 'assistant', content: 'Done' } }));
      response.statusCode = 200; return response.end('{}');
    }
    response.statusCode = 404; response.end('{}');
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test gateway did not bind.');
  const url = `http://127.0.0.1:${address.port}`;
  return new HermesClient({ id: 'test', name: 'Test', kind: 'local', url, controlUrl: url, hermesProfileId: null }, apiToken, controlToken);
};

describe('HermesClient', () => {
  it('detects portable and enhanced capabilities without reading Hermes files', async () => {
    const client = await gateway();
    const status = await client.probe();
    expect(status.status).toBe('enhanced');
    expect(status.core.models).toBe(true);
    expect(status.enhanced.sessions).toBe(true);
    expect(status.enhanced.memory).toBe(true);
    expect(status.enhanced.credentials).toBe(true);
    expect(status.enhanced.toolsets).toBe(true);
    expect(status.enhanced.messaging).toBe(true);
    expect(status.compatibility).toEqual(expect.objectContaining({ mode: 'verified', compatible: true, contract: 'hermes.api_server.capabilities/v1' }));
  });

  it('normalizes sessions, messages, models, and chat replies', async () => {
    const client = await gateway();
    expect(await client.listSessions()).toEqual([expect.objectContaining({ id: 's-1', messageCount: 2, createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-01T11:00:00Z', attention: 'approval' })]);
    expect(await client.getMessages('s-1')).toEqual([expect.objectContaining({ text: 'Hello', sessionId: 's-1', createdAt: '2026-07-01T10:30:00Z' })]);
    expect(await client.listModels()).toEqual([expect.objectContaining({ id: 'hermes-3', name: 'hermes-3', provider: 'nous', source: 'hermes' })]);
    const reply = await client.sendMessage({ sessionId: 's-1', message: 'Work' });
    expect(reply.message.text).toBe('Done'); expect(reply.sessionId).toBe('s-1-child');
    expect(await client.searchSessions('hello')).toEqual([expect.objectContaining({ sessionId: 's-1', lineageRoot: 'root-1', snippet: 'Hello world' })]);
  });

  it('uses the supported authenticated Hermes paths for mutations', async () => {
    const client = await gateway('agent-secret', 'dashboard-secret');
    await expect(client.requestControl('/api/config', { method: 'PUT', body: JSON.stringify({ config: {} }) })).resolves.toEqual({ ok: true });
    await expect(client.setSessionArchived('s-1', true)).resolves.toBeUndefined();
    await expect(client.updateSession('s-1', 'Renamed', 'code')).resolves.toEqual(expect.objectContaining({ id: 's-1', title: 'Renamed', profileId: 'code' }));
    await expect(client.requestControl('/private/config')).rejects.toThrow('/api path');
    await client.listModels();
    expect(observedRequests.findLast((request) => request.url === '/api/config')?.dashboardToken).toBe('dashboard-secret');
    expect(observedRequests.findLast((request) => request.url === '/api/sessions/s-1')?.dashboardToken).toBe('dashboard-secret');
    expect(observedRequests.findLast((request) => request.url === '/api/sessions/s-1')?.authorization).toBeNull();
    expect(observedRequests.findLast((request) => request.url === '/api/config')?.authorization).toBeNull();
    expect(observedRequests.findLast((request) => request.url === '/v1/models')?.authorization).toBe('Bearer agent-secret');
  });

  it('keeps a verified control-only host available as a partial connection', async () => {
    server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/api/status') return response.end(JSON.stringify({ version: '0.9.0', gateway_running: false, auth_required: false }));
      response.statusCode = 404;
      response.end('{}');
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test control service did not bind.');
    const url = `http://127.0.0.1:${address.port}`;
    const client = new HermesClient({ id: 'control-only', name: 'Control only', kind: 'local', url, controlUrl: url, hermesProfileId: null });

    const status = await client.probe();
    expect(status.status).toBe('partial');
    expect(status.enhanced.operations).toBe(true);
    expect(status.core.health).toBe(false);
    expect(status.error).toBeNull();
  });
});
