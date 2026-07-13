import { describe, expect, it } from 'vitest';
import { HermesGitBranch, HermesGitWorkspace, HermesGitWorktree, HermesRepoStatus, HermesReviewList, HermesReviewShipInfo, HermesWorktreeCreateInput } from '@hermes-companion/contracts';
import { normalizeHermesProject, normalizeHermesProjectTreeNode } from '../apps/desktop/src/lib/server/hermes-projects';

describe('Hermes project contracts', () => {
  it('normalizes the profile-scoped projects.list shape', () => {
    expect(normalizeHermesProject({
      id: 'p_companion',
      name: 'Hermes Companion',
      primary_path: '/workspace/hermes-companion',
      folders: [{ path: '/workspace/hermes-companion', is_primary: true }]
    }, 'railway-hermes')).toEqual({
      id: 'p_companion',
      name: 'Hermes Companion',
      repositoryPath: '/workspace/hermes-companion',
      remoteUrl: null,
      defaultBranch: 'main',
      connectionId: 'railway-hermes',
      archived: false
    });
  });

  it('rejects project records without a usable Hermes folder', () => {
    expect(normalizeHermesProject({ id: 'p_empty', name: 'Empty', folders: [] }, 'railway-hermes')).toBeNull();
  });

  it('preserves archived state for reversible project filtering', () => {
    expect(normalizeHermesProject({ id: 'p_old', name: 'Old', primary_path: '/workspace/old', archived: true }, 'railway-hermes')).toMatchObject({ archived: true });
  });

  it('normalizes the authoritative project → repository → lane tree without deriving membership', () => {
    expect(normalizeHermesProjectTreeNode({
      id: 'p_companion', label: 'Hermes Companion', path: '/workspace/hermes-companion', sessionCount: 1,
      previewSessions: [{ id: 's_preview', title: 'Preview', cwd: '/workspace/hermes-companion', git_branch: 'main', started_at: 1_700_000_000 }],
      repos: [{ id: '/workspace/hermes-companion', label: 'hermes-companion', path: '/workspace/hermes-companion', sessionCount: 1, groups: [{ id: '/workspace/hermes-companion::branch::main', label: 'main', path: '/workspace/hermes-companion', isMain: true, sessions: [{ id: 's_live', title: 'Live', cwd: '/workspace/hermes-companion', git_branch: 'main', last_active: 1_700_000_100 }] }] }]
    })).toMatchObject({
      id: 'p_companion', sessionCount: 1,
      previewSessions: [{ id: 's_preview', branch: 'main' }],
      repos: [{ sessionCount: 1, groups: [{ id: '/workspace/hermes-companion::branch::main', isMain: true, sessions: [{ id: 's_live', branch: 'main' }] }] }]
    });
  });

  it('rejects malformed tree nodes instead of creating phantom projects', () => {
    expect(normalizeHermesProjectTreeNode({ id: 'p_missing_label', repos: [] })).toBeNull();
  });

  it('parses the upstream Hermes worktree and branch wire shapes', () => {
    expect(HermesGitWorktree.parse({
      path: '/workspace/project/.worktrees/search-context',
      branch: 'hermes/search-context',
      isMain: false,
      detached: false,
      locked: false
    })).toMatchObject({ branch: 'hermes/search-context', isMain: false });
    expect(HermesGitBranch.parse({
      name: 'main',
      checkedOut: true,
      isDefault: true,
      worktreePath: '/workspace/project'
    })).toMatchObject({ name: 'main', checkedOut: true, isDefault: true });
  });

  it('does not permit an existing-branch worktree request to mix creation fields', () => {
    expect(HermesWorktreeCreateInput.safeParse({
      projectId: 'p_companion',
      existingBranch: 'feature/already-created',
      name: 'duplicate-intent'
    }).success).toBe(false);
    expect(HermesWorktreeCreateInput.safeParse({
      projectId: 'p_companion',
      existingBranch: 'feature/already-created'
    }).success).toBe(true);
  });

  it('parses native Hermes Git review state without inventing review metadata', () => {
    expect(HermesGitWorkspace.parse({
      projectId: 'p_companion', repositoryPath: '/workspace/hermes-companion',
      path: '/workspace/hermes-companion', branch: 'main'
    })).toMatchObject({ projectId: 'p_companion', branch: 'main' });
    expect(HermesRepoStatus.parse({
      branch: 'main', defaultBranch: 'main', detached: false, ahead: 1, behind: 0,
      staged: 1, unstaged: 1, untracked: 0, conflicted: 0, changed: 1, added: 8, removed: 3,
      files: [{ path: 'src/app.ts', staged: true, unstaged: true, untracked: false, conflicted: false }]
    })).toMatchObject({ added: 8, removed: 3, files: [{ path: 'src/app.ts' }] });
    expect(HermesReviewList.parse({
      base: null,
      files: [{ path: 'src/app.ts', status: 'modified', staged: false, added: 8, removed: 3 }]
    }).files).toHaveLength(1);
    expect(HermesReviewShipInfo.parse({ ghReady: true, pr: null })).toEqual({ ghReady: true, pr: null });
  });
});
