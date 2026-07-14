import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const desktop = new URL('../apps/desktop/src/', import.meta.url);
const contractsSource = new URL('../packages/contracts/src/index.ts', import.meta.url);
const source = (path: string) => readFile(new URL(path, desktop), 'utf8');

describe('shell resilience', () => {
  it('keeps deferred pets out of primary startup and settings work', async () => {
    const [page, settings] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/components/companion/settings-page.svelte')
    ]);

    expect(page).not.toContain('FloatingPet');
    expect(page).not.toContain('resolveCompanionPetActivity');
    expect(settings).not.toContain('PetSettings');
    expect(settings).not.toContain('setting-pet');
  });

  it('keeps deferred parity surfaces out of the primary capabilities screen', async () => {
    const [page, capabilities] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/components/companion/capabilities-center.svelte')
    ]);

    expect(capabilities).toContain('<Tabs.Trigger value="skills">Skills</Tabs.Trigger>');
    expect(capabilities).toContain('<Tabs.Trigger value="toolsets">Tools</Tabs.Trigger>');
    expect(capabilities).toContain('<Tabs.Trigger value="mcp">MCP</Tabs.Trigger>');
    expect(capabilities).toContain('<Tabs.Trigger value="hub">Browse Hub</Tabs.Trigger>');
    expect(capabilities).not.toContain('LearningCenter');
    expect(capabilities).not.toContain('ProductPluginCenter');
    expect(capabilities).not.toContain('InsightsCenter');
    expect(capabilities).not.toContain('value="learning"');
    expect(capabilities).not.toContain('value="kanban"');
    expect(capabilities).not.toContain('value="achievements"');
    expect(capabilities).not.toContain('value="analytics"');
    expect(capabilities).not.toContain('value="checkpoints"');
    expect(page).not.toContain('capabilityGroupDefinitions');
    expect(page).not.toContain('operationalCapabilities');
  });

  it('keeps deferred and hypothetical controls out of settings navigation', async () => {
    const [registry, settings, page] = await Promise.all([
      source('lib/settings/settings-registry.ts'),
      source('lib/components/companion/settings-page.svelte'),
      source('routes/+page.svelte')
    ]);

    expect(registry).not.toContain("id: 'voice'");
    expect(registry).not.toContain("id: 'advanced'");
    expect(registry).not.toContain("id: 'plugins'");
    expect(registry).not.toContain("id: 'artificial-analysis'");
    expect(settings).not.toContain('Coming later');
    expect(settings).not.toContain("onopensurface('updates')");
    expect(settings).not.toContain('OperationsCenter');
    expect(page).not.toContain("chooseSurface('updates')");
    expect(page).not.toContain("runCommandCenterAction('update')");
    expect(page).not.toContain('Hermes API</Button>');
    expect(settings).not.toContain('onopensurface(section.id)');
    expect(page).not.toContain("supported ?? (surface === 'model' ? 'models' : 'profiles')");
  });

  it('namespaces sidebar disclosure state from dependency-wide expanded selectors', async () => {
    const sidebarCategory = await source('lib/components/companion/sidebar-category.svelte');
    expect(sidebarCategory).toContain('data-category-expanded={expanded}');
    expect(sidebarCategory).not.toContain('data-expanded={expanded}');
  });

  it('releases dialog hit targets as soon as the shared primitive closes', async () => {
    const [content, overlay] = await Promise.all([
      source('lib/components/ui/dialog/dialog-content.svelte'),
      source('lib/components/ui/dialog/dialog-overlay.svelte')
    ]);
    for (const primitive of [content, overlay]) {
      expect(primitive).toContain('data-[state=closed]:hidden');
      expect(primitive).not.toContain('data-[state=closed]:animate-out');
      expect(primitive).not.toContain('data-closed:animate-out');
    }
    expect(content).toContain('{#snippet child({ props })}');
  });

  it('keeps both pane restoration controls in viewport chrome', async () => {
    const page = await source('routes/+page.svelte');
    expect(page).toContain('aria-controls="session-sidebar"');
    expect(page).toContain('aria-controls="workspace-inspector"');
    expect(page).toContain('aria-expanded={sidebarVisible}');
    expect(page).toContain('aria-expanded={inspectorVisible}');
    expect(page).toContain('.shell-chrome { display: contents; }');
    expect(page).toContain('.chrome-leading, .chrome-trailing { position: fixed');
    expect(page).not.toContain('class="window-drag-strip"');
    expect(page).toContain('-webkit-app-region: no-drag; }');
    expect(page).toContain('class="header-drag-space"');
    expect(page).toContain('.header-drag-space { min-inline-size: 1rem; align-self: stretch; flex: 1; -webkit-app-region: drag; }');
    expect(page).not.toContain("[data-settings-active='true'] { grid-template-columns: minmax(0, 1fr) 0");
  });

  it('keeps gateway status owned by a foreground, connection-scoped probe', async () => {
    const page = await source('routes/+page.svelte');
    expect(page).toContain("import { getWorkspaceOverview, refreshGateway, selectHermesProfile } from '$lib/client/remote/gateway.remote';");
    expect(page).toContain('async function refreshGatewayStatus()');
    expect(page).toContain('overview?.gateway.connection.id !== result.status.connection.id');
    expect(page).toContain('const becameLive = previous.status === \'disconnected\' && result.status.status !== \'disconnected\';');
    expect(page).toContain('previous.enhanced.sessionManagement !== result.status.enhanced.sessionManagement');
    expect(page).toContain('await loadWorkspace(true, false, true);');
    expect(page).toContain('approvalMode: result.approvalMode');
    expect(page).toContain('onconnected={() => void loadWorkspace(true, true)}');
    expect(page).toContain('window.addEventListener(\'focus\', refresh);');
    expect(page).toContain("document.addEventListener('visibilitychange', refresh);");
    expect(page).toContain('const gatewayTimer = setInterval(refresh, 30_000);');
  });

  it('uses a theme-relative side-pane surface', async () => {
    const [css, page] = await Promise.all([source('app.css'), source('routes/+page.svelte')]);
    expect(css).toContain('--surface-pane: color-mix(in oklab, var(--background)');
    expect(page.match(/background: var\(--surface-pane\)/g)).toHaveLength(2);
  });

  it('keeps pane contents rigid while their layout tracks release space', async () => {
    const [css, page] = await Promise.all([source('app.css'), source('routes/+page.svelte')]);
    expect(css).toContain('@property --shell-sidebar-track');
    expect(css).toContain("syntax: '<length>'");
    expect(page).toContain('grid-template-columns: var(--shell-sidebar-track) minmax(0, 1fr)');
    expect(page).toContain('transition: --shell-sidebar-track var(--motion-layout) var(--ease-standard)');
    expect(page).toContain("max(.75rem, calc(var(--window-safe-inline-start) + var(--shell-chrome-leading-width) - var(--shell-sidebar-track)))");
    expect(page).not.toContain("[data-sidebar-visible='false'] .workspace-header");
    expect(page).toContain('inline-size: var(--shell-sidebar-width); min-inline-size: var(--shell-sidebar-width)');
    expect(page).toContain("translate: -100% 0");
    expect(page).toContain('inline-size: var(--shell-inspector-width); min-inline-size: var(--shell-inspector-width)');
    expect(page).toContain('translate: 100% 0');
  });

  it('assigns explicit scroll owners to chat and settings', async () => {
    const [conversation, settings] = await Promise.all([
      source('lib/components/ai-elements/conversation/conversation-content.svelte'),
      source('lib/components/companion/settings-page.svelte')
    ]);
    expect(conversation).toContain('min-h-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain');
    expect(settings).toContain('overflow-y: auto');
    expect(settings).toContain('overscroll-behavior: contain');
  });

  it('gives the new-chat work surface the pane width instead of the reading-column width', async () => {
    const page = await source('routes/+page.svelte');
    expect(page).toContain("class={activeSessionId ? 'conversation-content' : 'new-conversation-content'}");
    expect(page).toContain(':global(.new-conversation-content) { inline-size: 100%; max-inline-size: none;');
  });

  it('uses one chat rail for messages and the compact follow-up composer', async () => {
    const [page, message] = await Promise.all([source('routes/+page.svelte'), source('lib/components/ai-elements/message/core/message.svelte')]);
    expect(page).toContain('--chat-rail-max-inline-size: 52rem');
    expect(page).toContain('inline-size: min(100%, var(--chat-rail-max-inline-size))');
    expect(page).toContain('padding-inline: var(--chat-rail-padding-inline)');
    expect(page).toContain('placement="conversation" presentation="compact"');
    expect(page).toContain(".message-author[data-message-role='user'] { align-self: flex-end; justify-content: flex-end; }");
    expect(message).toContain('"group flex w-full flex-col gap-2"');
    expect(message).not.toContain('max-w-[95%]');
  });

  it('keeps project-linked sessions in the conversation surface and composer contract', async () => {
    const [page, composer] = await Promise.all([source('routes/+page.svelte'), source('lib/components/companion/chat-composer.svelte')]);
    expect(page).toContain("const workspaceIsProjectScoped = $derived(Boolean(activeProject && !activeSessionId));");
    expect(page).toContain('project={activeComposerProjectContext}');
    expect(page).not.toContain('id="project-composer"');
    expect(page).not.toContain('<CodeReview');
    expect(page).toContain("let inspectorVisible = $state(false);");
    expect(page).toContain("type InspectorMode = 'docked' | 'focused';");
    expect(page).toContain('data-inspector-mode={inspectorMode}');
    expect(page).not.toContain('<DropdownMenu.Label>Hermes profiles</DropdownMenu.Label>');
    expect(composer).toContain('class="voice-secondary"');
    expect(composer).toContain('.composer-system :global(.composer-menu-trigger), .composer-system :global(.composer-submit), .composer-system :global(.voice-primary), .composer-system :global(.voice-secondary), .composer-system :global(.context-trigger) { border-radius: 50%; }');
    expect(composer).toContain('border-radius: 999px; color: var(--muted-foreground);');
  });

  it('keeps active project identity fixed while offering real branch alternatives', async () => {
    const [page, composer, context] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/components/companion/chat-composer.svelte'),
      source('lib/components/companion/context-usage-popover.svelte')
    ]);
    expect(page).not.toContain('function selectComposerProject');
    expect(page).not.toContain('projectOptions={composerProjectOptions}');
    expect(composer).toContain("branchOptions.length > 1");
    expect(composer).toContain('class="project-context-identity"');
    expect(context).toContain("'context-trigger'");
    expect(context).toContain('transparent 94%');
  });

  it('keeps composer approval policy in place instead of routing to a pending-approvals surface', async () => {
    const [page, composer] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/components/companion/chat-composer.svelte')
    ]);
    expect(page).toContain("const composerPermissionOptions = $derived([");
    expect(page).toContain("description: 'Prompt for flagged commands.'");
    expect(page).toContain("description: 'Assess risk, then decide or ask.'");
    expect(page).toContain("onPermissionChange={(id) => void setApprovalMode(id as 'manual' | 'smart' | 'off')}");
    expect(page).not.toContain("onPermissionClick={() => chooseSurface('approvals')}");
    expect(composer).toContain('<DropdownMenu.Label>Approval mode</DropdownMenu.Label>');
    expect(composer).toContain('permissionOptions.length');
  });

  it('contains conversation overflow and does not render unhooked checkpoint records', async () => {
    const [checkpoint, messageContent, conversation, reasoning, page] = await Promise.all([
      source('lib/components/ai-elements/checkpoint/checkpoint.svelte'),
      source('lib/components/ai-elements/message/core/message-content.svelte'),
      source('lib/components/ai-elements/conversation/conversation-content.svelte'),
      source('lib/components/ai-elements/reasoning/reasoning-content.svelte'),
      source('routes/+page.svelte')
    ]);
    expect(checkpoint).toContain('w-full min-w-0');
    expect(checkpoint).toContain('overflow-clip');
    expect(messageContent).toContain('group-[.is-assistant]:overflow-x-clip');
    expect(conversation).toContain('overflow-x-clip overflow-y-auto');
    expect(page).not.toContain('<Checkpoint.Root');
    expect(page).not.toContain('.message-checkpoint');
    expect(reasoning).toContain('block-size: var(--bits-collapsible-content-height)');
    expect(reasoning).toContain('color: inherit; font-family: inherit; font-size: inherit;');
    expect(reasoning).not.toContain('slide-in-from-top-2');
  });

  it('keeps Hermes spinner copy transient and distinct from persisted reasoning', async () => {
    const [page, controller, trigger, settings] = await Promise.all([
      source('routes/+page.svelte'),
      readFile(new URL('../packages/hermes-adapter/src/session-controller.ts', import.meta.url), 'utf8'),
      source('lib/components/ai-elements/reasoning/reasoning-trigger.svelte'),
      source('lib/components/companion/settings-page.svelte')
    ]);
    expect(controller).toContain("event.type === 'thinking.delta'");
    expect(controller).toContain("event.type === 'reasoning.delta'");
    expect(controller).toContain('thinkingStatus: text(payload.text).trim() || null');
    expect(controller).toContain('thinkingStatus: null');
    expect(page).toContain("profileUiPreferences?.thinkingStatus === 'personality' ? message.thinkingStatus : null");
    expect(page).toContain("profileUiPreferences?.thinkingStatus !== 'hidden'");
    expect(trigger).toContain('status?.trim() || "Thinking..."');
    expect(settings).toContain('aria-label="Thinking status"');
  });

  it('keeps provider discovery out of the workspace loading boundary', async () => {
    const [page, gateway] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/client/remote/gateway.remote.ts')
    ]);
    expect(gateway).not.toContain('getOpenRouterModels');
    expect(gateway).not.toContain('getOpenRouterCredential');
    expect(page).toContain('const workspaceStarting = $derived(loading && overview === null);');
    expect(page).toContain('loading={workspaceStarting}');
    expect(page).toContain('class="workspace-loading"');
    expect(page).not.toContain('class="message-loading"');
  });

  it('deduplicates upstream sessions and gates the first shell frame behind stable layout', async () => {
    const [page, gateway, hermesClient, navigation] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/client/remote/gateway.remote.ts'),
      source('lib/server/hermes-client.ts'),
      source('lib/components/companion/session-navigation.svelte')
    ]);
    expect(gateway).toContain('const sessions = liveSessions.map');
    expect(gateway).not.toContain('directProviderSessions');
    expect(gateway).not.toContain('developmentSessions');
    expect(gateway).toContain("client.listProfileSessions('exclude')");
    expect(gateway).toContain("client.listProfileSessions('only')");
    expect(hermesClient).toContain('profile=all&archived=${archived}&order=recent');
    expect(hermesClient).toContain('archived: item.archived === true');
    expect(navigation).toContain('const uniqueSessions = $derived');
    expect(navigation).toContain('const values = uniqueSessions.filter');
    expect(page).toContain("let shellPresented = $state(false);");
    expect(page).toContain('data-shell-presented={shellPresented}');
    expect(page).toContain("visibility: ${shellPresented ? 'visible' : 'hidden'};");
    expect(page).toContain('class="shell-boot"');
    expect(page).toContain('void tick().then(() => { if (!cancelled) shellPresented = true; });');
    expect(page).not.toContain('requestAnimationFrame(() => { shellPresented = true; })');
  });

  it('treats the command palette as a deep-link search surface with a prompt fallback', async () => {
    const page = await source('routes/+page.svelte');
    expect(page).toContain('let commandQuery = $state(\'\');');
    expect(page).toContain('function commandPaletteFilter');
    expect(page).toContain("if (value === 'send-to-hermes') return 10_000;");
    expect(page).toContain('async function submitCommandPalettePrompt()');
    expect(page).toContain('loadCommandSessionResults');
    expect(page).toContain('function closeCommandPalette()');
    expect(page).toContain('if (!nextOpen) resetCommandPaletteSearch();');
    expect(page).toContain('commandSessionResults = [];');
    expect(page).toContain('searchSessions({ query, profileIds:');
    expect(page).toContain('heading="Sessions"');
    expect(page).toContain('bind:value={commandQuery}');
    expect(page).toContain('value="send-to-hermes"');
    expect(page).toContain('openSettings(section.id, item.id)');
    expect(page).toContain('class="companion-command-palette"');
  });

  it('defaults profile approval and context controls to the textual status line', async () => {
    const [contracts, page, contextPopover, composer] = await Promise.all([
      readFile(contractsSource, 'utf8'),
      source('routes/+page.svelte'),
      source('lib/components/companion/context-usage-popover.svelte'),
      source('lib/components/companion/chat-composer.svelte')
    ]);
    expect(contracts).toContain("ProfileControlDisplay = z.enum(['composer', 'status', 'both', 'hidden'])");
    expect(contracts).toContain("approval: ProfileControlDisplay.default('status')");
    expect(contracts).toContain("context: ProfileControlDisplay.default('status')");
    expect(page).toContain('const composerShowsApproval');
    expect(page).toContain('const statusShowsApproval');
    expect(page).toContain('trigger="status"');
    expect(contextPopover).toContain("trigger = 'radial'");
    expect(contextPopover).toContain('status-context-value');
    expect(composer).toContain('var(--composer-surface-radius)');
    expect(composer).toContain('class="composer-action-menu"');
    expect(composer).toContain('class="model-picker-popover"');
    expect(composer).toContain('aria-haspopup="listbox"');
    expect(composer).not.toContain('<ModelSelector.Dialog');
  });

  it('keeps session actions contextual and exposes only fast actions on row hover', async () => {
    const [navigation, page] = await Promise.all([
      source('lib/components/companion/session-navigation.svelte'),
      source('routes/+page.svelte')
    ]);
    expect(navigation).toContain("import * as ContextMenu from '$lib/components/ui/context-menu';");
    expect(navigation).toContain("import * as HoverCard from '$lib/components/ui/hover-card';");
    expect(navigation).toContain('<ContextMenu.Trigger>');
    expect(navigation).toContain('class="session-row-actions"');
    expect(navigation).not.toContain('session-more');
    expect(navigation).toContain('<Pencil />Rename</ContextMenu.Item>');
    expect(navigation).toContain("session.unread ? 'Mark as Read' : 'Mark as Unread'");
    expect(navigation).toContain('onarchive?.(session.id)');
    expect(page).toContain('async function toggleSessionArchived(sessionId: string)');
    expect(page).toContain('if (session?.unread) await setSessionReadState(sessionId, false, false, owner);');
    expect(navigation).not.toContain('Fork Chat');
    expect(navigation).not.toContain('onfork');
  });

  it('never opens another profile session as the active-profile fallback', async () => {
    const page = await source('routes/+page.svelte');
    expect(page).toContain("overview.sessions.find((session) => session.source === 'chat' && (session.profileId ?? 'default') === profileId)");
    expect(page).not.toContain("=== profileId) ?? overview.sessions[0]");
  });

  it('invalidates profile-scoped draft projections before hydrating a new profile', async () => {
    const page = await source('routes/+page.svelte');
    const start = page.indexOf('async function selectProfile');
    const end = page.indexOf('async function loadProfileUi', start);
    expect(start).toBeGreaterThanOrEqual(0);
    const selectProfile = page.slice(start, end);
    expect(selectProfile).toContain('activeModelKey = null;');
    expect(selectProfile).toContain('profileUiPreferences = null;');
    expect(selectProfile).toContain('sessionPresentation = \'chats\';');
  });

  it('keeps session hover details compact, complete, and backed by session metadata', async () => {
    const navigation = await source('lib/components/companion/session-navigation.svelte');
    expect(navigation).toContain('class="session-detail-list"');
    expect(navigation).toContain('{#if session.branch}<li class="session-detail-line">');
    expect(navigation).toContain('{#if directory}<li class="session-detail-line">');
    expect(navigation).toContain('{#if session.model}<li class="session-detail-line">');
    expect(navigation).toContain('humanizeModelId(session.model)');
    expect(navigation).toContain('sessionStatusLabel(session)');
    expect(navigation).toContain('dateTime(session.updatedAt)');
    expect(navigation).toContain('sessionDuration(session)');
    expect(navigation).toContain('<small>Last message</small>');
    expect(navigation).toContain('<small>Session time</small>');
    expect(navigation).toContain('inline-size: min(14.5rem, calc(100vw - 1rem))');
    expect(navigation).toContain('class="session-detail-title"');
    expect(navigation).toContain('--detail-secondary: var(--muted-foreground)');
    expect(navigation).not.toContain('side="right" align="start" sideOffset={8}');
    expect(navigation).toContain('font-size: .7rem');
  });

  it('does not create worktrees as a side effect of selecting a session', async () => {
    const [page, projects] = await Promise.all([source('routes/+page.svelte'), source('lib/client/remote/projects.remote.ts')]);
    expect(page).not.toContain('void bindActiveSessionWorktree();');
    expect(projects).not.toContain('isShowcaseSession');
    expect(projects).not.toContain('fixture worktree');
  });

  it('owns rendered Markdown rhythm and provider-mark tone through shared tokens', async () => {
    const [css, response, messageResponse, providerMark] = await Promise.all([
      source('app.css'),
      source('lib/components/ai-elements/response/response.svelte'),
      source('lib/components/ai-elements/message/response/message-response.svelte'),
      source('lib/components/companion/model-provider-mark.svelte')
    ]);
    expect(css).toContain('@source "../../../node_modules/streamdown-svelte/dist/**/*.{js,svelte,ts}"');
    expect(css).toContain('--prose-flow-space');
    expect(css).toContain('.prose-copy :where(ul, ol) > li + li');
    expect(css).toContain('--icon-image-muted-filter');
    expect(response).toContain("'prose-copy size-full'");
    expect(messageResponse).toContain('"prose-copy size-full"');
    expect(response).not.toContain('.prose-copy {');
    expect(messageResponse).not.toContain('.prose-copy {');
    expect(providerMark).toContain('filter: var(--icon-image-muted-filter);');
  });

  it('gives text-bearing controls a safe shared line box before truncation', async () => {
    const [css, button, select, input, label, tabs, toggle, inputGroupButton, dialogTitle] = await Promise.all([
      source('app.css'),
      source('lib/components/ui/button/button.svelte'),
      source('lib/components/ui/select/select-trigger.svelte'),
      source('lib/components/ui/input/input.svelte'),
      source('lib/components/ui/label/label.svelte'),
      source('lib/components/ui/tabs/tabs-trigger.svelte'),
      source('lib/components/ui/toggle/toggle.svelte'),
      source('lib/components/ui/input-group/input-group-button.svelte'),
      source('lib/components/ui/dialog/dialog-title.svelte')
    ]);
    expect(css).toContain('--line-height-ui: 1.25;');
    for (const primitive of [button, select, input, label, tabs, toggle, inputGroupButton, dialogTitle]) {
      expect(primitive).toContain('leading-[var(--line-height-ui)]');
      expect(primitive).not.toContain('leading-none');
    }
  });

  it('does not expose synthetic development data controls', async () => {
    const page = await source('routes/+page.svelte');
    expect(page).not.toContain('Load fixtures');
    expect(page).not.toContain('Generate live');
    expect(page).not.toContain('Hide demo data');
    expect(page).not.toContain('developmentData');
  });

  it('provides one minimal error surface for every route status', async () => {
    const [route, component] = await Promise.all([source('routes/+error.svelte'), source('lib/components/companion/app-error.svelte')]);
    expect(route).toContain('<AppError status={page.status} />');
    expect(component).toContain("status === 404");
    expect(component).toContain("status === 401");
    expect(component).toContain('Something went wrong');
    expect(component).toContain('location.reload()');
    expect(component).toContain('history.back()');
  });

  it('routes transient failures through one compact top-layer notification', async () => {
    const [page, notification] = await Promise.all([source('routes/+page.svelte'), source('lib/components/companion/app-notification.svelte')]);
    expect(page).toContain('<AppNotification message={error}');
    expect(notification).toContain('popover="manual"');
    expect(notification).toContain('inset-block-start: calc(var(--shell-titlebar-height) + .65rem)');
    expect(notification).toContain('inline-size: min(28rem, calc(100dvi - 2rem))');
  });
});
