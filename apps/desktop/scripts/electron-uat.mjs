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
const nativeWorktreeDir = join(stateDir, 'worktrees', 'native-uat-thread');
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
await mkdir(dirname(worktreeDir), { recursive: true });
await execFileAsync('git', ['-C', repositoryDir, 'worktree', 'add', '-b', 'companion/uat-session', worktreeDir, 'HEAD']);
await rm(join(dirname(repositoryDir), '.hermes-worktrees', 'uat-project'), { recursive: true, force: true });
await mkdir(fakeBin, { recursive: true });
await writeFile(join(fakeBin, 'gh'), '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo "gh version 2.0.0"\n  exit 0\nfi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then\n  exit 0\nfi\nif [ "$1" = "pr" ] && [ "$2" = "view" ]; then\n  echo "{\\"number\\":1,\\"title\\":\\"UAT draft pull request\\",\\"url\\":\\"https://github.example.test/hermes-companion/uat/pull/1\\",\\"state\\":\\"OPEN\\",\\"isDraft\\":true,\\"reviewDecision\\":null}"\n  exit 0\nfi\nif [ "$1" = "pr" ] && [ "$2" = "create" ]; then\n  echo "https://github.example.test/hermes-companion/uat/pull/1"\n  exit 0\nfi\necho "unsupported gh invocation" >&2\nexit 1\n');
await chmod(join(fakeBin, 'gh'), 0o755);
const port = await new Promise((resolve, reject) => { const server = createNetServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); const value = typeof address === 'object' && address ? address.port : 0; server.close((error) => error ? reject(error) : resolve(value)); }); });

