import { describe, expect, it } from 'vitest';
import { HermesGitWorktree, HermesSession } from '@hermes-companion/contracts';
import { validateSessionWorkspaceSession, validateSessionWorkspaceWorktree } from '../apps/desktop/src/lib/server/session-workspace-identity';

const input = {
  connectionId: 'railway', profileId: 'code', projectId: 'project-1', repositoryPath: '/repo',
  worktreePath: '/repo-worktree', branch: 'feature/session', sessionId: 'session-1'
};

const session = HermesSession.parse({
  id: input.sessionId, title: 'Session', profileId: input.profileId, projectId: input.projectId,
  cwd: input.worktreePath, branch: input.branch, source: 'chat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
});

const worktree = HermesGitWorktree.parse({ path: input.worktreePath, branch: input.branch });

describe('session workspace identity', () => {
  it('accepts only the exact Hermes-owned session tuple', () => {
    expect(validateSessionWorkspaceSession(input, session)).toEqual({ ok: true });
    for (const changed of [
      { id: 'other' }, { profileId: 'other' }, { profileId: null }, { projectId: 'other' },
      { projectId: null }, { cwd: '/other' }, { cwd: null }, { branch: 'other' }, { branch: null }
    ]) {
      expect(validateSessionWorkspaceSession(input, { ...session, ...changed })).toMatchObject({ ok: false, reason: expect.any(String) });
    }
  });

  it('accepts only a linked non-main, non-detached worktree on the exact branch', () => {
    expect(validateSessionWorkspaceWorktree(input, [worktree])).toEqual({ ok: true, target: worktree });
    expect(validateSessionWorkspaceWorktree(input, [])).toMatchObject({ ok: false });
    expect(validateSessionWorkspaceWorktree(input, [{ ...worktree, isMain: true }])).toMatchObject({ ok: false });
    expect(validateSessionWorkspaceWorktree(input, [{ ...worktree, detached: true }])).toMatchObject({ ok: false });
    expect(validateSessionWorkspaceWorktree(input, [{ ...worktree, branch: 'other' }])).toMatchObject({ ok: false });
  });
});
