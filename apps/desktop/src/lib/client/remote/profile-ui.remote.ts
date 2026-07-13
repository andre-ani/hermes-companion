import { command, query } from '$app/server';
import { z } from 'zod';
import { ProfileUiPreferences } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';

const connectionId = z.object({ connectionId: z.string().min(1) });

export const getProfileUiPreferences = query(connectionId, ({ connectionId }) =>
  getCompanionRepository().getProfileUi(connectionId)
);

export const setProfileUiPreferences = command(connectionId.extend({ preferences: ProfileUiPreferences }), ({ connectionId, preferences }) =>
  getCompanionRepository().setProfileUi(connectionId, preferences)
);

export const getPinnedSessions = query(z.object({}), () => getCompanionRepository().getPinnedSessionIds());

export const setSessionPinned = command(z.object({ sessionId: z.string().min(1), pinned: z.boolean() }), ({ sessionId, pinned }) =>
  getCompanionRepository().setSessionPinned(sessionId, pinned)
);
