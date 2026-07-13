import { command, query } from '$app/server';
import { HermesActionStatus, HermesCheckpointStoreOverview, HermesInsightsOverview, ProfileUiPreferences, z } from '@hermes-companion/contracts';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { normalizeHermesPluginHub } from '$lib/server/hermes-plugin-catalog';

const empty = z.object({});
const name = z.string().trim().min(1).max(240);
const jsonRecord = z.record(z.string(), z.unknown());
const client = () => getActiveHermesClient();
const body = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) });
const put = (value: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(value) });
const patch = (value: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(value) });

async function audited<T>(action: string, subject: string, request: () => Promise<T>, detail: Record<string, unknown> = {}) {
  const result = await request(); await getCompanionRepository().recordAudit(action, subject, detail); return result;
}

async function read(path: string, timeout = 15_000) {
  try { return { available: true as const, data: await client().requestControl<unknown>(path, {}, timeout), error: null }; }
  catch (cause) { return { available: false as const, data: null, error: cause instanceof Error ? cause.message : 'Hermes capability failed.' }; }
}

async function readPlugins() {
  try {
    const raw = await client().requestControl<unknown>('/api/dashboard/plugins/hub', {}, 30_000);
    return { available: true as const, data: normalizeHermesPluginHub(raw), error: null };
  } catch (cause) { return { available: false as const, data: null, error: cause instanceof Error ? cause.message : 'Hermes plugin management failed.' }; }
}

export const getHermesPluginsOverview = query(empty, async () => ({ plugins: await readPlugins() }));
export const getHermesInsights = query(z.object({ days: z.number().int().min(1).max(365).default(30) }), async ({ days }) => HermesInsightsOverview.parse(await client().requestControl(`/api/analytics/usage?days=${days}`)));

export const getHermesOperationsOverview = query(z.object({ days: z.number().int().min(1).max(365).default(30), logLines: z.number().int().min(20).max(2_000).default(200) }), async ({ days, logLines }) => {
  const [status, profiles, config, configDefaults, configSchema, credentials, skills, mcp, mcpCatalog, toolsets, permissions, messaging, webhooks, cron, memory, learning, curator, analytics, logs, updates, modelInfo, modelOptions, oauth, plugins, checkpoints] = await Promise.all([
    read('/api/status'), read('/api/profiles', 30_000), read('/api/config'), read('/api/config/defaults'), read('/api/config/schema'),
    read('/api/env'), read('/api/skills'), read('/api/mcp/servers'), read('/api/mcp/catalog'), read('/api/tools/toolsets'),
    read('/api/tools/computer-use/status'), read('/api/messaging/platforms'), read('/api/webhooks'), read('/api/cron/jobs', 30_000), read('/api/memory'),
    read('/api/learning/graph'), read('/api/curator'), read(`/api/analytics/usage?days=${days}`), read(`/api/logs?lines=${logLines}`),
    read('/api/hermes/update/check'), read('/api/model/info'), read('/api/model/options?include_unconfigured=1&explicit_only=1', 30_000), read('/api/providers/oauth'), readPlugins(), read('/api/ops/checkpoints')
  ]);
  if (checkpoints.available) checkpoints.data = HermesCheckpointStoreOverview.parse(checkpoints.data);
  if (analytics.available) analytics.data = HermesInsightsOverview.parse(analytics.data);
  return { status, profiles, config, configDefaults, configSchema, credentials, skills, mcp, mcpCatalog, toolsets, permissions, messaging, webhooks, cron, memory, learning, curator, analytics, logs, updates, modelInfo, modelOptions, oauth, plugins, checkpoints };
});

const pluginName = z.string().trim().min(1).max(300).refine((value) => !value.includes('..') && !value.includes('\\'), 'Invalid plugin name.');
export const installHermesPlugin = command(z.object({ identifier: z.string().trim().min(1).max(2_000), force: z.boolean().default(false) }), async ({ identifier, force }) => audited('hermes.plugin.installed', identifier, () => client().requestControl('/api/dashboard/agent-plugins/install', body({ identifier, force, enable: true }), 120_000)));
export const setHermesPluginEnabled = command(z.object({ name: pluginName, enabled: z.boolean() }), async ({ name, enabled }) => audited(enabled ? 'hermes.plugin.enabled' : 'hermes.plugin.disabled', name, () => client().requestControl(`/api/dashboard/agent-plugins/${encodeURIComponent(name)}/${enabled ? 'enable' : 'disable'}`, body({}), 60_000)));
export const updateHermesPlugin = command(z.object({ name: pluginName }), async ({ name }) => audited('hermes.plugin.updated', name, () => client().requestControl(`/api/dashboard/agent-plugins/${encodeURIComponent(name)}/update`, body({}), 120_000)));
export const removeHermesPlugin = command(z.object({ name: pluginName }), async ({ name }) => audited('hermes.plugin.removed', name, () => client().requestControl(`/api/dashboard/agent-plugins/${encodeURIComponent(name)}`, { method: 'DELETE' }, 60_000)));
export const setHermesPluginProviders = command(z.object({ memoryProvider: z.string().max(300).optional(), contextEngine: z.string().max(300).optional() }), async ({ memoryProvider, contextEngine }) => audited('hermes.plugin.providers.updated', 'providers', () => client().requestControl('/api/dashboard/plugin-providers', put({ memory_provider: memoryProvider, context_engine: contextEngine }), 60_000)));

