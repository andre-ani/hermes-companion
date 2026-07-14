<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as Table from '$lib/components/ui/table';
  import * as Field from '$lib/components/ui/field';
  import * as Alert from '$lib/components/ui/alert';
  import * as Empty from '$lib/components/ui/empty';
  import * as Select from '$lib/components/ui/select';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import ProviderOAuthDialog from './provider-oauth-dialog.svelte';
  import InsightsCenter from './insights-center.svelte';
  import {
    controlHermesCronJob, createHermesCronJob, createHermesProfile, deleteHermesCredential, deleteHermesCronJob,
    deleteHermesProfile, getHermesOperationsOverview, grantComputerUsePermissions, installHermesMcpCatalogEntry,
    installHermesSkill, resetHermesMemory, revealHermesCredential, runHermesCurator, runHermesMaintenance, saveHermesConfig,
    searchHermesSkillHub, setHermesModel, disconnectHermesProviderOAuth, validateHermesProviderCredential,
    getHermesLearningNode, editHermesLearningNode, deleteHermesLearningNode, getHermesActionStatus,
    setHermesCredential, setHermesCuratorPaused, setHermesMcpEnabled, testHermesMcpServer, testMessagingPlatform,
    createHermesWebhook, deleteHermesWebhook, enableHermesWebhooks, setHermesWebhookEnabled,
    toggleHermesSkill, toggleHermesToolset, uninstallHermesSkill, updateHermesSkills, updateMessagingPlatform,
    installHermesPlugin, removeHermesPlugin, setHermesPluginEnabled, setHermesPluginProviders, updateHermesPlugin, getHermesPluginsOverview,
    pruneHermesCheckpoints
  } from '$lib/client/remote/operations.remote';
  import { getDesktopNotificationStatus } from '$lib/client/remote/notifications.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { Activity, Bell, Brain, CircleAlert, DatabaseBackup, HardDrive, KeyRound, Plus, Puzzle, RefreshCw, ServerCog, ShieldCheck, Trash2, Wrench } from '@lucide/svelte';
  import type { CapabilityFamily } from '@hermes-companion/contracts';
  import { capabilityLabel } from '$lib/capability-label';

  type CapabilityResult = { available: boolean; data: unknown; error: string | null };
  type OperationsOverview = Record<string, CapabilityResult>;
  type RecordValue = Record<string, unknown>;
  type ConfigField = { key: string; type?: 'boolean' | 'list' | 'number' | 'select' | 'string' | 'text'; description?: string; category?: string; options?: unknown[] };
  type DestructiveConfirmation = {
    title: string;
    description: string;
    actionLabel: string;
    pendingLabel: string;
    success: string;
    action: () => Promise<unknown>;
  };

  let { family, embedded = false }: { family: CapabilityFamily; embedded?: boolean } = $props();
  let overview = $state<OperationsOverview | null>(null);
  let loading = $state(true);
  let pending = $state('');
  let error = $state('');
  let notice = $state('');
  let credentialKey = $state('');
  let credentialValue = $state('');
  let revealed = $state<Record<string, string>>({});
  let cronName = $state('');
  let cronPrompt = $state('');
  let cronSchedule = $state('');
  let webhookName = $state('');
  let webhookDescription = $state('');
  let webhookEvents = $state('');
  let webhookPrompt = $state('');
  let profileName = $state('');
  let configDraft = $state<RecordValue>({});
  let skillQuery = $state('');
  let skillResults = $state<RecordValue[]>([]);
  let selectedProvider = $state('');
  let selectedModel = $state('');
  let oauthProvider = $state<RecordValue | null>(null);
  let learningNodeId = $state('');
  let learningNodeContent = $state('');
  let actionStatus = $state<RecordValue | null>(null);
  let activeActionName = $state<string | null>(null);
  let actionPollTimer: ReturnType<typeof setTimeout> | null = null;
  let actionPollFailures = 0;
  let pluginIdentifier = $state('');
  let memoryProvider = $state('');
  let contextEngine = $state('');
  let pruneCheckpointsOpen = $state(false);
  let destructiveConfirmation = $state<DestructiveConfirmation | null>(null);

  const asRecord = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
  const asRows = (value: unknown, key?: string): RecordValue[] => {
    const target = key ? asRecord(value)[key] : value;
    return Array.isArray(target) ? target.filter((item) => item && typeof item === 'object') as RecordValue[] : [];
  };
  const cloneRecord = (value: unknown): RecordValue => JSON.parse(JSON.stringify(asRecord(value))) as RecordValue;
  const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
  const bool = (value: unknown) => value === true;
  const summaryLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const summaryValue = (value: unknown) => value === null || value === undefined || value === '' ? 'Not reported' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : Array.isArray(value) ? value.length ? `${value.length} ${value.length === 1 ? 'item' : 'items'}` : 'None' : typeof value === 'object' ? Object.keys(asRecord(value)).length ? `${Object.keys(asRecord(value)).length} details` : 'None' : String(value);
  function summaryEntries(value: unknown, prefix = '', depth = 0): Array<[string, unknown]> {
    return Object.entries(asRecord(value)).flatMap(([key, entry]) => {
      const label = prefix ? `${prefix} · ${summaryLabel(key)}` : summaryLabel(key);
      return entry && typeof entry === 'object' && !Array.isArray(entry) && depth < 2 ? summaryEntries(entry, label, depth + 1) : [[label, entry] as [string, unknown]];
    }).slice(0, 30);
  }
  const sectionKey = $derived(({ profiles: 'profiles', credentials: 'credentials', skills: 'skills', mcp: 'mcp', toolsets: 'toolsets', permissions: 'permissions', messaging: 'messaging', webhooks: 'webhooks', jobs: 'cron', memory: 'memory', analytics: 'analytics', reports: 'analytics', audit: 'logs', updates: 'updates', health: 'status', models: 'modelOptions', plugins: 'plugins' } as Record<string, string>)[family] ?? family);
  const section = $derived(overview?.[sectionKey] ?? null);
  const sectionData = $derived(section?.data ?? null);
  const rows = $derived(section ? asRows(section.data, family === 'profiles' ? 'profiles' : family === 'mcp' ? 'servers' : family === 'messaging' ? 'platforms' : family === 'webhooks' ? 'subscriptions' : family === 'jobs' ? 'jobs' : family === 'checkpoints' ? 'sessions' : undefined) : []);
  const credentialRows = $derived(Object.entries(asRecord(sectionData)).filter(([, info]) => bool(asRecord(info).is_set) || bool(info)));
  const configSchema = $derived(asRecord(overview?.configSchema?.data));
  const configFields = $derived(Object.entries(asRecord(configSchema.fields)).map(([key, value]) => ({ key, ...asRecord(value) }) as ConfigField));
  const modelProviders = $derived(asRows(overview?.modelOptions?.data, 'providers'));
  const selectedProviderRecord = $derived(modelProviders.find((provider) => text(provider.slug) === selectedProvider) ?? null);
  const providerModels = $derived(Array.isArray(selectedProviderRecord?.models) ? selectedProviderRecord.models.filter((model): model is string => typeof model === 'string') : []);
  const oauthProviders = $derived(asRows(overview?.oauth?.data, 'providers'));
  const actionRunning = $derived(activeActionName !== null && actionStatus?.running !== false);
  const pluginData = $derived(asRecord(overview?.plugins?.data));
  const pluginRows = $derived(asRows(pluginData, 'plugins'));
  const pluginProviders = $derived(asRecord(pluginData.providers));
  const memoryOptions = $derived(asRows(pluginProviders, 'memory_options'));
  const contextOptions = $derived(asRows(pluginProviders, 'context_options'));
  const checkpointTotalBytes = $derived(Number(asRecord(sectionData).total_bytes ?? 0));

  $effect(() => { if (!selectedProvider && modelProviders[0]) selectedProvider = text(modelProviders[0].slug); });
  $effect(() => { if (selectedProvider && !providerModels.includes(selectedModel)) selectedModel = providerModels[0] ?? ''; });
  $effect(() => { if (!memoryProvider) memoryProvider = text(pluginProviders.memory_provider); if (!contextEngine) contextEngine = text(pluginProviders.context_engine); });

  async function load() {
    loading = true; error = '';
    try {
      if (family === 'plugins') {
        overview = await resolveRemoteResult(getHermesPluginsOverview({})) as OperationsOverview;
        return;
      }
      const [operations, notifications] = await Promise.all([
        resolveRemoteResult(getHermesOperationsOverview({ days: 30, logLines: 300 })) as Promise<OperationsOverview>,
        resolveRemoteResult(getDesktopNotificationStatus({}))
      ]);
      overview = operations;
      overview.notifications = { available: notifications.supported, data: notifications, error: notifications.error };
      configDraft = cloneRecord(overview.config?.data);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes operations could not be loaded.'; }
    finally { loading = false; }
  }

  async function act(label: string, action: () => Promise<unknown>, success: string) {
    if (pending) return; pending = label; error = ''; notice = '';
    try { await action(); notice = success; await load(); }
    catch (cause) { error = cause instanceof Error ? cause.message : `${label} failed.`; }
    finally { pending = ''; }
  }

  function confirmDestructiveAction(confirmation: DestructiveConfirmation) {
    destructiveConfirmation = confirmation;
  }

  async function runDestructiveAction() {
    const confirmation = destructiveConfirmation;
    if (!confirmation) return;
    destructiveConfirmation = null;
    await act(confirmation.pendingLabel, confirmation.action, confirmation.success);
  }

  function getConfigValue(path: string) {
    let value: unknown = configDraft;
    for (const part of path.split('.')) value = asRecord(value)[part];
    return value;
  }

  function setConfigValue(path: string, value: unknown) {
    const next = cloneRecord(configDraft); const parts = path.split('.'); let target = next;
    for (const part of parts.slice(0, -1)) { if (!target[part] || typeof target[part] !== 'object') target[part] = {}; target = target[part] as RecordValue; }
    target[parts.at(-1)!] = value; configDraft = next;
  }

  async function saveConfig() { await act('Save settings', () => resolveRemoteResult(saveHermesConfig({ config: configDraft })), 'Hermes settings saved.'); }
  async function addCredential() {
    const key = credentialKey.trim(); if (!key || !credentialValue || pending) return;
    pending = 'Validate credential'; error = ''; notice = '';
    try {
      const probe = asRecord(await resolveRemoteResult(validateHermesProviderCredential({ key, value: credentialValue })));
      if (probe.ok !== true && probe.reachable === true) { error = text(probe.message, 'Hermes rejected this credential.'); return; }
      await resolveRemoteResult(setHermesCredential({ key, value: credentialValue }));
      const warning = probe.reachable === false ? text(probe.message, 'Hermes could not validate this credential from the execution host.') : '';
      credentialKey = ''; credentialValue = ''; await load(); notice = warning ? `${key} saved with warning: ${warning}` : `${key} validated and saved.`;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Credential validation failed.'; }
    finally { pending = ''; }
  }
  async function addCron() { if (!cronPrompt.trim() || !cronSchedule.trim()) return; await act('Create job', () => resolveRemoteResult(createHermesCronJob({ name: cronName || undefined, prompt: cronPrompt, schedule: cronSchedule })), 'Scheduled job created.'); cronName = ''; cronPrompt = ''; cronSchedule = ''; }
  async function addWebhook() { if (!webhookName.trim()) return; await act('Create webhook', () => resolveRemoteResult(createHermesWebhook({ name: webhookName.trim(), description: webhookDescription.trim() || undefined, events: webhookEvents.split(',').map((value) => value.trim()).filter(Boolean), prompt: webhookPrompt.trim() || undefined })), 'Webhook route created. Copy its secret now; Hermes will not reveal it again.'); webhookName = ''; webhookDescription = ''; webhookEvents = ''; webhookPrompt = ''; }
  async function addProfile() { if (!profileName.trim()) return; await act('Create profile', () => resolveRemoteResult(createHermesProfile({ name: profileName, cloneFrom: null, cloneAll: false, noSkills: false })), 'Hermes profile created.'); profileName = ''; }
  async function addPlugin() { if (!pluginIdentifier.trim()) return; await act('Install plugin', () => resolveRemoteResult(installHermesPlugin({ identifier: pluginIdentifier.trim(), force: false })), 'Plugin installed and enabled.'); pluginIdentifier = ''; }
  async function savePluginProviders() { await act('Save plugin providers', () => resolveRemoteResult(setHermesPluginProviders({ memoryProvider: memoryProvider || undefined, contextEngine: contextEngine || undefined })), 'Plugin providers updated.'); }
  async function searchSkills() {
    if (!skillQuery.trim()) return; pending = 'Search skills'; error = '';
    try { const result = asRecord(await resolveRemoteResult(searchHermesSkillHub({ query: skillQuery, source: 'all', limit: 20 }))); skillResults = asRows(result, 'results').length ? asRows(result, 'results') : asRows(result, 'skills'); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Skill hub search failed.'; }
    finally { pending = ''; }
  }
  async function loadLearningNode(id: string) {
    pending = 'Load memory'; error = '';
    try { const result = asRecord(await resolveRemoteResult(getHermesLearningNode({ id }))); learningNodeId = id; learningNodeContent = text(result.content); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Memory node could not be loaded.'; }
    finally { pending = ''; }
  }
  async function runMaintenanceAction(action: 'doctor' | 'security-audit' | 'backup' | 'debug-share' | 'gateway-restart' | 'update') {
    pending = action; error = ''; actionStatus = null; activeActionName = null; if (actionPollTimer) clearTimeout(actionPollTimer);
    try {
      const started = asRecord(await resolveRemoteResult(runHermesMaintenance({ action }))); notice = `${action} started.`;
      const actionName = text(started.name, text(started.action));
      if (actionName) { activeActionName = actionName; actionPollFailures = 0; scheduleActionPoll(0); }
      else { actionStatus = started; notice = `${action} finished.`; }
    } catch (cause) { error = cause instanceof Error ? cause.message : `${action} failed.`; }
    finally { pending = ''; }
  }
  async function pruneCheckpoints() {
    pruneCheckpointsOpen = false; pending = 'Prune checkpoints'; error = ''; notice = ''; actionStatus = null; activeActionName = null;
    try {
      const started = asRecord(await resolveRemoteResult(pruneHermesCheckpoints({})));
      const actionName = text(started.name, 'checkpoints-prune');
      notice = 'Checkpoint cleanup started.'; activeActionName = actionName; actionPollFailures = 0; scheduleActionPoll(0);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Checkpoint cleanup failed.'; }
    finally { pending = ''; }
  }
  function formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB']; const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value / 1024 ** unit)} ${units[unit]}`;
  }
  function scheduleActionPoll(delay = 1_500) {
    if (!activeActionName) return; if (actionPollTimer) clearTimeout(actionPollTimer);
    actionPollTimer = setTimeout(pollAction, delay);
  }
  async function pollAction() {
    const name = activeActionName; if (!name) return;
    try {
      const status = asRecord(await resolveRemoteResult(getHermesActionStatus({ name, lines: 500 }))); actionStatus = status; actionPollFailures = 0;
      if (bool(status.running)) scheduleActionPoll();
      else { activeActionName = null; notice = Number(status.exit_code) === 0 ? `${name} finished.` : `${name} failed with exit code ${String(status.exit_code ?? '?')}.`; if (name === 'checkpoints-prune') await load(); }
    } catch (cause) {
      actionPollFailures += 1;
      if (actionPollFailures < 5) scheduleActionPoll(); else { activeActionName = null; error = cause instanceof Error ? cause.message : 'Action status disconnected.'; }
    }
  }
  onMount(load);
  onDestroy(() => { if (actionPollTimer) clearTimeout(actionPollTimer); });
</script>

<section class="operations" class:embedded data-family={family} aria-labelledby={embedded ? undefined : 'operations-heading'}>
  {#if !embedded}<header class="operations-header"><div><span class="data-label">Hermes capability</span><h1 id="operations-heading">{capabilityLabel(family)}</h1></div><Button size="sm" variant="outline" onclick={load} disabled={loading}><RefreshCw data-icon="inline-start" /> Refresh</Button></header>{/if}

  {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Operation failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
  {#if notice}<div class="notice" role="status">{notice}</div>{/if}

  {#if loading}
    <div class="loading"><Skeleton class="h-8 w-48" /><Skeleton class="h-32 w-full" /><Skeleton class="h-24 w-full" /></div>
  {:else if !section?.available && !['models', 'notifications', 'approvals'].includes(family)}
    <Empty.Root><Empty.Header><Empty.Media variant="icon"><ServerCog /></Empty.Media><Empty.Title>Capability unavailable</Empty.Title><Empty.Description>{section?.error ?? `The connected Hermes host does not expose ${family}.`}</Empty.Description></Empty.Header></Empty.Root>
  {:else if family === 'profiles'}
    <div class="operation-stack">
      <form class="compact-form surface-panel" onsubmit={(event) => { event.preventDefault(); void addProfile(); }}><Field.FieldGroup><Field.Field><Field.FieldLabel for="profile-name">New profile name</Field.FieldLabel><Input id="profile-name" name="profile-name" bind:value={profileName} required /></Field.Field></Field.FieldGroup><Button type="submit" size="sm" disabled={Boolean(pending)}><Plus data-icon="inline-start" /> Create profile</Button></form>
      <Table.Root><Table.Caption>Hermes execution profiles on the connected host.</Table.Caption><Table.Header><Table.Row><Table.Head>Name</Table.Head><Table.Head>Provider</Table.Head><Table.Head>Model</Table.Head><Table.Head>Skills</Table.Head><Table.Head>Actions</Table.Head></Table.Row></Table.Header><Table.Body>{#each rows as row (text(row.name))}<Table.Row><Table.Cell>{text(row.name)}</Table.Cell><Table.Cell>{text(row.provider, '—')}</Table.Cell><Table.Cell>{text(row.model, '—')}</Table.Cell><Table.Cell>{String(row.skill_count ?? 0)}</Table.Cell><Table.Cell>{#if !bool(row.is_default)}<Button size="xs" variant="destructive" disabled={Boolean(pending)} onclick={() => confirmDestructiveAction({ title: `Delete ${text(row.name)}?`, description: 'This removes the Hermes execution profile and its profile-owned configuration. This cannot be undone.', actionLabel: 'Delete profile', pendingLabel: 'Delete profile', success: 'Profile deleted.', action: () => resolveRemoteResult(deleteHermesProfile({ name: text(row.name) })) })}>Delete</Button>{:else}<Badge variant="secondary">Default</Badge>{/if}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    </div>
  {:else if family === 'plugins'}
    <div class="operation-stack plugin-manager">
      <form class="plugin-install" id="setting-install-plugin" onsubmit={(event) => { event.preventDefault(); void addPlugin(); }}>
        <div><label for="plugin-identifier">Install plugin</label><p>Use a trusted Hermes identifier or repository URL.</p></div>
        <Input id="plugin-identifier" name="plugin-identifier" bind:value={pluginIdentifier} placeholder="owner/plugin or https://…" required />
        <Button type="submit" size="sm" disabled={Boolean(pending) || !pluginIdentifier.trim()}><Plus /> Install</Button>
      </form>

      <section class="plugin-section" id="setting-installed-plugins" aria-labelledby="installed-plugins-heading">
        <header><div><h2 id="installed-plugins-heading">Installed plugins</h2><p>Runtime state comes directly from Hermes.</p></div><Badge variant="outline">{pluginRows.length}</Badge></header>
        {#if pluginRows.length}<ul class="plugin-list">{#each pluginRows as plugin (text(plugin.name))}<li>
          <Puzzle />
          <span class="plugin-copy"><strong>{text(plugin.name)}</strong><small>{text(plugin.description, text(plugin.source, 'Hermes plugin'))}</small><em>{text(plugin.version) || text(plugin.source)}{#if bool(plugin.auth_required)} · authentication required{/if}</em></span>
          <Badge variant={text(plugin.runtime_status) === 'enabled' ? 'secondary' : 'outline'}>{text(plugin.runtime_status, 'inactive')}</Badge>
          <div class="plugin-actions">
            {#if bool(plugin.can_update_git)}<Button size="xs" variant="ghost" disabled={Boolean(pending)} onclick={() => act('Update plugin', () => resolveRemoteResult(updateHermesPlugin({ name: text(plugin.name) })), 'Plugin updated.')}><RefreshCw /> Update</Button>{/if}
            {#if bool(plugin.can_remove)}<Button size="icon-xs" variant="ghost" disabled={Boolean(pending)} onclick={() => confirmDestructiveAction({ title: `Remove ${text(plugin.name)}?`, description: 'This uninstalls the plugin from the active Hermes profile. Plugin-owned behavior will stop immediately.', actionLabel: 'Remove plugin', pendingLabel: 'Remove plugin', success: 'Plugin removed.', action: () => resolveRemoteResult(removeHermesPlugin({ name: text(plugin.name) })) })} aria-label={`Remove ${text(plugin.name)}`} title={`Remove ${text(plugin.name)}`}><Trash2 /></Button>{/if}
            <Switch checked={text(plugin.runtime_status) === 'enabled'} disabled={Boolean(pending)} aria-label={`Enable ${text(plugin.name)}`} onCheckedChange={(enabled) => act(enabled ? 'Enable plugin' : 'Disable plugin', () => resolveRemoteResult(setHermesPluginEnabled({ name: text(plugin.name), enabled })), `Plugin ${enabled ? 'enabled' : 'disabled'}.`)} />
          </div>
        </li>{/each}</ul>{:else}<p class="plugin-empty">No plugins are installed in this Hermes profile.</p>{/if}
      </section>

      <section class="plugin-section" id="setting-plugin-providers" aria-labelledby="plugin-providers-heading">
        <header><div><h2 id="plugin-providers-heading">Plugin providers</h2><p>Choose the active memory and context implementations.</p></div></header>
        <div class="plugin-provider-fields">
          <Field.Field><Field.FieldLabel for="plugin-memory-provider">Memory provider</Field.FieldLabel><Select.Root type="single" bind:value={memoryProvider}><Select.Trigger id="plugin-memory-provider">{memoryProvider || 'Built-in'}</Select.Trigger><Select.Content><Select.Group>{#each memoryOptions as option}<Select.Item value={text(option.name)} label={text(option.label, text(option.name))}>{text(option.label, text(option.name))}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field>
          <Field.Field><Field.FieldLabel for="plugin-context-engine">Context engine</Field.FieldLabel><Select.Root type="single" bind:value={contextEngine}><Select.Trigger id="plugin-context-engine">{contextEngine || 'Default'}</Select.Trigger><Select.Content><Select.Group>{#each contextOptions as option}<Select.Item value={text(option.name)} label={text(option.label, text(option.name))}>{text(option.label, text(option.name))}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field>
          <Button size="sm" disabled={Boolean(pending)} onclick={() => void savePluginProviders()}>Save providers</Button>
        </div>
      </section>
    </div>
  {:else if family === 'credentials'}
    <div class="operation-stack">
      <form class="compact-form surface-panel" onsubmit={(event) => { event.preventDefault(); void addCredential(); }}><Field.FieldGroup><Field.Field><Field.FieldLabel for="credential-key">Environment variable</Field.FieldLabel><Input id="credential-key" name="credential-key" bind:value={credentialKey} pattern="[A-Z][A-Z0-9_]+" required /></Field.Field><Field.Field><Field.FieldLabel for="credential-value">Secret value</Field.FieldLabel><Input id="credential-value" name="credential-value" type="password" bind:value={credentialValue} autocomplete="off" required /></Field.Field></Field.FieldGroup><Button type="submit" size="sm" disabled={Boolean(pending) || !credentialKey.trim() || !credentialValue}>Save credential</Button></form>
      <section class="operation-section" aria-labelledby="credentials-heading"><header><h2 id="credentials-heading">Stored credentials</h2><p>Values stay masked until you explicitly reveal them.</p></header>{#if credentialRows.length}<ul class="settings-list">{#each credentialRows as [key] (key)}<li><span><strong><code>{key}</code></strong><small>{revealed[key] ?? 'Configured'}</small></span><span class="row-meta"><Button size="xs" variant="outline" disabled={Boolean(pending)} onclick={async () => { try { const result = asRecord(await resolveRemoteResult(revealHermesCredential({ key }))); revealed = { ...revealed, [key]: text(result.value, 'Unavailable') }; } catch (cause) { error = cause instanceof Error ? cause.message : 'Reveal failed.'; } }}>Reveal</Button><Button size="xs" variant="destructive" disabled={Boolean(pending)} onclick={() => confirmDestructiveAction({ title: `Delete ${key}?`, description: 'Hermes will lose this credential immediately. Features that depend on it may stop working until a new value is saved.', actionLabel: 'Delete credential', pendingLabel: 'Delete credential', success: `${key} deleted.`, action: () => resolveRemoteResult(deleteHermesCredential({ key })) })}>Delete</Button></span></li>{/each}</ul>{:else}<p class="empty-settings-list">No credentials are stored for this Hermes profile.</p>{/if}</section>
    </div>
  {:else if family === 'toolsets'}
    <section class="operation-section" aria-labelledby="toolsets-heading"><header><h2 id="toolsets-heading">Toolsets</h2><p>Enable the Hermes tool groups available to this profile.</p></header><ul class="settings-list">{#each rows as row (text(row.name))}<li><span><strong>{text(row.label, text(row.name))}</strong><small>{text(row.description)}</small></span><span class="row-meta"><Badge variant={bool(row.configured) ? 'secondary' : 'outline'}>{bool(row.configured) ? 'Ready' : 'Setup required'}</Badge><Switch checked={bool(row.enabled)} disabled={Boolean(pending)} aria-label={`Enable ${text(row.name)}`} onCheckedChange={(enabled) => act('Toggle toolset', () => resolveRemoteResult(toggleHermesToolset({ name: text(row.name), enabled })), 'Toolset updated.')} /></span></li>{/each}</ul></section>
  {:else if family === 'skills'}
    <div class="operation-stack"><Table.Root><Table.Caption>Installed Hermes skills.</Table.Caption><Table.Header><Table.Row><Table.Head>Name</Table.Head><Table.Head>Description</Table.Head><Table.Head>Status</Table.Head><Table.Head>Enabled</Table.Head><Table.Head>Manage</Table.Head></Table.Row></Table.Header><Table.Body>{#each rows as row (text(row.name))}<Table.Row><Table.Cell>{text(row.label, text(row.name))}</Table.Cell><Table.Cell>{text(row.description)}</Table.Cell><Table.Cell><Badge variant="secondary">{text(row.category, 'skill')}</Badge></Table.Cell><Table.Cell><Switch checked={bool(row.enabled)} disabled={Boolean(pending)} aria-label={`Enable ${text(row.name)}`} onCheckedChange={(enabled) => act('Toggle skill', () => resolveRemoteResult(toggleHermesSkill({ name: text(row.name), enabled })), 'Skill updated.')} /></Table.Cell><Table.Cell><Button size="xs" variant="outline" onclick={() => confirmDestructiveAction({ title: `Uninstall ${text(row.label, text(row.name))}?`, description: 'This removes the skill from the active Hermes profile. Sessions that rely on it will no longer be able to use it.', actionLabel: 'Uninstall skill', pendingLabel: 'Uninstall skill', success: 'Skill uninstall started.', action: () => resolveRemoteResult(uninstallHermesSkill({ name: text(row.name) })) })}>Uninstall</Button></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root><form class="hub-search surface-panel" onsubmit={(event) => { event.preventDefault(); void searchSkills(); }}><label for="skill-search">Browse skill hub</label><Input id="skill-search" name="skill-search" bind:value={skillQuery} required /><Button type="submit" size="sm" disabled={Boolean(pending)}>Search</Button><Button type="button" size="sm" variant="outline" disabled={Boolean(pending)} onclick={() => act('Update skills', () => resolveRemoteResult(updateHermesSkills({})), 'Skill update started.')}>Update installed</Button></form>{#if skillResults.length}<Table.Root><Table.Caption>Skill hub search results.</Table.Caption><Table.Header><Table.Row><Table.Head>Name</Table.Head><Table.Head>Description</Table.Head><Table.Head>Action</Table.Head></Table.Row></Table.Header><Table.Body>{#each skillResults as skill, index (`${text(skill.identifier, text(skill.name))}-${index}`)}<Table.Row><Table.Cell>{text(skill.name, text(skill.identifier))}</Table.Cell><Table.Cell>{text(skill.description)}</Table.Cell><Table.Cell><Button size="xs" onclick={() => act('Install skill', () => resolveRemoteResult(installHermesSkill({ identifier: text(skill.identifier, text(skill.name)) })), 'Skill install started.')}>Install</Button></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>{/if}</div>
  {:else if family === 'mcp'}
    <div class="operation-stack"><section class="operation-section" aria-labelledby="mcp-heading"><header><h2 id="mcp-heading">Connected servers</h2><p>Manage the Model Context Protocol connections available to Hermes.</p></header><ul class="settings-list">{#each rows as row (text(row.name))}<li><span><strong>{text(row.name)}</strong><small><code>{text(row.transport)} · {text(row.command, text(row.url, 'No endpoint'))}</code></small></span><span class="row-meta"><Switch checked={bool(row.enabled)} aria-label={`Enable ${text(row.name)}`} onCheckedChange={(enabled) => act('Toggle MCP', () => resolveRemoteResult(setHermesMcpEnabled({ name: text(row.name), enabled })), 'MCP server updated.')} /><Button size="xs" variant="outline" onclick={() => act('Test MCP', () => resolveRemoteResult(testHermesMcpServer({ name: text(row.name) })), 'MCP test completed.')}>Test</Button></span></li>{/each}</ul></section>{#if overview?.mcpCatalog?.available}<section class="operation-section" aria-labelledby="mcp-catalog-heading"><header><h2 id="mcp-catalog-heading">Catalog</h2><p>Optional Nous-approved connections.</p></header><ul class="settings-list">{#each asRows(overview.mcpCatalog.data, 'entries') as entry (text(entry.name))}<li><span><strong>{text(entry.name)}</strong><small>{text(entry.description)}</small></span><span class="row-meta">{#if bool(entry.installed)}<Badge variant="secondary">Installed</Badge>{:else}<Button size="xs" onclick={() => act('Install MCP', () => resolveRemoteResult(installHermesMcpCatalogEntry({ name: text(entry.name), env: {} })), 'MCP install started.')}>Install</Button>{/if}</span></li>{/each}</ul></section>{/if}</div>
  {:else if family === 'permissions'}
    <div class="status-card surface-panel"><ShieldCheck /><div><h2>Computer-use permissions</h2><dl class="data-summary">{#each summaryEntries(sectionData) as [label, value] (label)}<div><dt>{label}</dt><dd>{summaryValue(value)}</dd></div>{/each}</dl></div><Button size="sm" disabled={!bool(asRecord(sectionData).can_grant)} title={bool(asRecord(sectionData).can_grant) ? 'Open the operating-system permission flow' : 'The connected Hermes host cannot grant these permissions from Companion.'} onclick={() => act('Grant permissions', () => resolveRemoteResult(grantComputerUsePermissions({})), 'Permission flow started.')}>Grant permissions</Button></div>
  {:else if family === 'approvals'}
    <Empty.Root><Empty.Header><Empty.Media variant="icon"><ShieldCheck /></Empty.Media><Empty.Title>Approvals stay with the conversation</Empty.Title><Empty.Description>Hermes approval requests appear inline in the active session, where their prompt and tool context remain visible.</Empty.Description></Empty.Header></Empty.Root>
  {:else if family === 'messaging'}
    <Table.Root><Table.Caption>Messaging platforms configured on the Hermes host.</Table.Caption><Table.Header><Table.Row><Table.Head>Platform</Table.Head><Table.Head>State</Table.Head><Table.Head>Gateway</Table.Head><Table.Head>Actions</Table.Head></Table.Row></Table.Header><Table.Body>{#each rows as row (text(row.id))}<Table.Row><Table.Cell>{text(row.name, text(row.id))}</Table.Cell><Table.Cell>{text(row.state, bool(row.configured) ? 'configured' : 'not configured')}</Table.Cell><Table.Cell><Badge variant={bool(row.gateway_running) ? 'secondary' : 'outline'}>{bool(row.gateway_running) ? 'Running' : 'Stopped'}</Badge></Table.Cell><Table.Cell><div class="row-actions"><Switch checked={bool(row.enabled)} aria-label={`Enable ${text(row.name, text(row.id))}`} onCheckedChange={(enabled) => act('Update messaging', () => resolveRemoteResult(updateMessagingPlatform({ platformId: text(row.id), enabled })), 'Messaging platform updated.')} /><Button size="xs" variant="outline" onclick={() => act('Test messaging', () => resolveRemoteResult(testMessagingPlatform({ platformId: text(row.id) })), 'Messaging test completed.')}>Test</Button></div></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
  {:else if family === 'webhooks'}
    <div class="operation-stack">
      {#if !bool(asRecord(sectionData).enabled)}<div class="status-card surface-panel"><ServerCog /><div><h2>Enable webhooks</h2><p>Hermes receives signed events through routes scoped to this active profile. Enabling may restart the gateway.</p></div><Button size="sm" onclick={() => act('Enable webhooks', () => resolveRemoteResult(enableHermesWebhooks({})), 'Webhook platform enabled.')}>Enable webhooks</Button></div>{/if}
      <form class="webhook-form surface-panel" onsubmit={(event) => { event.preventDefault(); void addWebhook(); }}><Field.FieldGroup><Field.Field><Field.FieldLabel for="webhook-name">Route name</Field.FieldLabel><Input id="webhook-name" name="webhook-name" bind:value={webhookName} pattern="[a-z0-9][a-z0-9_-]*" autocomplete="off" required /><Field.FieldDescription>Lowercase letters, numbers, hyphens, and underscores.</Field.FieldDescription></Field.Field><Field.Field><Field.FieldLabel for="webhook-events">Events</Field.FieldLabel><Input id="webhook-events" name="webhook-events" bind:value={webhookEvents} placeholder="push, pull_request" /><Field.FieldDescription>Optional comma-separated event names.</Field.FieldDescription></Field.Field><Field.Field><Field.FieldLabel for="webhook-description">Description</Field.FieldLabel><Input id="webhook-description" name="webhook-description" bind:value={webhookDescription} /></Field.Field><Field.Field><Field.FieldLabel for="webhook-prompt">Hermes prompt</Field.FieldLabel><Textarea id="webhook-prompt" name="webhook-prompt" bind:value={webhookPrompt} rows={3} /></Field.Field></Field.FieldGroup><Button type="submit" size="sm" disabled={!bool(asRecord(sectionData).enabled) || Boolean(pending)}><Plus data-icon="inline-start" /> Create route</Button></form>
      <Table.Root><Table.Caption>Webhook subscriptions owned by Hermes. Route secrets are redacted after creation.</Table.Caption><Table.Header><Table.Row><Table.Head>Route</Table.Head><Table.Head>Events</Table.Head><Table.Head>Delivery</Table.Head><Table.Head>State</Table.Head><Table.Head>Actions</Table.Head></Table.Row></Table.Header><Table.Body>{#each rows as row (text(row.name))}<Table.Row><Table.Cell><div class="webhook-route"><strong>{text(row.name)}</strong><code>{text(row.url)}</code></div></Table.Cell><Table.Cell>{Array.isArray(row.events) && row.events.length ? (row.events as unknown[]).join(', ') : 'All events'}</Table.Cell><Table.Cell>{text(row.deliver, 'log')}</Table.Cell><Table.Cell><Badge variant={bool(row.enabled) ? 'secondary' : 'outline'}>{bool(row.enabled) ? 'Enabled' : 'Paused'}</Badge></Table.Cell><Table.Cell><div class="row-actions"><Switch checked={bool(row.enabled)} aria-label={`Enable webhook ${text(row.name)}`} disabled={Boolean(pending)} onCheckedChange={(enabled) => act('Toggle webhook', () => resolveRemoteResult(setHermesWebhookEnabled({ name: text(row.name), enabled })), 'Webhook updated.')} /><Button size="xs" variant="destructive" disabled={Boolean(pending)} onclick={() => confirmDestructiveAction({ title: `Delete ${text(row.name)}?`, description: 'This permanently removes the webhook route. Its secret and delivery configuration cannot be recovered.', actionLabel: 'Delete webhook', pendingLabel: 'Delete webhook', success: 'Webhook route deleted.', action: () => resolveRemoteResult(deleteHermesWebhook({ name: text(row.name) })) })}>Delete</Button></div></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    </div>
  {:else if family === 'jobs'}
    <div class="operation-stack"><form class="compact-form surface-panel" onsubmit={(event) => { event.preventDefault(); void addCron(); }}><Field.FieldGroup><Field.Field><Field.FieldLabel for="cron-name">Job name</Field.FieldLabel><Input id="cron-name" name="cron-name" bind:value={cronName} /></Field.Field><Field.Field><Field.FieldLabel for="cron-schedule">Schedule</Field.FieldLabel><Input id="cron-schedule" name="cron-schedule" bind:value={cronSchedule} placeholder="0 9 * * 1-5" required /></Field.Field><Field.Field><Field.FieldLabel for="cron-prompt">Prompt</Field.FieldLabel><Textarea id="cron-prompt" name="cron-prompt" bind:value={cronPrompt} required /></Field.Field></Field.FieldGroup><Button type="submit" size="sm" disabled={Boolean(pending)}>Create scheduled job</Button></form><Table.Root><Table.Caption>Hermes scheduled jobs and their runtime state.</Table.Caption><Table.Header><Table.Row><Table.Head>Name</Table.Head><Table.Head>Schedule</Table.Head><Table.Head>State</Table.Head><Table.Head>Actions</Table.Head></Table.Row></Table.Header><Table.Body>{#each rows as row (text(row.id))}<Table.Row><Table.Cell>{text(row.name, text(row.id))}</Table.Cell><Table.Cell>{text(row.schedule_display, text(asRecord(row.schedule).display, '—'))}</Table.Cell><Table.Cell>{text(row.state, bool(row.enabled) ? 'enabled' : 'paused')}</Table.Cell><Table.Cell><div class="row-actions"><Button size="xs" variant="outline" onclick={() => act('Run job', () => resolveRemoteResult(controlHermesCronJob({ jobId: text(row.id), action: 'trigger' })), 'Job triggered.')}>Run</Button><Button size="xs" variant="outline" onclick={() => act('Toggle job', () => resolveRemoteResult(controlHermesCronJob({ jobId: text(row.id), action: bool(row.enabled) ? 'pause' : 'resume' })), 'Job updated.')}>{bool(row.enabled) ? 'Pause' : 'Resume'}</Button><Button size="xs" variant="destructive" onclick={() => confirmDestructiveAction({ title: `Delete ${text(row.name, text(row.id))}?`, description: 'This permanently removes the schedule and prompt from Hermes. Existing run history is not a way to restore it.', actionLabel: 'Delete job', pendingLabel: 'Delete job', success: 'Job deleted.', action: () => resolveRemoteResult(deleteHermesCronJob({ jobId: text(row.id) })) })}>Delete</Button></div></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root></div>
  {:else if family === 'memory'}
    <div class="operation-stack"><div class="operation-grid"><div class="status-card surface-panel"><Brain /><div><h2>Memory provider</h2><dl class="data-summary">{#each summaryEntries(sectionData) as [label, value] (label)}<div><dt>{label}</dt><dd>{summaryValue(value)}</dd></div>{/each}</dl></div><div class="row-actions"><Button size="sm" variant="outline" onclick={() => confirmDestructiveAction({ title: 'Reset memory?', description: 'This clears the active memory provider while preserving unrelated Hermes configuration.', actionLabel: 'Reset memory', pendingLabel: 'Reset memory', success: 'Memory reset.', action: () => resolveRemoteResult(resetHermesMemory({ target: 'memory' })) })}>Reset memory</Button><Button size="sm" variant="destructive" onclick={() => confirmDestructiveAction({ title: 'Reset all memory?', description: 'This permanently clears all Hermes memory data for the active profile. This cannot be undone.', actionLabel: 'Reset all memory', pendingLabel: 'Reset all memory', success: 'All memory reset.', action: () => resolveRemoteResult(resetHermesMemory({ target: 'all' })) })}>Reset all</Button></div></div><div class="status-card surface-panel"><Activity /><div><h2>Skill curator</h2><dl class="data-summary">{#each summaryEntries(overview?.curator?.data) as [label, value] (label)}<div><dt>{label}</dt><dd>{summaryValue(value)}</dd></div>{/each}</dl></div><div class="row-actions"><Button size="sm" variant="outline" onclick={() => act('Toggle curator', () => resolveRemoteResult(setHermesCuratorPaused({ paused: !bool(asRecord(overview?.curator?.data).paused) })), 'Curator updated.')}>{bool(asRecord(overview?.curator?.data).paused) ? 'Resume' : 'Pause'}</Button><Button size="sm" onclick={() => act('Run curator', () => resolveRemoteResult(runHermesCurator({})), 'Curator started.')}>Run now</Button></div></div></div><section class="memory-graph surface-panel" aria-labelledby="memory-graph-heading"><header><div><h2 id="memory-graph-heading">Memory and skill graph</h2><p>Select a node to inspect or edit its source content.</p></div><Badge variant="outline">{asRows(overview?.learning?.data, 'nodes').length} nodes</Badge></header><div class="memory-layout"><ul aria-label="Memory graph nodes">{#each asRows(overview?.learning?.data, 'nodes') as node, index (`${text(node.id)}-${index}`)}<li><button type="button" class:active={learningNodeId === text(node.id)} onclick={() => loadLearningNode(text(node.id))}><span>{text(node.label, text(node.id))}</span><small>{text(node.kind, text(node.type))}</small></button></li>{/each}</ul><form onsubmit={(event) => { event.preventDefault(); if (learningNodeId) void act('Save memory node', () => resolveRemoteResult(editHermesLearningNode({ id: learningNodeId, content: learningNodeContent })), 'Memory node saved.'); }}><Field.FieldGroup><Field.Field><Field.FieldLabel for="memory-node-content">Node content</Field.FieldLabel><Textarea id="memory-node-content" name="memory-node-content" bind:value={learningNodeContent} rows={12} disabled={!learningNodeId} /></Field.Field></Field.FieldGroup><div class="row-actions"><Button type="submit" size="sm" disabled={!learningNodeId || Boolean(pending)}>Save node</Button><Button type="button" size="sm" variant="destructive" disabled={!learningNodeId || Boolean(pending)} onclick={() => confirmDestructiveAction({ title: 'Delete memory node?', description: 'This permanently removes the selected node from the Hermes learning graph.', actionLabel: 'Delete node', pendingLabel: 'Delete memory node', success: 'Memory node deleted.', action: () => resolveRemoteResult(deleteHermesLearningNode({ id: learningNodeId })) })}>Delete node</Button></div></form></div></section></div>
  {:else if family === 'models'}
    <div class="operation-stack"><form class="model-form surface-panel" onsubmit={(event) => { event.preventDefault(); void act('Set model', () => resolveRemoteResult(setHermesModel({ provider: selectedProvider, model: selectedModel })), 'Default model updated.'); }}><Field.FieldGroup><Field.Field><Field.FieldLabel for="model-provider">Provider</Field.FieldLabel><Select.Root type="single" name="model-provider" bind:value={selectedProvider}><Select.Trigger id="model-provider">{text(selectedProviderRecord?.name, 'Select provider')}</Select.Trigger><Select.Content><Select.Group>{#each modelProviders as provider (text(provider.slug))}<Select.Item value={text(provider.slug)} label={text(provider.name, text(provider.slug))} disabled={provider.authenticated === false}>{text(provider.name, text(provider.slug))}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field><Field.Field><Field.FieldLabel for="model-name">Model</Field.FieldLabel><Select.Root type="single" name="model-name" bind:value={selectedModel}><Select.Trigger id="model-name">{selectedModel || 'Select model'}</Select.Trigger><Select.Content><Select.Group>{#each providerModels as model (model)}<Select.Item value={model} label={model}>{model}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field></Field.FieldGroup><Button type="submit" size="sm" disabled={!selectedProvider || !selectedModel || Boolean(pending)}>Set default model</Button></form><div class="notice">Connect provider accounts to unlock their models in Hermes. Hermes remains the agent runtime; Companion never launches provider CLIs directly. For OpenAI models, Hermes’s <code>model.openai_runtime</code> setting chooses its native loop or its optional Codex app-server integration.</div>{#if oauthProviders.length}<section class="operation-section" aria-labelledby="provider-accounts-heading"><header><h2 id="provider-accounts-heading">Provider accounts</h2><p>Authentication is owned by the connected Hermes host.</p></header><ul class="settings-list provider-list">{#each oauthProviders as provider (text(provider.id))}<li><span><strong>{text(provider.name, text(provider.id))}</strong><small>{text(provider.flow) === 'external' ? 'Host CLI' : text(provider.flow)} · {bool(asRecord(provider.status).logged_in) ? `Connected${text(asRecord(provider.status).source_label) ? ` · ${text(asRecord(provider.status).source_label)}` : ''}` : 'Disconnected'}</small></span><span class="row-meta">{#if bool(asRecord(provider.status).logged_in) && provider.disconnectable !== false}<Button size="xs" variant="outline" onclick={() => act('Disconnect provider', () => resolveRemoteResult(disconnectHermesProviderOAuth({ providerId: text(provider.id) })), 'Provider disconnected.')}>Disconnect</Button>{:else if bool(asRecord(provider.status).logged_in)}<span class="table-hint">{text(provider.disconnect_hint, 'Disconnect with the provider CLI.')}</span>{:else}<Button size="xs" onclick={() => oauthProvider = provider}>{text(provider.flow) === 'external' ? 'Show host command' : 'Connect'}</Button>{/if}</span></li>{/each}</ul></section>{/if}<form class="settings-form" onsubmit={(event) => { event.preventDefault(); void saveConfig(); }}><header><div><h2>Schema-driven Hermes settings</h2><p>Fields come from the connected host’s <code>/api/config/schema</code>.</p></div><Button type="submit" size="sm" disabled={Boolean(pending)}>Save settings</Button></header><Field.FieldGroup>{#each configFields as field (field.key)}<Field.Field><Field.FieldLabel for={`config-${field.key}`}>{field.key}</Field.FieldLabel>{#if field.type === 'boolean'}<Switch id={`config-${field.key}`} checked={bool(getConfigValue(field.key))} onCheckedChange={(value) => setConfigValue(field.key, value)} />{:else if field.type === 'select'}<Select.Root type="single" name={field.key} value={String(getConfigValue(field.key) ?? '')} onValueChange={(value) => setConfigValue(field.key, value)}><Select.Trigger id={`config-${field.key}`}>{String(getConfigValue(field.key) ?? 'Select value')}</Select.Trigger><Select.Content><Select.Group><Select.Label>{field.key}</Select.Label>{#each field.options ?? [] as option (String(option))}<Select.Item value={String(option)} label={String(option)}>{String(option)}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root>{:else if field.type === 'text' || field.type === 'list'}<Textarea id={`config-${field.key}`} name={field.key} value={field.type === 'list' ? JSON.stringify(getConfigValue(field.key) ?? []) : text(getConfigValue(field.key))} oninput={(event) => setConfigValue(field.key, field.type === 'list' ? (() => { try { return JSON.parse(event.currentTarget.value); } catch { return event.currentTarget.value; } })() : event.currentTarget.value)} />{:else}<Input id={`config-${field.key}`} name={field.key} type={field.type === 'number' ? 'number' : 'text'} value={String(getConfigValue(field.key) ?? '')} oninput={(event) => setConfigValue(field.key, field.type === 'number' ? Number(event.currentTarget.value) : event.currentTarget.value)} />{/if}</Field.Field>{/each}</Field.FieldGroup></form></div>
  {:else if family === 'notifications'}
    <section class="operation-stack" aria-labelledby="notifications-heading"><div class="status-card surface-panel"><Bell /><div><h2 id="notifications-heading">Native notifications</h2><p>Hermes approval requests and completed session responses can notify this desktop. Approval decisions remain inline with their conversation context.</p></div><Badge variant={bool(asRecord(sectionData).supported) ? 'secondary' : 'outline'}>{bool(asRecord(sectionData).supported) ? 'Available' : 'Unavailable'}</Badge></div>{#if !bool(asRecord(sectionData).supported)}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Native notifications are unavailable</Alert.Title><Alert.Description>{text(asRecord(sectionData).error, 'This Electron runtime does not support native notifications.')}</Alert.Description></Alert.Root>{/if}</section>
  {:else if family === 'analytics' || family === 'reports'}
    <InsightsCenter />
  {:else if family === 'audit'}
    <div class="log-view surface-panel"><header><h2>Hermes logs</h2><Badge variant="outline">Host source</Badge></header><pre>{Array.isArray(asRecord(sectionData).lines) ? (asRecord(sectionData).lines as unknown[]).join('\n') : JSON.stringify(sectionData, null, 2)}</pre></div>
  {:else if family === 'checkpoints'}
    <div class="operation-stack checkpoint-store">
      <header class="checkpoint-summary">
        <div class="checkpoint-heading"><HardDrive /><div><h2>Filesystem checkpoints</h2><p>Hermes snapshots files before supported edits and destructive commands.</p></div></div>
        <div class="checkpoint-total"><strong>{formatBytes(checkpointTotalBytes)}</strong><span>{rows.length} {rows.length === 1 ? 'session store' : 'session stores'}</span></div>
        <Button size="sm" variant="outline" disabled={Boolean(pending) || actionRunning || rows.length === 0} onclick={() => pruneCheckpointsOpen = true}><Trash2 data-icon="inline-start" /> Prune storage</Button>
      </header>
      {#if rows.length}
        <ul class="checkpoint-list" aria-label="Hermes checkpoint session stores">
          {#each rows as row (text(row.session))}<li><HardDrive /><span><strong>{text(row.session)}</strong><small>{String(row.files ?? 0)} checkpoint {Number(row.files) === 1 ? 'file' : 'files'}</small></span><code>{formatBytes(Number(row.bytes ?? 0))}</code></li>{/each}
        </ul>
      {:else}
        <Empty.Root><Empty.Header><Empty.Media variant="icon"><HardDrive /></Empty.Media><Empty.Title>No filesystem checkpoints</Empty.Title><Empty.Description>Hermes has not recorded rollback snapshots for this profile. Fine-grained restore remains available through Hermes’s <code>/rollback</code> command when snapshots exist.</Empty.Description></Empty.Header></Empty.Root>
      {/if}
      <p class="checkpoint-note">This view manages aggregate storage only. Conversation restore reruns a selected prompt; context-compression summaries are not rollback points.</p>
      {#if actionStatus}<div class="log-view surface-panel"><header><div><h2>Cleanup output</h2><code>{text(actionStatus.name)}</code></div><Badge variant={bool(actionStatus.running) ? 'secondary' : Number(actionStatus.exit_code) === 0 ? 'outline' : 'destructive'}>{bool(actionStatus.running) ? 'Running' : Number(actionStatus.exit_code) === 0 ? 'Finished' : 'Failed'}</Badge></header><pre aria-live="polite">{Array.isArray(actionStatus.lines) ? (actionStatus.lines as unknown[]).join('\n') : JSON.stringify(actionStatus, null, 2)}</pre></div>{/if}
    </div>
  {:else if family === 'updates' || family === 'health'}
    <div class="operation-stack"><div class="operation-grid"><div class="status-card surface-panel"><ServerCog /><div><h2>{family === 'updates' ? 'Update status' : 'System health'}</h2><dl class="data-summary">{#each summaryEntries(sectionData) as [label, value] (label)}<div><dt>{label}</dt><dd>{summaryValue(value)}</dd></div>{/each}</dl></div></div><div class="maintenance surface-panel"><h2>Maintenance actions</h2><div>{#each ['doctor', 'security-audit', 'backup', 'debug-share', 'gateway-restart', 'update'] as action}<Button size="sm" variant="outline" disabled={Boolean(pending) || actionRunning || (action === 'update' && !bool(asRecord(sectionData).can_update_hermes))} title={action === 'update' && !bool(asRecord(sectionData).can_update_hermes) ? 'This Hermes host does not support in-app updates.' : undefined} onclick={() => runMaintenanceAction(action as 'doctor' | 'security-audit' | 'backup' | 'debug-share' | 'gateway-restart' | 'update')}>{#if action === 'backup'}<DatabaseBackup data-icon="inline-start" />{:else}<Wrench data-icon="inline-start" />{/if}{summaryLabel(action)}</Button>{/each}</div></div></div>{#if actionStatus}<div class="log-view surface-panel"><header><div><h2>Action output</h2>{#if text(actionStatus.name)}<code>{text(actionStatus.name)}</code>{/if}</div><Badge variant={bool(actionStatus.running) ? 'secondary' : Number(actionStatus.exit_code) === 0 ? 'outline' : 'destructive'}>{bool(actionStatus.running) ? 'Running' : Number(actionStatus.exit_code) === 0 ? 'Finished' : 'Failed'}</Badge></header><pre aria-live="polite">{Array.isArray(actionStatus.lines) ? (actionStatus.lines as unknown[]).join('\n') : JSON.stringify(actionStatus, null, 2)}</pre></div>{/if}</div>
  {:else}
    <Empty.Root><Empty.Header><Empty.Media variant="icon"><ServerCog /></Empty.Media><Empty.Title>Unsupported pending API</Empty.Title><Empty.Description>This family remains disabled until the connected Hermes version exposes a documented capability.</Empty.Description></Empty.Header></Empty.Root>
  {/if}
</section>

{#if oauthProvider}
  <ProviderOAuthDialog provider={oauthProvider} onclose={() => oauthProvider = null} onsuccess={async () => { notice = `${text(oauthProvider?.name, 'Provider')} connected.`; await load(); }} />
{/if}

<Dialog.Root open={destructiveConfirmation !== null} onOpenChange={(open) => { if (!open) destructiveConfirmation = null; }}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{destructiveConfirmation?.title}</Dialog.Title>
      <Dialog.Description>{destructiveConfirmation?.description}</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => destructiveConfirmation = null}>Cancel</Button>
      <Button variant="destructive" disabled={Boolean(pending)} onclick={() => void runDestructiveAction()}>{destructiveConfirmation?.actionLabel}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={pruneCheckpointsOpen}><Dialog.Content class="sm:max-w-md"><Dialog.Header><Dialog.Title>Prune checkpoint storage?</Dialog.Title><Dialog.Description>Hermes will remove old filesystem snapshots according to its retention policy. Active files and conversation history are not deleted.</Dialog.Description></Dialog.Header><Dialog.Footer><Button variant="ghost" onclick={() => pruneCheckpointsOpen = false}>Cancel</Button><Button variant="destructive" disabled={Boolean(pending) || actionRunning} onclick={() => void pruneCheckpoints()}>Prune old snapshots</Button></Dialog.Footer></Dialog.Content></Dialog.Root>

<style>
  .operations { block-size: 100%; overflow: auto; padding: clamp(.75rem, 2cqi, 1.25rem); container: operations / inline-size; }
  .operations.embedded { block-size: auto; overflow: visible; padding: 0; }
  .operations.embedded[data-family='models'] .settings-form { display: none; }
  .operations-header { display: flex; align-items: flex-end; justify-content: space-between; gap: .75rem; margin-block-end: .65rem; }
  .operations-header > div { display: grid; gap: .2rem; }
  h1 { margin: 0; font-size: clamp(1.2rem, 3cqi, 1.65rem); text-transform: capitalize; letter-spacing: -.035em; }
  h2 { margin: 0; font-size: .82rem; }
  .loading, .operation-stack { display: grid; gap: .55rem; }
  .notice { margin-block-end: .7rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--muted); padding: .55rem .7rem; color: var(--muted-foreground); font-size: .72rem; }
  .compact-form { display: flex; align-items: flex-end; gap: .5rem; padding: .6rem; }
  .compact-form > :global([data-slot='field-group']) { display: grid; grid-template-columns: repeat(3, minmax(10rem, 1fr)); flex: 1; }
  .hub-search, .model-form { display: flex; align-items: flex-end; gap: .4rem; padding: .6rem; }
  .webhook-form { display: grid; gap: .55rem; padding: .6rem; }
  .webhook-form > :global(button) { justify-self: end; }
  .webhook-route { display: grid; gap: .15rem; }
  .webhook-route code { max-inline-size: 18rem; overflow: hidden; color: var(--muted-foreground); font-size: .64rem; text-overflow: ellipsis; white-space: nowrap; }
  .hub-search label { align-self: center; font-size: .72rem; font-weight: 650; }
  .hub-search :global(input) { flex: 1; }
  .model-form > :global([data-slot='field-group']) { display: grid; grid-template-columns: repeat(2, minmax(12rem, 1fr)); flex: 1; }
  .row-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .35rem; }
  .operation-section { display: grid; gap: .4rem; }
  .operation-section > header { padding-inline: .1rem; }
  .operation-section > header p { margin: .12rem 0 0; color: var(--muted-foreground); font-size: var(--type-small); }
  .settings-list { display: grid; gap: 1px; margin: 0; padding: .2rem; border: 1px solid var(--border); border-radius: var(--radius); list-style: none; }
  .settings-list li { min-inline-size: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .75rem; border-radius: calc(var(--radius) * .8); padding: .55rem; }
  .settings-list li:is(:hover, :focus-within) { background: var(--surface-subtle); }
  .settings-list li > span:first-child { min-inline-size: 0; display: grid; gap: .12rem; }
  .settings-list strong { overflow: hidden; font-size: var(--type-small); font-weight: 590; text-overflow: ellipsis; white-space: nowrap; }
  .settings-list small { min-inline-size: 0; overflow: hidden; color: var(--muted-foreground); font-size: var(--type-small); line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
  .settings-list small code { font-size: var(--type-caption); }
  .row-meta { display: flex; align-items: center; gap: .45rem; }
  .empty-settings-list { margin: 0; border: 1px dashed var(--border); border-radius: var(--radius); padding: .8rem; color: var(--muted-foreground); font-size: var(--type-small); }
  .plugin-manager { max-inline-size: 64rem; margin-inline: auto; }
  .plugin-install { display: grid; grid-template-columns: minmax(11rem, .8fr) minmax(14rem, 1.3fr) auto; align-items: end; gap: .65rem; border-radius: calc(var(--radius) * 1.1); background: var(--surface-raised); padding: .7rem; }
  .plugin-install label, .plugin-section h2 { display: block; color: var(--foreground); font-size: .74rem; font-weight: 620; }
  .plugin-install p, .plugin-section p { margin: .12rem 0 0; color: var(--muted-foreground); font-size: .63rem; line-height: 1.4; }
  .plugin-section { display: grid; gap: .4rem; }
  .plugin-section > header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .35rem .15rem; }
  .plugin-list { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }
  .plugin-list li { min-inline-size: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: .55rem; border-radius: var(--radius); padding: .55rem .6rem; }
  .plugin-list li:is(:hover, :focus-within) { background: var(--sidebar-accent); }
  .plugin-list li > :global(svg) { inline-size: .9rem; color: var(--muted-foreground); }
  .plugin-copy { min-inline-size: 0; display: grid; gap: .08rem; }
  .plugin-copy strong, .plugin-copy small, .plugin-copy em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plugin-copy strong { font-size: .7rem; font-weight: 590; }
  .plugin-copy small { color: var(--muted-foreground); font-size: .63rem; }
  .plugin-copy em { color: var(--muted-foreground); font-family: var(--font-mono); font-size: .56rem; font-style: normal; }
  .plugin-actions { display: flex; align-items: center; gap: .25rem; }
  .plugin-empty { border-radius: var(--radius); background: color-mix(in oklab, var(--surface-raised), transparent 36%); padding: .75rem; }
  .plugin-provider-fields { display: grid; grid-template-columns: repeat(2, minmax(12rem, 1fr)) auto; align-items: end; gap: .65rem; border-radius: calc(var(--radius) * 1.1); background: var(--surface-raised); padding: .7rem; }
  .table-hint { display: inline-block; max-inline-size: 22rem; color: var(--muted-foreground); font-size: .68rem; line-height: 1.4; }
  code { font-family: var(--font-mono); font-size: .68rem; }
  .status-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: .6rem; padding: .65rem; }
  .status-card > :global(svg) { inline-size: 1rem; color: var(--primary); }
  .status-card p { margin: .3rem 0 0; overflow: auto; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .68rem; line-height: 1.55; white-space: pre-wrap; }
  .data-summary { min-inline-size: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr)); gap: .45rem .8rem; margin: .3rem 0 0; }
  .data-summary > div { min-inline-size: 0; display: grid; gap: .08rem; }
  .data-summary dt { color: var(--muted-foreground); font-size: var(--type-status); }
  .data-summary dd { min-inline-size: 0; margin: 0; overflow-wrap: anywhere; color: var(--foreground); font-family: var(--font-mono); font-size: var(--type-caption); }
  .operation-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
  .settings-form { display: grid; gap: .65rem; }
  .settings-form > header { position: sticky; inset-block-start: -.1rem; display: flex; align-items: center; justify-content: space-between; gap: .75rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-overlay); padding: .6rem; }
  .settings-form p { margin: .2rem 0 0; color: var(--muted-foreground); font-size: .7rem; }
  .log-view { overflow: hidden; }
  .log-view > header { display: flex; align-items: center; justify-content: space-between; padding: .5rem .6rem; border-block-end: 1px solid var(--border); }
  .log-view > pre { max-block-size: 65cqb; margin: 0; overflow: auto; padding: .6rem; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .68rem; line-height: 1.5; white-space: pre-wrap; }
  .maintenance { padding: .65rem; }
  .maintenance > div { display: flex; flex-wrap: wrap; gap: .4rem; margin-block-start: .7rem; }
  .checkpoint-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: .8rem; border-radius: calc(var(--radius) * 1.1); background: var(--surface-raised); padding: .75rem; }
  .checkpoint-heading { min-inline-size: 0; display: flex; align-items: flex-start; gap: .55rem; }
  .checkpoint-heading > :global(svg), .checkpoint-list li > :global(svg) { inline-size: .9rem; flex: none; color: var(--muted-foreground); }
  .checkpoint-heading p, .checkpoint-note { margin: .18rem 0 0; color: var(--muted-foreground); font-size: .65rem; line-height: 1.45; }
  .checkpoint-note { max-inline-size: 44rem; margin: .2rem auto 0; padding-inline: .6rem; text-align: center; }
  .checkpoint-total { display: grid; justify-items: end; }
  .checkpoint-total strong { font-family: var(--font-mono); font-size: .75rem; font-weight: 560; }
  .checkpoint-total span { color: var(--muted-foreground); font-size: .58rem; }
  .checkpoint-list { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }
  .checkpoint-list li { min-inline-size: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .55rem; border-radius: var(--radius); padding: .55rem .65rem; }
  .checkpoint-list li:is(:hover, :focus-within) { background: var(--sidebar-accent); }
  .checkpoint-list span { min-inline-size: 0; display: grid; gap: .08rem; }
  .checkpoint-list strong, .checkpoint-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .checkpoint-list strong { font-size: .7rem; font-weight: 580; }
  .checkpoint-list small { color: var(--muted-foreground); font-size: .61rem; }
  .checkpoint-list code { color: var(--muted-foreground); }
  .memory-graph { overflow: hidden; }
  .memory-graph > header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .6rem; border-block-end: 1px solid var(--border); }
  .memory-graph p { margin: .2rem 0 0; color: var(--muted-foreground); font-size: .68rem; }
  .memory-layout { display: grid; grid-template-columns: minmax(12rem, .7fr) minmax(0, 1.3fr); min-block-size: 20rem; }
  .memory-layout ul { max-block-size: 28rem; margin: 0; padding: .4rem; overflow: auto; border-inline-end: 1px solid var(--border); list-style: none; }
  .memory-layout li button { inline-size: 100%; display: flex; align-items: center; gap: .5rem; border: 0; border-radius: calc(var(--radius) * .75); background: transparent; padding: .45rem .5rem; color: var(--muted-foreground); text-align: start; }
  .memory-layout li button:hover, .memory-layout li button.active { background: var(--sidebar-accent); color: var(--foreground); }
  .memory-layout li span { min-inline-size: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .7rem; }
  .memory-layout li small { font-size: .6rem; }
  .memory-layout form { display: grid; align-content: start; gap: .5rem; padding: .6rem; }
  @container operations (max-width: 48rem) { .operation-grid { grid-template-columns: 1fr; } .compact-form { align-items: stretch; flex-direction: column; } .compact-form > :global([data-slot='field-group']) { grid-template-columns: 1fr; inline-size: 100%; } .plugin-install, .plugin-provider-fields, .checkpoint-summary { grid-template-columns: 1fr; } .checkpoint-total { justify-items: start; } .checkpoint-summary > :global(button) { justify-self: start; } .plugin-list li { grid-template-columns: auto minmax(0, 1fr) auto; } .plugin-actions { grid-column: 2 / -1; justify-content: end; } }
</style>
