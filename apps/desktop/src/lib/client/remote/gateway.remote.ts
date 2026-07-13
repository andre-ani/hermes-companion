import { command, query } from '$app/server';
import { GatewayConnection, HermesProfile, HermesProjectTree, HermesSession, z } from '@hermes-companion/contracts';
import { buildCapabilityRegistry } from '$lib/server/capability-registry';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { getActiveHermesClient, setActiveHermesClient } from '$lib/server/hermes-client';
import { setExecutionHostConnection } from '$lib/server/execution-host';
import { invokeNative } from '$lib/server/native-client';
import { discoverLocalHermesServices as discoverLocalHermesServicesOnHost } from '$lib/server/local-hermes-discovery';
import { resolveServedLocalDashboardToken } from '$lib/server/local-dashboard-token';
import { configureHermesServeAuth } from '$lib/server/hermes-serve-auth';
import { connectHermes } from '$lib/server/gateway-connection';
import { getHermesProjectTree, listHermesProjects } from '$lib/server/hermes-projects';

const empty = z.object({});

const restoreServeAuth = async (connection: GatewayConnection) => {
  const [username, password] = await Promise.all([
    invokeNative<{ value: string | null }>('secret.get', { key: `serve-username:${connection.id}` }).then((result) => result.value).catch(() => null),
    invokeNative<{ value: string | null }>('secret.get', { key: `serve-password:${connection.id}` }).then((result) => result.value).catch(() => null)
  ]);
  return configureHermesServeAuth(connection, username ?? '', password ?? '');
};

const configuredLoopbackUrl = (value: string | undefined) => {
  if (!value) return undefined;
  try {
    const target = new URL(value);
    return ['http:', 'https:'].includes(target.protocol) && ['127.0.0.1', 'localhost', '::1'].includes(target.hostname) ? target.origin : undefined;
  } catch {
    return undefined;
  }
};

const profileDisplayName = (id: string) => id === 'default'
  ? 'Hermes Agent'
  : id === 'code'
    ? 'Hermes Code'
    : id.split(/[-_]+/).filter(Boolean).map((part) => part[0]?.toLocaleUpperCase() + part.slice(1)).join(' ');

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

export const discoverLocalHermesServices = query(empty, async () => discoverLocalHermesServicesOnHost({
  agentUrl: configuredLoopbackUrl(process.env.HERMES_API_URL),
  controlUrl: configuredLoopbackUrl(process.env.HERMES_CONTROL_URL)
}));

