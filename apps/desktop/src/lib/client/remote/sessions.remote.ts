import { command, query } from '$app/server';
import { ChatTurnControl, ChatTurnSnapshot, ContextUsage, HermesMessage, z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { cancelHermesChatTurn, cancelHermesSessionTurn, getHermesChatTurnRecovery, nextHermesChatTurn, respondHermesChatApproval, startHermesChatTurn } from '$lib/server/hermes-chat-runs';
import { requestHermesServe, requestHermesServeSession } from '$lib/server/hermes-serve-runs';

const sessionId = z.object({ sessionId: z.string().min(1), profileId: z.string().min(1).optional() });

export const listSessions = query(z.object({ limit: z.number().int().positive().max(100).default(50), offset: z.number().int().nonnegative().default(0) }), async ({ limit, offset }) =>
  getActiveHermesClient().listSessions(limit, offset)
);

export const getSessionMessages = query(sessionId, async ({ sessionId, profileId }) => {
  const connection = getActiveHermesClient().executionContext().connection;
  if (connection.serveUrl || connection.serveWsUrl) {
    const resumed = await requestHermesServe<{ session_id: string; messages?: unknown[] }>(connection, 'session.resume', { session_id: sessionId, cols: 96, ...(profileId ? { profile: profileId } : {}) });
    return (resumed.messages ?? []).map((value, index) => {
      const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      return HermesMessage.parse({
        id: typeof item.id === 'string' ? item.id : `${sessionId}-${index}`,
        sessionId,
        role: item.role,
        text: typeof item.content === 'string' ? item.content : typeof item.text === 'string' ? item.text : '',
        reasoning: typeof item.reasoning_content === 'string' ? item.reasoning_content : typeof item.reasoning === 'string' ? item.reasoning : null,
        createdAt: typeof item.timestamp === 'number' ? new Date(item.timestamp * 1_000).toISOString() : typeof item.timestamp === 'string' ? item.timestamp : null,
        toolCalls: Array.isArray(item.tool_calls) ? item.tool_calls.flatMap((value, toolIndex) => {
          const tool = value && typeof value === 'object' ? value as Record<string, unknown> : {};
          const fn = tool.function && typeof tool.function === 'object' ? tool.function as Record<string, unknown> : {};
          const name = typeof fn.name === 'string' ? fn.name : typeof tool.name === 'string' ? tool.name : '';
          return name ? [{ id: typeof tool.id === 'string' ? tool.id : `${sessionId}-tool-${toolIndex}`, name, arguments: fn.arguments ?? tool.arguments, result: tool.result, status: 'complete' as const }] : [];
        }) : []
      });
    });
  }
  return getActiveHermesClient().getMessages(sessionId);
});

export const recoverSessionTurn = query(sessionId, async ({ sessionId, profileId }) =>
  getHermesChatTurnRecovery(sessionId, profileId)
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

export const getSessionContextUsage = query(sessionId, async ({ sessionId, profileId }) => {
  const connection = getActiveHermesClient().executionContext().connection;
  if (!connection.serveWsUrl && !connection.serveUrl) {
    return { available: false as const, data: null, reason: 'Context usage requires an authorized Hermes Serve connection.' };
  }
  try {
    const raw = await requestHermesServeSession<Record<string, unknown>>(
      connection,
      sessionId,
      'session.context_breakdown',
      {},
      profileId ?? connection.hermesProfileId ?? 'default'
    );
    const data = ContextUsage.parse({
      categories: raw.categories,
      contextMax: raw.context_max,
      contextPercent: raw.context_percent,
      contextUsed: raw.context_used,
      estimatedTotal: raw.estimated_total,
      model: raw.model
    });
    if (data.contextMax <= 0 || data.contextUsed > data.contextMax || Math.abs(data.contextPercent - ((data.contextUsed / data.contextMax) * 100)) > 1) {
      return { available: false as const, data: null, reason: 'Hermes did not return usable context bounds for this session.' };
    }
    return { available: true as const, data, reason: null };
  } catch (cause) {
    return {
      available: false as const,
      data: null,
      reason: cause instanceof Error ? cause.message : 'Hermes context usage is unavailable for this session.'
    };
  }
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
  await cancelHermesSessionTurn({ sessionId, connectionId: connection.id, profileId: ownerProfileId });
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
  if (archived) await cancelHermesSessionTurn({ sessionId, connectionId: connection.id, profileId: ownerProfileId });
  const repository = getCompanionRepository();
  await client.setSessionArchived(sessionId, archived, profileId);
  await repository.recordAudit(archived ? 'hermes.session.archived' : 'hermes.session.restored', sessionId).catch(() => undefined);
  return { ok: true as const };
});

export const setSessionUnread = command(sessionId.extend({ unread: z.boolean() }), async ({ sessionId, unread }) => {
  await getCompanionRepository().setSessionUnread(sessionId, unread);
  return { ok: true as const };
});

export const sendChatMessage = command(ChatTurnControl, async (input) => {
  if (input.operation === 'next') {
    try {
      return { ok: true as const, snapshot: await nextHermesChatTurn(input.requestId, input.afterSequence) };
    } catch (cause) {
      return { ok: false as const, error: cause instanceof Error ? cause.message : 'The response stream is unavailable.' };
    }
  }
  if (input.operation === 'cancel') return { ok: true as const, cancelled: await cancelHermesChatTurn(input.requestId) };
  if (input.operation === 'approve') {
    try {
      return { ok: true as const, snapshot: await respondHermesChatApproval(input.requestId, input.choice) };
    } catch (cause) {
      return { ok: false as const, error: cause instanceof Error ? cause.message : 'The Hermes approval could not be answered.' };
    }
  }
  if (input.modelSource && input.modelSource !== 'hermes') return { ok: false as const, error: 'Models must be configured and selected through Hermes.' };
  try {
    if (!input.message && !input.attachments.length) return { ok: false as const, error: 'Enter a message or attach a supported file.' };
    const snapshot = await startHermesChatTurn({ requestId: input.requestId, sessionId: input.sessionId, message: input.message, attachments: input.attachments, model: input.model, modelProvider: input.modelProvider, profileId: input.profileId, cwd: input.cwd, truncateBeforeUserOrdinal: input.truncateBeforeUserOrdinal, interruptFirst: input.interruptFirst });
    await getCompanionRepository().recordAudit(input.truncateBeforeUserOrdinal === undefined ? 'hermes.message.sent' : 'hermes.session.checkpoint.restored', snapshot.sessionId, { model: input.model ?? null, provider: input.modelProvider ?? null, attachmentCount: input.attachments.length, truncateBeforeUserOrdinal: input.truncateBeforeUserOrdinal ?? null });
    return { ok: true as const, snapshot };
  } catch (cause) {
    return { ok: false as const, error: cause instanceof Error ? cause.message : 'Hermes did not accept the message.' };
  }
});
