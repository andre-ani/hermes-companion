import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import httpProxy from 'http-proxy';
import { WebSocketServer, type WebSocket } from 'ws';
import { DefaultCompanionBridge } from './bridge.js';

const host = process.env.BRIDGE_HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? process.env.BRIDGE_PORT ?? 9130);
const token = process.env.BRIDGE_TOKEN ?? '';
if (token.length < 32) throw new Error('BRIDGE_TOKEN must contain at least 32 characters.');

const bridge = new DefaultCompanionBridge();
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true, xfwd: true });
// Hermes validates Host against its container bind. Keep Railway's existing
// forwarded scheme/host headers intact, but present the private upstream as
// the direct HTTP Host.
const hermesProxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true, xfwd: false });
const sockets = new WebSocketServer({ noServer: true });
const hermesUpstream = process.env.HERMES_UPSTREAM?.replace(/\/$/, '') ?? '';

const hermesReady = async () => {
  if (!hermesUpstream) return true;
  try {
    const response = await fetch(`${hermesUpstream}/api/auth/providers`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(2_000)
    });
    return response.ok;
  } catch {
    return false;
  }
};

const authorized = (request: IncomingMessage) => {
  const provided = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const left = Buffer.from(provided); const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
};
const reply = (response: ServerResponse, status: number, value?: unknown, headers: Record<string, string> = {}) => {
  response.writeHead(status, { ...(value === undefined ? {} : { 'content-type': 'application/json' }), 'cache-control': 'no-store', ...headers });
  response.end(value === undefined ? undefined : JSON.stringify(value));
};
const body = async (request: IncomingMessage) => { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 1024 * 1024) throw new Error('Request body exceeded 1 MB.'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); };

const mcpTools = [
  { name: 'companion_worktree_list', description: 'List Companion-owned worktrees, optionally for one opaque project ID.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } } } },
  { name: 'companion_file_list', description: 'List files confined to an opaque Companion worktree ID.', inputSchema: { type: 'object', required: ['worktreeId'], properties: { worktreeId: { type: 'string' }, path: { type: 'string' } } } },
  { name: 'companion_file_read', description: 'Read a text file confined to an opaque Companion worktree ID.', inputSchema: { type: 'object', required: ['worktreeId', 'path'], properties: { worktreeId: { type: 'string' }, path: { type: 'string' } } } },
  { name: 'companion_file_write', description: 'Write a text file confined to an opaque Companion worktree ID.', inputSchema: { type: 'object', required: ['worktreeId', 'path', 'content'], properties: { worktreeId: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' } } } },
  { name: 'companion_git_status', description: 'Read Git status for an opaque Companion worktree ID.', inputSchema: { type: 'object', required: ['worktreeId'], properties: { worktreeId: { type: 'string' } } } },
  { name: 'companion_git_diff', description: 'Read the unified Git diff for an opaque Companion worktree ID.', inputSchema: { type: 'object', required: ['worktreeId'], properties: { worktreeId: { type: 'string' }, cached: { type: 'boolean' } } } }
] as const;

const mcpEnvelope = (name: string, args: Record<string, unknown>) => {
  const action = name.replace(/^companion_/, '').replaceAll('_', '.');
  const capability = action.startsWith('file.') ? 'files' : action.startsWith('git.') ? 'git' : 'worktrees';
  return { version: 'v1', requestId: crypto.randomUUID(), capability, payload: { action, ...args } };
};
const mcpSessions = new Set<string>();
const mcpReply = (id: unknown, result?: unknown, error?: string) => ({ jsonrpc: '2.0', id, ...(error ? { error: { code: -32602, message: error } } : { result }) });
async function handleMcp(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'GET') return reply(response, 405, { error: 'Server-initiated SSE is not supported.' }, { allow: 'POST, DELETE' });
  if (request.method === 'DELETE') {
    const sessionId = String(request.headers['mcp-session-id'] ?? '');
    if (sessionId) mcpSessions.delete(sessionId);
    return reply(response, 204);
  }
  if (request.method !== 'POST') return reply(response, 405, { error: 'Method not allowed.' }, { allow: 'POST, DELETE' });
  const message = await body(request) as { id?: unknown; method?: string; params?: Record<string, unknown> };
  if (message.method === 'initialize') {
    const requestedVersion = typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '2025-06-18';
    const sessionId = crypto.randomUUID();
    mcpSessions.add(sessionId);
    return reply(response, 200, mcpReply(message.id, {
      protocolVersion: requestedVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'hermes-companion-bridge', version: '0.1.0' },
      instructions: 'Use Companion tools for opaque worktree file and Git operations. Paths are always relative to a Companion worktree.'
    }), { 'mcp-session-id': sessionId });
  }
  if (message.method?.startsWith('notifications/')) return reply(response, 202);
  const sessionId = String(request.headers['mcp-session-id'] ?? '');
  if (sessionId && !mcpSessions.has(sessionId)) return reply(response, 404, { error: 'MCP session not found.' });
  if (message.method === 'ping') return reply(response, 200, mcpReply(message.id, {}));
  if (message.method === 'tools/list') return reply(response, 200, mcpReply(message.id, { tools: mcpTools }));
  if (message.method === 'tools/call') {
    const name = String(message.params?.name ?? ''); const args = message.params?.arguments && typeof message.params.arguments === 'object' ? message.params.arguments as Record<string, unknown> : {};
    if (!mcpTools.some((tool) => tool.name === name)) return reply(response, 200, mcpReply(message.id, undefined, 'Unknown Companion MCP tool.'));
    const data = await bridge.handle(mcpEnvelope(name, args));
    return reply(response, 200, mcpReply(message.id, { content: [{ type: 'text', text: JSON.stringify(data) }] }));
  }
  return reply(response, 200, mcpReply(message.id, undefined, 'Method not found.'));
}

const previewRoute = (request: IncomingMessage) => new URL(request.url ?? '/', 'http://bridge').pathname.match(/^\/preview\/([0-9a-f-]{36})(\/.*)?$/i);
const cookieToken = (request: IncomingMessage, id: string) => request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`preview_${id}=`))?.split('=')[1];

