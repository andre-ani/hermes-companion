import { execFile, spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import electron from 'electron';
import { WebSocketServer } from 'ws';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = process.env.HERMES_COMPANION_UAT_REPORT_DIR || join(desktop, 'uat-artifacts', process.platform);
const stateDir = await mkdtemp(join(tmpdir(), 'hermes-companion-uat-'));
const execFileAsync = promisify(execFile);
const repositoryDir = await mkdtemp(join(tmpdir(), 'hermes-companion-repo-'));
const worktreeDir = join(stateDir, 'worktrees', 'uat-thread');
const remoteDir = join(stateDir, 'uat-origin.git');
const fakeBin = join(stateDir, 'bin');
await execFileAsync('git', ['init', '-b', 'main', repositoryDir]);
await execFileAsync('git', ['-C', repositoryDir, 'config', 'user.name', 'Hermes Companion UAT']);
await execFileAsync('git', ['-C', repositoryDir, 'config', 'user.email', 'uat@example.invalid']);
await writeFile(join(repositoryDir, 'README.md'), '# Electron UAT\n');
await execFileAsync('git', ['-C', repositoryDir, 'add', 'README.md']);
await execFileAsync('git', ['-C', repositoryDir, 'commit', '-m', 'Initial fixture']);
await execFileAsync('git', ['init', '--bare', remoteDir]);
await execFileAsync('git', ['-C', repositoryDir, 'remote', 'add', 'origin', remoteDir]);
await execFileAsync('git', ['-C', repositoryDir, 'push', '-u', 'origin', 'main']);
await rm(join(dirname(repositoryDir), '.hermes-worktrees', 'uat-project'), { recursive: true, force: true });
await mkdir(fakeBin, { recursive: true });
await writeFile(join(fakeBin, 'gh'), '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo "gh version 2.0.0"\n  exit 0\nfi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then\n  exit 0\nfi\nif [ "$1" = "pr" ] && [ "$2" = "view" ]; then\n  echo "{\\"number\\":1,\\"title\\":\\"UAT draft pull request\\",\\"url\\":\\"https://github.example.test/hermes-companion/uat/pull/1\\",\\"state\\":\\"OPEN\\",\\"isDraft\\":true,\\"reviewDecision\\":null}"\n  exit 0\nfi\nif [ "$1" = "pr" ] && [ "$2" = "create" ]; then\n  echo "https://github.example.test/hermes-companion/uat/pull/1"\n  exit 0\nfi\necho "unsupported gh invocation" >&2\nexit 1\n');
await chmod(join(fakeBin, 'gh'), 0o755);
const port = await new Promise((resolve, reject) => { const server = createNetServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); const value = typeof address === 'object' && address ? address.port : 0; server.close((error) => error ? reject(error) : resolve(value)); }); });

