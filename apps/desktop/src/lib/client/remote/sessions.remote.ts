import { command, query } from '$app/server';
import { z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { getActiveHermesClient } from '$lib/server/hermes-client';

const sessionId = z.object({ sessionId: z.string().min(1), profileId: z.string().min(1).optional() });

export const listSessions = query(z.object({ limit: z.number().int().positive().max(100).default(50), offset: z.number().int().nonnegative().default(0) }), async ({ limit, offset }) =>
  getActiveHermesClient().listSessions(limit, offset)
);

export const searchSessions = query(z.object({
  query: z.string().trim().min(2).max(500),
  profileIds: z.array(z.string().trim().min(1).max(120)).max(20).default([])
}), async ({ query, profileIds }) => {
  const client = getActiveHermesClient();
  const targets = profileIds.length ? profileIds : [undefined];
  const results = (await Promise.all(targets.map((profileId) => client.searchSessions(query, profileId, 8)))).flat();
  const unique = [...new Map(results.map((result) => [`${result.profileId ?? 'default'}:${result.sessionId}`, result])).values()]
    .toSorted((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    .slice(0, 12);
  return Promise.all(unique.map(async (result) => ({
    ...result,
    session: await client.getSession(result.sessionId, result.profileId ?? undefined)
  })));
});

export const createSession = command(z.object({ title: z.string().trim().max(200).optional(), model: z.string().trim().max(300).optional() }), async (input) => {
  const session = await getActiveHermesClient().createSession(input);
  await getCompanionRepository().recordAudit('hermes.session.created', session.id);
  return session;
});

export const renameSession = command(sessionId.extend({ title: z.string().trim().min(1).max(200) }), async ({ sessionId, profileId, title }) => {
  await getActiveHermesClient().updateSession(sessionId, title, profileId);
  await getCompanionRepository().recordAudit('hermes.session.renamed', sessionId).catch(() => undefined);
  return { ok: true as const, title };
});

export const deleteSession = command(sessionId, async ({ sessionId, profileId }) => {
  const client = getActiveHermesClient();
  const connection = client.executionContext().connection;
  const ownerProfileId = profileId ?? connection.hermesProfileId ?? 'default';
  await client.deleteSession(sessionId, profileId);
  const repository = getCompanionRepository();
  await repository.clearSessionPresentationState(sessionId, connection.id, ownerProfileId).catch(() => undefined);
  await repository.recordAudit('hermes.session.deleted', sessionId).catch(() => undefined);
  return { ok: true as const };
});

export const setSessionArchived = command(sessionId.extend({ archived: z.boolean() }), async ({ sessionId, profileId, archived }) => {
  const client = getActiveHermesClient();
  const connection = client.executionContext().connection;
  const ownerProfileId = profileId ?? connection.hermesProfileId ?? 'default';
  if (!(await client.supportsSessionManagement())) throw new Error('Archive requires the Hermes session-management service for this connection.');
  const repository = getCompanionRepository();
  await client.setSessionArchived(sessionId, archived, profileId);
  await repository.recordAudit(archived ? 'hermes.session.archived' : 'hermes.session.restored', sessionId).catch(() => undefined);
  return { ok: true as const };
});

export const setSessionUnread = command(sessionId.extend({ unread: z.boolean() }), async ({ sessionId, unread }) => {
  await getCompanionRepository().setSessionUnread(sessionId, unread);
  return { ok: true as const };
});
