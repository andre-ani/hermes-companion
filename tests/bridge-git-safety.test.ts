import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitCommitResult, GitRemoteStatus } from '@hermes-companion/contracts';
import { BridgeStore } from '../apps/bridge/src/bridge-store';
import { DefaultCompanionBridge } from '../apps/bridge/src/bridge';

const exec = promisify(execFile);
const roots: string[] = [];
const originalAllowedRoots = process.env.BRIDGE_ALLOWED_ROOTS;
const originalWorktreeRoot = process.env.BRIDGE_WORKTREE_ROOT;

afterEach(async () => {
  if (originalAllowedRoots === undefined) delete process.env.BRIDGE_ALLOWED_ROOTS; else process.env.BRIDGE_ALLOWED_ROOTS = originalAllowedRoots;
  if (originalWorktreeRoot === undefined) delete process.env.BRIDGE_WORKTREE_ROOT; else process.env.BRIDGE_WORKTREE_ROOT = originalWorktreeRoot;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(withOrigin = false) {
  const root = await mkdtemp(join(tmpdir(), 'hermes-bridge-git-'));
  roots.push(root);
  process.env.BRIDGE_ALLOWED_ROOTS = root;
  process.env.BRIDGE_WORKTREE_ROOT = join(root, 'worktrees');
  const repo = join(root, 'repo');
  await mkdir(repo);
  await exec('git', ['init', '-b', 'main'], { cwd: repo });
  await exec('git', ['config', 'user.email', 'bridge@test.invalid'], { cwd: repo });
  await exec('git', ['config', 'user.name', 'Bridge Test'], { cwd: repo });
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
  const bridge = new DefaultCompanionBridge(new BridgeStore(join(root, 'state.json')));
  const branch = 'companion/git-safety';
  const worktree = await bridge.handle({
    version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees',
    payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: crypto.randomUUID(), branch, base: 'HEAD' }
  }) as { worktreeId: string; path: string; branch: string };
  return { root, repo, origin, branch, worktree, bridge };
}

const gitAction = (bridge: DefaultCompanionBridge, payload: Record<string, unknown>) => bridge.handle({
  version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload
});

describe('bridge Git safety actions', () => {
  it('stages and unstages selected paths without discarding working-tree content', async () => {
    const { bridge, worktree } = await fixture();
    await writeFile(join(worktree.path, 'README.md'), '# Changed\n');
    await gitAction(bridge, { action: 'git.stage', worktreeId: worktree.worktreeId, paths: ['README.md'] });
    expect((await exec('git', ['diff', '--cached', '--name-only'], { cwd: worktree.path })).stdout.trim()).toBe('README.md');

    await gitAction(bridge, { action: 'git.unstage', worktreeId: worktree.worktreeId, paths: ['README.md'] });
    expect((await exec('git', ['diff', '--cached', '--name-only'], { cwd: worktree.path })).stdout).toBe('');
    expect((await exec('git', ['diff', '--name-only'], { cwd: worktree.path })).stdout.trim()).toBe('README.md');
    expect(await readFile(join(worktree.path, 'README.md'), 'utf8')).toBe('# Changed\n');
  });

  it('restores tracked and staged content to HEAD and removes a selected untracked file', async () => {
    const { bridge, worktree } = await fixture();
    await writeFile(join(worktree.path, 'README.md'), '# Staged change\n');
    await gitAction(bridge, { action: 'git.stage', worktreeId: worktree.worktreeId, paths: ['README.md'] });
    await writeFile(join(worktree.path, 'scratch.txt'), 'temporary\n');
    await writeFile(join(worktree.path, 'staged-new.txt'), 'temporary staged content\n');
    await gitAction(bridge, { action: 'git.stage', worktreeId: worktree.worktreeId, paths: ['staged-new.txt'] });

    await gitAction(bridge, { action: 'git.revert', worktreeId: worktree.worktreeId, paths: ['README.md'] });
    await gitAction(bridge, { action: 'git.revert', worktreeId: worktree.worktreeId, paths: ['scratch.txt'] });
    await gitAction(bridge, { action: 'git.revert', worktreeId: worktree.worktreeId, paths: ['staged-new.txt'] });
    expect(await readFile(join(worktree.path, 'README.md'), 'utf8')).toBe('# Test\n');
    await expect(readFile(join(worktree.path, 'scratch.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(worktree.path, 'staged-new.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await exec('git', ['status', '--porcelain'], { cwd: worktree.path })).stdout).toBe('');
    await expect(gitAction(bridge, { action: 'git.revert', worktreeId: worktree.worktreeId, paths: ['README.md'] })).rejects.toThrow('no changes to revert');
  });

  it('fails a commit with no staged changes and leaves HEAD and working content untouched', async () => {
    const { bridge, worktree } = await fixture();
    await writeFile(join(worktree.path, 'README.md'), '# Unstaged only\n');
    const before = (await exec('git', ['rev-parse', 'HEAD'], { cwd: worktree.path })).stdout.trim();
    await expect(gitAction(bridge, { action: 'git.commit', worktreeId: worktree.worktreeId, message: 'must not auto-stage' })).rejects.toThrow();
    expect((await exec('git', ['rev-parse', 'HEAD'], { cwd: worktree.path })).stdout.trim()).toBe(before);
    expect(await readFile(join(worktree.path, 'README.md'), 'utf8')).toBe('# Unstaged only\n');
  });

  it('returns the authoritative HEAD sha after a successful commit', async () => {
    const { bridge, worktree } = await fixture();
    await writeFile(join(worktree.path, 'README.md'), '# Committed\n');
    await gitAction(bridge, { action: 'git.stage', worktreeId: worktree.worktreeId, paths: ['README.md'] });
    const result = GitCommitResult.parse(await gitAction(bridge, { action: 'git.commit', worktreeId: worktree.worktreeId, message: 'safe commit' }));
    expect(result.sha).toBe((await exec('git', ['rev-parse', 'HEAD'], { cwd: worktree.path })).stdout.trim());
    expect((await exec('git', ['log', '-1', '--format=%s'], { cwd: worktree.path })).stdout.trim()).toBe('safe commit');
  });

  it('reports a missing origin as disabled and refuses to push', async () => {
    const { bridge, worktree } = await fixture();
    const result = GitRemoteStatus.parse(await gitAction(bridge, { action: 'git.remote.status', worktreeId: worktree.worktreeId }));
    expect(result).toEqual({ remote: 'origin', configured: false, upstream: null, canPush: false, reason: "Git remote 'origin' is not configured." });
    await expect(gitAction(bridge, { action: 'git.push', worktreeId: worktree.worktreeId })).rejects.toThrow("remote 'origin' is not configured");
  });

  it('reports a configured origin without exposing its URL and establishes the missing upstream on push', async () => {
    const { bridge, origin, branch, worktree } = await fixture(true);
    const rawBefore = await gitAction(bridge, { action: 'git.remote.status', worktreeId: worktree.worktreeId });
    const before = GitRemoteStatus.parse(rawBefore);
    expect(before).toEqual({ remote: 'origin', configured: true, upstream: null, canPush: true, reason: null });
    expect(Object.keys(rawBefore as object).sort()).toEqual(['canPush', 'configured', 'reason', 'remote', 'upstream']);
    expect(JSON.stringify(rawBefore)).not.toContain(origin!);

    await gitAction(bridge, { action: 'git.push', worktreeId: worktree.worktreeId });
    expect((await exec('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], { cwd: worktree.path })).stdout.trim()).toBe(`origin/${branch}`);
    expect((await exec('git', ['rev-parse', `refs/heads/${branch}`], { cwd: origin! })).stdout.trim()).toBe((await exec('git', ['rev-parse', 'HEAD'], { cwd: worktree.path })).stdout.trim());

    const rawAfter = await gitAction(bridge, { action: 'git.remote.status', worktreeId: worktree.worktreeId });
    const after = GitRemoteStatus.parse(rawAfter);
    expect(after).toEqual({ remote: 'origin', configured: true, upstream: `origin/${branch}`, canPush: true, reason: null });
    expect(Object.keys(rawAfter as object).sort()).toEqual(['canPush', 'configured', 'reason', 'remote', 'upstream']);
    expect(JSON.stringify(rawAfter)).not.toContain(origin!);

    await writeFile(join(worktree.path, 'README.md'), '# Pushed again\n');
    await gitAction(bridge, { action: 'git.stage', worktreeId: worktree.worktreeId, paths: ['README.md'] });
    const secondCommit = GitCommitResult.parse(await gitAction(bridge, { action: 'git.commit', worktreeId: worktree.worktreeId, message: 'second push' }));
    await gitAction(bridge, { action: 'git.push', worktreeId: worktree.worktreeId });
    expect((await exec('git', ['rev-parse', `refs/heads/${branch}`], { cwd: origin! })).stdout.trim()).toBe(secondCommit.sha);
  });
});
