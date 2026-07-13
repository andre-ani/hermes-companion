import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { mkdir, realpath } from 'node:fs/promises';
import type { GitCommitResult, GitRemoteStatus } from '@hermes-companion/contracts';
import { assertAllowedExistingPath, assertAllowedTargetPath, assertBranch } from './path-policy.js';

const exec = promisify(execFile);
const validRemote = (remote: string) => /^(?!-)[A-Za-z0-9._/-]+$/.test(remote);
const validRelativePath = (value: string) => Boolean(value) && (value === '.' || (!value.startsWith('/') && !value.split(/[\\/]/).includes('..')));
const validatePaths = (paths: string[], action: string, allowAll = true) => {
  if (!paths.length || paths.some((value) => !validRelativePath(value) || (!allowAll && value === '.'))) throw new Error(`Invalid path selected for ${action}.`);
};

export async function git(cwd: string, args: string[]) {
  const safeCwd = await assertAllowedExistingPath(cwd);
  const { stdout, stderr } = await exec('git', ['-C', safeCwd, ...args], { timeout: 120_000, maxBuffer: 25 * 1024 * 1024 });
  return { stdout, stderr };
}

export async function createWorktree(input: { projectId: string; repositoryPath: string; threadId: string; branch: string; base: string }) {
  const repositoryPath = await assertAllowedExistingPath(input.repositoryPath);
  const branch = assertBranch(input.branch);
  const safeThread = input.threadId.replace(/[^A-Za-z0-9._-]/g, '-');
  const root = assertAllowedTargetPath(process.env.BRIDGE_WORKTREE_ROOT ?? join(dirname(repositoryPath), '.hermes-worktrees'));
  const target = assertAllowedTargetPath(join(root, input.projectId.replace(/[^A-Za-z0-9._-]/g, '-'), safeThread));
  await mkdir(dirname(target), { recursive: true });
  await git(repositoryPath, ['worktree', 'add', '-b', branch, target, input.base]);
  return { path: target, branch };
}

export async function attachWorktree(input: { repositoryPath: string; worktreePath: string; branch: string }) {
  const repositoryPath = await assertAllowedExistingPath(input.repositoryPath);
  const worktreePath = await assertAllowedExistingPath(input.worktreePath);
  const requestedBranch = assertBranch(input.branch);
  const listed = await git(repositoryPath, ['worktree', 'list', '--porcelain']);
  const registeredPaths = listed.stdout.split(/\n\s*\n/).flatMap((record) => {
    const line = record.split('\n').find((candidate) => candidate.startsWith('worktree '));
    return line ? [line.slice('worktree '.length)] : [];
  });
  const registered = await Promise.all(registeredPaths.map((candidate) => realpath(candidate).catch(() => '')));
  if (!registered.includes(worktreePath)) throw new Error('The selected path is not a registered worktree of this repository.');
  const actualBranch = (await git(worktreePath, ['branch', '--show-current'])).stdout.trim();
  if (!actualBranch || actualBranch !== requestedBranch) throw new Error('The selected worktree branch no longer matches Hermes state.');
  return { path: worktreePath, branch: actualBranch };
}