const session = {
  id: 'uat-session', title: 'Implement preview relay', model: 'hermes-3-pro',
  started_at: '2026-07-11T09:00:00.000Z', last_active: '2026-07-11T10:00:00.000Z',
  message_count: 2, archived: false
};
let createdSessionCount = 0;
const dashboardSessionToken = 'uat-dashboard-session-token-1234';
const serveSocket = new WebSocketServer({ port: 0, host: '127.0.0.1' });
await new Promise((resolve, reject) => { serveSocket.once('listening', resolve); serveSocket.once('error', reject); });
const serveAddress = serveSocket.address();
if (!serveAddress || typeof serveAddress === 'string') throw new Error('Could not start the Hermes Serve UAT fixture.');
serveSocket.on('connection', (socket) => socket.on('message', (raw) => {
  const request = JSON.parse(raw.toString());
  if (request.method !== 'session.context_breakdown') return socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { message: 'Unsupported UAT Serve method.' } }));
  socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { context_max: 128000, context_used: 32000, context_percent: 25, estimated_total: 42000, model: 'hermes-3-pro', categories: [{ id: 'conversation', label: 'Conversation', tokens: 18000 }, { id: 'tools', label: 'Tool output', tokens: 14000 }] } }));
}));
const mockHermes = createHttpServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://hermes-uat');
  const reply = (status, value) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
  if (url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return response.end(`<script>window.__HERMES_SESSION_TOKEN__=${JSON.stringify(dashboardSessionToken)};</script>`); }
  if (url.pathname === '/uat/browser') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return response.end('<!doctype html><html><body>Isolated browser fixture</body></html>'); }
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/sessions') && !['/api/status', '/api/config/defaults', '/api/config/schema', '/api/model/info'].includes(url.pathname) && request.headers['x-hermes-session-token'] !== dashboardSessionToken) return reply(401, { detail: 'Invalid dashboard session token' });
  if (url.pathname === '/v1/capabilities') return reply(200, {
    object: 'hermes.api_server.capabilities', platform: 'hermes-agent',
    features: { chat_completions: true, session_resources: true, session_chat_streaming: true },
    endpoints: {
      health: { method: 'GET', path: '/health' }, models: { method: 'GET', path: '/v1/models' },
      chat_completions: { method: 'POST', path: '/v1/chat/completions' }, sessions: { method: 'GET', path: '/api/sessions' },
      session_chat_stream: { method: 'POST', path: '/api/sessions/{id}/chat' }, jobs: { method: 'GET', path: '/api/jobs' }
    },
    runtime: { mode: 'hermes', tool_execution: 'hermes', split_runtime: false }
  });
  if (url.pathname === '/health') return reply(200, { status: 'ok' });
  if (url.pathname === '/v1/models') return reply(200, { object: 'list', data: [{ id: 'hermes-3-pro', name: 'Hermes 3 Pro', provider: 'Hermes' }] });
  if (request.method === 'GET' && url.pathname === '/api/sessions') return reply(200, { object: 'list', data: [session] });
  if (request.method === 'GET' && url.pathname === '/api/sessions/search') return reply(200, { object: 'list', results: [
    { session_id: 'uat-session', lineage_root: null, model: 'hermes-3-pro', role: 'assistant', snippet: 'Preview relay search result', source: 'history', session_started: '2026-07-11T09:00:00.000Z' }
  ] });
  if (request.method === 'POST' && url.pathname === '/api/sessions') { createdSessionCount += 1; const id = createdSessionCount === 1 ? 'uat-created-session' : `uat-created-session-${createdSessionCount}`; return reply(200, { object: 'hermes.session', session: {
    id, title: 'New thread', model: 'hermes-3-pro', started_at: '2026-07-11T10:02:00.000Z', last_active: '2026-07-11T10:02:00.000Z', message_count: 0, archived: false
  } }); }
  if (url.pathname === '/api/sessions/uat-session/messages') return reply(200, {
    object: 'list', session_id: 'uat-session', data: [
      { id: 'uat-message-1', role: 'user', content: 'Inspect the authenticated preview relay and confirm worktree isolation.', timestamp: '2026-07-11T09:58:00.000Z' },
      { id: 'uat-message-2', role: 'assistant', content: 'The preview lease is scoped to this worktree. I am validating the relay and browser session boundary now.', timestamp: '2026-07-11T10:00:00.000Z', reasoning: 'Checking lease authorization and isolated Electron session behavior.' }
    ]
  });
  if (request.method === 'POST' && url.pathname === '/api/sessions/uat-session/chat') return reply(200, {
    session_id: 'uat-session', message: {
      id: 'uat-message-3', role: 'assistant',
      content: 'Confirmed: this session remains bound to its isolated preview relay and worktree.',
      timestamp: '2026-07-11T10:01:00.000Z'
    }
  });
  if (url.pathname === '/api/sessions/uat-created-session/messages') return reply(200, { object: 'list', session_id: 'uat-created-session', data: [] });
  if (/^\/api\/sessions\/uat-created-session-\d+\/messages$/.test(url.pathname)) return reply(200, { object: 'list', session_id: url.pathname.split('/').at(-2), data: [] });
  if (url.pathname === '/api/model/options') return reply(200, { providers: [
    { slug: 'openai-codex', name: 'OpenAI Codex', configured: true, models: ['gpt-5.4', 'gpt-5.3-codex'] },
    { slug: 'anthropic', name: 'Anthropic', configured: false, models: ['claude-opus-4-6', 'claude-sonnet-4-6'] }
  ] });
  if (url.pathname === '/api/providers/oauth') return reply(200, { providers: [
    { id: 'openai-codex', name: 'OpenAI Codex', flow: 'pkce', status: { logged_in: true, source_label: 'Codex subscription' }, disconnectable: true },
    { id: 'anthropic', name: 'Anthropic', flow: 'device', status: { logged_in: false }, disconnectable: true }
  ] });
  if (url.pathname === '/api/providers/oauth/anthropic/start') return reply(200, {
    flow: 'device_code', session_id: 'uat-oauth-session', user_code: 'HERM-4821', expires_in: 900, poll_interval: 30
  });
  if (url.pathname === '/api/providers/oauth/anthropic/poll/uat-oauth-session') return reply(200, { status: 'pending' });
  if (url.pathname === '/api/config/schema') return reply(200, { fields: {
    'model.default': { type: 'string', category: 'models', description: 'Default Hermes model for new sessions.' },
    'model.openai_runtime': { type: 'select', category: 'models', options: ['native', 'codex'], description: 'Hermes-owned OpenAI execution runtime.' }
  } });
  if (url.pathname === '/api/config') return reply(200, { model: { default: 'gpt-5.4', openai_runtime: 'native' }, approvals: { mode: 'ask' } });
  if (url.pathname === '/api/config/defaults') return reply(200, { model: { default: 'hermes-3-pro', openai_runtime: 'native' } });
  if (url.pathname === '/api/model/info') return reply(200, { provider: 'openai-codex', model: 'gpt-5.4' });
  if (url.pathname === '/api/status') return reply(200, { version: '0.9.0-uat', gateway_running: true, auth_required: false });
  if (url.pathname === '/api/webhooks') return reply(200, {
    enabled: true, base_url: 'https://gateway.example.test', subscriptions: [{
      name: 'github-pr-review', description: 'Review pull requests from GitHub.', events: ['pull_request'], deliver: 'log', deliver_only: false,
      prompt: 'Review this pull request and summarize risks.', script: '', skills: ['code-review'], created_at: '2026-07-11T10:00:00Z',
      url: 'https://gateway.example.test/webhooks/github-pr-review', secret_set: true, enabled: true
    }]
  });
  if (url.pathname.startsWith('/api/')) return reply(200, { status: 'ok', data: [], items: [], results: [] });
  return reply(404, { error: 'Not found' });
});
await new Promise((resolve, reject) => { mockHermes.once('error', reject); mockHermes.listen(0, '127.0.0.1', resolve); });
const mockAddress = mockHermes.address();
if (!mockAddress || typeof mockAddress === 'string') throw new Error('Could not start the Hermes UAT fixture.');
const mockHermesUrl = `http://127.0.0.1:${mockAddress.port}`;
await writeFile(join(stateDir, 'state.json'), JSON.stringify({
  version: 1,
  activeConnectionId: 'default',
  connections: [{ id: 'default', name: 'Hermes', kind: 'local', url: mockHermesUrl, controlUrl: mockHermesUrl, serveWsUrl: `ws://127.0.0.1:${serveAddress.port}`, bridgeUrl: null, hermesProfileId: null }],
  projects: [{ id: 'uat-project', name: 'Electron UAT', repositoryPath: repositoryDir, remoteUrl: null, defaultBranch: 'main', connectionId: 'default' }],
  worktrees: [], runs: [], annotations: [], previews: [], audit: []
}, null, 2));

const child = spawn(electron, [desktop], { cwd: desktop, stdio: 'inherit', env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}`, HERMES_COMPANION_UAT: '1', HERMES_COMPANION_UAT_REPORT_DIR: reportDir, HERMES_COMPANION_UAT_BROWSER_URL: `${mockHermesUrl}/uat/browser`, HERMES_COMPANION_UAT_REPOSITORY: repositoryDir, HERMES_COMPANION_UAT_WORKTREE: worktreeDir, HERMES_COMPANION_RENDERER_URL: `http://127.0.0.1:${port}`, HERMES_API_URL: `http://127.0.0.1:${port}`, HERMES_CONTROL_URL: mockHermesUrl, HERMES_SERVE_WS_URL: `ws://127.0.0.1:${serveAddress.port}`, COMPANION_DATA_DIR: stateDir } });
const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1)); }); clearTimeout(timer);
await new Promise((resolve) => mockHermes.close(resolve));
await new Promise((resolve) => serveSocket.close(resolve));
const report = JSON.parse(await readFile(join(reportDir, 'report.json'), 'utf8'));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (exitCode !== 0 || report.ok !== true) process.exitCode = 1;
