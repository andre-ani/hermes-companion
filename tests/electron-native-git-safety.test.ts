import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitCommitResult, GitRemoteStatus } from '@hermes-companion/contracts';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const roots: string[] = [];
let dispatchNative: (capability: string, input?: Record<string, unknown>) => Promise<unknown>;

beforeAll(() => {
  const Module = require('node:module') as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return {
      app: { isPackaged: true, whenReady: () => new Promise(() => {}), on() {}, getVersion: () => 'test', exit() {}, quit() {} },
      BrowserWindow: { getAllWindows: () => [] }, WebContentsView: class {}, session: {}, ipcMain: {}, shell: {}, utilityProcess: {}, safeStorage: {}, Notification: {}, dialog: {}
    };
    if (request === 'node-pty') return { spawn: () => { throw new Error('PTY is unavailable in native Git tests.'); } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    ({ dispatchNative } = require('../apps/desktop/electron/main.cjs') as { dispatchNative: typeof dispatchNative });
  } finally {
    Module._load = originalLoad;
  }
});

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(withOrigin = false) {
  const root = await mkdtemp(join(tmpdir(), 'hermes-electron-git-'));
  roots.push(root);
  const repo = join(root, 'repo');
  const worktree = join(root, 'worktree');
  const branch = 'companion/native-safety';
  await mkdir(repo);
  await exec('git', ['init', '-b', 'main'], { cwd: repo });
  await exec('git', ['config', 'user.email', 'native@test.invalid'], { cwd: repo });
  await exec('git', ['config', 'user.name', 'Native Test'], { cwd: repo });
  await writeFile(join(repo, 'README.md'), '# Test\n');
  await exec('git', ['add', 'README.md'], { cwd: repo });
  await exec('git', ['commit', '-m', 'initial'], { cwd: repo });
  let origin: string | null = null;
  if (withOrigin) {
    origin = join(root, 'origin.git');
    await exec('git', ['init', '--bare', '-b', 'main', origin]);
    await exec('git', ['remote', 'add', 'origin', origin], { cwd: repo });
    await exec('git', ['push', '--set-upstream', 'origin', 'main'], { cwd: repo });
  }
  await exec('git', ['worktree', 'add', '-b', branch, worktree, 'HEAD'], { cwd: repo });
  return { root, repo, worktree, branch, origin };
}

