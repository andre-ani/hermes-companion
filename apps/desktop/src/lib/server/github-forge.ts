import { GitHubForgeStatus, GitHubPullRequest } from '@hermes-companion/contracts';
import { invokeExecutionHost } from './execution-host.js';
import { requireActiveWorktree } from './worktree-ownership.js';

export const getGitHubForgeStatus = async (worktreeId: string): Promise<GitHubForgeStatus> => {
  const worktree = await requireActiveWorktree(worktreeId);
  return GitHubForgeStatus.parse(await invokeExecutionHost<unknown>({
    localCapability: 'git.github.status', localInput: {}, remoteCapability: 'git', remotePayload: { action: 'git.github.status', worktreeId }, expectedConnectionId: worktree.connectionId
  }));
};

export const getGitHubPullRequest = async (worktreeId: string): Promise<GitHubPullRequest | null> => {
  const worktree = await requireActiveWorktree(worktreeId);
  return GitHubPullRequest.nullable().parse(await invokeExecutionHost<unknown>({
    localCapability: 'git.pr.view', localInput: { cwd: worktree.path }, remoteCapability: 'git', remotePayload: { action: 'git.pr.view', worktreeId }, expectedConnectionId: worktree.connectionId
  }));
};