async function handlePreview(request: IncomingMessage, response: ServerResponse, match: RegExpMatchArray) {
  const id = match[1]; const lease = await bridge.store.getPreview(id);
  if (!lease || Date.parse(lease.expiresAt) <= Date.now()) return reply(response, 404, { error: 'Preview lease expired or missing.' });
  const url = new URL(request.url ?? '/', 'http://bridge'); const access = url.searchParams.get('token') ?? cookieToken(request, id);
  if (access !== lease.accessToken) return reply(response, 401, { error: 'Preview authorization required.' });
  if (url.searchParams.has('token')) { url.searchParams.delete('token'); response.writeHead(302, { location: `${url.pathname}${url.search}`, 'set-cookie': `preview_${id}=${lease.accessToken}; HttpOnly; SameSite=Strict; Path=/preview/${id}/; Max-Age=${Math.max(1, Math.floor((Date.parse(lease.expiresAt) - Date.now()) / 1000))}` }); return response.end(); }
  request.url = `${match[2] || '/'}${url.search}`; proxy.web(request, response, { target: lease.origin }, (error: Error) => reply(response, 502, { error: error.message }));
}

const server = createServer(async (request, response) => {
  try {
    const preview = previewRoute(request); if (preview) return handlePreview(request, response, preview);
    if (request.url === '/healthz') {
      const ready = await hermesReady();
      return reply(response, ready ? 200 : 503, { status: ready ? 'ok' : 'starting', version: 'v1' });
    }
    if (request.url === '/mcp' || request.url === '/v1/capability') {
      if (!authorized(request)) return reply(response, 404, { error: 'Not found.' });
      if (request.url === '/mcp') return handleMcp(request, response);
      if (request.method === 'POST') return reply(response, 200, { ok: true, data: await bridge.handle(await body(request)) });
      return reply(response, 405, { error: 'Method not allowed.' }, { allow: 'POST' });
    }
    if (hermesUpstream) return hermesProxy.web(request, response, { target: hermesUpstream });
    return reply(response, 404, { error: 'Not found.' });
  } catch (error) { return reply(response, 400, { ok: false, error: error instanceof Error ? error.message : 'Bridge capability failed.' }); }
});

sockets.on('connection', (socket: WebSocket) => {
  socket.on('message', async (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>; const type = String(message.type ?? '');
      if (type === 'open') { const terminal = await bridge.terminals.open({ worktreeId: String(message.worktreeId), cols: Number(message.cols ?? 100), rows: Number(message.rows ?? 30), shell: typeof message.shell === 'string' ? message.shell : undefined }); bridge.terminals.attach(terminal.terminalId, socket); socket.send(JSON.stringify({ type: 'opened', ...terminal })); }
      else if (type === 'attach') bridge.terminals.attach(String(message.terminalId), socket);
      else if (type === 'input') bridge.terminals.write(String(message.terminalId), String(message.data ?? ''));
      else if (type === 'resize') bridge.terminals.resize(String(message.terminalId), Number(message.cols), Number(message.rows));
      else if (type === 'close') bridge.terminals.close(String(message.terminalId));
      else throw new Error('Unknown PTY message type.');
    } catch (error) { socket.send(JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'PTY request failed.' })); }
  });
});

server.on('upgrade', async (request, socket, head) => {
  const preview = previewRoute(request);
  if (preview) {
    const lease = await bridge.store.getPreview(preview[1]); const url = new URL(request.url ?? '/', 'http://bridge'); const access = url.searchParams.get('token') ?? cookieToken(request, preview[1]);
    if (!lease || access !== lease.accessToken || Date.parse(lease.expiresAt) <= Date.now()) return socket.destroy();
    request.url = preview[2] || '/'; return proxy.ws(request, socket, head, { target: lease.origin });
  }
  if (new URL(request.url ?? '/', 'http://bridge').pathname === '/v1/pty') {
    if (!authorized(request)) return socket.destroy();
    return sockets.handleUpgrade(request, socket, head, (websocket) => sockets.emit('connection', websocket, request));
  }
  if (hermesUpstream) return hermesProxy.ws(request, socket, head, { target: hermesUpstream });
  return socket.destroy();
});

proxy.on('error', (error: Error) => console.error('[bridge] preview proxy error', error));
hermesProxy.on('error', (error: Error) => console.error('[bridge] Hermes proxy error', error));
server.listen(port, host, () => console.log(`[bridge] listening on http://${host}:${port}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
