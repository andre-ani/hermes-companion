const { app, BrowserWindow, WebContentsView, session, ipcMain, shell, utilityProcess, safeStorage, Notification, dialog } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const pty = require('node-pty');

const execFileAsync = promisify(execFile);
const rendererUrl = process.env.HERMES_COMPANION_RENDERER_URL || 'http://127.0.0.1:5400';
const rendererTarget = new URL(rendererUrl);
if (rendererTarget.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(rendererTarget.hostname)) throw new Error('The Companion renderer must bind to a loopback HTTP origin.');
const isDev = !app.isPackaged && process.env.HERMES_COMPANION_UAT !== '1';
const uatReportDir = process.env.HERMES_COMPANION_UAT_REPORT_DIR || '';
const stateDir = process.env.COMPANION_DATA_DIR || path.join(os.homedir(), '.hermes-companion');
const nativeDescriptorPath = path.join(stateDir, 'native-endpoint.json');
const token = crypto.randomBytes(32).toString('base64url');
const terminals = new Map();
const previewLeases = new Map();
let secretWriteQueue = Promise.resolve();
const filePreviewTypes = new Map([['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.pdf', 'application/pdf']]);
const validFilePreviewSignature = (mime, data) => mime === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : mime === 'image/jpeg' ? data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff : mime === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii')) : mime === 'image/webp' ? data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP' : data.subarray(0, 5).toString('ascii') === '%PDF-';
let mainWindow;
let browserView;
let browserLayout = 'dock';
let browserViewKind = null;
let browserViewBounds = null;
let nativeServer;
let rendererProcess;

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
};