describe('Electron native Git safety actions', () => {
  it('exposes every governed Git safety action through the preload allowlist', async () => {
    const preload = await readFile(new URL('../apps/desktop/electron/preload.cjs', import.meta.url), 'utf8');
    for (const capability of ['git.stage', 'git.unstage', 'git.revert', 'git.remote.status', 'git.commit', 'git.push']) expect(preload).toContain(`'${capability}'`);
  });

  it('stages and unstages a selected path without discarding its working content', async () => {
    const { worktree } = await fixture();
    await writeFile(join(worktree, 'README.md'), '# Changed\n');
    await dispatchNative('git.stage', { cwd: worktree, paths: ['README.md'] });
    expect((await exec('git', ['diff', '--cached', '--name-only'], { cwd: worktree })).stdout.trim()).toBe('README.md');
    await dispatchNative('git.unstage', { cwd: worktree, paths: ['README.md'] });
    expect((await exec('git', ['diff', '--cached', '--name-only'], { cwd: worktree })).stdout).toBe('');
    expect((await exec('git', ['diff', '--name-only'], { cwd: worktree })).stdout.trim()).toBe('README.md');
    expect(await readFile(join(worktree, 'README.md'), 'utf8')).toBe('# Changed\n');
  });

  it('restores tracked/staged content and removes selected untracked and staged-new files', async () => {
    const { worktree } = await fixture();
    await writeFile(join(worktree, 'README.md'), '# Staged change\n');
    await dispatchNative('git.stage', { cwd: worktree, paths: ['README.md'] });
    await writeFile(join(worktree, 'scratch.txt'), 'temporary\n');
    await writeFile(join(worktree, 'staged-new.txt'), 'temporary staged content\n');
    await dispatchNative('git.stage', { cwd: worktree, paths: ['staged-new.txt'] });

    await dispatchNative('git.revert', { cwd: worktree, paths: ['README.md'] });
    await dispatchNative('git.revert', { cwd: worktree, paths: ['scratch.txt'] });
    await dispatchNative('git.revert', { cwd: worktree, paths: ['staged-new.txt'] });
    expect(await readFile(join(worktree, 'README.md'), 'utf8')).toBe('# Test\n');
    await expect(readFile(join(worktree, 'scratch.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(worktree, 'staged-new.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await exec('git', ['status', '--porcelain'], { cwd: worktree })).stdout).toBe('');
    await expect(dispatchNative('git.revert', { cwd: worktree, paths: ['README.md'] })).rejects.toThrow('no changes to revert');
  });

  it('does not auto-stage an unstaged commit', async () => {
    const { worktree } = await fixture();
    await writeFile(join(worktree, 'README.md'), '# Unstaged only\n');
    const before = (await exec('git', ['rev-parse', 'HEAD'], { cwd: worktree })).stdout.trim();
    await expect(dispatchNative('git.commit', { cwd: worktree, message: 'must not auto-stage', amend: false })).rejects.toThrow();
    expect((await exec('git', ['rev-parse', 'HEAD'], { cwd: worktree })).stdout.trim()).toBe(before);
    expect(await readFile(join(worktree, 'README.md'), 'utf8')).toBe('# Unstaged only\n');
  });

  it('returns the authoritative HEAD sha after commit', async () => {
    const { worktree } = await fixture();
    await writeFile(join(worktree, 'README.md'), '# Committed\n');
    await dispatchNative('git.stage', { cwd: worktree, paths: ['README.md'] });
    const result = GitCommitResult.parse(await dispatchNative('git.commit', { cwd: worktree, message: 'safe native commit', amend: false }));
    expect(result.sha).toBe((await exec('git', ['rev-parse', 'HEAD'], { cwd: worktree })).stdout.trim());
  });

  it('reports a missing origin as disabled and refuses to push', async () => {
    const { worktree, branch } = await fixture();
    const result = GitRemoteStatus.parse(await dispatchNative('git.remote.status', { cwd: worktree, branch, remote: 'origin' }));
    expect(result).toEqual({ remote: 'origin', configured: false, upstream: null, canPush: false, reason: "Git remote 'origin' is not configured." });
    await expect(dispatchNative('git.push', { cwd: worktree, branch, remote: 'origin', forceWithLease: false })).rejects.toThrow("remote 'origin' is not configured");
  });

  it('reports configured origin without its URL, establishes upstream, and pushes subsequent commits', async () => {
    const { worktree, branch, origin } = await fixture(true);
    const rawBefore = await dispatchNative('git.remote.status', { cwd: worktree, branch, remote: 'origin' });
    expect(GitRemoteStatus.parse(rawBefore)).toEqual({ remote: 'origin', configured: true, upstream: null, canPush: true, reason: null });
    expect(Object.keys(rawBefore as object).sort()).toEqual(['canPush', 'configured', 'reason', 'remote', 'upstream']);
    expect(JSON.stringify(rawBefore)).not.toContain(origin!);

    await dispatchNative('git.push', { cwd: worktree, branch, remote: 'origin', forceWithLease: false });
    expect((await exec('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], { cwd: worktree })).stdout.trim()).toBe(`origin/${branch}`);

    await writeFile(join(worktree, 'README.md'), '# Pushed again\n');
    await dispatchNative('git.stage', { cwd: worktree, paths: ['README.md'] });
    const committed = GitCommitResult.parse(await dispatchNative('git.commit', { cwd: worktree, message: 'second native push', amend: false }));
    await dispatchNative('git.push', { cwd: worktree, branch, remote: 'origin', forceWithLease: false });
    expect((await exec('git', ['rev-parse', `refs/heads/${branch}`], { cwd: origin! })).stdout.trim()).toBe(committed.sha);

    const rawAfter = await dispatchNative('git.remote.status', { cwd: worktree, branch, remote: 'origin' });
    expect(GitRemoteStatus.parse(rawAfter)).toEqual({ remote: 'origin', configured: true, upstream: `origin/${branch}`, canPush: true, reason: null });
    expect(Object.keys(rawAfter as object).sort()).toEqual(['canPush', 'configured', 'reason', 'remote', 'upstream']);
    expect(JSON.stringify(rawAfter)).not.toContain(origin!);
  });
});