export const saveHermesConfig = command(z.object({ config: jsonRecord }), async ({ config }) => audited('hermes.config.saved', 'active-profile', () => client().requestControl('/api/config', put({ config }))));
export const setHermesApprovalMode = command(z.object({ mode: z.enum(['manual', 'smart', 'off']) }), async ({ mode }) => audited('hermes.approvals.mode', mode, async () => {
  const current = await client().requestControl<Record<string, unknown>>('/api/config');
  const approvals = current.approvals && typeof current.approvals === 'object' && !Array.isArray(current.approvals) ? current.approvals as Record<string, unknown> : {};
  return client().requestControl('/api/config', put({ config: { ...current, approvals: { ...approvals, mode } } }));
}, { mode }));

export const setHermesCredential = command(z.object({ key: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/), value: z.string().max(32_000) }), async ({ key, value }) => audited('hermes.credential.set', key, () => client().requestControl('/api/env', put({ key, value }))));
export const validateHermesProviderCredential = command(z.object({ key: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/), value: z.string().min(1).max(32_000), apiKey: z.string().max(32_000).optional() }), async ({ key, value, apiKey }) => client().requestControl('/api/providers/validate', body({ key, value, api_key: apiKey ?? '' })));
export const deleteHermesCredential = command(z.object({ key: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/) }), async ({ key }) => audited('hermes.credential.deleted', key, () => client().requestControl('/api/env', { method: 'DELETE', body: JSON.stringify({ key }) })));
export const revealHermesCredential = command(z.object({ key: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/) }), async ({ key }) => audited('hermes.credential.revealed', key, () => client().requestControl('/api/env/reveal', body({ key }))));

export const toggleHermesSkill = command(z.object({ name, enabled: z.boolean() }), async ({ name, enabled }) => audited('hermes.skill.toggled', name, () => client().requestControl('/api/skills/toggle', put({ name, enabled })), { enabled }));
export const searchHermesSkillHub = query(z.object({ query: z.string().trim().min(1).max(500), source: z.string().max(100).default('all'), limit: z.number().int().min(1).max(100).default(20) }), async ({ query, source, limit }) => client().requestControl(`/api/skills/hub/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}&limit=${limit}`, {}, 45_000));
export const getHermesSkillHubSources = query(empty, async () => client().requestControl('/api/skills/hub/sources', {}, 45_000));
export const installHermesSkill = command(z.object({ identifier: name }), async ({ identifier }) => audited('hermes.skill.installed', identifier, () => client().requestControl('/api/skills/hub/install', body({ identifier }), 45_000)));
export const uninstallHermesSkill = command(z.object({ name }), async ({ name }) => audited('hermes.skill.uninstalled', name, () => client().requestControl('/api/skills/hub/uninstall', body({ name }), 45_000)));
export const updateHermesSkills = command(empty, async () => audited('hermes.skills.updated', 'all', () => client().requestControl('/api/skills/hub/update', body({}), 45_000)));
export const toggleHermesToolset = command(z.object({ name, enabled: z.boolean() }), async ({ name, enabled }) => audited('hermes.toolset.toggled', name, () => client().requestControl(`/api/tools/toolsets/${encodeURIComponent(name)}`, put({ enabled })), { enabled }));
export const grantComputerUsePermissions = command(empty, async () => audited('hermes.permissions.requested', 'computer-use', () => client().requestControl('/api/tools/computer-use/permissions/grant', body({}))));

export const setHermesMcpEnabled = command(z.object({ name, enabled: z.boolean() }), async ({ name, enabled }) => audited('hermes.mcp.toggled', name, () => client().requestControl(`/api/mcp/servers/${encodeURIComponent(name)}/enabled`, put({ enabled })), { enabled }));
export const testHermesMcpServer = command(z.object({ name }), async ({ name }) => audited('hermes.mcp.tested', name, () => client().requestControl(`/api/mcp/servers/${encodeURIComponent(name)}/test`, body({}), 60_000)));
export const installHermesMcpCatalogEntry = command(z.object({ name, env: z.record(z.string(), z.string().max(32_000)).default({}) }), async ({ name, env }) => audited('hermes.mcp.installed', name, () => client().requestControl('/api/mcp/catalog/install', body({ name, env, enable: true }), 60_000)));

