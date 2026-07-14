<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import * as Field from '$lib/components/ui/field';
  import * as Select from '$lib/components/ui/select';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { settingsSections } from '$lib/settings/settings-registry';
  import type { SettingsAction } from '$lib/settings/settings-registry';
  import { getOpenRouterPolicy, saveDesktopSettings, saveOpenRouterManagementKey } from '$lib/client/remote/settings.remote';
  import { setProfileUiPreferences } from '$lib/client/remote/profile-ui.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import type { CapabilityFamily, DesktopPreferences, OpenRouterPolicyOverview, ProfileControlDisplay, ProfileUiPreferences } from '@hermes-companion/contracts';
  import { Check, CircleAlert, ExternalLink, LoaderCircle, ShieldCheck } from '@lucide/svelte';

  let { sectionId, itemId, preferences, profileConnectionId = null, profileUiPreferences = null, openRouterConfigured = false, openRouterVerified = false, openRouterVerificationError = null, openRouterPolicy = null, availableSurfaces = [], connectionAvailable = false, onsaved, onpolicysaved, onprofileuisaved, onsettingsaction }: {
    sectionId: string;
    itemId?: string;
    preferences: DesktopPreferences;
    profileConnectionId?: string | null;
    profileUiPreferences?: ProfileUiPreferences | null;
    openRouterConfigured?: boolean;
    openRouterVerified?: boolean;
    openRouterVerificationError?: string | null;
    openRouterPolicy?: OpenRouterPolicyOverview | null;
    availableSurfaces?: CapabilityFamily[];
    connectionAvailable?: boolean;
    onsaved: (preferences: DesktopPreferences, configured: boolean, verified: boolean, verificationError: string | null) => void;
    onpolicysaved: (policy: OpenRouterPolicyOverview) => void;
    onprofileuisaved: (preferences: ProfileUiPreferences) => void;
    onsettingsaction: (action: SettingsAction) => void;
  } = $props();

  let draft = $state<DesktopPreferences>({ account: { displayName: 'Hermes User', email: '' }, appearance: { mode: 'system', palette: 'mono', codeWordWrap: false, toolCallDensity: 'balanced' }, notifications: { system: true, warnings: true, completionSound: false } });
  let openRouterApiKey = $state('');
  let clearOpenRouterApiKey = $state(false);
  let openRouterManagementKey = $state('');
  let clearOpenRouterManagementKey = $state(false);
  let savingManagement = $state(false);
  let saving = $state(false);
  let feedback = $state('');
  let failure = $state('');
  let initialized = false;
  let profileControlDraft = $state<{ approval: ProfileControlDisplay; context: ProfileControlDisplay }>({ approval: 'status', context: 'status' });
  let thinkingStatusDraft = $state<'plain' | 'personality' | 'hidden'>('personality');
  const section = $derived(settingsSections.find((entry) => entry.id === sectionId) ?? settingsSections[0]);
  const sectionHasDesktopSettings = $derived(['appearance', 'notifications', 'about'].includes(section.id));
  const actionAvailable = (action?: SettingsAction) => action?.kind === 'connection' ? connectionAvailable : action?.kind === 'surface' ? availableSurfaces.includes(action.surface) : false;

  $effect(() => {
    if (!initialized) {
      draft = {
        account: { ...preferences.account },
        appearance: { ...preferences.appearance },
        notifications: { ...preferences.notifications },
      };
      initialized = true;
    }
  });

  $effect(() => {
    if (profileUiPreferences) { profileControlDraft = { ...profileUiPreferences.contextualControls }; thinkingStatusDraft = profileUiPreferences.thinkingStatus; }
  });

  $effect(() => {
    if (!itemId) return;
    requestAnimationFrame(() => document.getElementById(`setting-${itemId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  });

  async function save() {
    saving = true; failure = ''; feedback = '';
    try {
      const result = await resolveRemoteResult(saveDesktopSettings({ preferences: draft, openRouterApiKey: openRouterApiKey || undefined, clearOpenRouterApiKey, verifyOpenRouter: section.id === 'providers' }));
      if (!result.ok) throw new Error(result.error);
      const replacedCredential = Boolean(openRouterApiKey);
      const removedCredential = clearOpenRouterApiKey && !replacedCredential;
      openRouterApiKey = ''; clearOpenRouterApiKey = false;
      feedback = replacedCredential ? 'Credential saved and verified' : removedCredential ? (result.openRouter.configured ? 'Stored credential removed; environment credential remains active' : 'Stored credential removed') : section.id === 'providers' ? 'Credential verified' : 'Settings saved';
      onsaved(result.preferences, result.openRouter.configured, result.openRouter.verified, result.openRouter.error);
      onpolicysaved(await resolveRemoteResult(getOpenRouterPolicy({ refresh: true })));
    } catch (cause) { failure = cause instanceof Error ? cause.message : 'Settings could not be saved.'; }
    finally { saving = false; }
  }

  async function saveManagementKey() {
    savingManagement = true; failure = ''; feedback = '';
    try {
      const result = await resolveRemoteResult(saveOpenRouterManagementKey({ apiKey: openRouterManagementKey || undefined, clear: clearOpenRouterManagementKey }));
      if (!result.ok) throw new Error(result.error);
      openRouterManagementKey = ''; clearOpenRouterManagementKey = false; onpolicysaved(result.policy);
      feedback = result.policy.managementConfigured ? 'Guardrail access verified' : 'Management key removed';
    } catch (cause) { failure = cause instanceof Error ? cause.message : 'Management key could not be saved.'; }
    finally { savingManagement = false; }
  }

  async function saveProfileControlDisplay() {
    if (!profileConnectionId || !profileUiPreferences) return;
    saving = true; failure = ''; feedback = '';
    try {
      const next = await resolveRemoteResult(setProfileUiPreferences({ connectionId: profileConnectionId, preferences: { ...profileUiPreferences, contextualControls: profileControlDraft } }));
      onprofileuisaved(next); feedback = 'Profile control locations saved';
    } catch (cause) { failure = cause instanceof Error ? cause.message : 'Profile control locations could not be saved.'; }
    finally { saving = false; }
  }

  async function saveThinkingStatus() {
    if (!profileConnectionId || !profileUiPreferences) return;
    saving = true; failure = ''; feedback = '';
    try {
      const next = await resolveRemoteResult(setProfileUiPreferences({ connectionId: profileConnectionId, preferences: { ...profileUiPreferences, thinkingStatus: thinkingStatusDraft } }));
      onprofileuisaved(next); feedback = 'Thinking status saved';
    } catch (cause) { failure = cause instanceof Error ? cause.message : 'Thinking status could not be saved.'; }
    finally { saving = false; }
  }

</script>

<div class="settings-scroll">
  <article class="settings-page" aria-labelledby="settings-heading">
    <header class="settings-page-header"><div><h1 id="settings-heading">{section.label}</h1><p>{section.description}</p></div>{#if sectionHasDesktopSettings}<Button size="sm" onclick={() => void save()} disabled={saving}>{#if saving}<LoaderCircle data-icon="inline-start" class="spin" />{/if}Save</Button>{/if}</header>
    {#if feedback}<p class="settings-feedback" role="status"><Check />{feedback}</p>{/if}
    {#if failure}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Settings action failed</Alert.Title><Alert.Description>{failure}</Alert.Description></Alert.Root>{/if}

    {#if section.id === 'chat'}
      <section class="settings-group" aria-labelledby="chat-reasoning-status" id="setting-reasoning-blocks"><h2 id="chat-reasoning-status">Reasoning</h2><Field.FieldGroup>
        <Field.Field orientation="horizontal"><Field.FieldContent><Field.FieldTitle>Thinking status</Field.FieldTitle><Field.FieldDescription>Use a plain label, Hermes personality text, or no transient label. Completed reasoning remains available in its disclosure.</Field.FieldDescription></Field.FieldContent><Select.Root type="single" bind:value={thinkingStatusDraft} disabled={!profileConnectionId}><Select.Trigger aria-label="Thinking status">{thinkingStatusDraft === 'personality' ? 'Hermes personality' : thinkingStatusDraft === 'plain' ? 'Plain' : 'Hidden'}</Select.Trigger><Select.Content><Select.Group><Select.Label>Thinking status</Select.Label><Select.Item value="plain" label="Plain">Plain</Select.Item><Select.Item value="personality" label="Hermes personality">Hermes personality</Select.Item><Select.Item value="hidden" label="Hidden">Hidden</Select.Item></Select.Group></Select.Content></Select.Root></Field.Field>
      </Field.FieldGroup><Button size="sm" variant="outline" disabled={!profileConnectionId || saving} onclick={() => void saveThinkingStatus()}>Save chat display</Button></section>
    {:else if section.id === 'appearance'}
      <section class="settings-group" aria-labelledby="appearance-mode">
        <h2 id="appearance-mode">Theme</h2>
        <Field.FieldGroup>
          <Field.Field orientation="horizontal" id="setting-theme"><Field.FieldContent><Field.FieldTitle>Mode</Field.FieldTitle><Field.FieldDescription>Apply light or dark luminance independently from the color palette.</Field.FieldDescription></Field.FieldContent><ToggleGroup.Root type="single" bind:value={draft.appearance.mode} aria-label="Theme mode"><ToggleGroup.Item value="light">Light</ToggleGroup.Item><ToggleGroup.Item value="dark">Dark</ToggleGroup.Item><ToggleGroup.Item value="system">System</ToggleGroup.Item></ToggleGroup.Root></Field.Field>
          <Field.Field orientation="horizontal" id="setting-palette"><Field.FieldContent><Field.FieldTitle>Palette</Field.FieldTitle><Field.FieldDescription>Meta themes replace neutral and accent primitives while preserving semantic roles.</Field.FieldDescription></Field.FieldContent><Select.Root type="single" bind:value={draft.appearance.palette}><Select.Trigger aria-label="Palette">{draft.appearance.palette}</Select.Trigger><Select.Content><Select.Group><Select.Label>Palettes</Select.Label>{#each ['mono', 'nous', 'midnight', 'ember', 'cyberpunk', 'slate'] as palette}<Select.Item value={palette} label={palette}>{palette}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field>
        </Field.FieldGroup>
      </section>
      <section class="settings-group" aria-labelledby="appearance-conversation"><h2 id="appearance-conversation">Agent conversations</h2><Field.FieldGroup>
        <Field.Field orientation="horizontal" id="setting-tool-density"><Field.FieldContent><Field.FieldTitle>Tool call density</Field.FieldTitle><Field.FieldDescription>Adjust how much detail is shown for tool calls.</Field.FieldDescription></Field.FieldContent><Select.Root type="single" bind:value={draft.appearance.toolCallDensity}><Select.Trigger aria-label="Tool call density">{draft.appearance.toolCallDensity}</Select.Trigger><Select.Content><Select.Group>{#each ['compact', 'balanced', 'detailed'] as density}<Select.Item value={density} label={density}>{density}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field>
        <Field.Field orientation="horizontal" id="setting-code-wrap"><Field.FieldContent><Field.FieldTitle>Code block word wrap</Field.FieldTitle><Field.FieldDescription>Wrap long lines in conversation code blocks.</Field.FieldDescription></Field.FieldContent><Switch bind:checked={draft.appearance.codeWordWrap} aria-label="Code block word wrap" /></Field.Field>
      </Field.FieldGroup></section>
      <section class="settings-group" aria-labelledby="appearance-contextual-controls" id="setting-contextual-controls"><h2 id="appearance-contextual-controls">Contextual controls</h2><Field.FieldGroup>
        <Field.Field orientation="horizontal"><Field.FieldContent><Field.FieldTitle>Approval mode location</Field.FieldTitle><Field.FieldDescription>Default to the status line; show it in the composer only when this profile benefits from an in-flow control.</Field.FieldDescription></Field.FieldContent><Select.Root type="single" bind:value={profileControlDraft.approval} disabled={!profileConnectionId}><Select.Trigger aria-label="Approval mode location">{profileControlDraft.approval}</Select.Trigger><Select.Content><Select.Group>{#each [['status', 'Status line'], ['composer', 'Composer'], ['both', 'Both'], ['hidden', 'Hidden']] as option}<Select.Item value={option[0]} label={option[1]}>{option[1]}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field>
        <Field.Field orientation="horizontal"><Field.FieldContent><Field.FieldTitle>Context usage location</Field.FieldTitle><Field.FieldDescription>Use the status line for token capacity; the composer can retain its compact radial control when explicitly enabled.</Field.FieldDescription></Field.FieldContent><Select.Root type="single" bind:value={profileControlDraft.context} disabled={!profileConnectionId}><Select.Trigger aria-label="Context usage location">{profileControlDraft.context}</Select.Trigger><Select.Content><Select.Group>{#each [['status', 'Status line'], ['composer', 'Composer'], ['both', 'Both'], ['hidden', 'Hidden']] as option}<Select.Item value={option[0]} label={option[1]}>{option[1]}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field>
      </Field.FieldGroup><Button size="sm" variant="outline" disabled={!profileConnectionId || saving} onclick={() => void saveProfileControlDisplay()}>Save profile controls</Button></section>
    {:else if section.id === 'notifications'}
      <section class="settings-group" aria-labelledby="notification-settings"><h2 id="notification-settings">Notifications</h2><Field.FieldGroup>
        <Field.Field orientation="horizontal" id="setting-system-notifications"><Field.FieldContent><Field.FieldTitle>System notifications</Field.FieldTitle><Field.FieldDescription>Notify when an agent completes or needs attention.</Field.FieldDescription></Field.FieldContent><Switch bind:checked={draft.notifications.system} aria-label="System notifications" /></Field.Field>
        <Field.Field orientation="horizontal" id="setting-warning-notifications"><Field.FieldContent><Field.FieldTitle>Warning notifications</Field.FieldTitle><Field.FieldDescription>Show warning-level in-app toasts.</Field.FieldDescription></Field.FieldContent><Switch bind:checked={draft.notifications.warnings} aria-label="Warning notifications" /></Field.Field>
        <Field.Field orientation="horizontal" id="setting-completion-sound"><Field.FieldContent><Field.FieldTitle>Completion sound</Field.FieldTitle><Field.FieldDescription>Play a sound when Hermes finishes responding.</Field.FieldDescription></Field.FieldContent><Switch bind:checked={draft.notifications.completionSound} aria-label="Completion sound" /></Field.Field>
      </Field.FieldGroup></section>
    {:else if section.id === 'providers'}
      <Alert.Root><ShieldCheck /><Alert.Title>Hermes remains the primary runtime</Alert.Title><Alert.Description>Provider policy is a read-only layer over Hermes. It can restrict choices but never becomes a second inference path.</Alert.Description></Alert.Root>
      <section class="settings-group" aria-labelledby="hermes-provider-heading" id="setting-hermes-providers"><h2 id="hermes-provider-heading">Hermes providers</h2><div class="setting-row"><span><strong>Model provider accounts</strong><small>Authentication and default model selection remain owned by Hermes.</small></span><Button variant="outline" size="sm" disabled={!availableSurfaces.includes('models')} onclick={() => onsettingsaction({ kind: 'surface', surface: 'models' })}>Manage <ExternalLink data-icon="inline-end" /></Button></div></section>
      <section class="settings-group" aria-labelledby="openrouter-heading" id="setting-openrouter"><h2 id="openrouter-heading">OpenRouter policy</h2><Field.FieldGroup>
        <Field.Field><Field.FieldLabel for="openrouter-key">Inference key</Field.FieldLabel><Input id="openrouter-key" type="password" bind:value={openRouterApiKey} oninput={() => { failure = ''; feedback = ''; }} placeholder={openRouterConfigured ? 'Stored securely — enter to replace' : 'sk-or-v1-…'} autocomplete="new-password" /><Field.FieldDescription>Read the effective model inventory and restrictions for the OpenRouter account used by Hermes. Companion never uses this key as a second chat runtime.</Field.FieldDescription></Field.Field>
        {#if openRouterConfigured}<Field.Field orientation="horizontal"><Field.FieldContent><Field.FieldTitle>Stored credential</Field.FieldTitle><Field.FieldDescription>Remove the encrypted OpenRouter key when these settings are saved.</Field.FieldDescription></Field.FieldContent><Switch bind:checked={clearOpenRouterApiKey} aria-label="Remove stored OpenRouter key" /></Field.Field>{/if}
      </Field.FieldGroup><div class="provider-actions"><Button size="sm" onclick={() => void save()} disabled={saving}>{#if saving}<LoaderCircle data-icon="inline-start" class="spin" />{/if}{openRouterApiKey ? 'Save & verify' : clearOpenRouterApiKey ? 'Remove credential' : openRouterConfigured ? 'Verify stored credential' : 'Save credential'}</Button><span class="credential-state" data-state={openRouterVerified ? 'verified' : failure ? 'rejected' : openRouterConfigured ? 'stored' : 'missing'} title={failure || openRouterVerificationError || undefined}>{openRouterVerified ? 'Verified' : failure ? 'Rejected' : openRouterConfigured ? 'Stored · not verified' : 'Not stored'}</span></div></section>
      <section class="settings-group" aria-labelledby="openrouter-policy-heading" id="setting-openrouter-policy"><h2 id="openrouter-policy-heading">Effective policy</h2>
        <div class="setting-row"><span><strong>{openRouterPolicy?.verified ? `${openRouterPolicy.eligibleModelCount} models available` : 'Policy unavailable'}</strong><small>{openRouterPolicy?.verified ? `Filtered for ${openRouterPolicy.keyLabel ?? 'the stored OpenRouter key'} by account preferences, privacy, and guardrails.` : openRouterPolicy?.error ?? 'Store an OpenRouter inference key to load its effective model policy.'}</small></span>{#if openRouterPolicy?.keyLimitRemainingUsd !== null && openRouterPolicy?.keyLimitRemainingUsd !== undefined}<span class="policy-value">${openRouterPolicy.keyLimitRemainingUsd.toFixed(2)} left</span>{/if}</div>
        <Field.Field><Field.FieldLabel for="openrouter-management-key">Management key</Field.FieldLabel><Input id="openrouter-management-key" type="password" bind:value={openRouterManagementKey} placeholder={openRouterPolicy?.managementConfigured ? 'Stored securely — enter to replace' : 'OpenRouter management key'} autocomplete="new-password" /><Field.FieldDescription>Optional read-only access to guardrail names and restrictions. Management keys are never used for model requests.</Field.FieldDescription></Field.Field>
        {#if openRouterPolicy?.managementConfigured}<Field.Field orientation="horizontal"><Field.FieldContent><Field.FieldTitle>Stored management key</Field.FieldTitle><Field.FieldDescription>Remove guardrail inspection access.</Field.FieldDescription></Field.FieldContent><Switch bind:checked={clearOpenRouterManagementKey} aria-label="Remove stored OpenRouter management key" /></Field.Field>{/if}
        <div class="provider-actions"><Button size="sm" variant="outline" disabled={savingManagement || (!openRouterManagementKey && !clearOpenRouterManagementKey && !openRouterPolicy?.managementConfigured)} onclick={() => void saveManagementKey()}>{#if savingManagement}<LoaderCircle data-icon="inline-start" class="spin" />{/if}{openRouterManagementKey ? 'Save & inspect' : clearOpenRouterManagementKey ? 'Remove access' : openRouterPolicy?.managementConfigured ? 'Refresh guardrails' : 'Add inspection access'}</Button>{#if openRouterPolicy?.managementError}<span class="credential-state" data-state="rejected" title={openRouterPolicy.managementError}>Unavailable</span>{/if}</div>
        {#if openRouterPolicy?.guardrailsVisible}<div class="guardrail-list" role="list" aria-label="OpenRouter guardrails"><p class="policy-empty">These are workspace definitions visible to the management key. Effective eligibility above remains authoritative for the stored inference key.</p>{#each openRouterPolicy.guardrails as guardrail (guardrail.id)}<article class="guardrail-row" role="listitem"><div><strong>{guardrail.name}</strong>{#if guardrail.description}<small>{guardrail.description}</small>{/if}</div><span>{guardrail.allowedModels?.length ? `${guardrail.allowedModels.length} models` : 'All models'} · {guardrail.allowedProviders?.length ? `${guardrail.allowedProviders.length} providers` : 'All providers'}{#if guardrail.limitUsd !== null} · ${guardrail.limitUsd}/{guardrail.resetInterval}{/if}{#if guardrail.enforceZdr} · ZDR{/if}</span></article>{/each}{#if !openRouterPolicy.guardrails.length}<p class="policy-empty">No named guardrails were returned for this workspace.</p>{/if}</div>{/if}
      </section>
    {:else if section.id === 'about'}
      <section class="settings-group" aria-labelledby="account-heading" id="setting-account-identity"><h2 id="account-heading">Account identity</h2><Field.FieldGroup>
        <Field.Field><Field.FieldLabel for="account-name">Name</Field.FieldLabel><Input id="account-name" bind:value={draft.account.displayName} autocomplete="name" /></Field.Field>
        <Field.Field><Field.FieldLabel for="account-email">Email</Field.FieldLabel><Input id="account-email" type="email" bind:value={draft.account.email} autocomplete="email" placeholder="you@example.com" /><Field.FieldDescription>Shown beneath your name in the sidebar footer.</Field.FieldDescription></Field.Field>
      </Field.FieldGroup></section>
      <section class="settings-group" aria-labelledby="about-heading" id="setting-version"><h2 id="about-heading">Hermes Companion</h2><div class="setting-row"><span><strong>Development build</strong><small>This owner-only build is qualified directly on macOS.</small></span></div></section>
    {:else}
      <section class="settings-group" aria-labelledby="section-options"><h2 id="section-options">{section.label}</h2>
        {#each section.items as item (item.id)}<div class="setting-row" id={`setting-${item.id}`}><span><strong>{item.label}</strong><small>{item.description}</small></span><Button size="sm" variant="ghost" disabled={!actionAvailable(item.action)} title={item.unavailableReason ?? undefined} onclick={() => item.action && onsettingsaction(item.action)}>{item.action ? 'Configure' : 'Unavailable'}</Button></div>{/each}
      </section>
    {/if}
  </article>
</div>

<style>
  .settings-scroll { min-block-size: 0; max-block-size: 100%; block-size: 100%; overflow-y: auto; overflow-x: clip; overscroll-behavior: contain; scrollbar-gutter: stable; }
  .settings-page { inline-size: min(100% - 2rem, 48rem); display: grid; gap: 1.25rem; margin-inline: auto; padding: clamp(3.5rem, 8vh, 5.5rem) 0 4rem; }
  .settings-page-header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
  h1, h2, p { margin: 0; } h1 { font-size: 1rem; font-weight: 650; } h2 { color: var(--muted-foreground); font-size: .67rem; font-weight: 590; }
  .settings-page-header p { margin-block-start: .2rem; color: var(--muted-foreground); font-size: .7rem; }
  .settings-group { display: grid; gap: .45rem; scroll-margin-block: 5rem; }
  .settings-group > :global([data-slot='field-group']), .settings-group > .setting-row { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-subtle); padding: .25rem .7rem; }
  .settings-group :global([data-slot='field']) { min-block-size: 3.7rem; padding-block: .55rem; }
  .settings-group :global([data-slot='field'] + [data-slot='field']) { border-block-start: 1px solid var(--border); }
  .settings-group :global([data-slot='field-title']), .setting-row strong { font-size: .71rem; font-weight: 590; }
  .settings-group :global([data-slot='field-description']), .setting-row small { color: var(--muted-foreground); font-size: .63rem; line-height: 1.4; }
  .settings-group :global([data-slot='select-trigger']) { min-inline-size: 8.5rem; }
  .setting-row { min-block-size: 3.7rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; scroll-margin-block: 5rem; }
  .setting-row + .setting-row { margin-block-start: 1px; }
  .setting-row span { min-inline-size: 0; display: grid; gap: .12rem; }
  .provider-actions { display: flex; align-items: center; gap: .45rem; }
  .credential-state { margin-inline-start: auto; color: var(--muted-foreground); font-size: .63rem; }
  .credential-state[data-state='verified'] { color: var(--status-positive); }
  .credential-state[data-state='rejected'] { color: var(--status-negative); }
  .policy-value { flex: none; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .63rem; }
  .guardrail-list { display: grid; gap: 1px; }
  .guardrail-row { min-inline-size: 0; display: flex; align-items: start; justify-content: space-between; gap: 1rem; border-radius: var(--radius-sm); background: var(--surface-subtle); padding: .65rem .7rem; }
  .guardrail-row > div { min-inline-size: 0; display: grid; gap: .1rem; }
  .guardrail-row strong { font-size: .71rem; font-weight: 590; }
  .guardrail-row small, .guardrail-row > span, .policy-empty { color: var(--muted-foreground); font-size: .63rem; line-height: 1.4; }
  .guardrail-row > span { flex: none; max-inline-size: 45%; text-align: end; }
  .policy-empty { padding: .65rem .7rem; }
  .settings-feedback { display: flex; align-items: center; gap: .35rem; color: var(--status-positive); font-size: .68rem; }
  .settings-feedback :global(svg) { inline-size: .8rem; }
  :global(.spin) { animation: spin 1s linear infinite; } @keyframes spin { to { rotate: 1turn; } }
  @media (max-width: 48rem) { .settings-page { inline-size: min(100% - 1rem, 48rem); } }
</style>
