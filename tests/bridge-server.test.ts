import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import WebSocket, { type RawData } from 'ws';

let child: ChildProcess | null = null;
let previewServer: Server | null = null;
let directory = '';
const exec = promisify(execFile);
afterEach(async () => {
  child?.kill('SIGTERM'); child = null;
  await new Promise<void>((done) => previewServer?.close(() => done()) ?? done()); previewServer = null;
  if (directory) await rm(directory, { recursive: true, force: true }); directory = '';
});

const freePort = () => new Promise<number>((resolvePort) => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test port'); const port = address.port; server.close(() => resolvePort(port)); }); });
const waitFor = async (url: string) => { for (let i = 0; i < 50; i++) { try { const response = await fetch(url); if (response.ok) return; } catch {} await new Promise((resolveWait) => setTimeout(resolveWait, 50)); } throw new Error('Bridge did not start.'); };
const capability = async (port: number, token: string, capabilityName: string, payload: Record<string, unknown>) => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/capability`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ version: 'v1', requestId: crypto.randomUUID(), capability: capabilityName, payload }) });
  const result = await response.json() as { ok: boolean; data?: unknown; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? `Bridge request failed (${response.status})`);
  return result.data;
};

const repositoryFixture = async () => {
  directory = await mkdtemp(join(tmpdir(), 'bridge-server-'));
  const repositoryPath = join(directory, 'repo'); await mkdir(repositoryPath);
  await exec('git', ['init', '-b', 'main'], { cwd: repositoryPath });
  await exec('git', ['config', 'user.email', 'bridge-server@test.invalid'], { cwd: repositoryPath });
  await exec('git', ['config', 'user.name', 'Bridge Server Test'], { cwd: repositoryPath });
  await writeFile(join(repositoryPath, 'README.md'), '# Bridge server\n');
  await exec('git', ['add', 'README.md'], { cwd: repositoryPath }); await exec('git', ['commit', '-m', 'initial'], { cwd: repositoryPath });
  return repositoryPath;
};

const openSocket = (url: string, token: string) => new Promise<WebSocket>((done, reject) => {
  const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
  socket.once('open', () => done(socket)); socket.once('error', reject);
});
const nextMessage = (socket: WebSocket, predicate: (message: Record<string, unknown>) => boolean, timeoutMs = 5_000) => new Promise<Record<string, unknown>>((done, reject) => {
  const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error('Timed out waiting for bridge WebSocket message.')); }, timeoutMs);
  const onMessage = (raw: RawData) => { const message = JSON.parse(raw.toString()) as Record<string, unknown>; if (predicate(message)) { clearTimeout(timer); socket.off('message', onMessage); done(message); } };
  socket.on('message', onMessage);
});

describe('bridge HTTP service', () => {
  it('reports starting until its co-located Hermes upstream is ready', async () => {
    const port = await freePort(); const upstreamPort = await freePort(); directory = await mkdtemp(join(tmpdir(), 'bridge-server-'));
    const token = 'test-bridge-token-that-is-at-least-32-characters'; let upstreamReady = false;
    previewServer = createServer((request, response) => {
      if (request.url !== '/api/auth/providers') { response.writeHead(404); return response.end(); }
      response.writeHead(upstreamReady ? 200 : 503, { 'content-type': 'application/json' });
      response.end(upstreamReady ? '{"providers":[]}' : '{"status":"starting"}');
    });
    await new Promise<void>((done) => previewServer!.listen(upstreamPort, '127.0.0.1', () => done()));
    child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('apps/bridge/src/server.ts')], { env: {
      ...process.env, PORT: String(port), BRIDGE_HOST: '127.0.0.1', BRIDGE_TOKEN: token,
      BRIDGE_STATE_DIR: directory, BRIDGE_ALLOWED_ROOTS: directory, HERMES_UPSTREAM: `http://127.0.0.1:${upstreamPort}`
    }, stdio: 'pipe' });

    for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).status === 503) break; } catch {} await new Promise((wait) => setTimeout(wait, 50)); }
    const starting = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(starting.status).toBe(503);
    expect(await starting.json()).toEqual({ status: 'starting', version: 'v1' });
    upstreamReady = true;
    await waitFor(`http://127.0.0.1:${port}/healthz`);
    const ready = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ok', version: 'v1' });
  }, 15_000);

  it('serves health and rejects unauthenticated capability calls', async () => {
    const port = await freePort(); directory = await mkdtemp(join(tmpdir(), 'bridge-server-')); const token = 'test-bridge-token-that-is-at-least-32-characters';
    child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('apps/bridge/src/server.ts')], { env: { ...process.env, PORT: String(port), BRIDGE_HOST: '127.0.0.1', BRIDGE_TOKEN: token, BRIDGE_STATE_DIR: directory, BRIDGE_ALLOWED_ROOTS: directory }, stdio: 'pipe' });
    await waitFor(`http://127.0.0.1:${port}/healthz`);
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
    const unauthenticated = await fetch(`http://127.0.0.1:${port}/v1/capability`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(unauthenticated.status).toBe(404);
    const authenticated = await fetch(`http://127.0.0.1:${port}/v1/capability`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.list' } }) });
    expect(authenticated.status).toBe(200);
    expect((await authenticated.json() as { ok: boolean }).ok).toBe(true);
  }, 15_000);

  it('serves authenticated Streamable HTTP MCP initialization, discovery, and delegated tool calls', async () => {
    const port = await freePort(); directory = await mkdtemp(join(tmpdir(), 'bridge-server-')); const token = 'test-bridge-token-that-is-at-least-32-characters';
    child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('apps/bridge/src/server.ts')], { env: { ...process.env, PORT: String(port), BRIDGE_HOST: '127.0.0.1', BRIDGE_TOKEN: token, BRIDGE_STATE_DIR: directory, BRIDGE_ALLOWED_ROOTS: directory }, stdio: 'pipe' });
    await waitFor(`http://127.0.0.1:${port}/healthz`);
    const call = async (id: number, method: string, params = {}) => (await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'mcp-protocol-version': '2025-03-26' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json() as Promise<Record<string, unknown>>;
    expect((await call(1, 'initialize', { protocolVersion: '2025-03-26' })).result).toEqual(expect.objectContaining({ protocolVersion: '2025-03-26' }));
    const listed = await call(2, 'tools/list'); expect((listed.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toContain('companion_worktree_list');
    const invoked = await call(3, 'tools/call', { name: 'companion_worktree_list', arguments: {} });
    expect((invoked.result as { content: Array<{ text: string }> }).content[0]?.text).toBe('[]');
    expect((await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404);
  }, 15_000);

  it('relays an authenticated worktree preview without exposing the access token upstream', async () => {
    const bridgePort = await freePort(); const previewPort = await freePort(); const repositoryPath = await repositoryFixture();
    const token = 'test-bridge-token-that-is-at-least-32-characters';
    let upstreamRequest = '';
    previewServer = createServer((request, response) => { upstreamRequest = request.url ?? ''; response.writeHead(200, { 'content-type': 'text/plain' }); response.end('preview relay ok'); });
    await new Promise<void>((done) => previewServer!.listen(previewPort, '127.0.0.1', () => done()));
    child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('apps/bridge/src/server.ts')], { env: {
      ...process.env, PORT: String(bridgePort), BRIDGE_HOST: '127.0.0.1', BRIDGE_TOKEN: token,
      BRIDGE_STATE_DIR: directory, BRIDGE_ALLOWED_ROOTS: directory, BRIDGE_WORKTREE_ROOT: join(directory, 'worktrees'),
      BRIDGE_PUBLIC_URL: `http://127.0.0.1:${bridgePort}`
    }, stdio: 'pipe' });
    await waitFor(`http://127.0.0.1:${bridgePort}/healthz`);

    const worktree = await capability(bridgePort, token, 'worktrees', { action: 'worktree.create', projectId: 'project-1', repositoryPath, threadId: 'thread-preview', branch: 'companion/preview-relay', base: 'HEAD' }) as { worktreeId: string };
    const lease = await capability(bridgePort, token, 'preview', { action: 'preview.start', worktreeId: worktree.worktreeId, origin: `http://127.0.0.1:${previewPort}`, designModeAllowed: true, ttlSeconds: 300 }) as { id: string; relayUrl: string };
    const entryUrl = new URL(lease.relayUrl); entryUrl.pathname += 'nested/route'; entryUrl.searchParams.set('view', '1');
    const exchange = await fetch(entryUrl, { redirect: 'manual' });
    expect(exchange.status).toBe(302);
    expect(exchange.headers.get('location')).toBe(`/preview/${lease.id}/nested/route?view=1`);
    const cookie = exchange.headers.get('set-cookie');
    expect(cookie).toMatch(new RegExp(`^preview_${lease.id}=[^;]+; HttpOnly; SameSite=Strict; Path=/preview/${lease.id}/`));
    expect((await fetch(`http://127.0.0.1:${bridgePort}${exchange.headers.get('location')}`)).status).toBe(401);
    const relayed = await fetch(`http://127.0.0.1:${bridgePort}${exchange.headers.get('location')}`, { headers: { cookie: cookie!.split(';')[0] } });
    expect(relayed.status).toBe(200); expect(await relayed.text()).toBe('preview relay ok');
    expect(upstreamRequest).toBe('/nested/route?view=1');
    await capability(bridgePort, token, 'preview', { action: 'preview.stop', leaseId: lease.id });
    expect((await fetch(`http://127.0.0.1:${bridgePort}${exchange.headers.get('location')}`, { headers: { cookie: cookie!.split(';')[0] } })).status).toBe(404);
  }, 20_000);

  it('returns authenticated active-PR metadata through the remote Git capability', async () => {
    const port = await freePort(); const repositoryPath = await repositoryFixture(); const token = 'test-bridge-token-that-is-at-least-32-characters';
    const bin = join(directory, 'bin'); await mkdir(bin);
    await writeFile(join(bin, 'gh'), '#!/bin/sh\nif [ "$1" = "--version" ] || { [ "$1" = "auth" ] && [ "$2" = "status" ]; }; then exit 0; fi\nif [ "$1" = "pr" ] && [ "$2" = "view" ]; then echo "{\\"number\\":7,\\"title\\":\\"Remote review\\",\\"url\\":\\"https://github.example.test/bridge/pr/7\\",\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"reviewDecision\\":\\"APPROVED\\"}"; exit 0; fi\nexit 1\n');
    await chmod(join(bin, 'gh'), 0o755);
    child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('apps/bridge/src/server.ts')], { env: {
      ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, PORT: String(port), BRIDGE_HOST: '127.0.0.1', BRIDGE_TOKEN: token,
      BRIDGE_STATE_DIR: directory, BRIDGE_ALLOWED_ROOTS: directory, BRIDGE_WORKTREE_ROOT: join(directory, 'worktrees')
    }, stdio: 'pipe' });
    await waitFor(`http://127.0.0.1:${port}/healthz`);
    const worktree = await capability(port, token, 'worktrees', { action: 'worktree.create', projectId: 'project-1', repositoryPath, threadId: 'thread-pr', branch: 'companion/remote-pr', base: 'HEAD' }) as { worktreeId: string };
    const status = await capability(port, token, 'git', { action: 'git.github.status', worktreeId: worktree.worktreeId }) as { authenticated: boolean };
    const pullRequest = await capability(port, token, 'git', { action: 'git.pr.view', worktreeId: worktree.worktreeId }) as { number: number; title: string; reviewDecision: string | null };
    expect(status.authenticated).toBe(true); expect(pullRequest).toEqual(expect.objectContaining({ number: 7, title: 'Remote review', reviewDecision: 'APPROVED' }));
  }, 20_000);

  it('reattaches to a live worktree PTY after the WebSocket client reconnects', async () => {
    const port = await freePort(); const repositoryPath = await repositoryFixture(); const token = 'test-bridge-token-that-is-at-least-32-characters';
    child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('apps/bridge/src/server.ts')], { env: {
      ...process.env, PORT: String(port), BRIDGE_HOST: '127.0.0.1', BRIDGE_TOKEN: token,
      BRIDGE_STATE_DIR: directory, BRIDGE_ALLOWED_ROOTS: directory, BRIDGE_WORKTREE_ROOT: join(directory, 'worktrees')
    }, stdio: 'pipe' });
    await waitFor(`http://127.0.0.1:${port}/healthz`);
    const worktree = await capability(port, token, 'worktrees', { action: 'worktree.create', projectId: 'project-1', repositoryPath, threadId: 'thread-pty', branch: 'companion/pty-reconnect', base: 'HEAD' }) as { worktreeId: string; path: string };

    const first = await openSocket(`ws://127.0.0.1:${port}/v1/pty`, token);
    const openedPromise = nextMessage(first, (message) => message.type === 'opened');
    first.send(JSON.stringify({ type: 'open', worktreeId: worktree.worktreeId, shell: '/bin/sh', cols: 90, rows: 24 }));
    const opened = await openedPromise; const terminalId = String(opened.terminalId);
    const initialOutput = nextMessage(first, (message) => message.type === 'output' && String(message.data).includes(worktree.path));
    first.send(JSON.stringify({ type: 'input', terminalId, data: 'pwd\n' })); await initialOutput;
    await new Promise<void>((done) => { first.once('close', () => done()); first.close(); });

    const second = await openSocket(`ws://127.0.0.1:${port}/v1/pty`, token);
    second.send(JSON.stringify({ type: 'attach', terminalId }));
    const reconnectedOutput = nextMessage(second, (message) => message.type === 'output' && String(message.data).includes('bridge-reconnected'));
    second.send(JSON.stringify({ type: 'input', terminalId, data: 'echo bridge-reconnected\n' }));
    expect(String((await reconnectedOutput).data)).toContain('bridge-reconnected');
    second.send(JSON.stringify({ type: 'close', terminalId })); second.close();
  }, 20_000);
});
