import type { HermesGitWorktree, HermesSession } from '@hermes-companion/contracts';

export type SessionWorkspaceIdentity = {
  connectionId: string;
  profileId: string;
  projectId: string;
  repositoryPath: string;
  worktreePath: string;
  branch: string;
  sessionId: string;
};

export function validateSessionWorkspaceSession(input: SessionWorkspaceIdentity, session: HermesSession) {
  if (session.id !== input.sessionId) return { ok: false as const, reason: 'Hermes returned a different session.' };
  if (!session.profileId || session.profileId !== input.profileId) return { ok: false as const, reason: 'The Hermes profile no longer owns this session.' };
  if (!session.projectId || session.projectId !== input.projectId) return { ok: false as const, reason: 'The Hermes project no longer owns this session.' };
  if (!session.cwd || session.cwd !== input.worktreePath) return { ok: false as const, reason: 'The Hermes session working directory no longer matches this worktree.' };
  if (!session.branch || session.branch !== input.branch) return { ok: false as const, reason: 'The Hermes session branch no longer matches this worktree.' };
  return { ok: true as const };
}

export function validateSessionWorkspaceWorktree(input: SessionWorkspaceIdentity, worktrees: HermesGitWorktree[]) {
  const target = worktrees.find((worktree) => worktree.path === input.worktreePath);
  if (!target) return { ok: false as const, reason: 'The session worktree is no longer registered with Hermes.' };
  if (target.isMain) return { ok: false as const, reason: 'Create or select a linked worktree before using mutable coding surfaces.' };
  if (target.detached) return { ok: false as const, reason: 'Detached worktrees are not supported by the ordinary coding workflow.' };
  if (!target.branch || target.branch !== input.branch) return { ok: false as const, reason: 'The session branch no longer matches its linked worktree.' };
  return { ok: true as const, target };
}