export const resetHermesMemory = command(z.object({ target: z.enum(['all', 'memory', 'user']) }), async ({ target }) => audited('hermes.memory.reset', target, () => client().requestControl('/api/memory/reset', body({ target }))));
export const setHermesCuratorPaused = command(z.object({ paused: z.boolean() }), async ({ paused }) => audited('hermes.curator.paused', 'curator', () => client().requestControl('/api/curator/paused', put({ paused })), { paused }));
export const runHermesCurator = command(empty, async () => audited('hermes.curator.run', 'curator', () => client().requestControl('/api/curator/run', body({}))));
export const getHermesLearningNode = query(z.object({ id: name }), async ({ id }) => client().requestControl(`/api/learning/node?id=${encodeURIComponent(id)}`));
export const editHermesLearningNode = command(z.object({ id: name, content: z.string().max(2_000_000) }), async ({ id, content }) => audited('hermes.learning.edited', id, () => client().requestControl('/api/learning/node', put({ id, content }))));
export const deleteHermesLearningNode = command(z.object({ id: name }), async ({ id }) => audited('hermes.learning.deleted', id, () => client().requestControl('/api/learning/node', { method: 'DELETE', body: JSON.stringify({ id }) })));

export const updateMessagingPlatform = command(z.object({ platformId: name, enabled: z.boolean().optional(), env: z.record(z.string(), z.string().max(32_000)).optional(), clearEnv: z.array(z.string()).max(100).optional() }), async ({ platformId, enabled, env, clearEnv }) => audited('hermes.messaging.updated', platformId, () => client().requestControl(`/api/messaging/platforms/${encodeURIComponent(platformId)}`, put({ enabled, env, clear_env: clearEnv }))));
export const testMessagingPlatform = command(z.object({ platformId: name }), async ({ platformId }) => audited('hermes.messaging.tested', platformId, () => client().requestControl(`/api/messaging/platforms/${encodeURIComponent(platformId)}/test`, body({}))));

const webhookName = z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lowercase letters, numbers, hyphens, or underscores.');
const webhookPayload = z.object({ name: webhookName, description: z.string().max(1_000).optional(), events: z.array(z.string().trim().min(1).max(240)).max(100).default([]), prompt: z.string().max(20_000).optional(), script: z.string().max(20_000).optional(), skills: z.array(z.string().trim().min(1).max(240)).max(100).default([]), deliver: z.string().trim().min(1).max(240).default('log'), deliverOnly: z.boolean().default(false), deliverChatId: z.string().max(1_000).optional(), secret: z.string().min(16).max(1_024).optional() });
export const enableHermesWebhooks = command(empty, async () => audited('hermes.webhooks.enabled', 'platform', () => client().requestControl('/api/webhooks/enable', body({}))));
export const createHermesWebhook = command(webhookPayload, async ({ deliverOnly, deliverChatId, ...input }) => audited('hermes.webhook.created', input.name, () => client().requestControl('/api/webhooks', body({ ...input, deliver_only: deliverOnly, deliver_chat_id: deliverChatId })), { events: input.events, deliver: input.deliver }));
export const deleteHermesWebhook = command(z.object({ name: webhookName }), async ({ name }) => audited('hermes.webhook.deleted', name, () => client().requestControl(`/api/webhooks/${encodeURIComponent(name)}`, { method: 'DELETE' })));
export const setHermesWebhookEnabled = command(z.object({ name: webhookName, enabled: z.boolean() }), async ({ name, enabled }) => audited('hermes.webhook.toggled', name, () => client().requestControl(`/api/webhooks/${encodeURIComponent(name)}/enabled`, put({ enabled })), { enabled }));