// Provider catalog discovery is intentionally separate from the workspace
// snapshot. A slow third-party catalog must never hold the desktop shell,
// navigation tree, or an empty conversation hostage.
export const getWorkspaceOverview = query(empty, async () => {
  const repository = getCompanionRepository();
  const desktopPreferences = await repository.getDesktopPreferences();
  const connection = await repository.getActiveConnection();
  if (connection) await restoreServeAuth(connection);
  const current = getActiveHermesClient();
  const effectiveConnection = connection && connection.id === current.connection.id && !connection.controlUrl && current.connection.controlUrl
    ? { ...connection, controlUrl: current.connection.controlUrl }
    : connection;
  const storedHermesToken = connection ? await invokeNative<{ value: string | null }>('secret.get', { key: `gateway:${connection.id}` }).then((result) => result.value).catch(() => null) : null;
  const storedControlToken = connection ? await invokeNative<{ value: string | null }>('secret.get', { key: `control:${connection.id}` }).then((result) => result.value).catch(() => null) : null;
  const storedBridgeToken = connection ? await invokeNative<{ value: string | null }>('secret.get', { key: `bridge:${connection.id}` }).then((result) => result.value).catch(() => null) : null;
  const hermesToken = storedHermesToken ?? process.env.HERMES_API_TOKEN ?? '';
  const controlToken = storedControlToken ?? process.env.HERMES_CONTROL_TOKEN ?? await resolveServedLocalDashboardToken(effectiveConnection?.controlUrl) ?? '';
  const bridgeToken = storedBridgeToken ?? process.env.HERMES_BRIDGE_TOKEN ?? '';
  const client = effectiveConnection && (current.connection.id !== effectiveConnection.id || current.connection.hermesProfileId !== effectiveConnection.hermesProfileId || storedHermesToken || controlToken || effectiveConnection !== connection)
    ? setActiveHermesClient(effectiveConnection, hermesToken, controlToken)
    : current;
  if (effectiveConnection) setExecutionHostConnection(effectiveConnection, bridgeToken);
  const gateway = await client.probe();
  const [connections, storedProjects, worktrees, audit, approvalConfig, profilesPayload, pinnedSessionIds, unreadSessionIds] = await Promise.all([
    repository.getConnections(), repository.listProjects(), repository.listWorktrees(), repository.recentAudit(20)
    , gateway.enhanced.config ? client.requestControl<Record<string, unknown>>('/api/config').catch(() => null) : Promise.resolve(null),
    gateway.enhanced.profiles ? client.requestAgent<{ profiles?: unknown[] }>('/api/profiles', {}, 30_000).catch(() => ({ profiles: [] })) : Promise.resolve({ profiles: [] }),
    repository.getPinnedSessionIds(), repository.getUnreadSessionIds()
  ]);
  const profiles = (profilesPayload.profiles ?? []).flatMap((value) => {
    const item = asRecord(value);
    const id = typeof item.name === 'string' ? item.name : '';
    if (!id) return [];
    return [HermesProfile.parse({
      id,
      name: profileDisplayName(id),
      description: typeof item.description === 'string' ? item.description : '',
      isDefault: item.is_default === true,
      model: typeof item.model === 'string' ? item.model : null,
      provider: typeof item.provider === 'string' ? item.provider : null,
      skillCount: typeof item.skill_count === 'number' ? item.skill_count : 0
    })];
  });
  const [projects, projectTree] = effectiveConnection && (effectiveConnection.serveUrl || effectiveConnection.serveWsUrl)
    ? await Promise.all([
      listHermesProjects(effectiveConnection).then((result) => result.projects).catch(() => storedProjects),
      getHermesProjectTree(effectiveConnection).catch(() => HermesProjectTree.parse({}))
    ])
    : [storedProjects, HermesProjectTree.parse({})];
  const activeProfileId = effectiveConnection?.hermesProfileId ?? profiles.find((profile) => profile.isDefault)?.id ?? profiles[0]?.id ?? 'default';
  const liveSessions = gateway.enhanced.sessions ? await (async () => {
    if (effectiveConnection?.serveUrl || effectiveConnection?.serveWsUrl) {
      // Keep recovery independent from the active-session page size. A single
      // `archived=include` page can contain 100 active rows and silently starve
      // every archived row, making restore impossible for a busy account.
      const [activeResult, archivedResult] = await Promise.all([
        client.requestAgent<{ sessions?: unknown[] }>('/api/profiles/sessions?limit=100&profile=all&archived=exclude&order=recent', {}, 30_000).catch(() => ({ sessions: [] })),
        client.requestAgent<{ sessions?: unknown[] }>('/api/profiles/sessions?limit=100&profile=all&archived=only&order=recent', {}, 30_000).catch(() => ({ sessions: [] }))
      ]);
      return [...(activeResult.sessions ?? []), ...(archivedResult.sessions ?? [])].map((value) => {
        const item = asRecord(value);
        const created = typeof item.created_at === 'number' ? item.created_at : typeof item.started_at === 'number' ? item.started_at : null;
        const updated = typeof item.last_active_at === 'number' ? item.last_active_at : typeof item.updated_at === 'number' ? item.updated_at : created;
        return HermesSession.parse({
          id: item.id ?? item.session_id,
          title: typeof item.title === 'string' && item.title.trim()
            ? item.title.trim()
            : typeof item.preview === 'string' && item.preview.trim()
              ? item.preview.trim().slice(0, 120)
              : 'Untitled session',
          model: typeof item.model === 'string' ? item.model : null,
          createdAt: created === null ? null : new Date(created * 1_000).toISOString(),
          updatedAt: updated === null ? null : new Date(updated * 1_000).toISOString(),
          messageCount: item.message_count,
          archived: item.archived === true,
          source: ['slack', 'discord', 'cron'].includes(String(item.source)) ? item.source : 'chat',
          profileId: typeof item.profile === 'string' ? item.profile : activeProfileId,
          provider: typeof item.provider === 'string' ? item.provider : null,
          projectId: typeof item.project_id === 'string' ? item.project_id : null,
          cwd: typeof item.cwd === 'string' ? item.cwd : null,
          branch: typeof item.branch === 'string' ? item.branch : null,
          environment: effectiveConnection.kind === 'remote' ? 'remote' : 'local'
        });
      });
    }
    return client.listSessions();
  })().catch(() => []) : [];
  const sessions = liveSessions.map((session) => ({ ...session, unread: unreadSessionIds.includes(session.id) || session.unread }));
  const liveModels = gateway.core.models ? await client.listModels(activeProfileId).catch(() => []) : [];
  const models = liveModels;
  const mode = approvalConfig && typeof approvalConfig.approvals === 'object' && approvalConfig.approvals !== null && !Array.isArray(approvalConfig.approvals) ? (approvalConfig.approvals as Record<string, unknown>).mode : null;
  return { gateway, capabilities: buildCapabilityRegistry(gateway), connections, profiles, activeProfileId, sessions, models, projects, projectTree, worktrees, audit, pinnedSessionIds, approvalMode: mode === 'manual' || mode === 'smart' || mode === 'off' ? mode : null };
});