export async function inspectRepository(repositoryPath: string, initialize = false) {
  const root = await git(repositoryPath, ['rev-parse', '--show-toplevel']).then((result) => result.stdout.trim()).catch(async (cause) => {
    if (!initialize) throw cause;
    await git(repositoryPath, ['init', '-b', 'main']);
    return (await git(repositoryPath, ['rev-parse', '--show-toplevel'])).stdout.trim();
  });
  const name = root.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Repository';
  const currentBranch = (await git(root, ['branch', '--show-current'])).stdout.trim() || 'main';
  const remoteUrl = await git(root, ['remote', 'get-url', 'origin']).then((result) => result.stdout.trim() || null).catch(() => null);
  const defaultBranch = await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).then((result) => result.stdout.trim().replace(/^origin\//, '')).catch(() => currentBranch);
  return { name, repositoryPath: root, remoteUrl, defaultBranch };
}

export const removeWorktree = async (repositoryPath: string, worktreePath: string, force: boolean) => git(repositoryPath, ['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath]);
export const status = async (cwd: string) => git(cwd, ['status', '--porcelain=v2', '--branch']);
export const diff = async (cwd: string, cached: boolean) => git(cwd, ['diff', '--no-ext-diff', ...(cached ? ['--cached'] : []), '--']);
export async function commitMetadata(cwd: string) {
  const result = await git(cwd, ['log', '-1', '--format=%s%n%b']);
  const [subject = '', ...body] = result.stdout.replace(/\n+$/, '').split('\n');
  return { subject, body: body.join('\n').trim() };
}
export const stage = async (cwd: string, paths: string[]) => {
  validatePaths(paths, 'staging');
  return git(cwd, ['add', '--', ...paths]);
};
export const unstage = async (cwd: string, paths: string[]) => {
  validatePaths(paths, 'unstaging');
  return git(cwd, ['reset', '--quiet', 'HEAD', '--', ...paths]);
};
export async function revert(cwd: string, paths: string[]) {
  validatePaths(paths, 'reverting', false);
  for (const path of paths) {
    const before = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', path]);
    if (!before.stdout) throw new Error(`Selected path has no changes to revert: ${path}`);
    const trackedAtHead = (await git(cwd, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', path])).stdout
      .split('\0').some((candidate) => candidate === path);
    if (trackedAtHead) {
      await git(cwd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', path]);
    } else {
      await git(cwd, ['reset', '--quiet', 'HEAD', '--', path]);
      await git(cwd, ['clean', '-fd', '--', path]);
    }
    const after = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', path]);
    if (after.stdout) throw new Error(`Git could not fully revert the selected path: ${path}`);
  }
  return { ok: true as const, paths };
}
export async function commit(cwd: string, message: string, amend: boolean): Promise<GitCommitResult> {
  const result = await git(cwd, ['commit', ...(amend ? ['--amend'] : []), '-m', message]);
  const sha = (await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim();
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error('Git committed the changes but did not return a valid HEAD revision.');
  return { ...result, sha };
}
export async function remoteStatus(cwd: string, branch: string, remote: string): Promise<GitRemoteStatus> {
  if (!validRemote(remote)) throw new Error('Invalid Git remote name.');
  const expectedBranch = assertBranch(branch);
  const configured = (await git(cwd, ['remote'])).stdout.split(/\r?\n/).some((candidate) => candidate === remote);
  const currentBranch = (await git(cwd, ['branch', '--show-current'])).stdout.trim();
  const upstream = (await git(cwd, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${expectedBranch}`])).stdout.trim() || null;
  if (!configured) return { remote, configured: false, upstream, canPush: false, reason: `Git remote '${remote}' is not configured.` };
  const hasPushTarget = await git(cwd, ['remote', 'get-url', '--push', remote]).then((result) => Boolean(result.stdout.trim())).catch(() => false);
  if (!hasPushTarget) return { remote, configured: true, upstream, canPush: false, reason: `Git remote '${remote}' has no push target.` };
  if (currentBranch !== expectedBranch) return { remote, configured: true, upstream, canPush: false, reason: `The bound worktree is not on branch '${expectedBranch}'.` };
  return { remote, configured: true, upstream, canPush: true, reason: null };
}
export const push = async (cwd: string, branch: string, remote: string, forceWithLease: boolean) => {
  const readiness = await remoteStatus(cwd, branch, remote);
  if (!readiness.canPush) throw new Error(readiness.reason ?? 'This branch cannot be pushed.');
  return git(cwd, ['push', ...(forceWithLease ? ['--force-with-lease'] : []), ...(readiness.upstream ? [] : ['--set-upstream']), remote, branch]);
};
export async function githubForgeStatus() {
  try { await exec('gh', ['--version'], { timeout: 15_000, maxBuffer: 256 * 1024 }); }
  catch { return { installed: false, authenticated: false, message: 'GitHub CLI is not installed on this execution host.' }; }
  try {
    await exec('gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: 15_000, maxBuffer: 256 * 1024 });
    return { installed: true, authenticated: true, message: 'GitHub CLI is authenticated on this execution host.' };
  } catch {
    return { installed: true, authenticated: false, message: 'GitHub CLI is installed but not authenticated for github.com.' };
  }
}
export async function viewPullRequest(cwd: string) {
  const safeCwd = await assertAllowedExistingPath(cwd);
  try {
    const { stdout } = await exec('gh', ['pr', 'view', '--json', 'number,title,url,state,isDraft,reviewDecision'], { cwd: safeCwd, timeout: 30_000, maxBuffer: 512 * 1024 });
    const value = JSON.parse(stdout);
    return { number: value.number, title: value.title, url: value.url, state: value.state, isDraft: value.isDraft, reviewDecision: value.reviewDecision ?? null };
  } catch (cause) {
    const stderr = typeof cause === 'object' && cause && 'stderr' in cause ? String(cause.stderr ?? '') : '';
    const message = `${cause instanceof Error ? cause.message : String(cause)}\n${stderr}`;
    if (/no pull requests found|no pull request found|no open pull requests/i.test(message)) return null;
    throw cause;
  }
}
export async function createPullRequest(cwd: string, input: { title: string; body: string; base: string; draft: boolean }) {
  assertBranch(input.base); const safeCwd = await assertAllowedExistingPath(cwd);
  const args = ['pr', 'create', '--title', input.title, '--body', input.body, '--base', input.base, ...(input.draft ? ['--draft'] : [])];
  const { stdout, stderr } = await exec('gh', args, { cwd: safeCwd, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 });
  return { stdout, stderr, url: stdout.trim().split(/\s+/).find((value) => value.startsWith('http')) ?? null };
}

export async function mergeWorktree(parentPath: string, childPath: string, childBranch: string, message: string) {
  assertBranch(childBranch);
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