const cronPayload = z.object({ name: z.string().max(240).optional(), prompt: z.string().trim().min(1).max(20_000), schedule: z.string().trim().min(1).max(240), deliver: z.string().max(500).optional() });
export const createHermesCronJob = command(cronPayload, async (input) => audited('hermes.cron.created', input.name ?? 'job', () => client().requestControl('/api/cron/jobs', body(input))));
export const updateHermesCronJob = command(cronPayload.partial().extend({ jobId: name }), async ({ jobId, ...updates }) => audited('hermes.cron.updated', jobId, () => client().requestControl(`/api/cron/jobs/${encodeURIComponent(jobId)}`, put({ updates }))));
export const controlHermesCronJob = command(z.object({ jobId: name, action: z.enum(['pause', 'resume', 'trigger']) }), async ({ jobId, action }) => audited(`hermes.cron.${action}`, jobId, () => client().requestControl(`/api/cron/jobs/${encodeURIComponent(jobId)}/${action}`, body({}))));
export const deleteHermesCronJob = command(z.object({ jobId: name }), async ({ jobId }) => audited('hermes.cron.deleted', jobId, () => client().requestControl(`/api/cron/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' })));

export const createHermesProfile = command(z.object({
  name,
  displayName: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(280).default(''),
  cloneFrom: z.string().nullable().default(null),
  cloneAll: z.boolean().default(false),
  noSkills: z.boolean().default(false),
  soul: z.string().max(2_000_000).default(''),
  ui: ProfileUiPreferences.optional()
}), async ({ name, displayName, description, cloneFrom, cloneAll, noSkills, soul, ui }) => {
  const repository = getCompanionRepository();
  const active = await repository.getActiveConnection();
  if (!active) throw new Error('No Hermes environment is connected.');
  const profile = await audited('hermes.profile.created', name, () => client().requestControl('/api/profiles', body({ name, clone_from: cloneFrom, clone_all: cloneAll, no_skills: noSkills })));
  if (soul.trim()) await audited('hermes.profile.soul.saved', name, () => client().requestControl(`/api/profiles/${encodeURIComponent(name)}/soul`, put({ content: soul })));
  const connection = await repository.upsertConnection({ ...active, id: crypto.randomUUID(), name: displayName?.trim() || name, description, hermesProfileId: name });
  const preferences = await repository.setProfileUi(connection.id, ProfileUiPreferences.parse(ui ?? {}));
  return { profile, connection, preferences };
});
export const renameHermesProfile = command(z.object({ name, newName: name }), async ({ name, newName }) => audited('hermes.profile.renamed', name, () => client().requestControl(`/api/profiles/${encodeURIComponent(name)}`, patch({ new_name: newName })), { newName }));
export const deleteHermesProfile = command(z.object({ name }), async ({ name }) => audited('hermes.profile.deleted', name, () => client().requestControl(`/api/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' })));
export const updateHermesProfileSoul = command(z.object({ name, content: z.string().max(2_000_000) }), async ({ name, content }) => audited('hermes.profile.soul.saved', name, () => client().requestControl(`/api/profiles/${encodeURIComponent(name)}/soul`, put({ content }))));

export const runHermesMaintenance = command(z.object({ action: z.enum(['doctor', 'security-audit', 'backup', 'debug-share', 'gateway-restart', 'update']) }), async ({ action }) => {
  const paths = { doctor: '/api/ops/doctor', 'security-audit': '/api/ops/security-audit', backup: '/api/ops/backup', 'debug-share': '/api/ops/debug-share', 'gateway-restart': '/api/gateway/restart', update: '/api/hermes/update' } as const;
  return audited(`hermes.maintenance.${action}`, 'gateway', () => client().requestControl(paths[action], body({}), action === 'debug-share' ? 120_000 : 30_000));
});
export const getHermesActionStatus = query(z.object({ name, lines: z.number().int().min(1).max(2_000).default(200) }), async ({ name, lines }) => HermesActionStatus.parse(await client().requestControl(`/api/actions/${encodeURIComponent(name)}/status?lines=${lines}`)));
export const pruneHermesCheckpoints = command(empty, async () => audited('hermes.checkpoints.pruned', 'checkpoint-store', () => client().requestControl('/api/ops/checkpoints/prune', body({}), 30_000)));

export const setHermesModel = command(z.object({ provider: name, model: name }), async ({ provider, model }) => audited('hermes.model.set', model, () => client().requestControl('/api/model/set', body({ scope: 'main', provider, model })), { provider }));
export const startHermesProviderOAuth = command(z.object({ providerId: name }), async ({ providerId }) => audited('hermes.oauth.started', providerId, () => client().requestControl(`/api/providers/oauth/${encodeURIComponent(providerId)}/start`, body({}))));
export const disconnectHermesProviderOAuth = command(z.object({ providerId: name }), async ({ providerId }) => audited('hermes.oauth.disconnected', providerId, () => client().requestControl(`/api/providers/oauth/${encodeURIComponent(providerId)}`, { method: 'DELETE' })));
export const pollHermesProviderOAuth = query(z.object({ providerId: name, sessionId: name }), async ({ providerId, sessionId }) => client().requestControl(`/api/providers/oauth/${encodeURIComponent(providerId)}/poll/${encodeURIComponent(sessionId)}`));
export const submitHermesProviderOAuthCode = command(z.object({ providerId: name, sessionId: name, code: z.string().trim().min(1).max(4_096) }), async ({ providerId, sessionId, code }) => audited('hermes.oauth.code.submitted', providerId, () => client().requestControl(`/api/providers/oauth/${encodeURIComponent(providerId)}/submit`, body({ session_id: sessionId, code }))));
export const cancelHermesProviderOAuth = command(z.object({ sessionId: name }), async ({ sessionId }) => client().requestControl(`/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }));
