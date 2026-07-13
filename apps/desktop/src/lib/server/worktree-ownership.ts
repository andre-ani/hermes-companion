import type { WorktreeRecord } from '@hermes-companion/contracts';
import { getCompanionRepository } from './companion-repository';
import { getActiveHermesClient } from './hermes-client';

export function activeWorkspaceConnectionId() {
  return getActiveHermesClient().executionContext().connection.id;
}

export function activeWorkspaceProfileId() {
  return getActiveHermesClient().executionContext().connection.hermesProfileId ?? 'default';
}

export function activeWorkspaceOwner() {
  const connection = getActiveHermesClient().executionContext().connection;
  return { connectionId: connection.id, profileId: connection.hermesProfileId ?? 'default' } as const;
}

export async function findActiveWorktree(worktreeId: string): Promise<WorktreeRecord | null> {
  const owner = activeWorkspaceOwner();
  return getCompanionRepository().getWorktree(worktreeId, owner.connectionId, owner.profileId);
}

export async function requireActiveWorktree(worktreeId: string): Promise<WorktreeRecord> {
  const worktree = await findActiveWorktree(worktreeId);
  if (!worktree) throw new Error('Worktree was not found for the active Hermes connection.');
  return worktree;
}

export function assertActiveWorktreeOwner(worktree: Pick<WorktreeRecord, 'connectionId' | 'profileId'>) {
  const owner = activeWorkspaceOwner();
  if (owner.connectionId !== worktree.connectionId || owner.profileId !== worktree.profileId) {
    throw new Error('The active Hermes workspace changed before this operation could run.');
  }
  return owner;
}

export async function listActiveWorktrees(profileId?: string): Promise<WorktreeRecord[]> {
  const owner = activeWorkspaceOwner();
  return getCompanionRepository().listWorktrees(undefined, owner.connectionId, profileId ?? owner.profileId);
}