export const selectHermesProfile = command(z.object({ id: z.string().min(1) }), async ({ id }) => {
  const repository = getCompanionRepository();
  const connection = await repository.getActiveConnection();
  if (!connection) throw new Error('Connect Hermes before selecting a profile.');
  await restoreServeAuth(connection);
  const client = getActiveHermesClient();
  const payload = await client.requestAgent<{ profiles?: unknown[] }>('/api/profiles', {}, 30_000);
  if (!(payload.profiles ?? []).some((value) => asRecord(value).name === id)) throw new Error('Hermes profile was not found.');
  await repository.upsertConnection({ ...connection, hermesProfileId: id });
  return { id };
});

export const selectGatewayConnection = command(z.object({ id: z.string().min(1) }), async ({ id }) => {
  const repository = getCompanionRepository(); const connection = (await repository.getConnections()).find((item) => item.id === id);
  if (!connection) throw new Error('Saved gateway connection was not found.');
  await restoreServeAuth(connection);
  const hermesToken = await invokeNative<{ value: string | null }>('secret.get', { key: `gateway:${id}` }).then((result) => result.value).catch(() => null) ?? process.env.HERMES_API_TOKEN ?? '';
  const controlToken = await invokeNative<{ value: string | null }>('secret.get', { key: `control:${id}` }).then((result) => result.value).catch(() => null) ?? process.env.HERMES_CONTROL_TOKEN ?? await resolveServedLocalDashboardToken(connection.controlUrl) ?? '';
  const bridgeToken = await invokeNative<{ value: string | null }>('secret.get', { key: `bridge:${id}` }).then((result) => result.value).catch(() => null) ?? process.env.HERMES_BRIDGE_TOKEN ?? '';
  const client = setActiveHermesClient(connection, hermesToken, controlToken); setExecutionHostConnection(connection, bridgeToken);
  const status = await client.probe(); if (status.status === 'disconnected') throw new Error(status.error ?? 'Saved gateway is unavailable.');
  await repository.upsertConnection(connection); return { status, capabilities: buildCapabilityRegistry(status) };
});

export const connectGateway = command(GatewayConnection.extend({
  token: z.string().max(8_192).default(''),
  controlToken: z.string().max(8_192).default(''),
  bridgeToken: z.string().max(8_192).default(''),
  serveUsername: z.string().trim().max(256).default(''),
  servePassword: z.string().max(8_192).default('')
}), async ({ token, controlToken, bridgeToken, serveUsername, servePassword, ...connection }) =>
  connectHermes({ connection, token, controlToken, bridgeToken, serveUsername, servePassword })
);

export const refreshGateway = command(empty, async () => {
  const status = await getActiveHermesClient().probe();
  return { status, capabilities: buildCapabilityRegistry(status) };
});
