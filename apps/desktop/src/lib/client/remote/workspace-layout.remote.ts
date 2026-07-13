import { command, query } from '$app/server';
import { WorkspaceLayoutOwner, WorkspaceLayoutPreferences, z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';

export const getWorkspaceLayout = query(z.object({ owner: WorkspaceLayoutOwner }), ({ owner }) =>
  getCompanionRepository().getWorkspaceLayout(owner)
);

export const setWorkspaceLayout = command(z.object({ owner: WorkspaceLayoutOwner, preferences: WorkspaceLayoutPreferences }), ({ owner, preferences }) =>
  getCompanionRepository().setWorkspaceLayout(owner, preferences)
);

export const adoptWorkspaceLayout = command(z.object({ from: WorkspaceLayoutOwner, to: WorkspaceLayoutOwner, preferences: WorkspaceLayoutPreferences.optional() }), ({ from, to, preferences }) =>
  getCompanionRepository().adoptWorkspaceLayout(from, to, preferences)
);

export const deleteWorkspaceLayout = command(z.object({ owner: WorkspaceLayoutOwner }), ({ owner }) =>
  getCompanionRepository().deleteWorkspaceLayout(owner)
);