const session = {
  id: 'uat-session', title: 'Implement preview relay', model: 'hermes-3-pro',
  started_at: '2026-07-11T09:00:00.000Z', last_active: '2026-07-11T10:00:00.000Z',
  message_count: 2, archived: false, profile: 'default', profile_id: 'default', project_id: 'uat-project',
  cwd: worktreeDir, branch: 'companion/uat-session', kind: 'code'
};
const secondarySession = {
  id: 'uat-secondary-session', title: 'Verify session restoration', model: 'hermes-3-pro',
  started_at: '2026-07-11T08:00:00.000Z', last_active: '2026-07-11T08:30:00.000Z',
  message_count: 2, archived: false, profile: 'default', profile_id: 'default', kind: 'chat'
};
const unavailableSession = {
  id: 'uat-unavailable-session', title: 'Recover unavailable history', model: 'hermes-3-pro',
  started_at: '2026-07-11T07:00:00.000Z', last_active: '2026-07-11T07:30:00.000Z',
  message_count: 2, archived: false, profile: 'default', profile_id: 'default', kind: 'chat'
};
let unavailableSessionDeleted = false;
let createdSessionCount = 0;
const dashboardSessionToken = 'uat-dashboard-session-token-1234';
const serveSocket = new WebSocketServer({ port: 0, host: '127.0.0.1' });
await new Promise((resolve, reject) => { serveSocket.once('listening', resolve); serveSocket.once('error', reject); });
const serveAddress = serveSocket.address();
if (!serveAddress || typeof serveAddress === 'string') throw new Error('Could not start the Hermes Serve UAT fixture.');
serveSocket.on('connection', (socket) => socket.on('message', (raw) => {
  const request = JSON.parse(raw.toString());
  const reply = (result) => socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  if (request.method === 'session.resume') {
    const sessionId = request.params?.session_id;
    if (sessionId === 'uat-unavailable-session') {
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { message: 'History fixture unavailable.' } }));
      return;
    }
    if (sessionId === 'uat-secondary-session') return reply({ session_id: sessionId, messages: [
      { id: 'uat-secondary-message-1', role: 'user', content: 'Keep this session layout independent.', timestamp: '2026-07-11T08:28:00.000Z' },
      { id: 'uat-secondary-message-2', role: 'assistant', content: 'This session starts with its own closed workspace dock.', timestamp: '2026-07-11T08:30:00.000Z' }
    ] });
    return reply({ session_id: 'uat-session', messages: [
      { id: 'uat-message-1', role: 'user', content: 'Inspect the authenticated preview relay and confirm worktree isolation.', timestamp: '2026-07-11T09:58:00.000Z' },
      { id: 'uat-message-2', role: 'assistant', content: 'The preview lease is scoped to this worktree. I am validating the relay and browser session boundary now.', timestamp: '2026-07-11T10:00:00.000Z', reasoning: 'Checking lease authorization and isolated Electron session behavior.' }
    ] });
  }
  if (request.method === 'session.context_breakdown') return reply({ context_max: 128000, context_used: 32000, context_percent: 25, estimated_total: 42000, model: 'hermes-3-pro', categories: [{ id: 'conversation', label: 'Conversation', tokens: 18000 }, { id: 'tools', label: 'Tool output', tokens: 14000 }] });
  if (request.method === 'delegation.status') return reply({ active: [], paused: false, max_spawn_depth: 3, max_concurrent_children: 4 });
  if (request.method === 'projects.list') return reply({ active_id: 'uat-project', projects: [{ id: 'uat-project', name: 'Electron UAT', folders: [{ path: repositoryDir }], primary_path: repositoryDir, archived: false }] });
  if (request.method === 'projects.tree') return reply({ active_id: 'uat-project', scoped_session_ids: ['uat-session'], projects: [{ id: 'uat-project', label: 'Electron UAT', path: repositoryDir, sessionCount: 1, previewSessions: [session], repos: [{ id: 'uat-repository', label: 'Electron UAT', path: repositoryDir, sessionCount: 1, groups: [{ id: 'uat-worktree', label: 'companion/uat-session', path: worktreeDir, totalCount: 1, sessions: [session], isMain: false }] }] }] });
  if (request.method === 'projects.project_sessions') return reply({ project: { id: 'uat-project', label: 'Electron UAT', path: repositoryDir, sessionCount: 1, previewSessions: [session], repos: [{ id: 'uat-repository', label: 'Electron UAT', path: repositoryDir, sessionCount: 1, groups: [{ id: 'uat-worktree', label: 'companion/uat-session', path: worktreeDir, totalCount: 1, sessions: [session], isMain: false }] }] } });
  socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { message: `Unsupported UAT Serve method: ${request.method}.` } }));
}));
const mockHermes = createHttpServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://hermes-uat');
  const reply = (status, value) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
  const readJson = async () => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  };
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
  if (request.method === 'GET' && url.pathname === '/api/sessions') return reply(200, { object: 'list', data: [session, secondarySession, ...(!unavailableSessionDeleted ? [unavailableSession] : [])] });
  if (request.method === 'GET' && url.pathname === '/api/profiles/sessions') return reply(200, {
    sessions: url.searchParams.get('archived') === 'only'
      ? (!unavailableSessionDeleted && unavailableSession.archived ? [unavailableSession] : [])
      : [session, secondarySession, ...(!unavailableSessionDeleted && (url.searchParams.get('archived') === 'include' || !unavailableSession.archived) ? [unavailableSession] : [])]
  });
  if (request.method === 'GET' && url.pathname === '/api/sessions/search') return reply(200, { object: 'list', results: [
    { session_id: 'uat-session', lineage_root: null, model: 'hermes-3-pro', role: 'assistant', snippet: 'Preview relay search result', source: 'history', session_started: '2026-07-11T09:00:00.000Z' }
  ] });
  if (request.method === 'POST' && url.pathname === '/api/sessions') { createdSessionCount += 1; const id = createdSessionCount === 1 ? 'uat-created-session' : `uat-created-session-${createdSessionCount}`; return reply(200, { object: 'hermes.session', session: {
    id, title: 'New thread', model: 'hermes-3-pro', started_at: '2026-07-11T10:02:00.000Z', last_active: '2026-07-11T10:02:00.000Z', message_count: 0, archived: false
  } }); }
  if (request.method === 'GET' && url.pathname === '/api/sessions/uat-session') return reply(200, session);
  if (request.method === 'GET' && url.pathname === '/api/sessions/uat-secondary-session') return reply(200, secondarySession);
  if (request.method === 'GET' && url.pathname === '/api/sessions/uat-unavailable-session') return unavailableSessionDeleted ? reply(404, { detail: 'Session not found' }) : reply(200, unavailableSession);
  if (request.method === 'PATCH' && url.pathname === '/api/sessions/uat-unavailable-session') {
    if (unavailableSessionDeleted) return reply(404, { detail: 'Session not found' });
    const update = await readJson();
    if (typeof update.title === 'string') unavailableSession.title = update.title;
    if (typeof update.archived === 'boolean') unavailableSession.archived = update.archived;
    return reply(200, { ok: true, title: unavailableSession.title, archived: unavailableSession.archived });
  }
  if (request.method === 'DELETE' && url.pathname === '/api/sessions/uat-unavailable-session') {
    unavailableSessionDeleted = true;
    return reply(200, { ok: true });
  }
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
  if (url.pathname === '/api/sessions/uat-secondary-session/messages') return reply(200, {
    object: 'list', session_id: 'uat-secondary-session', data: [
      { id: 'uat-secondary-message-1', role: 'user', content: 'Keep this session layout independent.', timestamp: '2026-07-11T08:28:00.000Z' },
      { id: 'uat-secondary-message-2', role: 'assistant', content: 'This session starts with its own closed workspace dock.', timestamp: '2026-07-11T08:30:00.000Z' }
    ]
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
  if (request.method === 'GET' && url.pathname === '/api/git/worktrees') return reply(200, { worktrees: [
    { path: repositoryDir, branch: 'main', isMain: true, detached: false, locked: false },
    { path: worktreeDir, branch: 'companion/uat-session', isMain: false, detached: false, locked: false }
  ] });
  if (request.method === 'GET' && url.pathname === '/api/git/status') {
    const { stdout } = await execFileAsync('git', ['-C', worktreeDir, 'status', '--porcelain=v1']);
    const line = stdout.split('\n').find((candidate) => candidate.slice(3) === 'README.md') ?? '';
    const staged = Boolean(line[0] && line[0] !== ' ' && line[0] !== '?');
    const unstaged = Boolean(line[1] && line[1] !== ' ');
    return reply(200, {
      branch: 'companion/uat-session', defaultBranch: 'main', detached: false, ahead: 0, behind: 0,
      staged: staged ? 1 : 0, unstaged: unstaged ? 1 : 0, untracked: 0, conflicted: 0,
      changed: staged || unstaged ? 1 : 0, added: staged || unstaged ? 1 : 0, removed: 0,
      files: staged || unstaged ? [{ path: 'README.md', staged, unstaged, untracked: false, conflicted: false }] : []
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/git/review/list') {
    const { stdout } = await execFileAsync('git', ['-C', worktreeDir, 'status', '--porcelain=v1']);
    const line = stdout.split('\n').find((candidate) => candidate.slice(3) === 'README.md') ?? '';
    return reply(200, { files: line ? [{ path: 'README.md', added: 1, removed: 0, status: 'M', staged: Boolean(line[0] && line[0] !== ' ' && line[0] !== '?') }] : [], base: null });
  }
  if (request.method === 'GET' && url.pathname === '/api/git/review/diff') {
    const args = ['-C', worktreeDir, 'diff'];
    if (url.searchParams.get('staged') === 'true') args.push('--cached');
    args.push('--', url.searchParams.get('file') ?? 'README.md');
    const { stdout } = await execFileAsync('git', args);
    return reply(200, { diff: stdout });
  }
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
  worktrees: [{ connectionId: 'default', profileId: 'default', projectId: 'uat-project', worktreeId: 'uat-worktree', path: worktreeDir, branch: 'companion/uat-session', threadId: 'uat-session', parentWorktreeId: null, writerRunId: null, createdAt: '2026-07-11T09:00:00.000Z' }], runs: [], annotations: [], previews: [], audit: []
}, null, 2));

const child = spawn(electron, [desktop], { cwd: desktop, stdio: 'inherit', env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}`, HERMES_COMPANION_UAT: '1', HERMES_COMPANION_UAT_REPORT_DIR: reportDir, HERMES_COMPANION_UAT_BROWSER_URL: `${mockHermesUrl}/uat/browser`, HERMES_COMPANION_UAT_REPOSITORY: repositoryDir, HERMES_COMPANION_UAT_WORKTREE: nativeWorktreeDir, HERMES_COMPANION_RENDERER_URL: `http://127.0.0.1:${port}`, HERMES_API_URL: `http://127.0.0.1:${port}`, HERMES_CONTROL_URL: mockHermesUrl, HERMES_CONTROL_TOKEN: dashboardSessionToken, HERMES_SERVE_WS_URL: `ws://127.0.0.1:${serveAddress.port}`, COMPANION_DATA_DIR: stateDir } });
const timer = setTimeout(() => child.kill('SIGKILL'), 135_000);
const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1)); }); clearTimeout(timer);
await new Promise((resolve) => mockHermes.close(resolve));
await new Promise((resolve) => serveSocket.close(resolve));
const report = JSON.parse(await readFile(join(reportDir, 'report.json'), 'utf8'));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (exitCode !== 0 || report.ok !== true) process.exitCode = 1;