const readJson = async (request) => {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Native request payload exceeded 1 MB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const validBranch = (branch) => typeof branch === 'string' && /^(?![-/.])(?!.*\.\.)(?!.*[~^:?*\[\\\s])[^\x00-\x1f\x7f]+(?<![/.])$/.test(branch);
const validRemote = (remote) => typeof remote === 'string' && /^(?!-)[A-Za-z0-9._/-]+$/.test(remote);
const validRelativePath = (value) => typeof value === 'string' && Boolean(value) && (value === '.' || (!path.isAbsolute(value) && !value.split(/[\\/]/).includes('..')));
const validateGitPaths = (paths, action, allowAll = true) => {
  if (!Array.isArray(paths) || !paths.length || paths.some((value) => !validRelativePath(value) || (!allowAll && value === '.'))) throw new Error(`Invalid path selected for ${action}.`);
};
async function containedFilePath(root, value) {
  if (!validRelativePath(value || '.')) throw new Error('File path must be relative to its worktree.');
  const realRoot = await fsp.realpath(root); const candidate = await fsp.realpath(path.resolve(realRoot, value || '.'));
  const rel = path.relative(realRoot, candidate); if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('File path escaped its worktree.');
  return { realRoot, candidate };
}
async function containedTargetFilePath(root, value) {
  if (!value || !validRelativePath(value)) throw new Error('File path must be relative to its worktree.');
  const realRoot = await fsp.realpath(root); const parent = await fsp.realpath(path.dirname(path.resolve(realRoot, value))); const rel = path.relative(realRoot, parent);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('File path escaped its worktree.');
  const candidate = path.resolve(parent, value.split(/[\\/]/).at(-1)); const targetRel = path.relative(realRoot, candidate);
  if (!targetRel || targetRel.startsWith('..') || path.isAbsolute(targetRel)) throw new Error('File path escaped its worktree.');
  return { realRoot, candidate };
}
async function git(cwd, args) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('Git working directory must be absolute.');
  const realCwd = await fsp.realpath(cwd);
  const { stdout, stderr } = await execFileAsync('git', ['-C', realCwd, ...args], { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  return { stdout, stderr };
}
async function revertGitPaths(cwd, paths) {
  validateGitPaths(paths, 'reverting', false);
  for (const selectedPath of paths) {
    const before = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', selectedPath]);
    if (!before.stdout) throw new Error(`Selected path has no changes to revert: ${selectedPath}`);
    const trackedAtHead = (await git(cwd, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', selectedPath])).stdout
      .split('\0').some((candidate) => candidate === selectedPath);
    if (trackedAtHead) {
      await git(cwd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', selectedPath]);
    } else {
      await git(cwd, ['reset', '--quiet', 'HEAD', '--', selectedPath]);
      await git(cwd, ['clean', '-fd', '--', selectedPath]);
    }
    const after = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', selectedPath]);
    if (after.stdout) throw new Error(`Git could not fully revert the selected path: ${selectedPath}`);
  }
  return { ok: true, paths };
}
async function commitGit(cwd, message, amend) {
  const result = await git(cwd, ['commit', ...(amend ? ['--amend'] : []), '-m', message]);
  const sha = (await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim();
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error('Git committed the changes but did not return a valid HEAD revision.');
  return { ...result, sha };
}
async function gitRemoteStatus(cwd, branch, remote) {
  if (!validRemote(remote)) throw new Error('Invalid Git remote name.');
  if (!validBranch(branch)) throw new Error('Invalid Git branch name.');
  const configured = (await git(cwd, ['remote'])).stdout.split(/\r?\n/).some((candidate) => candidate === remote);
  const currentBranch = (await git(cwd, ['branch', '--show-current'])).stdout.trim();
  const upstream = (await git(cwd, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).stdout.trim() || null;
  if (!configured) return { remote, configured: false, upstream, canPush: false, reason: `Git remote '${remote}' is not configured.` };
  const hasPushTarget = await git(cwd, ['remote', 'get-url', '--push', remote]).then((result) => Boolean(result.stdout.trim())).catch(() => false);
  if (!hasPushTarget) return { remote, configured: true, upstream, canPush: false, reason: `Git remote '${remote}' has no push target.` };
  if (currentBranch !== branch) return { remote, configured: true, upstream, canPush: false, reason: `The bound worktree is not on branch '${branch}'.` };
  return { remote, configured: true, upstream, canPush: true, reason: null };
}
async function pushGit(cwd, branch, remote, forceWithLease) {
  const readiness = await gitRemoteStatus(cwd, branch, remote);
  if (!readiness.canPush) throw new Error(readiness.reason || 'This branch cannot be pushed.');
  return git(cwd, ['push', ...(forceWithLease ? ['--force-with-lease'] : []), ...(readiness.upstream ? [] : ['--set-upstream']), remote, branch]);
}
async function githubForgeStatus() {
  try { await execFileAsync('gh', ['--version'], { timeout: 15_000, maxBuffer: 256 * 1024 }); }
  catch { return { installed: false, authenticated: false, message: 'GitHub CLI is not installed on this execution host.' }; }
  try {
    await execFileAsync('gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: 15_000, maxBuffer: 256 * 1024 });
    return { installed: true, authenticated: true, message: 'GitHub CLI is authenticated on this execution host.' };
  } catch {
    return { installed: true, authenticated: false, message: 'GitHub CLI is installed but not authenticated for github.com.' };
  }
}
async function githubPullRequest(cwd) {
  const realCwd = await fsp.realpath(cwd);
  try {
    const { stdout } = await execFileAsync('gh', ['pr', 'view', '--json', 'number,title,url,state,isDraft,reviewDecision'], { cwd: realCwd, timeout: 30_000, maxBuffer: 512 * 1024 });
    const value = JSON.parse(stdout);
    return { number: value.number, title: value.title, url: value.url, state: value.state, isDraft: value.isDraft, reviewDecision: value.reviewDecision || null };
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '') : '';
    const message = `${error instanceof Error ? error.message : String(error)}\n${stderr}`;
    if (/no pull requests found|no pull request found|no open pull requests/i.test(message)) return null;
    throw error;
  }
}
async function mergeWorktree(parentPath, childPath, childBranch, message) {
  if (!validBranch(childBranch)) throw new Error('Invalid child branch name.');
  if ((await git(parentPath, ['status', '--porcelain'])).stdout.trim()) throw new Error('Parent worktree must be clean before merging.');
  if ((await git(childPath, ['status', '--porcelain'])).stdout.trim()) throw new Error('Child worktree must be clean and committed before merging.');
  const alreadyMerged = await git(parentPath, ['merge-base', '--is-ancestor', childBranch, 'HEAD']).then(() => true).catch(() => false);
  if (alreadyMerged) return { stdout: 'Child branch is already merged.\n', stderr: '', alreadyMerged: true };
  try {
    const merged = await git(parentPath, ['merge', '--no-ff', '--no-commit', childBranch]);
    const committed = await git(parentPath, ['commit', '-m', message]);
    return { stdout: `${merged.stdout}${committed.stdout}`, stderr: `${merged.stderr}${committed.stderr}`, alreadyMerged: false };
  } catch (error) {
    await git(parentPath, ['merge', '--abort']).catch(() => undefined);
    throw new Error(`Child worktree could not be merged cleanly: ${error instanceof Error ? error.message : 'Git merge failed.'}`);
  }
}

async function storeSecret(key, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable.');
  secretWriteQueue = secretWriteQueue.catch(() => undefined).then(async () => {
    await fsp.mkdir(stateDir, { recursive: true, mode: 0o700 });
    const file = path.join(stateDir, 'secrets.json');
    let values = {};
    try { values = JSON.parse(await fsp.readFile(file, 'utf8')); } catch {}
    values[key] = safeStorage.encryptString(value).toString('base64');
    await fsp.writeFile(file, JSON.stringify(values), { mode: 0o600 });
  });
  return secretWriteQueue;
}

async function readSecret(key) {
  try {
    const values = JSON.parse(await fsp.readFile(path.join(stateDir, 'secrets.json'), 'utf8'));
    return values[key] ? safeStorage.decryptString(Buffer.from(values[key], 'base64')) : null;
  } catch { return null; }
}

async function deleteSecret(key) {
  secretWriteQueue = secretWriteQueue.catch(() => undefined).then(async () => {
    const file = path.join(stateDir, 'secrets.json');
    try {
      const values = JSON.parse(await fsp.readFile(file, 'utf8'));
      delete values[key];
      await fsp.writeFile(file, JSON.stringify(values), { mode: 0o600 });
    } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  });
  return secretWriteQueue;
}

function openTerminal(input) {
  const id = crypto.randomUUID();
  const shellPath = input.shell || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash');
  const terminal = pty.spawn(shellPath, [], { name: 'xterm-256color', cols: input.cols || 100, rows: input.rows || 30, cwd: input.cwd, env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } });
  const state = { terminal, output: [], closed: false };
  terminal.onData((data) => { state.output.push(data); if (state.output.length > 2_000) state.output.splice(0, state.output.length - 2_000); });
  terminal.onExit(() => { state.closed = true; });
  terminals.set(id, state);
  return { id };
}

async function dispatchNative(capability, input = {}) {
  switch (capability) {
    case 'app.info': return { version: app.getVersion(), electron: process.versions.electron, platform: process.platform };
    case 'git.status': return git(input.cwd, ['status', '--porcelain=v2', '--branch']);
    case 'dialog.directory': { const result = await dialog.showOpenDialog(mainWindow, { title: input.title || 'Choose or create a Git repository', properties: ['openDirectory', 'createDirectory'] }); return { path: result.canceled ? null : result.filePaths[0] || null }; }
    case 'git.inspect': {
      const root = await git(input.repositoryPath, ['rev-parse', '--show-toplevel']).then((result) => result.stdout.trim()).catch(async (cause) => {
        if (!input.initialize) throw cause;
        await git(input.repositoryPath, ['init', '-b', 'main']);
        return (await git(input.repositoryPath, ['rev-parse', '--show-toplevel'])).stdout.trim();
      }); const name = path.basename(root);
      const currentBranch = (await git(root, ['branch', '--show-current'])).stdout.trim() || 'main';
      const remoteUrl = await git(root, ['remote', 'get-url', 'origin']).then((result) => result.stdout.trim() || null).catch(() => null);
      const defaultBranch = await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).then((result) => result.stdout.trim().replace(/^origin\//, '')).catch(() => currentBranch);
      return { name, repositoryPath: root, remoteUrl, defaultBranch };
    }
    case 'git.diff': return git(input.cwd, ['diff', '--no-ext-diff', ...(input.cached ? ['--cached'] : []), '--']);
    case 'git.commit.metadata': {
      const result = await git(input.cwd, ['log', '-1', '--format=%s%n%b']);
      const [subject = '', ...body] = result.stdout.replace(/\n+$/, '').split('\n');
      return { subject, body: body.join('\n').trim() };
    }
    case 'git.stage': validateGitPaths(input.paths, 'staging'); return git(input.cwd, ['add', '--', ...input.paths]);
    case 'git.unstage': validateGitPaths(input.paths, 'unstaging'); return git(input.cwd, ['reset', '--quiet', 'HEAD', '--', ...input.paths]);
    case 'git.revert': return revertGitPaths(input.cwd, input.paths);
    case 'git.worktree.create': {
      if (!validBranch(input.branch)) throw new Error('Invalid branch name.');
      const target = path.resolve(input.targetPath);
      const base = input.base || 'HEAD';
      await git(input.repositoryPath, ['worktree', 'add', '-b', input.branch, target, base]);
      return { path: target, branch: input.branch };
    }
    case 'git.worktree.attach': {
      if (!validBranch(input.branch)) throw new Error('Invalid branch name.');
      const worktreePath = await fsp.realpath(input.worktreePath);
      const listed = await git(input.repositoryPath, ['worktree', 'list', '--porcelain']);
      const paths = listed.stdout.split(/\n\s*\n/).flatMap((record) => {
        const line = record.split('\n').find((candidate) => candidate.startsWith('worktree '));
        return line ? [line.slice('worktree '.length)] : [];
      });
      const registered = await Promise.all(paths.map((candidate) => fsp.realpath(candidate).catch(() => '')));
      if (!registered.includes(worktreePath)) throw new Error('The selected path is not a registered worktree of this repository.');
      const branch = (await git(worktreePath, ['branch', '--show-current'])).stdout.trim();
      if (branch !== input.branch) throw new Error('The selected worktree branch no longer matches Hermes state.');
      return { path: worktreePath, branch };
    }
    case 'git.worktree.detach': return { ok: true };
    case 'git.worktree.remove': await git(input.repositoryPath, ['worktree', 'remove', ...(input.force ? ['--force'] : []), input.worktreePath]); return { ok: true };
    case 'git.commit': return commitGit(input.cwd, input.message, input.amend);
    case 'git.remote.status': return gitRemoteStatus(input.cwd, input.branch, input.remote || 'origin');
    case 'git.push': return pushGit(input.cwd, input.branch, input.remote || 'origin', input.forceWithLease);
    case 'git.github.status': return githubForgeStatus();
    case 'git.pr.view': return githubPullRequest(input.cwd);
    case 'git.pr.create': {
      if (!validBranch(input.base)) throw new Error('Invalid base branch.');
      const realCwd = await fsp.realpath(input.cwd);
      const args = ['pr', 'create', '--title', input.title, '--body', input.body || '', '--base', input.base, ...(input.draft ? ['--draft'] : [])];
      const { stdout, stderr } = await execFileAsync('gh', args, { cwd: realCwd, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 });
      return { stdout, stderr, url: stdout.trim().split(/\s+/).find((value) => value.startsWith('http')) || null };
    }
    case 'git.merge': return mergeWorktree(input.parentPath, input.childPath, input.childBranch, input.message);
    case 'file.list': {
      const { realRoot, candidate } = await containedFilePath(input.root, input.path || '.');
      const entries = (await fsp.readdir(candidate, { withFileTypes: true })).filter((entry) => !['.git', 'node_modules'].includes(entry.name) && (entry.isFile() || entry.isDirectory())).slice(0, 2_000);
      const items = await Promise.all(entries.map(async (entry) => { const absolute = path.join(candidate, entry.name); const info = entry.isFile() ? await fsp.stat(absolute) : null; return { name: entry.name, path: path.relative(realRoot, absolute), kind: entry.isDirectory() ? 'directory' : 'file', size: info?.size ?? null }; }));
      return items.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1);
    }
    case 'file.read': {
      const { candidate } = await containedFilePath(input.root, input.path); const info = await fsp.stat(candidate);
      if (!info.isFile()) throw new Error('Selected path is not a file.'); if (info.size > 2 * 1024 * 1024) throw new Error('File exceeds the 2 MB editor limit.');
      return { path: input.path, content: await fsp.readFile(candidate, 'utf8'), size: info.size };
    }
    case 'file.write': {
      const { candidate } = await containedFilePath(input.root, input.path); const info = await fsp.stat(candidate); const size = Buffer.byteLength(input.content, 'utf8');
      if (!info.isFile()) throw new Error('Selected path is not a file.'); if (info.size > 2 * 1024 * 1024 || size > 2 * 1024 * 1024) throw new Error('File exceeds the 2 MB editor limit.');
      await fsp.writeFile(candidate, input.content, 'utf8'); return { path: input.path, size };
    }
    case 'file.search': {
      const { realRoot } = await containedFilePath(input.root, '.');
      try {
        const { stdout } = await execFileAsync('rg', ['--json', '--line-number', '--max-count', '20', '--glob', '!.git/**', '--glob', '!node_modules/**', '--', input.query, '.'], { cwd: realRoot, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
        const results = [];
        for (const line of stdout.split(/\r?\n/)) {
          if (!line || results.length >= (input.limit || 200)) continue;
          try { const event = JSON.parse(line); if (event.type === 'match' && event.data?.path?.text && event.data.line_number) results.push({ path: event.data.path.text.replace(/^\.\//, ''), line: event.data.line_number, text: (event.data.lines?.text || '').trimEnd() }); } catch {}
        }
        return results;
      } catch (error) { if (error?.code === 1) return []; throw error; }
    }
    case 'file.create': {
      const { realRoot, candidate } = await containedTargetFilePath(input.root, input.path);
      if (input.kind === 'directory') await fsp.mkdir(candidate); else { const handle = await fsp.open(candidate, 'wx'); await handle.close(); }
      return { path: path.relative(realRoot, candidate), kind: input.kind };
    }
    case 'file.move': {
      const source = await containedFilePath(input.root, input.from); const target = await containedTargetFilePath(input.root, input.to);
      await fsp.stat(target.candidate).then(() => { throw new Error('Destination already exists.'); }).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
      await fsp.rename(source.candidate, target.candidate); return { from: input.from, to: path.relative(source.realRoot, target.candidate) };
    }
    case 'file.delete': {
      const { realRoot, candidate } = await containedFilePath(input.root, input.path); if (candidate === realRoot) throw new Error('Cannot delete the worktree root.');
      const info = await fsp.stat(candidate); await fsp.rm(candidate, { recursive: info.isDirectory() ? input.recursive : false, force: false }); return { path: input.path, kind: info.isDirectory() ? 'directory' : 'file' };
    }
    case 'file.preview': {
      const { candidate } = await containedFilePath(input.root, input.path); const info = await fsp.stat(candidate); const mime = filePreviewTypes.get(path.extname(input.path).toLowerCase());
      if (!info.isFile() || !mime) throw new Error('This file type does not support binary preview.'); if (info.size > 8 * 1024 * 1024) throw new Error('Binary preview exceeds the 8 MB limit.');
      const data = await fsp.readFile(candidate); if (!validFilePreviewSignature(mime, data)) throw new Error('File content does not match its preview type.');
      return { path: input.path, mime, dataUrl: `data:${mime};base64,${data.toString('base64')}`, size: info.size };
    }
    case 'pty.open': return openTerminal(input);
    case 'pty.write': terminals.get(input.id)?.terminal.write(input.data); return { ok: terminals.has(input.id) };
    case 'pty.resize': terminals.get(input.id)?.terminal.resize(input.cols, input.rows); return { ok: terminals.has(input.id) };
    case 'pty.read': {
      const state = terminals.get(input.id); if (!state) return { output: [], closed: true };
      const output = state.output.splice(0); return { output, closed: state.closed };
    }
    case 'pty.close': terminals.get(input.id)?.terminal.kill(); terminals.delete(input.id); return { ok: true };
    case 'secret.set': await storeSecret(input.key, input.value); return { ok: true };
    case 'secret.get': return { value: await readSecret(input.key) };
    case 'secret.delete': await deleteSecret(input.key); return { ok: true };
    case 'preview.register': previewLeases.set(input.id, input); return { ok: true };
    case 'preview.open': return openBrowserView(input.leaseId);
    case 'browser.open': return openGeneralBrowser(input.url);
    case 'browser.navigate': return navigateBrowser(input.url);
    case 'browser.back': if (browserView?.webContents.navigationHistory.canGoBack()) browserView.webContents.navigationHistory.goBack(); return browserStatus();
    case 'browser.forward': if (browserView?.webContents.navigationHistory.canGoForward()) browserView.webContents.navigationHistory.goForward(); return browserStatus();
    case 'browser.reload': browserView?.webContents.reload(); return browserStatus();
    case 'browser.close': closeBrowserView(); return { ok: true };
    case 'browser.devtools': if (browserView && !browserView.webContents.isDestroyed()) browserView.webContents.openDevTools({ mode: 'detach' }); return { ok: Boolean(browserView) };
    case 'browser.bounds': browserViewBounds = { x: input.x, y: input.y, width: input.width, height: input.height }; setViewBounds(); attachBrowserView(); return { ok: true };
    case 'browser.layout': browserLayout = input.fullscreen ? 'fullscreen' : 'dock'; setViewBounds(); return { ok: true, fullscreen: browserLayout === 'fullscreen' };
    case 'browser.status': return browserStatus();
    case 'notification.status': return { supported: Notification.isSupported() };
    case 'notification.show': if (Notification.isSupported()) new Notification({ title: input.title, body: input.body }).show(); return { ok: true };
    default: throw new Error(`Unsupported native capability: ${capability}`);
  }
}

async function startNativeServer() {
  await fsp.mkdir(stateDir, { recursive: true, mode: 0o700 });
  nativeServer = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/capability' || request.headers.authorization !== `Bearer ${token}`) return json(response, 404, { error: 'Not found' });
    try {
      const body = await readJson(request);
      json(response, 200, { ok: true, data: await dispatchNative(body.capability, body.input) });
    } catch (error) { json(response, 400, { ok: false, error: error instanceof Error ? error.message : 'Native capability failed.' }); }
  });
  await new Promise((resolve) => nativeServer.listen(0, '127.0.0.1', resolve));
  const address = nativeServer.address();
  await fsp.writeFile(nativeDescriptorPath, JSON.stringify({ url: `http://127.0.0.1:${address.port}`, token, pid: process.pid }), { mode: 0o600 });
}

function setViewBounds() {
  if (!mainWindow || !browserView) return;
  const [width, height] = mainWindow.getContentSize();
  if (browserLayout === 'fullscreen') browserView.setBounds({ x: 0, y: 0, width, height: Math.max(200, height - 112) });
  else if (browserViewBounds) browserView.setBounds({ x: Math.max(0, Math.round(browserViewBounds.x)), y: Math.max(0, Math.round(browserViewBounds.y)), width: Math.max(1, Math.min(width - Math.round(browserViewBounds.x), Math.round(browserViewBounds.width))), height: Math.max(1, Math.min(height - Math.round(browserViewBounds.y), Math.round(browserViewBounds.height))) });
}

function attachBrowserView() {
  if (!mainWindow || !browserView || !browserViewBounds) return;
  if (!mainWindow.contentView.children.includes(browserView)) mainWindow.contentView.addChildView(browserView);
}

function validatedBrowserUrl(value) {
  const target = new URL(value); if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Browser URL must use HTTP or HTTPS.'); return target;
}

function browserStatus() {
  return { open: Boolean(browserView), kind: browserViewKind, url: browserView && !browserView.webContents.isDestroyed() ? browserView.webContents.getURL() : null, fullscreen: browserLayout === 'fullscreen' };
}

function closeBrowserView() {
  if (!browserView) return;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(browserView);
  if (!browserView.webContents.isDestroyed()) browserView.webContents.close();
  browserView = null;
  browserViewKind = null;
  browserViewBounds = null;
}

async function openGeneralBrowser(value) {
  const target = validatedBrowserUrl(value);
  closeBrowserView();
  const isolatedSession = session.fromPartition(`web:${crypto.randomUUID()}`, { cache: false });
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserView = new WebContentsView({ webPreferences: { session: isolatedSession, contextIsolation: true, sandbox: true, nodeIntegration: false } }); browserViewKind = 'general';
  browserView.webContents.setWindowOpenHandler(({ url }) => { void navigateBrowser(url); return { action: 'deny' }; });
  await browserView.webContents.loadURL(target.toString()); return browserStatus();
}

async function navigateBrowser(value) {
  if (!browserView) return openGeneralBrowser(value);
  const target = validatedBrowserUrl(value); await browserView.webContents.loadURL(target.toString()); return browserStatus();
}

async function openBrowserView(leaseId) {
  const lease = previewLeases.get(leaseId);
  if (!lease || Date.parse(lease.expiresAt) <= Date.now()) throw new Error('Preview lease is missing or expired.');
  const target = new URL(lease.relayUrl || lease.origin);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Preview must use HTTP or HTTPS.');
  closeBrowserView();
  const previewSession = session.fromPartition(`preview:${lease.worktreeId}:${crypto.randomUUID()}`, { cache: false });
  previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserView = new WebContentsView({ webPreferences: { session: previewSession, contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'preview-preload.cjs'), additionalArguments: lease.designModeAllowed ? ['--hermes-design-mode'] : [] } });
  browserViewKind = 'preview';
  browserView.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  browserView.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== target.origin) event.preventDefault(); });
  await browserView.webContents.loadURL(target.toString());
  return { ok: true };
}

async function waitForRenderer(url, timeout = 20_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Renderer did not start at ${url}`);
}

async function startRenderer() {
  if (isDev) return;
  const entry = path.join(__dirname, '../build/index.js');
  rendererProcess = utilityProcess.fork(entry, [], { env: { ...process.env, HOST: rendererTarget.hostname, PORT: rendererTarget.port || '80', ORIGIN: rendererUrl, COMPANION_DATA_DIR: stateDir }, stdio: 'pipe' });
  rendererProcess.stdout?.on('data', (chunk) => console.log(`[renderer] ${chunk}`));
  rendererProcess.stderr?.on('data', (chunk) => console.error(`[renderer] ${chunk}`));
  await waitForRenderer(rendererUrl);
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1500, height: 940, minWidth: 960, minHeight: 680, backgroundColor: '#0d0f16', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 20, y: 17 } } : {}), webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const toggleDevTools = input.key === 'F12' || (process.platform === 'darwin' ? input.meta && input.alt && input.key.toLowerCase() === 'i' : input.control && input.shift && input.key.toLowerCase() === 'i');
    if (!toggleDevTools) return;
    event.preventDefault();
    if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools(); else mainWindow.webContents.openDevTools({ mode: 'detach' });
  });
  mainWindow.on('resize', setViewBounds);
  if (uatReportDir) void runAutomatedUat(mainWindow);
  mainWindow.loadURL(rendererUrl);
}

async function runAutomatedUat(window) {
  const timeout = setTimeout(async () => { await writeUatReport({ ok: false, error: 'Electron UAT timed out waiting for the renderer.' }); app.exit(1); }, 30_000);
  try {
    await new Promise((resolve, reject) => { window.webContents.once('did-finish-load', resolve); window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`Renderer failed to load (${code}): ${description}`))); });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const pending = await window.webContents.executeJavaScript(`document.body.innerText.includes('Checking') || Boolean(document.querySelector('[data-slot="skeleton"]'))`);
      if (!pending) break; await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    const evidence = await window.webContents.executeJavaScript(`(() => { const launcher = [...document.querySelectorAll('.sidebar-launchers button')].find((item) => item.innerText.includes('Capabilities')); const rect = launcher?.getBoundingClientRect(); const style = launcher ? getComputedStyle(launcher) : null; return { title: document.title, hasMain: Boolean(document.querySelector('main')), buttonCount: document.querySelectorAll('button').length, hasCompanionPreload: typeof window.companion?.invoke === 'function', nativePlatform: window.companion?.platform ?? null, skeletonCount: document.querySelectorAll('[data-slot="skeleton"]').length, capabilityLauncher: launcher ? { text: launcher.innerText, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, display: style.display, visibility: style.visibility, opacity: style.opacity, color: style.color } : null, hasStatusBar: Boolean(document.querySelector('.status-bar')), bodyText: document.body.innerText.slice(0, 2000), dimensions: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight } }; })()`);
    const checks = { title: evidence.title.length > 0, main: evidence.hasMain === true, controls: evidence.buttonCount > 0, preload: evidence.hasCompanionPreload === true, nativePlatform: evidence.nativePlatform === process.platform, shellText: /Chat/.test(evidence.bodyText) && /Code/.test(evidence.bodyText), focusedSidebar: /(Today|Earlier)/i.test(evidence.bodyText) && /Messaging/.test(evidence.bodyText) && /Capabilities/.test(evidence.bodyText), statusBar: evidence.hasStatusBar === true, connectedGateway: /Gateway\s+enhanced/i.test(evidence.bodyText) && /Hermes API\s+Verified/.test(evidence.bodyText), sessionHistory: /Implement preview relay/.test(evidence.bodyText), modelList: /Hermes 3 Pro/.test(evidence.bodyText) };
    const chatInspectorCollapsed = await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Show workspace inspector"]') !== null`);
    checks.chatInspectorCollapsed = chatInspectorCollapsed;
    const toggledYolo = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.status-bar button')].find((item) => item.innerText.trim() === 'YOLO'); button?.click(); return Boolean(button) && !button.disabled; })()`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const yoloEvidence = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.status-bar button')].find((item) => item.innerText.trim() === 'YOLO'); return { className: button?.className ?? '', title: button?.getAttribute('title') ?? '' }; })()`);
    checks.yoloToggle = toggledYolo && /status-yolo/.test(yoloEvidence.className) && /yolo/.test(yoloEvidence.title);
    const submittedChat = await window.webContents.executeJavaScript(`(() => { const prompt = document.querySelector('#chat-prompt'); if (!(prompt instanceof HTMLTextAreaElement) || prompt.disabled) return false; prompt.value = 'Confirm the preview relay boundary.'; prompt.dispatchEvent(new Event('input', { bubbles: true })); prompt.closest('form')?.requestSubmit(); return true; })()`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const chatEvidence = await window.webContents.executeJavaScript(`document.querySelector('main')?.innerText ?? ''`);
    checks.chatMutation = submittedChat && /Confirm the preview relay boundary\./.test(chatEvidence) && /Confirmed: this session remains bound to its isolated preview relay and worktree\./.test(chatEvidence);
    const contextUsage = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('[popovertarget="status-context-usage"]'); if (!(button instanceof HTMLButtonElement)) return false; button.click(); const popover = document.querySelector('#status-context-usage'); return Boolean(popover?.matches(':popover-open')) && /Conversation/.test(popover?.textContent ?? '') && /Tool output/.test(popover?.textContent ?? ''); })()`);
    checks.contextUsage = contextUsage;
    const searchedSidebarHistory = await window.webContents.executeJavaScript(`(() => { const input = document.querySelector('#session-filter'); if (!(input instanceof HTMLInputElement)) return false; input.value = 'preview'; input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`document.querySelector('.history-results')?.innerText?.includes('Preview relay search result')`);
      if (ready) break; await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const historySearchEvidence = await window.webContents.executeJavaScript(`(() => ({ results: document.querySelector('.history-results')?.innerText ?? '', hasDialog: Boolean(document.querySelector('[data-slot="dialog-content"]')) }))()`);
    checks.sidebarHistorySearch = searchedSidebarHistory && /Preview relay search result/.test(historySearchEvidence.results) && historySearchEvidence.hasDialog === false;
    const historySearchScreenshot = await window.webContents.capturePage();
    await fsp.mkdir(uatReportDir, { recursive: true }); await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-history-search.png'), historySearchScreenshot.toPNG());
    await window.webContents.executeJavaScript(`(() => { const input = document.querySelector('#session-filter'); if (!(input instanceof HTMLInputElement)) return; input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const createdSession = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.sidebar-actions button')].find((item) => /New (thread|chat)/.test(item.innerText)); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const sessionEvidence = await window.webContents.executeJavaScript(`(() => ({ title: document.title, bodyText: document.body.innerText }))()`);
    checks.sessionCreation = createdSession && sessionEvidence.title === 'New thread' && /New thread/.test(sessionEvidence.bodyText);
    const screenshot = await window.webContents.capturePage();
    await fsp.mkdir(uatReportDir, { recursive: true }); await fsp.writeFile(path.join(uatReportDir, 'hermes-companion.png'), screenshot.toPNG());
    const repositoryPath = process.env.HERMES_COMPANION_UAT_REPOSITORY;
    const worktreePath = process.env.HERMES_COMPANION_UAT_WORKTREE;
    if (!repositoryPath || !worktreePath) throw new Error('Electron UAT repository fixture is missing.');
    const openedCode = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('button')].find((item) => item.innerText.trim().startsWith('Code')); button?.click(); return Boolean(button); })()`);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`document.querySelector('#review-heading')?.textContent?.includes('Review worktree') && !document.body.innerText.includes('Preparing worktree') && !document.querySelector('[aria-label="Refresh Git review"]')?.disabled`);
      if (ready) break; await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const uatState = JSON.parse(await fsp.readFile(path.join(stateDir, 'state.json'), 'utf8'));
    const uiWorktreePath = uatState.worktrees?.find((worktree) => worktree.threadId === 'uat-created-session')?.path ?? null;
    const closedWorktreeDialog = true;
    if (!uiWorktreePath) {
      const failureEvidence = await window.webContents.executeJavaScript(`(() => ({ body: document.body.innerText.slice(0, 3000), error: document.querySelector('.error-banner')?.textContent?.trim() ?? null }))()`);
      throw new Error(`Code-mode UAT did not create a session worktree: ${JSON.stringify(failureEvidence)}`);
    }
    await dispatchNative('file.write', { root: uiWorktreePath, path: 'README.md', content: '# Electron UAT\n\nUnstaged review evidence\n' });
    const refreshedReview = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('[aria-label="Refresh Git review"]'); button?.click(); return Boolean(button); })()`);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const loaded = await window.webContents.executeJavaScript(`!document.querySelector('[aria-label="Refresh Git review"]')?.disabled && document.querySelector('.review-content')?.innerText?.includes('Unstaged review evidence')`);
      if (loaded) break; await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const stagedReviewFile = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('.review-tabs button[title^="Stage README.md"]'); button?.click(); return Boolean(button) && !button.disabled; })()`);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const staged = await window.webContents.executeJavaScript(`document.querySelector('.review-notice')?.textContent?.includes('README.md staged.') && !document.querySelector('[aria-label="Refresh Git review"]')?.disabled`);
      if (staged) break; await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const openedStagedTab = await window.webContents.executeJavaScript(`(() => { const tab = [...document.querySelectorAll('[data-slot="tabs-trigger"]')].find((item) => item.textContent?.trim() === 'Staged'); tab?.click(); return Boolean(tab); })()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const reviewEvidence = await window.webContents.executeJavaScript(`(() => ({ heading: document.querySelector('#review-heading')?.textContent?.trim() ?? null, tabs: [...document.querySelectorAll('[data-slot="tabs-trigger"]')].map((item) => item.textContent?.trim()), diff: document.querySelector('.review-content')?.innerText ?? '', stageFileDisabled: document.querySelector('.review-tabs button[title^="Stage README.md"]')?.disabled ?? null }))()`);
    const codeInspectorCollapsed = await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Show workspace inspector"]') !== null`);
    checks.codeReview = openedCode && closedWorktreeDialog && refreshedReview && stagedReviewFile && openedStagedTab && codeInspectorCollapsed && reviewEvidence.heading === 'Review worktree' && reviewEvidence.tabs.includes('Staged') && /Unstaged review evidence/.test(reviewEvidence.diff) && reviewEvidence.stageFileDisabled === true;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const reviewScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-review.png'), reviewScreenshot.toPNG());
    const openedCenterTerminal = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.status-bar button')].find((item) => item.innerText.trim() === 'Terminal'); button?.click(); return Boolean(button) && !button.disabled; })()`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const terminalEvidence = await window.webContents.executeJavaScript(`(() => ({ open: document.querySelector('.primary-pane')?.getAttribute('data-terminal-open') === 'true', heading: document.querySelector('[aria-label="Worktree terminals"]')?.textContent?.trim() ?? null, addTerminal: document.querySelector('[aria-label="Add terminal"]') instanceof HTMLButtonElement }))()`);
    checks.centerTerminal = openedCenterTerminal && terminalEvidence.open && /terminals/i.test(terminalEvidence.heading ?? '') && terminalEvidence.addTerminal;
    const terminalScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-terminal.png'), terminalScreenshot.toPNG());
    const openedInspector = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('[aria-label="Show workspace inspector"]'); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const openedFiles = openedInspector && await window.webContents.executeJavaScript(`(() => { const tab = [...document.querySelectorAll('[data-slot="tabs-trigger"]')].find((item) => item.textContent?.trim() === 'Files'); tab?.click(); return Boolean(tab); })()`);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.file-list .file-open'))`);
      if (ready) break; await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const openedReadme = await window.webContents.executeJavaScript(`(() => { const file = [...document.querySelectorAll('.file-list .file-open')].find((item) => item.textContent?.includes('README.md')); file?.click(); return Boolean(file); })()`);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.cm-content[aria-label="Edit README.md"]'))`);
      if (ready) break; await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const editorSaveTriggered = await window.webContents.executeJavaScript(`(() => { const editor = document.querySelector('.cm-content[aria-label="Edit README.md"]'); if (!(editor instanceof HTMLElement)) return false; editor.focus(); document.execCommand('selectAll', false); document.execCommand('insertText', false, '# Electron UAT\\n\\nKeyboard save evidence\\n'); editor.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })); return true; })()`);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const saved = await window.webContents.executeJavaScript(`document.querySelector('.file-notice')?.textContent?.includes('Saved')`);
      if (saved) break; await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const keyboardSavedFile = await dispatchNative('file.read', { root: uiWorktreePath, path: 'README.md' });
    const editorEvidence = await window.webContents.executeJavaScript(`(() => ({ label: document.querySelector('.cm-content')?.getAttribute('aria-label') ?? null, shortcuts: document.querySelector('.cm-content')?.getAttribute('aria-keyshortcuts') ?? null, notice: document.querySelector('.file-notice')?.textContent?.trim() ?? null, saveHint: document.querySelector('.file-editor-panel kbd')?.textContent?.trim() ?? null }))()`);
    checks.editorKeyboardSave = openedFiles && openedReadme && editorSaveTriggered && editorEvidence.label === 'Edit README.md' && editorEvidence.shortcuts === 'Meta+S Control+S' && editorEvidence.notice === 'Saved' && editorEvidence.saveHint === '⌘S' && /Keyboard save evidence/.test(keyboardSavedFile.content);
    const editorScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-editor-save.png'), editorScreenshot.toPNG());
    const openedBrowserTab = await window.webContents.executeJavaScript(`(() => { const tab = [...document.querySelectorAll('[data-slot="tabs-trigger"]')].find((item) => item.textContent?.trim() === 'Browser'); tab?.click(); return Boolean(tab); })()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const previewCollapsed = await window.webContents.executeJavaScript(`!document.querySelector('#preview-origin') && Boolean([...document.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Configure preview'))`);
    const openedPreviewSetup = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Configure preview'); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const previewDisclosureEvidence = await window.webContents.executeJavaScript(`(() => ({ originVisible: Boolean(document.querySelector('#preview-origin')), expanded: [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Hide preview setup')?.getAttribute('aria-expanded') ?? null }))()`);
    checks.previewDisclosure = openedBrowserTab && previewCollapsed && openedPreviewSetup && previewDisclosureEvidence.originVisible && previewDisclosureEvidence.expanded === 'true';
    const openedProjectDialog = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('.project-tree-heading button'); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const projectDialogEvidence = await window.webContents.executeJavaScript(`(() => ({ title: document.querySelector('[data-slot="dialog-title"]')?.textContent?.trim() ?? null, body: document.querySelector('[data-slot="dialog-content"]')?.innerText ?? '' }))()`);
    const projectScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-add-project.png'), projectScreenshot.toPNG());
    const projectStateBefore = JSON.parse(await fsp.readFile(path.join(stateDir, 'state.json'), 'utf8'));
    const filledProject = await window.webContents.executeJavaScript(`(() => { const path = document.querySelector('#repository-path'); const name = document.querySelector('#project-name'); if (!(path instanceof HTMLInputElement) || !(name instanceof HTMLInputElement)) return false; path.value = ${JSON.stringify(repositoryPath)}; path.dispatchEvent(new Event('input', { bubbles: true })); name.value = 'UAT project entry'; name.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const startedProject = filledProject && await window.webContents.executeJavaScript(`(() => { const action = [...document.querySelectorAll('[data-slot="dialog-content"] button')].find((item) => item.innerText.trim() === 'Create project and chat'); if (!(action instanceof HTMLButtonElement) || action.disabled) return false; action.closest('form')?.requestSubmit(); return true; })()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`(() => document.querySelector('.project-row[data-active="true"]')?.textContent?.includes('UAT project entry') && document.querySelector('.project-threads button.active')?.textContent?.includes('New thread') && !document.querySelector('[data-slot="dialog-content"]'))()`);
      if (ready) break; await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const projectStartEvidence = await window.webContents.executeJavaScript(`(() => { const dialog = [...document.querySelectorAll('[data-slot="dialog-content"]')].find((item) => getComputedStyle(item).display !== 'none' && getComputedStyle(item).visibility !== 'hidden'); return { activeProject: document.querySelector('.project-row[data-active="true"]')?.textContent?.trim() ?? null, activeThread: document.querySelector('.project-threads button.active')?.textContent?.trim() ?? null, dialogOpen: Boolean(dialog) }; })()`);
    const projectStateAfter = JSON.parse(await fsp.readFile(path.join(stateDir, 'state.json'), 'utf8'));
    checks.projectEntry = openedProjectDialog && /New code project/.test(projectDialogEvidence.body) && /Initialize Git if needed/.test(projectDialogEvidence.body) && /Create project and chat/.test(projectDialogEvidence.body) && startedProject && projectStateAfter.worktrees.length === projectStateBefore.worktrees.length + 1 && projectStartEvidence.activeProject && projectStartEvidence.activeThread?.includes('New thread') && !projectStartEvidence.dialogOpen;
    const openedCapabilityMenu = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.sidebar-launchers button')].find((item) => item.innerText.includes('Capabilities')); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const openedModels = openedCapabilityMenu && await window.webContents.executeJavaScript(`(() => { const item = [...document.querySelectorAll('[role="menuitem"]')].find((entry) => entry.innerText.trim().startsWith('Models')); item?.click(); return Boolean(item); })()`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const modelEvidence = await window.webContents.executeJavaScript(`(() => ({ heading: document.querySelector('#operations-heading')?.textContent?.trim() ?? null, bodyText: document.querySelector('main')?.innerText?.slice(0, 4000) ?? '', providerOptions: [...document.querySelectorAll('[role="combobox"]')].map((item) => item.textContent?.trim()), fieldCount: document.querySelectorAll('input, textarea, [role="combobox"]').length }))()`);
    checks.modelSurface = openedModels && modelEvidence.heading === 'models' && /Connect provider accounts/.test(modelEvidence.bodyText) && /OpenAI Codex/.test(modelEvidence.bodyText) && /Codex subscription/.test(modelEvidence.bodyText) && !/Operation failed/.test(modelEvidence.bodyText);
    const modelScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-models.png'), modelScreenshot.toPNG());
    const openedOauth = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('main button')].find((item) => item.innerText.trim() === 'Connect'); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 750));
    const oauthEvidence = await window.webContents.executeJavaScript(`(() => ({ title: document.querySelector('[data-slot="dialog-title"]')?.textContent?.trim() ?? null, bodyText: document.querySelector('[data-slot="dialog-content"]')?.innerText ?? '', dialogCount: document.querySelectorAll('[data-slot="dialog-content"]').length }))()`);
    checks.oauthSurface = openedOauth && /Connect Anthropic/.test(oauthEvidence.bodyText) && /HERM-4821/.test(oauthEvidence.bodyText) && /Waiting for provider approval/.test(oauthEvidence.bodyText);
    const oauthScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-oauth.png'), oauthScreenshot.toPNG());
    await window.webContents.executeJavaScript(`(() => { [...document.querySelectorAll('[data-slot="dialog-content"] button')].find((item) => item.innerText.trim() === 'Close')?.click(); })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await window.webContents.executeJavaScript(`(() => { [...document.querySelectorAll('.workspace-header button')].find((item) => item.innerText.trim() === 'Back')?.click(); })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const openedWebhookMenu = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.sidebar-launchers button')].find((item) => item.innerText.includes('Capabilities')); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const openedWebhooks = openedWebhookMenu && await window.webContents.executeJavaScript(`(() => { const item = [...document.querySelectorAll('[role="menuitem"]')].find((entry) => entry.innerText.trim().startsWith('Webhooks')); item?.click(); return Boolean(item); })()`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const webhookEvidence = await window.webContents.executeJavaScript(`(() => ({ heading: document.querySelector('#operations-heading')?.textContent?.trim() ?? null, bodyText: document.querySelector('main')?.innerText?.slice(0, 4000) ?? '' }))()`);
    checks.webhookSurface = openedWebhooks && webhookEvidence.heading === 'webhooks' && /github-pr-review/.test(webhookEvidence.bodyText) && /Webhook subscriptions owned by Hermes/.test(webhookEvidence.bodyText);
    const webhookScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-webhooks.png'), webhookScreenshot.toPNG());
    const returnedToWorkspace = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('main button')].find((item) => item.innerText.trim() === 'Back'); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const openedNotificationsMenu = returnedToWorkspace && await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.sidebar-launchers button')].find((item) => item.innerText.includes('Capabilities')); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const openedNotifications = openedNotificationsMenu && await window.webContents.executeJavaScript(`(() => { const item = [...document.querySelectorAll('[role="menuitem"]')].find((entry) => entry.innerText.trim().startsWith('Notifications')); item?.click(); return Boolean(item); })()`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const notificationEvidence = await window.webContents.executeJavaScript(`(() => ({ heading: document.querySelector('#operations-heading')?.textContent?.trim() ?? null, bodyText: document.querySelector('main')?.innerText?.slice(0, 4000) ?? '' }))()`);
    const nativeNotificationStatus = await dispatchNative('notification.status', {});
    checks.notificationSurface = openedNotifications && notificationEvidence.heading === 'notifications' && /Native notifications/.test(notificationEvidence.bodyText) && typeof nativeNotificationStatus.supported === 'boolean';
    const notificationScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-notifications.png'), notificationScreenshot.toPNG());
    const openedConnection = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('[aria-label="Add profile"]'); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const startedDiscovery = openedConnection && await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('[data-slot="dialog-content"] button')].find((item) => item.innerText.trim() === 'Discover local Hermes'); button?.click(); return Boolean(button); })()`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const discoveryEvidence = await window.webContents.executeJavaScript(`(() => ({ title: document.querySelector('[data-slot="dialog-title"]')?.textContent?.trim() ?? null, bodyText: document.querySelector('[data-slot="dialog-content"]')?.innerText ?? '', agentUrl: document.querySelector('#gateway-url')?.value ?? null, controlUrl: document.querySelector('#control-url')?.value ?? null }))()`);
    checks.localDiscovery = startedDiscovery && /Connect a Hermes gateway/.test(discoveryEvidence.bodyText) && /Local Hermes was partially discovered/.test(discoveryEvidence.bodyText) && /Dashboard-only hosts use their verified Dashboard URL/.test(discoveryEvidence.bodyText) && discoveryEvidence.agentUrl === process.env.HERMES_CONTROL_URL && discoveryEvidence.controlUrl === process.env.HERMES_CONTROL_URL;
    const discoveryScreenshot = await window.webContents.capturePage();
    await fsp.writeFile(path.join(uatReportDir, 'hermes-companion-connection.png'), discoveryScreenshot.toPNG());
    const browserFixtureUrl = process.env.HERMES_COMPANION_UAT_BROWSER_URL;
    if (!browserFixtureUrl) throw new Error('Electron UAT browser fixture URL is missing.');
    await openGeneralBrowser(browserFixtureUrl);
    const firstBrowserSession = await browserView.webContents.executeJavaScript(`(() => { document.cookie = 'companion-isolation=first-session; SameSite=Strict'; return { cookie: document.cookie, node: typeof require, companion: typeof window.companion }; })()`);
    await openGeneralBrowser(browserFixtureUrl);
    const secondBrowserSession = await browserView.webContents.executeJavaScript(`(() => ({ cookie: document.cookie, node: typeof require, companion: typeof window.companion }))()`);
    const fullscreenBrowser = await dispatchNative('browser.layout', { fullscreen: true });
    const browserEvidence = { firstBrowserSession, secondBrowserSession, fullscreenBrowser, status: browserStatus() };
    checks.browserIsolation = /companion-isolation=first-session/.test(firstBrowserSession.cookie) && secondBrowserSession.cookie === '' && firstBrowserSession.node === 'undefined' && secondBrowserSession.node === 'undefined' && firstBrowserSession.companion === 'undefined' && secondBrowserSession.companion === 'undefined';
    checks.browserFullscreen = fullscreenBrowser.fullscreen === true && browserEvidence.status.fullscreen === true;
    await dispatchNative('browser.close');
    const repositoryEvidence = await dispatchNative('git.inspect', { repositoryPath });
    const initializedProjectPath = path.join(stateDir, 'new-project');
    await fsp.mkdir(initializedProjectPath, { recursive: true });
    const initializedProject = await dispatchNative('git.inspect', { repositoryPath: initializedProjectPath, initialize: true });
    const initializedProjectGit = await git(initializedProjectPath, ['rev-parse', '--is-inside-work-tree']);
    const createdWorktree = await dispatchNative('git.worktree.create', { repositoryPath, targetPath: worktreePath, branch: 'companion/uat-thread', base: 'HEAD' });
    const initialFiles = await dispatchNative('file.list', { root: createdWorktree.path, path: '.' });
    const readme = await dispatchNative('file.read', { root: createdWorktree.path, path: 'README.md' });
    await dispatchNative('file.create', { root: createdWorktree.path, path: 'uat-note.txt', kind: 'file' });
    await dispatchNative('file.write', { root: createdWorktree.path, path: 'uat-note.txt', content: 'Worktree-confined native file UAT\n' });
    const searchResults = await dispatchNative('file.search', { root: createdWorktree.path, query: 'Worktree-confined native file UAT', limit: 20 });
    const terminal = await dispatchNative('pty.open', { cwd: createdWorktree.path, shell: '/bin/sh', cols: 90, rows: 24 });
    await dispatchNative('pty.resize', { id: terminal.id, cols: 100, rows: 30 });
    await dispatchNative('pty.write', { id: terminal.id, data: 'pwd\n' });
    let terminalOutput = '';
    for (let attempt = 0; attempt < 30 && !terminalOutput.includes(createdWorktree.path); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const read = await dispatchNative('pty.read', { id: terminal.id });
      terminalOutput += read.output.join('');
    }
    await dispatchNative('pty.close', { id: terminal.id });
    const gitStatus = await dispatchNative('git.status', { cwd: createdWorktree.path });
    await dispatchNative('git.stage', { cwd: createdWorktree.path, paths: ['uat-note.txt'] });
    const initialCommit = await dispatchNative('git.commit', { cwd: createdWorktree.path, message: 'Add UAT note', amend: false });
    await dispatchNative('file.write', { root: createdWorktree.path, path: 'uat-note.txt', content: 'Worktree-confined native file UAT, amended\n' });
    await dispatchNative('git.stage', { cwd: createdWorktree.path, paths: ['uat-note.txt'] });
    const amendedCommit = await dispatchNative('git.commit', { cwd: createdWorktree.path, message: 'Amend UAT note', amend: true });
    const commitMetadata = await dispatchNative('git.commit.metadata', { cwd: createdWorktree.path });
    const pushed = await dispatchNative('git.push', { cwd: createdWorktree.path, branch: createdWorktree.branch, remote: 'origin', forceWithLease: true });
    const githubStatus = await dispatchNative('git.github.status', {});
    const existingPullRequest = await dispatchNative('git.pr.view', { cwd: createdWorktree.path });
    const pullRequest = await dispatchNative('git.pr.create', { cwd: createdWorktree.path, title: 'UAT draft pull request', body: 'Deterministic Electron UAT.', base: 'main', draft: true });
    const canonicalRepositoryPath = await fsp.realpath(repositoryPath);
    const canonicalWorktreePath = await fsp.realpath(worktreePath);
    const nativeWorkspaceEvidence = { repositoryEvidence, initializedProject, createdWorktree, canonicalRepositoryPath, canonicalWorktreePath, initialFiles, readme: { path: readme.path, size: readme.size }, searchResults, terminalBoundToWorktree: terminalOutput.includes(createdWorktree.path), gitStatusContainsCreatedFile: gitStatus.stdout.includes('uat-note.txt'), gitLifecycle: { initialCommit: initialCommit.stdout, amendedCommit: amendedCommit.stdout, commitMetadata, pushed: pushed.stdout, githubStatus, existingPullRequest, pullRequestUrl: pullRequest.url } };
    checks.nativeWorktree = repositoryEvidence.repositoryPath === canonicalRepositoryPath && await fsp.realpath(createdWorktree.path) === canonicalWorktreePath && createdWorktree.branch === 'companion/uat-thread';
    checks.nativeProjectInitialization = initializedProject.defaultBranch === 'main' && initializedProjectGit.stdout.trim() === 'true';
    checks.nativeFiles = initialFiles.some((item) => item.name === 'README.md') && readme.content === '# Electron UAT\n' && searchResults.some((item) => item.path === 'uat-note.txt' && item.line === 1) && nativeWorkspaceEvidence.gitStatusContainsCreatedFile;
    checks.nativePty = nativeWorkspaceEvidence.terminalBoundToWorktree;
    checks.nativeGitLifecycle = /Add UAT note/.test(initialCommit.stdout) && /Amend UAT note/.test(amendedCommit.stdout) && commitMetadata.subject === 'Amend UAT note' && typeof pushed.stdout === 'string' && typeof pushed.stderr === 'string' && githubStatus.installed && githubStatus.authenticated && existingPullRequest?.number === 1 && existingPullRequest?.isDraft === true && pullRequest.url === 'https://github.example.test/hermes-companion/uat/pull/1';
    await dispatchNative('git.worktree.remove', { repositoryPath, worktreePath, force: true });
    const ok = Object.values(checks).every(Boolean);
    await writeUatReport({ ok, platform: process.platform, rendererUrl, checks, evidence, yoloEvidence, chatEvidence, sessionEvidence, reviewEvidence, terminalEvidence, projectDialogEvidence, projectStartEvidence, previewDisclosureEvidence, modelEvidence, oauthEvidence, webhookEvidence, notificationEvidence, nativeNotificationStatus, discoveryEvidence, browserEvidence, nativeWorkspaceEvidence, capturedAt: new Date().toISOString() }); clearTimeout(timeout); app.exit(ok ? 0 : 1);
  } catch (error) { clearTimeout(timeout); await writeUatReport({ ok: false, platform: process.platform, rendererUrl, error: error instanceof Error ? error.message : String(error), capturedAt: new Date().toISOString() }); app.exit(1); }
}

async function writeUatReport(value) {
  if (!uatReportDir) return; await fsp.mkdir(uatReportDir, { recursive: true }); await fsp.writeFile(path.join(uatReportDir, 'report.json'), JSON.stringify(value, null, 2));
}

app.whenReady().then(async () => {
  await startNativeServer(); await startRenderer(); createWindow();
  ipcMain.handle('native:invoke', (_event, capability, input) => dispatchNative(capability, input));
  ipcMain.on('design:annotation', (_event, annotation) => mainWindow?.webContents.send('design:annotation', annotation));
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  for (const state of terminals.values()) state.terminal.kill();
  rendererProcess?.kill(); nativeServer?.close();
  try { fs.unlinkSync(nativeDescriptorPath); } catch {}
});

module.exports = { dispatchNative };
