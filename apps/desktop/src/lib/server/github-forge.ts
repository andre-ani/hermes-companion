import { GitHubForgeStatus, GitHubPullRequest } from '@hermes-companion/contracts';
import { getCompanionRepository } from './companion-repository.js';
import { invokeExecutionHost } from './execution-host.js';

export const getGitHubForgeStatus = async (worktreeId: string): Promise<GitHubForgeStatus> => {
  const worktree = (await getCompanionRepository().listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  return GitHubForgeStatus.parse(await invokeExecutionHost<unknown>({
    localCapability: 'git.github.status', localInput: {}, remoteCapability: 'git', remotePayload: { action: 'git.github.status', worktreeId }
  }));
};

export const getGitHubPullRequest = async (worktreeId: string): Promise<GitHubPullRequest | null> => {
  const worktree = (await getCompanionRepository().listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  return GitHubPullRequest.nullable().parse(await invokeExecutionHost<unknown>({
    localCapability: 'git.pr.view', localInput: { cwd: worktree.path }, remoteCapability: 'git', remotePayload: { action: 'git.pr.view', worktreeId }
  }));
};
