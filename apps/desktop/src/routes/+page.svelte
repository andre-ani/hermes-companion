<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import * as CommandMenu from '$lib/components/ui/command';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Alert from '$lib/components/ui/alert';
  import * as Conversation from '$lib/components/ai-elements/conversation';
  import * as Message from '$lib/components/ai-elements/message';
  import * as Reasoning from '$lib/components/ai-elements/reasoning';
  import { Shimmer } from '$lib/components/ai-elements/shimmer';
  import { Button } from '$lib/components/ui/button';
  import * as ButtonGroup from '$lib/components/ui/button-group';
  import { Badge } from '$lib/components/ui/badge';
  import ConnectionDialog from '$lib/components/companion/connection-dialog.svelte';
  import ChatComposer from '$lib/components/companion/chat-composer.svelte';
  import type { ComposerCompletion, ComposerModel, ComposerPromptAction, ComposerSubmitDetail } from '$lib/components/companion/chat-composer.svelte';
  import WorkspaceDock from '$lib/components/companion/workspace-dock.svelte';
  import ContextUsagePopover from '$lib/components/companion/context-usage-popover.svelte';
  import TerminalSplit from '$lib/components/companion/terminal-split.svelte';
  import OperationsCenter from '$lib/components/companion/operations-center.svelte';
  import CapabilitiesCenter from '$lib/components/companion/capabilities-center.svelte';
  import ProjectDialog from '$lib/components/companion/project-dialog.svelte';
  import ProjectActionsDialog from '$lib/components/companion/project-actions-dialog.svelte';
  import WorktreeDialog from '$lib/components/companion/worktree-dialog.svelte';
  import WorktreeRemoveDialog from '$lib/components/companion/worktree-remove-dialog.svelte';
  import SessionActionsDialog from '$lib/components/companion/session-actions-dialog.svelte';
  import SessionNavigation from '$lib/components/companion/session-navigation.svelte';
  import ProfileDialog from '$lib/components/companion/profile-dialog.svelte';
  import AccountFooter from '$lib/components/companion/account-footer.svelte';
  import SettingsNavigation from '$lib/components/companion/settings-navigation.svelte';
  import SettingsPage from '$lib/components/companion/settings-page.svelte';
  import RestoreCheckpointDialog from '$lib/components/companion/restore-checkpoint-dialog.svelte';
  import AppNotification from '$lib/components/companion/app-notification.svelte';
  import ModelProvenance from '$lib/components/companion/model-provenance.svelte';
  import { getWorkspaceOverview, refreshGateway, selectHermesProfile } from '$lib/client/remote/gateway.remote';
  import { searchSessions, setSessionArchived, setSessionUnread } from '$lib/client/remote/sessions.remote';
  import { acquireHermesChatSession, adoptHermesChatSession, type HermesChatSession, type HermesChatView } from '$lib/client/hermes-chat.svelte';
  import { bindHermesProjectWorktree, getProjectSessions, resolveSessionWorkspaceTarget, setProjectArchived } from '$lib/client/remote/projects.remote';
  import { getProfileUiPreferences, setProfileUiPreferences, setSessionPinned } from '$lib/client/remote/profile-ui.remote';
  import { runHermesMaintenance, setHermesApprovalMode } from '$lib/client/remote/operations.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { setBrowserFullscreen } from '$lib/client/remote/browser.remote';
  import { getDesktopSettings, getOpenRouterPolicy } from '$lib/client/remote/settings.remote';
  import { adoptWorkspaceLayout, getWorkspaceLayout, setWorkspaceLayout } from '$lib/client/remote/workspace-layout.remote';
  import { clearWorkspaceLayoutJournal, readWorkspaceLayoutJournal, writeWorkspaceLayoutJournal } from '$lib/client/workspace-layout-journal';
  import { settingsSections } from '$lib/settings/settings-registry';
  import type { SettingsAction } from '$lib/settings/settings-registry';
  import { capabilityLabel } from '$lib/capability-label';
  import { modelSelectionKey } from '$lib/model-identity';
  import { applyOpenRouterPolicy } from '$lib/openrouter-policy';
  import { errorMessage } from '$lib/error-message';
  import { SerializedSelectionQueue, ViewOwnership, viewResourceKey, type ViewOwner } from '$lib/view-ownership';
  import { workspaceLayoutOwnerKey, WorkspaceLayoutPreferences, type CapabilityAvailability, type CapabilityFamily, type ChatAttachmentInput, type ChatTurnApproval, type ContextUsage, type DesktopPreferences, type GatewayStatus, type HermesGitWorktree, type HermesMessage, type HermesProfile, type HermesProjectTree, type HermesProjectTreeNode, type HermesSession, type ModelInfo, type OpenRouterPolicyOverview, type ProfileUiPreferences, type ProjectBinding, type SessionPresentation, type SessionTreeFilter, type WorkspaceDockTab, type WorkspaceLayoutOwner, type WorktreeRecord } from '@hermes-companion/contracts';
  import type { HermesDurableSessionId } from '@hermes-companion/hermes-adapter';
  import { ArrowLeft, Bot, Check, ChevronDown, CircleAlert, Clock3, Command as CommandIcon, FolderGit2, GitCommitHorizontal, GitPullRequest, KeyRound, Maximize2, MessageCircle, Minimize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Plus, RotateCcw, RotateCw, Search, Server, Settings, Shapes, ShieldCheck, Sparkles, SquarePen, SquareTerminal, Stethoscope, Timer, Upload, Wifi, Wrench } from '@lucide/svelte';

  type Overview = { gateway: GatewayStatus; capabilities: CapabilityAvailability[]; connections: GatewayStatus['connection'][]; profiles: HermesProfile[]; activeProfileId: string; sessions: HermesSession[]; models: ModelInfo[]; projects: ProjectBinding[]; projectTree: HermesProjectTree; worktrees: WorktreeRecord[]; pinnedSessionIds: string[]; audit: Array<{ id: string; action: string; subject: string; at: string }>; approvalMode: 'manual' | 'smart' | 'off' | null };
  const workspaceOverviewQuery = getWorkspaceOverview({});
  const desktopSettingsQuery = getDesktopSettings({});
  const openRouterPolicyQuery = getOpenRouterPolicy({ refresh: false });

  let sidebarVisible = $state(true);
  let sidebarWidth = $state(296);
  let overview = $state<Overview | null>(null);
  let messages = $state<HermesMessage[]>([]);
  let sessionHistoryError = $state<string | null>(null);
  let activeSessionId = $state<string | null>(null);
  let prompt = $state('');
  let loading = $state(true);
  let shellPresented = $state(false);
  let sending = $state(false);
  let error = $state('');
  let connectOpen = $state(false);
  let profileOpen = $state(false);
  let announcement = $state('');
  let activeSurface = $state<CapabilityFamily | 'capabilities' | null>(null);
  let fullscreenPreview = $state(false);
  let projectsOpen = $state(false);
  let projectDialogMode = $state<'add' | 'worktrees'>('add');
  let commandOpen = $state(false);
  let commandQuery = $state('');
  let commandSessionResults = $state<Array<{ sessionId: string; snippet: string; role: string | null; profileId: string | null; session: HermesSession }>>([]);
  let commandSessionSearching = $state(false);
  let commandSearchGeneration = 0;
  let sessionActionsOpen = $state(false);
  let projectActionsOpen = $state(false);
  let worktreeOpen = $state(false);
  let worktreeProjectTargetId = $state<string | null>(null);
  let worktreeRepositoryPaths = $state<string[]>([]);
  let draftWorktree = $state<HermesGitWorktree | null>(null);
  let worktreeRemoveOpen = $state(false);
  let worktreeRemoveTarget = $state<{ projectId: string; repositoryPath: string; worktreePath: string; branch: string } | null>(null);
  let hydratedProjects = $state<Record<string, HermesProjectTreeNode>>({});
  let projectLoadingIds = $state<string[]>([]);
  let hydratedProjectOwnerKey = $state('');
  let restoreTarget = $state<{ text: string; messageIndex: number; userOrdinal: number } | null>(null);
  let restoreDialogOpen = $state(false);
  let selectedProjectId = $state<string | null>(null);
  let nativePlatform = $state('');
  type InspectorMode = 'docked' | 'focused';
  let dockTab = $state<WorkspaceDockTab>('surfaces');
  let dockTabs = $state<Array<Exclude<WorkspaceDockTab, 'surfaces'>>>([]);
  let inspectorVisible = $state(false);
  let inspectorMode = $state<InspectorMode>('docked');
  let browserLeaseId = $state(crypto.randomUUID());
  let inspectorWidth = $state(480);
  let clock = $state(Date.now());
  let approvalPending = $state(false);
  let terminalOpen = $state(false);
  let terminalHeight = $state(260);
  let activeDraftId = $state<string | null>(crypto.randomUUID());
  let workspaceLayoutReady = $state(false);
  let workspaceLayoutApplying = $state(false);
  let workspaceLayoutHydratedKey = $state('');
  let workspaceLayoutHydrationGeneration = 0;
  const pendingWorkspaceLayouts = new Map<string, { owner: WorkspaceLayoutOwner; preferences: WorkspaceLayoutPreferences }>();
  const workspaceLayoutSaveQueues = new Map<string, Promise<void>>();
  const workspaceLayoutOwnerRedirects = new Map<string, WorkspaceLayoutOwner>();
  let workspaceLayoutResizeActive = $state(false);
  let workspaceTargetHydratedKey = $state('');
  let resolvedWorkspaceTarget = $state<{ key: string; worktree: WorktreeRecord | null; reason: string | null } | null>(null);
  let workspaceTargetHydrationGeneration = 0;
  let terminalSplit = $state<{ runCommand: (command: string) => Promise<boolean> } | null>(null);
  let sessionPresentation = $state<SessionPresentation>('chats');
  let profileUiPreferences = $state<ProfileUiPreferences | null>(null);
  let presentationSaving = $state(false);
  let sessionActionTargetId = $state<string | null>(null);
  let projectActionTargetId = $state<string | null>(null);
  let contextUsage = $state<ContextUsage | null>(null);
  let contextUsageReason = $state<string | null>('Select a Hermes session to view its context usage.');
  let activeModelKey = $state<string | null>(null);
  let activeTurnApproval = $state<(ChatTurnApproval & { requestId: string }) | null>(null);
  let approvalResponsePending = $state(false);
  let settingsActive = $state(false);
  let activeSettingsSection = $state('model');
  let activeSettingsItem = $state<string | undefined>();
  let desktopPreferences = $state<DesktopPreferences>({ account: { displayName: 'Hermes User', email: '' }, appearance: { mode: 'system', palette: 'mono', codeWordWrap: false, toolCallDensity: 'balanced' }, notifications: { system: true, warnings: true, completionSound: false } });
  let openRouterConfigured = $state(false);
  let openRouterVerified = $state(false);
  let openRouterVerificationError = $state<string | null>(null);
  let openRouterPolicy = $state<OpenRouterPolicyOverview | null>(null);
  let activeChatController: HermesChatSession | null = null;
  let activeChatSubscription: (() => void) | null = null;
  let activeChatView = $state<HermesChatView | null>(null);
  const viewOwnership = new ViewOwnership();
  let visibleViewOwner = $state<ViewOwner | null>(null);
  let workspaceLoadGeneration = 0;
  let gatewayRefreshInFlight = false;
  let profileSelectionTargetId: string | null = null;
  const profileSelections = new SerializedSelectionQueue<string>();
  let profileUiLoadGeneration = 0;
  let profileUiSaveGeneration = 0;

  const workspaceStarting = $derived(loading && overview === null);
  const activeSession = $derived.by(() => {
    const current = overview;
    if (!current) return null;
    return current.sessions.find((session) => session.id === activeSessionId
      && (session.profileId ?? current.activeProfileId) === current.activeProfileId) ?? null;
  });
  const activeProject = $derived.by(() => {
    const current = overview;
    return current?.projects.find((project) => project.connectionId === current.gateway.connection.id && project.id === (selectedProjectId ?? activeSession?.projectId)) ?? null;
  });
  const sessionWorkspaceResolution = $derived.by(() => {
    if (!activeSession) return { request: null, key: '', reason: activeProject ? 'Send a message from a linked worktree before opening coding surfaces.' : 'Select a project session to open coding surfaces.' };
    if (!activeProject) return { request: null, key: '', reason: 'This Hermes session is not linked to a project.' };
    const connectionId = overview?.gateway.connection.id;
    const profileId = activeSession.profileId;
    if (!connectionId || !profileId || !activeSession.cwd || !activeSession.branch) {
      return { request: null, key: '', reason: 'Hermes did not provide a complete workspace identity for this session.' };
    }
    const request = {
      connectionId,
      profileId,
      projectId: activeProject.id,
      repositoryPath: activeProject.repositoryPath,
      worktreePath: activeSession.cwd,
      branch: activeSession.branch,
      sessionId: activeSession.id
    };
    return { request, key: JSON.stringify([connectionId, profileId, activeSession.id, activeProject.id, activeProject.repositoryPath, activeSession.cwd, activeSession.branch, overview?.gateway.checkedAt]), reason: null };
  });
  const activeWorktree = $derived(resolvedWorkspaceTarget?.key === sessionWorkspaceResolution.key ? resolvedWorkspaceTarget.worktree : null);
  const workspaceTargetReady = $derived(!sessionWorkspaceResolution.request || workspaceTargetHydratedKey === sessionWorkspaceResolution.key);
  const workspaceUnavailableReason = $derived(resolvedWorkspaceTarget?.key === sessionWorkspaceResolution.key
    ? resolvedWorkspaceTarget.reason
    : sessionWorkspaceResolution.reason ?? 'Verifying this session worktree with Hermes…');
  // A session remains a conversation even when it is attached to a worktree.
  // Project ownership enriches the composer; it does not silently replace the
  // conversation with a different-sized editor.
  const workspaceIsProjectScoped = $derived(Boolean(activeProject && !activeSessionId));
  const workspaceLayoutIdentity = $derived.by((): WorkspaceLayoutOwner | null => {
    const owner = visibleViewOwner;
    if (!owner?.connectionId || !owner.profileId || owner.sessionId !== activeSessionId || owner.draftId !== activeDraftId) return null;
    if (owner.sessionId) return { connectionId: owner.connectionId, profileId: owner.profileId, resource: { kind: 'session', id: owner.sessionId } };
    if (owner.draftId) return { connectionId: owner.connectionId, profileId: owner.profileId, resource: { kind: 'draft', id: owner.draftId } };
    return null;
  });
  const inspectorOwnerKey = $derived(workspaceLayoutIdentity ? workspaceLayoutOwnerKey(workspaceLayoutIdentity) : 'workspace:none');
  // Browser tabs belong to the logical profile/resource, not to a transient
  // gateway connection. Connection recovery must not tear down a native view
  // that is still owned by the same visible session.
  function browserOwnerKeyFor(owner: WorkspaceLayoutOwner | null) {
    return owner
      ? `workspace-browser:${owner.profileId}:${owner.resource.kind}:${owner.resource.id}`
      : 'workspace-browser:none';
  }
  const browserOwnerKey = $derived(browserOwnerKeyFor(workspaceLayoutIdentity));
  const workspaceLayoutInteractive = $derived(Boolean(workspaceLayoutIdentity && workspaceLayoutHydratedKey === inspectorOwnerKey && !workspaceLayoutApplying));

  // The lease belongs to the logical workspace owner, not to tab visibility.
  // Switching between inspector tabs must preserve the native browsing
  // context; owner transitions rotate the lease in prepareWorkspaceLayoutOwnerTransition.
  const activeWorkspaceBranch = $derived(activeWorktree
    ? { id: activeWorktree.worktreeId, branch: activeWorktree.branch }
    : !activeSessionId && draftWorktree
      ? { id: draftWorktree.path, branch: draftWorktree.branch ?? 'detached' }
      : null);
  const activeComposerProjectContext = $derived(activeProject && activeWorkspaceBranch
    ? { id: activeProject.id, name: activeProject.name, branchId: activeWorkspaceBranch.id, branch: activeWorkspaceBranch.branch }
    : null);
  const activeGitWorkspace = $derived(activeProject && (activeWorktree || (!activeSessionId && draftWorktree))
    ? {
        projectId: activeProject.id,
        repositoryPath: activeProject.repositoryPath,
        path: activeWorktree?.path ?? draftWorktree!.path,
        branch: activeWorktree?.branch ?? draftWorktree!.branch ?? activeProject.defaultBranch
      }
    : null);

  const composerAvailable = $derived(Boolean(overview?.gateway.connection.serveUrl || overview?.gateway.connection.serveWsUrl));
  const sessionManagementAvailable = $derived(overview?.gateway.enhanced.sessionManagement === true);
  const gatewayTone = $derived(overview?.gateway.status === 'enhanced' || overview?.gateway.status === 'connected' ? 'positive' : overview?.gateway.status === 'partial' ? 'warning' : 'negative');
  const approvalMode = $derived(overview?.approvalMode ?? null);
  const profileControlLocations = $derived(profileUiPreferences?.contextualControls ?? { approval: 'status' as const, context: 'status' as const });
  const composerShowsApproval = $derived(profileControlLocations.approval === 'composer' || profileControlLocations.approval === 'both');
  const statusShowsApproval = $derived(profileControlLocations.approval === 'status' || profileControlLocations.approval === 'both');
  const composerShowsContext = $derived(profileControlLocations.context === 'composer' || profileControlLocations.context === 'both');
  const statusShowsContext = $derived(profileControlLocations.context === 'status' || profileControlLocations.context === 'both');
  const sessionElapsed = $derived(formatElapsed(activeSession?.createdAt, clock));
  const primaryProfileAction = $derived(profileUiPreferences?.header.customActions.find((action) => action.id === profileUiPreferences?.header.primaryActionId) ?? profileUiPreferences?.header.customActions[0] ?? null);
  const recentSessions = $derived([...(overview?.sessions ?? [])].filter((session) => !session.archived).toSorted((a, b) => Date.parse(b.updatedAt ?? b.createdAt ?? '') - Date.parse(a.updatedAt ?? a.createdAt ?? '')).slice(0, 6));
  const composerModels = $derived.by((): ComposerModel[] => {
    const available = applyOpenRouterPolicy([...(overview?.models ?? [])], openRouterPolicy)
      .filter((item, index, values) => values.findIndex((candidate) => modelSelectionKey(candidate.source, candidate.id, candidate.runtimeProvider) === modelSelectionKey(item.source, item.id, item.runtimeProvider)) === index)
      .map((item): ComposerModel => ({
      id: item.id,
      label: item.name,
      source: item.source,
      provider: item.provider ?? undefined,
      runtimeProvider: item.runtimeProvider ?? undefined,
      detail: item.id,
      inputModalities: item.inputModalities,
      outputModalities: item.outputModalities,
      supportedParameters: item.supportedParameters
      , description: item.description ?? undefined
      , contextLength: item.contextLength ?? undefined
      , routeKind: item.routeKind
      , canonicalModelId: item.canonicalModelId ?? undefined
      , pricing: item.pricing ?? undefined
      , policyStatus: item.policyStatus
      , policyReason: item.policyReason ?? undefined
    }));
    if (available.length) return available;
    if (activeSession?.model) return [{ id: activeSession.model, label: activeSession.model, source: 'hermes', provider: activeSession.provider ?? undefined }];
    return [{ id: 'default', label: 'Default model', source: 'hermes' }];
  });
  const activeComposerModel = $derived(
    composerModels.find((item) => item.policyStatus !== 'restricted' && modelSelectionKey(item.source, item.id, item.runtimeProvider) === activeModelKey)
      ?? composerModels.find((item) => item.policyStatus !== 'restricted' && item.id === activeProfile?.model && (!activeProfile?.provider || item.runtimeProvider === activeProfile.provider))
      ?? composerModels.find((item) => item.policyStatus !== 'restricted')
      ?? composerModels[0]
  );
  const activeComposerModelOverride = $derived(activeComposerModel?.id === 'default' || activeComposerModel?.policyStatus === 'restricted' ? null : activeComposerModel ?? null);
  const composerPermission = $derived(approvalMode === 'smart'
    ? { id: 'smart', label: 'Smart', detail: 'Hermes evaluates flagged commands and escalates uncertain ones.' }
    : approvalMode === 'off'
      ? { id: 'off', label: 'Off', detail: 'Hermes skips approval prompts for flagged commands.' }
      : { id: 'manual', label: 'Manual', detail: 'Hermes prompts for flagged commands.' });
  const composerPermissionOptions = $derived([
    { id: 'manual', label: 'Manual', description: 'Prompt for flagged commands.' },
    { id: 'smart', label: 'Smart', description: 'Assess risk, then decide or ask.' },
    { id: 'off', label: 'Off', description: 'Skip approval prompts.' }
  ]);
  const activeProfile = $derived(overview?.profiles.find((profile) => profile.id === overview?.activeProfileId) ?? overview?.profiles[0] ?? null);
  const profilePreferenceKey = $derived(overview ? `${overview.gateway.connection.id}:${overview.activeProfileId}` : null);
  const composerCompletions = $derived.by((): ComposerCompletion[] => [
    { id: 'slash-new', trigger: '/', label: 'new', value: 'new', group: 'Session', description: 'Start a new Hermes session', behavior: 'execute', priority: 100 },
    { id: 'slash-plan', trigger: '/', label: 'plan', value: 'plan', group: 'Work', description: 'Plan the task before making changes', insertText: '/plan', priority: 90 },
    { id: 'slash-review', trigger: '/', label: 'review', value: 'review', group: 'Work', description: 'Open the review surface for this project', behavior: 'execute', projectOnly: true, priority: 85 },
    { id: 'slash-terminal', trigger: '/', label: 'terminal', value: 'terminal', group: 'Surfaces', description: 'Open the terminal below the workspace', behavior: 'execute', projectOnly: true },
    { id: 'slash-model', trigger: '/', label: 'model', value: 'model', group: 'Configuration', description: 'Choose the model for this session', behavior: 'execute' },
    { id: 'slash-settings', trigger: '/', label: 'settings', value: 'settings', group: 'Configuration', description: 'Open Hermes settings', behavior: 'execute' },
    ...(overview?.profiles ?? []).map((profile): ComposerCompletion => ({ id: `profile-${profile.id}`, trigger: '@', label: profile.name, value: profile.id, group: 'Profiles', description: profile.description || 'Hermes profile', insertText: `@${profile.name}` })),
    ...(overview?.projects ?? []).map((project): ComposerCompletion => ({ id: `project-${project.id}`, trigger: '@', label: project.name, value: project.name.replace(/\s+/g, '-').toLocaleLowerCase(), group: 'Projects', description: project.repositoryPath, insertText: `@${project.name}`, keywords: [project.defaultBranch] }))
  ]);
  const composerQuickActions: ComposerPromptAction[] = [
    { id: 'plan', label: 'Plan a new idea', prompt: '/plan ' },
    { id: 'multitask', label: 'Multitask', prompt: 'Break this into parallel workstreams: ' },
    { id: 'review', label: 'Review changes', prompt: 'Review the current changes and prioritize risks. ' }
  ];
  const composerSuggestions: ComposerPromptAction[] = [
    { id: 'release', label: 'Trace a release regression', description: 'Inspect, isolate, and checkpoint the safest fix', prompt: 'Trace the release regression and stop at a safe checkpoint before making broad changes.' },
    { id: 'architecture', label: 'Map an implementation', description: 'Turn an idea into a concrete technical plan', prompt: '/plan Map the implementation for ' },
    { id: 'project-review', label: 'Review a project', description: 'Use @ to attach a project or profile', prompt: 'Review @' }
  ];
  const composerBranchOptions = $derived((overview?.worktrees ?? []).filter((worktree) => worktree.connectionId === overview?.gateway.connection.id && worktree.profileId === overview?.activeProfileId && worktree.projectId === activeProject?.id).map((worktree) => ({ id: worktree.worktreeId, label: worktree.branch, description: overview?.sessions.find((session) => session.id === worktree.threadId)?.title ?? worktree.path })));

  $effect(() => {
    const resolution = sessionWorkspaceResolution;
    if (!resolution.request) {
      workspaceTargetHydrationGeneration += 1;
      workspaceTargetHydratedKey = '';
      resolvedWorkspaceTarget = null;
      return;
    }
    if (workspaceTargetHydratedKey === resolution.key) return;
    // Remote command state is not an input to this effect. Tracking it would
    // make the request invalidate and restart itself before it can commit.
    untrack(() => void hydrateSessionWorkspaceTarget(resolution.request!, resolution.key));
  });

  $effect(() => {
    const owner = workspaceLayoutIdentity;
    if (!owner) {
      workspaceLayoutReady = !workspaceStarting;
      return;
    }
    // The owner is the dependency; the query lifecycle started by hydration
    // is not. Keep request-state updates from recursively restarting it.
    untrack(() => void hydrateWorkspaceLayout(owner));
  });

  $effect(() => {
    const owner = workspaceLayoutIdentity;
    const preferences = WorkspaceLayoutPreferences.parse({
      inspector: { visible: inspectorVisible, mode: inspectorMode, activeTab: dockTab, openTabs: [...dockTabs], width: inspectorWidth },
      terminal: { visible: terminalOpen, height: terminalHeight }
    });
    if (!owner || workspaceLayoutApplying || workspaceLayoutResizeActive || workspaceLayoutHydratedKey !== workspaceLayoutOwnerKey(owner)) return;
    queueWorkspaceLayoutPersistence(owner, preferences);
  });

  // The first visible frame is either the boot surface or a fully measured
  // shell. Never expose shell children while their tracks are still resolving.
  $effect(() => {
    // Worktree verification protects coding surfaces, but it is not part of
    // conversation-shell readiness. A slow or unavailable execution host must
    // never strand chat behind the boot surface; workspace controls remain
    // withheld until the verified target resolves.
    if (workspaceStarting || !workspaceLayoutReady || shellPresented) return;
    let cancelled = false;
    // Electron may suspend animation frames while a window is backgrounded.
    // A visual transition must never become a prerequisite for app readiness.
    void tick().then(() => { if (!cancelled) shellPresented = true; });
    return () => { cancelled = true; };
  });

  $effect(() => {
    if (!commandOpen) {
      commandSearchGeneration += 1;
      commandSessionResults = [];
      commandSessionSearching = false;
      if (commandQuery) commandQuery = '';
      return;
    }
    const query = commandQuery.trim();
    if (query.length < 2) {
      commandSearchGeneration += 1;
      commandSessionResults = [];
      commandSessionSearching = false;
      return;
    }
    const generation = ++commandSearchGeneration;
    commandSessionSearching = true;
    const timer = setTimeout(() => void loadCommandSessionResults(query, generation), 160);
    return () => clearTimeout(timer);
  });

  function capabilityFor(family: CapabilityFamily) { return overview?.capabilities.find((item) => item.family === family) ?? null; }

  async function hydrateSessionWorkspaceTarget(
    request: NonNullable<typeof sessionWorkspaceResolution.request>,
    key: string
  ) {
    const generation = ++workspaceTargetHydrationGeneration;
    workspaceTargetHydratedKey = '';
    resolvedWorkspaceTarget = null;
    try {
      const target = await resolveRemoteResult(resolveSessionWorkspaceTarget(request));
      if (generation !== workspaceTargetHydrationGeneration || sessionWorkspaceResolution.key !== key) return;
      resolvedWorkspaceTarget = target.available
        ? { key, worktree: target.worktree, reason: null }
        : { key, worktree: null, reason: target.reason };
      workspaceTargetHydratedKey = key;
      if (target.available && overview) {
        overview = {
          ...overview,
          worktrees: [
            target.worktree,
            ...overview.worktrees.filter((item) => item.worktreeId !== target.worktree.worktreeId && !(item.connectionId === target.worktree.connectionId && item.profileId === target.worktree.profileId && item.projectId === target.worktree.projectId && item.threadId === target.worktree.threadId))
          ]
        };
      }
    } catch (cause) {
      if (generation !== workspaceTargetHydrationGeneration || sessionWorkspaceResolution.key !== key) return;
      resolvedWorkspaceTarget = { key, worktree: null, reason: errorMessage(cause, 'Hermes could not verify this session worktree.') };
      workspaceTargetHydratedKey = key;
    }
  }

  function snapshotWorkspaceLayout() {
    return WorkspaceLayoutPreferences.parse({
      inspector: { visible: inspectorVisible, mode: inspectorMode, activeTab: dockTab, openTabs: [...dockTabs], width: inspectorWidth },
      terminal: { visible: terminalOpen, height: terminalHeight }
    });
  }

  function layoutOwnerForIdentity(identity: Pick<ViewOwner, 'connectionId' | 'profileId' | 'sessionId' | 'draftId'> | null): WorkspaceLayoutOwner | null {
    if (!identity?.connectionId || !identity.profileId) return null;
    if (identity.sessionId) return { connectionId: identity.connectionId, profileId: identity.profileId, resource: { kind: 'session', id: identity.sessionId } };
    if (identity.draftId) return { connectionId: identity.connectionId, profileId: identity.profileId, resource: { kind: 'draft', id: identity.draftId } };
    return null;
  }

  function layoutOwnerForView(owner: ViewOwner | null) {
    return layoutOwnerForIdentity(owner);
  }

  function workspaceLayoutOwnerKeyOrNull(owner: WorkspaceLayoutOwner | null) {
    return owner ? workspaceLayoutOwnerKey(owner) : null;
  }

  function prepareWorkspaceLayoutOwnerTransition(outgoingOwner: WorkspaceLayoutOwner | null, nextOwner: WorkspaceLayoutOwner | null) {
    if (outgoingOwner && workspaceLayoutHydratedKey === workspaceLayoutOwnerKey(outgoingOwner)) {
      queueWorkspaceLayoutPersistence(outgoingOwner, snapshotWorkspaceLayout());
    }
    const outgoingOwnerKey = workspaceLayoutOwnerKeyOrNull(outgoingOwner) ?? 'workspace:none';
    const outgoingLeaseId = browserLeaseId;
    if (fullscreenPreview) {
      void resolveRemoteResult(setBrowserFullscreen({ fullscreen: false, ownerKey: browserOwnerKeyFor(outgoingOwner), browserLeaseId: outgoingLeaseId })).catch(() => undefined);
    }
    fullscreenPreview = false;
    workspaceLayoutReady = false;
    workspaceLayoutApplying = true;
    workspaceLayoutHydratedKey = '';
    if (browserOwnerKeyFor(outgoingOwner) !== browserOwnerKeyFor(nextOwner)) browserLeaseId = crypto.randomUUID();
    applyWorkspaceLayout(WorkspaceLayoutPreferences.parse({}));
  }

  function applyWorkspaceLayout(preferences: WorkspaceLayoutPreferences) {
    const parsed = WorkspaceLayoutPreferences.parse(preferences);
    const tabs = [...parsed.inspector.openTabs];
    inspectorVisible = parsed.inspector.visible;
    inspectorMode = parsed.inspector.visible ? parsed.inspector.mode : 'docked';
    dockTabs = tabs;
    dockTab = parsed.inspector.activeTab === 'surfaces' || tabs.includes(parsed.inspector.activeTab)
      ? parsed.inspector.activeTab
      : 'surfaces';
    const viewportMaximum = typeof window === 'undefined' ? parsed.inspector.width : Math.max(280, window.innerWidth * 0.48);
    inspectorWidth = Math.min(parsed.inspector.width, viewportMaximum);
    terminalOpen = parsed.terminal.visible;
    terminalHeight = parsed.terminal.height;
  }

  function queueWorkspaceLayoutPersistence(owner = workspaceLayoutIdentity, preferences = snapshotWorkspaceLayout()) {
    if (!owner || workspaceLayoutApplying) return;
    const sourceKey = workspaceLayoutOwnerKey(owner);
    const targetOwner = workspaceLayoutOwnerRedirects.get(sourceKey) ?? owner;
    const targetKey = workspaceLayoutOwnerKey(targetOwner);
    if (workspaceLayoutHydratedKey !== sourceKey && workspaceLayoutHydratedKey !== targetKey) return;
    const parsed = writeWorkspaceLayoutJournal(targetOwner, preferences);
    pendingWorkspaceLayouts.set(targetKey, { owner: targetOwner, preferences: parsed });
    // Start the authoritative write in the same task as the interaction. A
    // reload cannot strand a debounced timer, while the journal recovers a
    // request that the browser cancels during teardown.
    void flushWorkspaceLayout(targetKey);
  }

  function enqueueWorkspaceLayoutOperation(key: string, operation: () => Promise<void>) {
    const completion = (workspaceLayoutSaveQueues.get(key) ?? Promise.resolve()).then(operation);
    const retained = completion.catch(() => undefined);
    workspaceLayoutSaveQueues.set(key, retained);
    void retained.finally(() => {
      if (workspaceLayoutSaveQueues.get(key) === retained) workspaceLayoutSaveQueues.delete(key);
    });
    return completion;
  }

  function assertWorkspaceLayoutWritable(key: string) {
  }

  function writePersistedWorkspaceLayout(owner: WorkspaceLayoutOwner, preferences: WorkspaceLayoutPreferences) {
    const key = workspaceLayoutOwnerKey(owner);
    assertWorkspaceLayoutWritable(key);
    return enqueueWorkspaceLayoutOperation(key, async () => {
      assertWorkspaceLayoutWritable(key);
      await resolveRemoteResult(setWorkspaceLayout({ owner, preferences }));
      clearWorkspaceLayoutJournal(owner, preferences);
    });
  }

  async function flushWorkspaceLayout(key?: string) {
    const keys = key ? [key] : [...pendingWorkspaceLayouts.keys()];
    await Promise.all(keys.map(async (pendingKey) => {
      const pending = pendingWorkspaceLayouts.get(pendingKey);
      pendingWorkspaceLayouts.delete(pendingKey);
      if (!pending) return workspaceLayoutSaveQueues.get(pendingKey);
      const completion = writePersistedWorkspaceLayout(pending.owner, pending.preferences);
      try { await completion; }
      catch (cause) {
        if (workspaceLayoutIdentity && workspaceLayoutOwnerKey(workspaceLayoutIdentity) === workspaceLayoutOwnerKey(pending.owner)) {
          error = errorMessage(cause, 'Workspace layout could not be saved.');
        }
      }
    }));
  }

  async function adoptPersistedWorkspaceLayout(from: WorkspaceLayoutOwner, to: WorkspaceLayoutOwner, preferences: WorkspaceLayoutPreferences) {
    const fromKey = workspaceLayoutOwnerKey(from);
    const toKey = workspaceLayoutOwnerKey(to);
    workspaceLayoutOwnerRedirects.set(fromKey, to);
    writeWorkspaceLayoutJournal(to, preferences);
    pendingWorkspaceLayouts.delete(fromKey);
    await (workspaceLayoutSaveQueues.get(fromKey) ?? Promise.resolve());
    await enqueueWorkspaceLayoutOperation(toKey, async () => {
      assertWorkspaceLayoutWritable(toKey);
      await resolveRemoteResult(adoptWorkspaceLayout({ from, to, preferences }));
    });
    clearWorkspaceLayoutJournal(from);
    clearWorkspaceLayoutJournal(to, preferences);
    if (workspaceLayoutHydratedKey === fromKey) workspaceLayoutHydratedKey = toKey;
  }

  async function hydrateWorkspaceLayout(owner: WorkspaceLayoutOwner) {
    const key = workspaceLayoutOwnerKey(owner);
    if (workspaceLayoutHydratedKey === key && !workspaceLayoutApplying) {
      workspaceLayoutReady = true;
      return;
    }
    const generation = ++workspaceLayoutHydrationGeneration;
    const outgoingKey = workspaceLayoutHydratedKey;
    // Saving the previous owner's geometry is independent from making the
    // next owner usable. A stalled persistence request must not become a shell
    // readiness lock; the journal remains the reload-safe recovery source.
    if (outgoingKey) void flushWorkspaceLayout(outgoingKey).catch(() => undefined);
    try {
      const recovered = readWorkspaceLayoutJournal(owner);
      const remoteLayout = recovered ? null : getWorkspaceLayout({ owner });
      const remoteLayoutPromise = remoteLayout ? resolveRemoteResult(remoteLayout) : null;
      const preferences = recovered ?? await new Promise<WorkspaceLayoutPreferences>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Workspace layout lookup timed out.')), 4_000);
        remoteLayoutPromise!.then(
          (value) => { clearTimeout(timeout); resolve(value); },
          (cause) => { clearTimeout(timeout); reject(cause); }
        );
      });
      if (generation !== workspaceLayoutHydrationGeneration || !workspaceLayoutIdentity || workspaceLayoutOwnerKey(workspaceLayoutIdentity) !== key) return;
      applyWorkspaceLayout(preferences);
      if (recovered) void writePersistedWorkspaceLayout(owner, recovered).catch((cause) => {
        if (workspaceLayoutIdentity && workspaceLayoutOwnerKey(workspaceLayoutIdentity) === key) {
          error = errorMessage(cause, 'Workspace layout could not be recovered.');
        }
      });
    } catch {
      if (generation !== workspaceLayoutHydrationGeneration || !workspaceLayoutIdentity || workspaceLayoutOwnerKey(workspaceLayoutIdentity) !== key) return;
      applyWorkspaceLayout(WorkspaceLayoutPreferences.parse({}));
    } finally {
      if (generation === workspaceLayoutHydrationGeneration && workspaceLayoutIdentity && workspaceLayoutOwnerKey(workspaceLayoutIdentity) === key) {
        workspaceLayoutHydratedKey = key;
        workspaceLayoutApplying = false;
        workspaceLayoutReady = true;
      }
    }
  }

  function beginVisibleView(
    sessionId: string | null,
    location: 'chat' | 'settings' | 'surface' = 'chat',
    profileId = profileSelectionTargetId ?? overview?.activeProfileId ?? null,
    connectionId = overview?.gateway.connection.id ?? null,
    draftId = sessionId === null ? viewOwnership.current?.draftId ?? crypto.randomUUID() : null
  ) {
    const previousLayoutOwner = layoutOwnerForView(visibleViewOwner);
    const nextLayoutOwner = layoutOwnerForIdentity({ connectionId, profileId, sessionId, draftId });
    if (workspaceLayoutOwnerKeyOrNull(previousLayoutOwner) !== workspaceLayoutOwnerKeyOrNull(nextLayoutOwner)) {
      prepareWorkspaceLayoutOwnerTransition(previousLayoutOwner, nextLayoutOwner);
    }
    const owner = viewOwnership.begin({ connectionId, profileId, sessionId, draftId, location });
    visibleViewOwner = owner;
    activeSessionId = sessionId;
    activeDraftId = owner.draftId;
    return owner;
  }

  function ownsVisibleView(owner: ViewOwner | null | undefined) {
    return viewOwnership.owns(owner) && activeSessionId === owner.sessionId;
  }

  function ensureChatOwner() {
    const current = viewOwnership.current;
    if (current?.location === 'chat' && current.sessionId === activeSessionId) return current;
    return beginVisibleView(
      activeSessionId,
      'chat',
      activeSession?.profileId ?? profileSelectionTargetId ?? overview?.activeProfileId ?? null,
      overview?.gateway.connection.id ?? null,
      activeSessionId === null ? current?.draftId ?? crypto.randomUUID() : null
    );
  }

  function detachVisibleChat() {
    activeChatSubscription?.();
    activeChatSubscription = null;
    activeChatController = null;
    activeChatView = null;
    sending = false;
    activeTurnApproval = null;
    approvalResponsePending = false;
  }

  function projectVisibleChat(controller: HermesChatSession, owner: ViewOwner) {
    activeChatSubscription?.();
    activeChatController = controller;
    let previousStatus: HermesChatView['status'] | null = null;
    activeChatSubscription = controller.subscribe((view) => {
      if (activeChatController !== controller || !ownsVisibleView(owner)) return;
      activeChatView = view;
      messages = view.messages;
      sending = view.status === 'running' || view.status === 'awaiting-input';
      activeTurnApproval = view.approval;
      if (view.connectionState === 'reconnecting') announcement = 'Hermes connection interrupted. Reconnecting…';
      if (view.error) error = view.error;
      const becameTerminal = previousStatus !== view.status && ['completed', 'interrupted', 'failed'].includes(view.status);
      previousStatus = view.status;
      if (!becameTerminal) return;
      if (view.status === 'failed') error = view.error ?? 'The response did not finish.';
      else if (view.status === 'interrupted') announcement = 'Response stopped';
      else announcement = 'Hermes replied';
      if (view.status === 'completed' && view.durableSessionId) void loadContextUsage(view.durableSessionId, owner);
      void refreshWorkspaceOverview();
    });
  }

  async function hydrateProject(projectId: string) {
    if (hydratedProjects[projectId] || projectLoadingIds.includes(projectId)) return;
    const ownerKey = hydratedProjectOwnerKey;
    projectLoadingIds = [...projectLoadingIds, projectId];
    try {
      const project = await resolveRemoteResult(getProjectSessions({ projectId }));
      if (project && hydratedProjectOwnerKey === ownerKey) hydratedProjects = { ...hydratedProjects, [projectId]: project };
    } catch (cause) {
      if (hydratedProjectOwnerKey === ownerKey) error = cause instanceof Error ? cause.message : 'Hermes project sessions could not be loaded.';
    } finally {
      if (hydratedProjectOwnerKey === ownerKey) projectLoadingIds = projectLoadingIds.filter((id) => id !== projectId);
    }
  }

  async function loadWorkspace(refresh = false, selectInitial = false, silent = false) {
    if (silent && (loading || profileSelectionTargetId !== null)) return false;
    const generation = ++workspaceLoadGeneration;
    const startingOwner = viewOwnership.current;
    if (!silent) { loading = true; error = ''; }
    try {
      if (refresh) await workspaceOverviewQuery.refresh();
      const nextOverview = await resolveRemoteResult(workspaceOverviewQuery) as Overview;
      if (generation !== workspaceLoadGeneration) return false;
      const nextOwnerKey = `${nextOverview.gateway.connection.id}:${nextOverview.activeProfileId}`;
      if (nextOwnerKey !== hydratedProjectOwnerKey) {
        hydratedProjects = {};
        projectLoadingIds = [];
        hydratedProjectOwnerKey = nextOwnerKey;
      }
      overview = nextOverview;
      const currentOwner = viewOwnership.current;
      if (profileSelectionTargetId === null && currentOwner && (currentOwner.connectionId !== nextOverview.gateway.connection.id || currentOwner.profileId !== nextOverview.activeProfileId)) {
        detachVisibleChat();
        beginVisibleView(null, 'chat', nextOverview.activeProfileId, nextOverview.gateway.connection.id);
        messages = [];
        sessionHistoryError = null;
        contextUsage = null;
        contextUsageReason = null;
        activeModelKey = null;
        selectedProjectId = null;
        draftWorktree = null;
      }
      const viewIntentUnchanged = startingOwner ? viewOwnership.owns(startingOwner) : viewOwnership.current === null;
      if (selectInitial && !activeSessionId && viewIntentUnchanged) {
        const profileId = overview.activeProfileId;
        // Global navigation may list sessions from every profile, but the
        // center pane belongs to the active profile. Never borrow the first
        // global session when this profile has no chat of its own.
        const initial = overview.sessions.find((session) => session.source === 'chat' && (session.profileId ?? 'default') === profileId);
        if (initial) await selectSession(initial.id);
      }
      if (!viewOwnership.current && profileSelectionTargetId === null) {
        beginVisibleView(null, 'chat', nextOverview.activeProfileId, nextOverview.gateway.connection.id, activeDraftId ?? crypto.randomUUID());
      }
      return true;
    } catch (cause) {
      if (!silent && generation === workspaceLoadGeneration) error = cause instanceof Error ? cause.message : 'The workspace could not be loaded.';
      return false;
    }
    finally { if (!silent && generation === workspaceLoadGeneration) loading = false; }
  }

  // Gateway health is external state. Keep the status bar current while the
  // shell is visible, but only project a result back into the same connection
  // that initiated the probe so a late response cannot repaint a new gateway.
  async function refreshGatewayStatus() {
    const current = overview;
    if (gatewayRefreshInFlight || !current || loading || profileSelectionTargetId !== null || document.visibilityState !== 'visible') return;
    gatewayRefreshInFlight = true;
    try {
      const result = await resolveRemoteResult(refreshGateway({}));
      if (overview?.gateway.connection.id !== result.status.connection.id) return;
      const previous = overview.gateway;
      const becameLive = previous.status === 'disconnected' && result.status.status !== 'disconnected';
      const capabilityBoundaryChanged = previous.core.models !== result.status.core.models
        || previous.enhanced.sessions !== result.status.enhanced.sessions
        || previous.enhanced.sessionManagement !== result.status.enhanced.sessionManagement
        || previous.enhanced.profiles !== result.status.enhanced.profiles
        || previous.enhanced.config !== result.status.enhanced.config;
      overview = { ...overview, gateway: result.status, capabilities: result.capabilities, approvalMode: result.approvalMode };
      // Keep an offline snapshot stable, but rehydrate the authoritative
      // workspace when a live connection returns or a Hermes capability
      // boundary changes. Status-only projection is insufficient for sessions,
      // models, profiles, and approval configuration.
      if (result.status.status !== 'disconnected' && (becameLive || capabilityBoundaryChanged)) {
        await loadWorkspace(true, false, true);
      }
    }
    catch {
      // Probe failures are represented by the gateway status itself when the
      // server can answer. Avoid replacing the current workspace with a
      // transient banner while the next foreground probe is pending.
    }
    finally { gatewayRefreshInFlight = false; }
  }

  async function selectSession(sessionId: string) {
    if (sessionId !== activeSessionId) draftWorktree = null;
    const currentOverview = overview;
    const session = currentOverview?.sessions.find((item) => item.id === sessionId);
    const sessionProfileId = session?.profileId ?? currentOverview?.activeProfileId ?? null;
    const intendedProfileId = profileSelectionTargetId ?? overview?.activeProfileId ?? null;
    if (session && sessionProfileId && sessionProfileId !== intendedProfileId) {
      await selectProfile(sessionProfileId, sessionId);
      return;
    }
    const boundWorktree = currentOverview?.worktrees.find((item) => item.connectionId === currentOverview.gateway.connection.id && item.profileId === sessionProfileId && item.threadId === sessionId);
    selectedProjectId = session?.projectId ?? boundWorktree?.projectId ?? null;
    const owner = beginVisibleView(sessionId, 'chat');
    activeSurface = null; settingsActive = false; error = ''; sessionHistoryError = null; messages = [];
    activeModelKey = session?.model ? modelSelectionKey('hermes', session.model, session.provider) : null;
    if (session?.unread) await setSessionReadState(sessionId, false, false, owner);
    const connectionId = owner.connectionId;
    const profileId = owner.profileId;
    if (!connectionId || !profileId) {
      sessionHistoryError = 'The selected session has no active Hermes connection owner.';
      return;
    }
    const controller = acquireHermesChatSession(viewResourceKey(owner), { connectionId, profileId });
    projectVisibleChat(controller, owner);
    try {
      await controller.resume(sessionId as HermesDurableSessionId);
    }
    catch (cause) {
      if (!ownsVisibleView(owner)) return;
      sessionHistoryError = cause instanceof Error ? cause.message : 'Session history could not be loaded.';
    }
    finally {
      if (ownsVisibleView(owner)) void loadContextUsage(sessionId, owner);
    }
  }

  async function loadContextUsage(sessionId: string, owner = viewOwnership.current) {
    if (!ownsVisibleView(owner)) return;
    contextUsage = null; contextUsageReason = 'Loading Hermes context usage…';
    try {
      const controller = activeChatController;
      if (!controller || activeChatView?.durableSessionId !== sessionId) throw new Error('Resume this Hermes session before loading context usage.');
      const result = await controller.contextUsage();
      if (!ownsVisibleView(owner)) return;
      contextUsage = result.available ? result.data : null;
      contextUsageReason = result.reason;
    } catch (cause) {
      if (!ownsVisibleView(owner)) return;
      contextUsage = null; contextUsageReason = cause instanceof Error ? cause.message : 'Hermes context usage is unavailable for this session.';
    }
  }


  function newSession(preserveProject = false) {
    detachVisibleChat();
    beginVisibleView(null, 'chat', overview?.activeProfileId ?? null, overview?.gateway.connection.id ?? null, crypto.randomUUID());
    activeModelKey = null; activeSurface = null; settingsActive = false; messages = []; contextUsage = null; contextUsageReason = null; error = ''; sessionHistoryError = null;
    draftWorktree = null;
    if (!preserveProject) selectedProjectId = null;
    announcement = overview?.gateway.enhanced.sessions ? 'New Hermes conversation ready' : 'Started a temporary local thread';
  }

  async function startProjectThread(project: ProjectBinding) {
    const owner = viewOwnership.current;
    const loaded = await loadWorkspace(true);
    if (!loaded || (owner ? !viewOwnership.owns(owner) : viewOwnership.current !== null)) return;
    selectedProjectId = project.id;
    newSession(true);
  }

  function startWorktreeThread(worktree: HermesGitWorktree) {
    const projectId = worktreeProjectTargetId;
    if (!projectId) return;
    selectedProjectId = projectId;
    newSession(true);
    draftWorktree = worktree;
    announcement = `New Hermes conversation ready in ${worktree.branch ?? worktree.path}`;
  }

  async function handleWorktreeRemoved(worktreePath: string) {
    const target = worktreeRemoveTarget;
    if (draftWorktree?.path === worktreePath) newSession(true);
    if (target) {
      const next = { ...hydratedProjects };
      delete next[target.projectId];
      hydratedProjects = next;
      await loadWorkspace(true);
      await hydrateProject(target.projectId);
    }
    announcement = 'Worktree removed';
  }

  async function selectProjectThread(projectId: string, threadId: string) {
    selectedProjectId = projectId;
    await selectSession(threadId);
  }

  function selectComposerBranch(worktreeId: string) {
    const worktree = overview?.worktrees.find((item) => item.worktreeId === worktreeId);
    if (worktree) void selectProjectThread(worktree.projectId, worktree.threadId);
  }

  async function bindCreatedWorktree(input: { connectionId: string; profileId: string; projectId: string; repositoryPath: string; worktreePath: string; branch: string; sessionId: string }) {
    let lastFailure: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await resolveRemoteResult(bindHermesProjectWorktree(input)); }
      catch (cause) {
        lastFailure = cause;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
    throw new Error(errorMessage(lastFailure, 'The Hermes session could not be bound to its worktree.'));
  }

  async function submit(message = prompt, restore?: { messageIndex: number; userOrdinal: number }, attachments: ChatAttachmentInput[] = []) {
    const text = message.trim(); if ((!text && !attachments.length) || sending) return false;
    let viewOwner = ensureChatOwner();
    if (!viewOwner.connectionId || !viewOwner.profileId) {
      error = 'Connect Hermes and select a profile before sending a message.';
      return false;
    }
    sending = true; prompt = ''; error = '';
    const requestId = crypto.randomUUID();
    const originalSessionId = activeSessionId;
    const draftControllerKey = viewResourceKey(viewOwner);
    let controller = acquireHermesChatSession(draftControllerKey, {
      connectionId: viewOwner.connectionId,
      profileId: viewOwner.profileId
    });
    projectVisibleChat(controller, viewOwner);
    const draftLayoutOwner = workspaceLayoutIdentity?.resource.kind === 'draft' ? workspaceLayoutIdentity : null;
    const draftLayoutPreferences = draftLayoutOwner ? snapshotWorkspaceLayout() : null;
    const pendingWorktreeBinding = !originalSessionId && draftWorktree && activeProject && draftWorktree.branch
      ? { projectId: activeProject.id, repositoryPath: activeProject.repositoryPath, worktreePath: draftWorktree.path, branch: draftWorktree.branch }
      : null;
    try {
      let sessionId = originalSessionId as HermesDurableSessionId | null;
      if (sessionId) await controller.resume(sessionId);
      else sessionId = await controller.create({
        model: activeComposerModelOverride?.id,
        provider: activeComposerModelOverride?.runtimeProvider ?? undefined,
        cwd: draftWorktree?.path ?? activeWorktree?.path ?? activeProject?.repositoryPath
      });
      if (!originalSessionId) {
        if (draftLayoutOwner) {
          const sessionLayoutOwner: WorkspaceLayoutOwner = {
            connectionId: viewOwner.connectionId,
            profileId: viewOwner.profileId,
            resource: { kind: 'session', id: sessionId }
          };
          const preferences = draftLayoutPreferences ?? WorkspaceLayoutPreferences.parse({});
          try {
            await adoptPersistedWorkspaceLayout(draftLayoutOwner, sessionLayoutOwner, preferences);
          } catch (cause) {
            try { await writePersistedWorkspaceLayout(sessionLayoutOwner, preferences); }
            catch { if (ownsVisibleView(viewOwner)) error = errorMessage(cause, 'Conversation started, but its workspace layout could not be adopted.'); }
          }
        }
        const currentView = viewOwnership.current;
        const adoptedViewOwner = currentView
          && currentView.connectionId === viewOwner.connectionId
          && currentView.profileId === viewOwner.profileId
          && currentView.sessionId === null
          && currentView.draftId === viewOwner.draftId
          ? viewOwnership.adoptSession(currentView, sessionId)
          : null;
        if (adoptedViewOwner) {
          const sessionControllerKey = viewResourceKey(adoptedViewOwner);
          controller = adoptHermesChatSession(draftControllerKey, sessionControllerKey) ?? controller;
          visibleViewOwner = adoptedViewOwner;
          viewOwner = adoptedViewOwner;
          activeSessionId = sessionId;
          activeDraftId = null;
          projectVisibleChat(controller, viewOwner);
        }
        if (pendingWorktreeBinding) {
          try {
            const boundWorktree = await bindCreatedWorktree({ ...pendingWorktreeBinding, connectionId: viewOwner.connectionId!, profileId: viewOwner.profileId!, sessionId });
            if (overview && ownsVisibleView(viewOwner)) {
              overview = {
                ...overview,
                worktrees: [
                  boundWorktree,
                  ...overview.worktrees.filter((item) => item.worktreeId !== boundWorktree.worktreeId && !(item.connectionId === boundWorktree.connectionId && item.profileId === boundWorktree.profileId && item.projectId === boundWorktree.projectId && item.threadId === boundWorktree.threadId))
                ]
              };
            }
            await refreshWorkspaceOverview();
          } catch (cause) {
            if (ownsVisibleView(viewOwner)) error = errorMessage(cause, 'The Hermes session could not be bound to its worktree.');
          }
        }
      }
      await controller.submit({
        requestId,
        text,
        attachments,
        modelId: activeComposerModelOverride?.id,
        modelName: activeComposerModelOverride?.label,
        provider: activeComposerModelOverride?.runtimeProvider,
        truncateBeforeUserOrdinal: restore?.userOrdinal
      });
      return true;
    } catch (cause) {
      if (ownsVisibleView(viewOwner)) {
        sending = false;
        if (!prompt) prompt = text;
        error = cause instanceof Error ? cause.message : 'The message could not be sent.';
      }
      return false;
    }
  }

  function requestCheckpointRestore(messageIndex: number) {
    const message = messages[messageIndex]; if (!message || message.role !== 'user' || !message.text.trim() || sending) return;
    restoreTarget = { text: message.text, messageIndex, userOrdinal: messages.slice(0, messageIndex).filter((candidate) => candidate.role === 'user').length }; restoreDialogOpen = true;
  }

  async function confirmCheckpointRestore() {
    const target = restoreTarget; if (!target) return;
    restoreDialogOpen = false; restoreTarget = null; await submit(target.text, target);
  }

  async function stopActiveTurn() {
    const controller = activeChatController;
    if (!controller || !activeChatView?.requestId) return;
    announcement = 'Stopping response…';
    await controller.interrupt().catch(() => undefined);
  }

  async function respondToActiveApproval(choice: 'once' | 'session' | 'always' | 'deny') {
    const controller = activeChatController;
    const approval = activeTurnApproval;
    if (!controller || !approval || approvalResponsePending || activeChatView?.requestId !== approval.requestId) return;
    approvalResponsePending = true;
    error = '';
    try {
      await controller.respondApproval(choice);
      if (activeChatController !== controller) return;
      announcement = choice === 'deny' ? 'Approval denied' : 'Approval granted';
    } catch (cause) {
      if (activeChatController === controller) error = cause instanceof Error ? cause.message : 'The Hermes approval could not be answered.';
    }
    finally {
      if (activeChatController === controller) approvalResponsePending = false;
    }
  }

  async function refreshWorkspaceOverview() {
    await loadWorkspace(true, false, true);
  }

  async function submitComposer(detail: ComposerSubmitDetail) {
    const attachments: ChatAttachmentInput[] = (detail.files ?? []).map((file) => ({
      filename: file.filename ?? 'attachment', mediaType: file.mediaType ?? 'application/octet-stream', dataUrl: file.url
    }));
    const accepted = await submit(detail.prompt, undefined, attachments);
    if (!accepted) throw new Error(error || 'Hermes did not accept the message.');
  }

  function commandPaletteFilter(value: string, search: string, keywords: string[] = []) {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return 1;
    if (value === 'send-to-hermes') return 10_000;
    const words = query.split(/\s+/).filter(Boolean);
    const haystack = [value, ...keywords].join(' ').toLocaleLowerCase();
    if (!words.every((word) => haystack.includes(word))) return 0;
    return 10 + words.reduce((score, word) => score + (haystack.startsWith(word) ? 4 : 1), 0);
  }

  async function loadCommandSessionResults(query: string, generation: number) {
    try {
      const results = await resolveRemoteResult(searchSessions({ query, profileIds: overview?.profiles.map((profile) => profile.id) ?? [] }));
      if (generation !== commandSearchGeneration || !commandOpen || commandQuery.trim() !== query) return;
      commandSessionResults = results;
    } catch {
      if (generation === commandSearchGeneration) commandSessionResults = [];
    } finally {
      if (generation === commandSearchGeneration) commandSessionSearching = false;
    }
  }

  function resetCommandPaletteSearch() {
    commandSearchGeneration += 1;
    commandQuery = '';
    commandSessionResults = [];
    commandSessionSearching = false;
  }

  function closeCommandPalette() {
    resetCommandPaletteSearch();
    commandOpen = false;
  }

  async function openCommandSessionResult(result: (typeof commandSessionResults)[number]) {
    if (overview && !overview.sessions.some((session) => session.id === result.session.id && session.profileId === result.session.profileId)) {
      overview = { ...overview, sessions: [result.session, ...overview.sessions] };
    }
    closeCommandPalette();
    await selectSession(result.sessionId);
  }

  async function submitCommandPalettePrompt() {
    const message = commandQuery.trim();
    if (!message || sending) return;
    commandOpen = false;
    commandQuery = '';
    newSession();
    await submit(message);
  }

  function selectComposerCompletion(completion: ComposerCompletion) {
    if (completion.behavior !== 'execute') return;
    if (completion.id === 'slash-new') void newSession();
    else if (completion.id === 'slash-terminal') { if (!workspaceLayoutInteractive) return; terminalOpen = true; rememberInspectorState(); }
    else if (completion.id === 'slash-review') { if (!workspaceLayoutInteractive) return; inspectorVisible = true; inspectorMode = 'docked'; dockTab = 'changes'; if (!dockTabs.includes('changes')) dockTabs = [...dockTabs, 'changes']; rememberInspectorState(); }
    else if (completion.id === 'slash-model') activeSurface = 'models';
    else if (completion.id === 'slash-settings') openSettings('model');
  }

  function formatElapsed(startedAt: string | null | undefined, now: number) {
    if (!startedAt) return '—';
    const elapsed = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1_000));
    const hours = Math.floor(elapsed / 3_600); const minutes = Math.floor((elapsed % 3_600) / 60); const seconds = elapsed % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  async function setApprovalMode(mode: 'manual' | 'smart' | 'off') {
    if (!approvalMode || approvalPending || mode === approvalMode) return;
    approvalPending = true; error = '';
    try {
      await resolveRemoteResult(setHermesApprovalMode({ mode }));
      if (overview) overview.approvalMode = mode;
      announcement = `Hermes approval mode set to ${mode === 'manual' ? 'Manual' : mode === 'smart' ? 'Smart' : 'Off'}`;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not update Hermes approval mode.'; }
    finally { approvalPending = false; }
  }

  function toggleSidebar() { sidebarVisible = !sidebarVisible; }

  function handleKeyboard(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); void newSession(); }
    if (event.key.toLowerCase() === 'k') { event.preventDefault(); commandOpen = !commandOpen; }
  }

  function chooseSurface(surface: CapabilityFamily | 'capabilities' | null) {
    settingsActive = false; activeSurface = surface; commandOpen = false;
    if (surface) beginVisibleView(activeSessionId, 'surface');
    else if (activeSessionId) void selectSession(activeSessionId);
    else beginVisibleView(null);
  }

  function openSettings(sectionId = 'model', itemId?: string) {
    beginVisibleView(activeSessionId, 'settings');
    settingsActive = true; activeSurface = null; activeSettingsSection = sectionId; activeSettingsItem = itemId; commandOpen = false;
  }

  function openProjectDialog(mode: 'add' | 'worktrees' = 'add') {
    projectDialogMode = mode;
    projectsOpen = true;
  }

  function closeSettings() {
    settingsActive = false;
    activeSettingsItem = undefined;
    if (activeSessionId) void selectSession(activeSessionId);
    else beginVisibleView(null);
  }

  function applyDesktopAppearance(preferences: DesktopPreferences) {
    document.documentElement.dataset.themeMode = preferences.appearance.mode;
    document.documentElement.dataset.themePalette = preferences.appearance.palette;
    document.documentElement.classList.toggle('dark', preferences.appearance.mode === 'dark');
  }

  function openSettingsAction(action: SettingsAction) {
    if (action.kind === 'connection') { connectOpen = true; return; }
    if (!capabilityFor(action.surface)?.available) return;
    chooseSurface(action.surface);
  }

  function rememberInspectorState() {
    if (!workspaceLayoutInteractive) return;
    queueWorkspaceLayoutPersistence(workspaceLayoutIdentity, snapshotWorkspaceLayout());
  }

  function toggleInspector() {
    if (!workspaceLayoutInteractive) return;
    inspectorVisible = !inspectorVisible;
    if (!inspectorVisible) inspectorMode = 'docked';
    rememberInspectorState();
  }

  function toggleInspectorFocus() {
    if (!workspaceLayoutInteractive || !inspectorVisible) return;
    inspectorMode = inspectorMode === 'focused' ? 'docked' : 'focused';
    rememberInspectorState();
  }

  function openAgentsDock() {
    if (!workspaceLayoutInteractive) return;
    inspectorVisible = true;
    inspectorMode = 'docked';
    dockTab = 'agents';
    if (!dockTabs.includes('agents')) dockTabs = [...dockTabs, 'agents'];
    rememberInspectorState();
  }

  function startPanelResize(event: PointerEvent, panel: 'sidebar' | 'inspector' | 'terminal') {
    if (event.button !== 0) return;
    if (panel !== 'sidebar' && !workspaceLayoutInteractive) return;
    event.preventDefault();
    const shell = document.querySelector<HTMLElement>('.companion-shell');
    const workspace = document.querySelector<HTMLElement>('.workspace');
    const primary = document.querySelector<HTMLElement>('.primary-layout');
    if (!shell || !workspace || !primary) return;
    const shellRect = shell.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    const primaryRect = primary.getBoundingClientRect();
    if (panel === 'inspector' || panel === 'terminal') workspaceLayoutResizeActive = true;
    const onMove = (moveEvent: PointerEvent) => {
      if (panel === 'sidebar') sidebarWidth = Math.round(Math.min(420, Math.max(224, moveEvent.clientX - shellRect.left)));
      if (panel === 'inspector') inspectorWidth = Math.round(Math.min(workspaceRect.width * 0.48, Math.max(280, workspaceRect.right - moveEvent.clientX)));
      if (panel === 'terminal') terminalHeight = Math.round(Math.min(primaryRect.height * 0.62, Math.max(176, primaryRect.bottom - moveEvent.clientY)));
    };
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      document.documentElement.removeAttribute('data-resizing');
      if (panel === 'inspector' || panel === 'terminal') {
        workspaceLayoutResizeActive = false;
        queueWorkspaceLayoutPersistence(workspaceLayoutIdentity, snapshotWorkspaceLayout());
      }
    };
    document.documentElement.dataset.resizing = panel;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd, { once: true });
    window.addEventListener('pointercancel', onEnd, { once: true });
  }

  function resizePanelFromKeyboard(event: KeyboardEvent, panel: 'sidebar' | 'inspector' | 'terminal') {
    if (panel !== 'sidebar' && !workspaceLayoutInteractive) return;
    const workspace = document.querySelector<HTMLElement>('.workspace');
    const primary = document.querySelector<HTMLElement>('.primary-layout');
    const minimum = panel === 'sidebar' ? 224 : panel === 'inspector' ? 280 : 176;
    const maximum = panel === 'sidebar'
      ? 420
      : panel === 'inspector'
        ? Math.round((workspace?.getBoundingClientRect().width ?? window.innerWidth) * .48)
        : Math.round((primary?.getBoundingClientRect().height ?? window.innerHeight) * .62);
    const current = panel === 'sidebar' ? sidebarWidth : panel === 'inspector' ? inspectorWidth : terminalHeight;
    let next = current;
    if (event.key === 'Home') next = minimum;
    else if (event.key === 'End') next = maximum;
    else if (panel === 'sidebar' && event.key === 'ArrowLeft') next -= 16;
    else if (panel === 'sidebar' && event.key === 'ArrowRight') next += 16;
    else if (panel === 'inspector' && event.key === 'ArrowLeft') next += 16;
    else if (panel === 'inspector' && event.key === 'ArrowRight') next -= 16;
    else if (panel === 'terminal' && event.key === 'ArrowUp') next += 16;
    else if (panel === 'terminal' && event.key === 'ArrowDown') next -= 16;
    else return;
    event.preventDefault();
    next = Math.min(maximum, Math.max(minimum, next));
    if (panel === 'sidebar') sidebarWidth = next;
    if (panel === 'inspector') inspectorWidth = next;
    if (panel === 'terminal') terminalHeight = next;
    if (panel === 'inspector' || panel === 'terminal') queueWorkspaceLayoutPersistence(workspaceLayoutIdentity, snapshotWorkspaceLayout());
  }

  function toggleTerminal() {
    if (!workspaceLayoutInteractive) return;
    terminalOpen = !terminalOpen;
    queueWorkspaceLayoutPersistence(workspaceLayoutIdentity, snapshotWorkspaceLayout());
  }

  async function runProfileAction(action: NonNullable<typeof primaryProfileAction>) {
    if (!workspaceLayoutInteractive) return;
    if (!activeWorktree) { announcement = 'Select a project session to run this action'; return; }
    terminalOpen = true;
    await tick();
    const ran = await terminalSplit?.runCommand(action.command);
    announcement = ran ? `Running ${action.name}` : `${action.name} could not start`;
  }

  function chooseGitAction(action: 'commit' | 'push' | 'create-pr') {
    if (!workspaceLayoutInteractive) return;
    inspectorVisible = true;
    inspectorMode = 'docked';
    dockTab = 'changes';
    if (!dockTabs.includes('changes')) dockTabs = [...dockTabs, 'changes'];
    rememberInspectorState();
    announcement = action === 'commit' ? 'Opened commit controls' : action === 'push' ? 'Opened push controls' : 'Opened pull request controls';
  }

  async function runCommandCenterAction(action: 'doctor' | 'gateway-restart') {
    commandOpen = false;
    try { await resolveRemoteResult(runHermesMaintenance({ action })); announcement = action === 'gateway-restart' ? 'Gateway restart requested' : `${action} started`; }
    catch (cause) { error = cause instanceof Error ? cause.message : `${action} could not start`; }
  }

  async function exitFullscreenPreview() {
    try { await resolveRemoteResult(setBrowserFullscreen({ fullscreen: false, ownerKey: browserOwnerKey, browserLeaseId })); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not leave full-screen preview.'; }
    finally { fullscreenPreview = false; }
  }

  async function selectProfile(id: string, targetSessionId?: string) {
    if (id === overview?.activeProfileId && profileSelectionTargetId === null) {
      if (targetSessionId && targetSessionId !== activeSessionId) await selectSession(targetSessionId);
      return;
    }
    const intent = profileSelections.enqueue(id, async (profileId) => {
      await resolveRemoteResult(selectHermesProfile({ id: profileId }));
    });
    profileSelectionTargetId = id;
    // Model and UI selections are draft projections owned by the current
    // profile. Invalidate them before the target profile is hydrated so a
    // shared model id cannot become an explicit override in the new chat.
    activeModelKey = null;
    profileUiLoadGeneration += 1;
    profileUiPreferences = null;
    sessionPresentation = 'chats';
    profileUiSaveGeneration += 1;
    presentationSaving = false;
    detachVisibleChat();
    const owner = beginVisibleView(null, 'chat', id);
    messages = [];
    sessionHistoryError = null;
    contextUsage = null;
    selectedProjectId = null;
    loading = true; error = '';
    try {
      await intent.completion;
      if (!profileSelections.isLatest(intent)) return;
      // The remote mutation is authoritative even if the user navigated to a
      // different center surface while it was pending. Project the confirmed
      // profile immediately, then reconcile the complete overview.
      if (overview) overview = { ...overview, activeProfileId: id };
      const loaded = await loadWorkspace(true, false);
      if (!profileSelections.isLatest(intent)) return;
      profileSelectionTargetId = null;
      if (!loaded) {
        const current = viewOwnership.current;
        if (current?.profileId === id) beginVisibleView(null, current.location, id, overview?.gateway.connection.id ?? current.connectionId);
        loading = false;
        return;
      }
      const current = viewOwnership.current;
      if (current && current.profileId !== overview?.activeProfileId) {
        beginVisibleView(null, current.location, overview?.activeProfileId ?? id, overview?.gateway.connection.id ?? current.connectionId);
        messages = [];
        sessionHistoryError = null;
        contextUsage = null;
        selectedProjectId = null;
      }
      if (targetSessionId) await selectSession(targetSessionId);
      else if (ownsVisibleView(owner)) {
        const initial = overview?.sessions.find((session) => session.source === 'chat' && (session.profileId ?? 'default') === id);
        if (initial) await selectSession(initial.id);
      }
      if (profileSelections.isLatest(intent)) {
        announcement = 'Hermes profile switched';
      }
    }
    catch (cause) {
      if (profileSelections.isLatest(intent)) {
        const failure = cause instanceof Error ? cause.message : 'Profile switch failed.';
        const lastSuccessfulProfileId = profileSelections.lastSuccessfulTarget ?? overview?.activeProfileId ?? null;
        if (overview && lastSuccessfulProfileId) overview = { ...overview, activeProfileId: lastSuccessfulProfileId };
        await loadWorkspace(true, false);
        if (!profileSelections.isLatest(intent)) return;
        profileSelectionTargetId = null;
        const authoritativeProfileId = overview?.activeProfileId ?? lastSuccessfulProfileId;
        const current = viewOwnership.current;
        beginVisibleView(null, current?.location ?? 'chat', authoritativeProfileId, overview?.gateway.connection.id ?? current?.connectionId ?? null);
        messages = [];
        sessionHistoryError = null;
        contextUsage = null;
        selectedProjectId = null;
        error = failure;
        loading = false;
      }
    }
  }

  onMount(() => {
    nativePlatform = window.companion?.platform ?? '';
    const timer = setInterval(() => { clock = Date.now(); }, 1_000);
    const refresh = () => { void refreshGatewayStatus(); };
    const gatewayTimer = setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    void loadWorkspace(false, true);
    void resolveRemoteResult(desktopSettingsQuery).then((result) => { desktopPreferences = result.preferences; openRouterConfigured = result.openRouter.configured; openRouterVerified = result.openRouter.verified; openRouterVerificationError = result.openRouter.error; applyDesktopAppearance(result.preferences); }).catch(() => undefined);
    void resolveRemoteResult(openRouterPolicyQuery).then((result) => { openRouterPolicy = result; }).catch(() => undefined);
    void window.companion?.invoke<{ version: string; platform: NodeJS.Platform }>('app.info', {}).then((info) => { nativePlatform = info.platform; }).catch(() => undefined);
    return () => {
      activeChatSubscription?.();
      activeChatSubscription = null;
      clearInterval(timer);
      clearInterval(gatewayTimer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  });
  async function loadProfileUi(connectionId: string) {
    const generation = ++profileUiLoadGeneration;
    try {
      const preferences = await resolveRemoteResult(getProfileUiPreferences({ connectionId }));
      if (generation !== profileUiLoadGeneration || connectionId !== profilePreferenceKey) return;
      profileUiPreferences = preferences;
      sessionPresentation = preferences.sessionPresentation;
    }
    catch {
      if (generation !== profileUiLoadGeneration || connectionId !== profilePreferenceKey) return;
      profileUiPreferences = null;
      sessionPresentation = 'chats';
    }
  }

  async function selectSessionPresentation(next: SessionPresentation) {
    const connectionId = profilePreferenceKey;
    if (!connectionId || presentationSaving || next === sessionPresentation) return;
    const generation = ++profileUiSaveGeneration;
    profileUiLoadGeneration += 1;
    sessionPresentation = next;
    presentationSaving = true;
    try {
      const preferences = await resolveRemoteResult(setProfileUiPreferences({ connectionId, preferences: { ...(profileUiPreferences ?? {}), sessionPresentation: next } }));
      if (generation === profileUiSaveGeneration && connectionId === profilePreferenceKey) profileUiPreferences = preferences;
    }
    catch (cause) { if (generation === profileUiSaveGeneration && connectionId === profilePreferenceKey) error = cause instanceof Error ? cause.message : 'Could not save this profile view.'; }
    finally { if (generation === profileUiSaveGeneration) presentationSaving = false; }
  }

  async function selectSessionFilter(next: SessionTreeFilter | null) {
    const connectionId = profilePreferenceKey;
    if (!connectionId || presentationSaving) return;
    const generation = ++profileUiSaveGeneration;
    profileUiLoadGeneration += 1;
    presentationSaving = true;
    try {
      const preferences = await resolveRemoteResult(setProfileUiPreferences({ connectionId, preferences: { ...(profileUiPreferences ?? {}), sessionPresentation, sessionFilter: next } }));
      if (generation === profileUiSaveGeneration && connectionId === profilePreferenceKey) profileUiPreferences = preferences;
    } catch (cause) { if (generation === profileUiSaveGeneration && connectionId === profilePreferenceKey) error = cause instanceof Error ? cause.message : 'Could not save this profile filter.'; }
    finally { if (generation === profileUiSaveGeneration) presentationSaving = false; }
  }

  async function togglePinned(sessionId: string) {
    if (!overview) return;
    const pinned = !overview.pinnedSessionIds.includes(sessionId);
    try {
      await resolveRemoteResult(setSessionPinned({ sessionId, pinned }));
      overview.pinnedSessionIds = pinned ? [...overview.pinnedSessionIds, sessionId] : overview.pinnedSessionIds.filter((id) => id !== sessionId);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not update the session pin.'; }
  }

  async function toggleSessionArchived(sessionId: string) {
    const currentOverview = overview;
    if (!currentOverview) return;
    const session = currentOverview.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    try {
      await resolveRemoteResult(setSessionArchived({ sessionId, profileId: session.profileId ?? undefined, archived: !session.archived }));
      overview = { ...currentOverview, sessions: currentOverview.sessions.map((item) => item.id === sessionId ? { ...item, archived: !session.archived } : item) };
      if (!session.archived && activeSessionId === sessionId) {
        detachVisibleChat();
        beginVisibleView(null);
        messages = [];
        sessionHistoryError = null;
        contextUsage = null;
      }
      announcement = session.archived ? 'Session restored' : 'Session archived';
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not update the session archive.'; }
  }

  async function toggleProjectArchived(projectId: string) {
    const currentOverview = overview; const project = currentOverview?.projects.find((item) => item.id === projectId);
    if (!currentOverview || !project) return;
    const archived = !project.archived;
    try {
      await resolveRemoteResult(setProjectArchived({ projectId, archived }));
      overview = { ...currentOverview, projects: currentOverview.projects.map((item) => item.id === projectId ? { ...item, archived } : item) };
      if (archived && selectedProjectId === projectId) selectedProjectId = null;
      announcement = archived ? 'Project archived' : 'Project restored';
      void refreshWorkspaceOverview();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not update the project archive.'; }
  }

  async function copySessionTranscript(sessionId: string) {
    try {
      const connectionId = overview?.gateway.connection.id;
      const profileId = overview?.sessions.find((session) => session.id === sessionId)?.profileId ?? overview?.activeProfileId;
      if (!connectionId || !profileId) throw new Error('The session has no active Hermes owner.');
      const key = viewResourceKey({ connectionId, profileId, sessionId, draftId: null });
      const controller = acquireHermesChatSession(key, { connectionId, profileId });
      await controller.resume(sessionId as HermesDurableSessionId);
      const transcript = controller.current().messages.filter((message) => message.generation === null);
      const text = transcript.map((message) => `${message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Hermes' : 'Tool'}:\n${message.text}`).join('\n\n');
      await navigator.clipboard.writeText(text);
      announcement = 'Transcript copied';
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not copy the transcript.'; }
  }

  async function setSessionReadState(sessionId: string, unread: boolean, announce = true, owner?: ViewOwner) {
    try {
      await resolveRemoteResult(setSessionUnread({ sessionId, unread }));
      if (owner && !ownsVisibleView(owner)) return;
      if (overview) overview = { ...overview, sessions: overview.sessions.map((session) => session.id === sessionId ? { ...session, unread } : session) };
      if (announce) announcement = unread ? 'Session marked unread' : 'Session marked read';
    } catch (cause) {
      if (!owner || ownsVisibleView(owner)) error = cause instanceof Error ? cause.message : `Could not mark the session ${unread ? 'unread' : 'read'}.`;
    }
  }

  async function handleSessionDeleted(sessionId: string) {
    if (overview) {
      overview = {
        ...overview,
        sessions: overview.sessions.filter((session) => session.id !== sessionId),
        pinnedSessionIds: overview.pinnedSessionIds.filter((id) => id !== sessionId)
      };
    }
    sessionActionTargetId = null;
    if (activeSessionId === sessionId) {
      detachVisibleChat();
      beginVisibleView(null);
      messages = [];
      sessionHistoryError = null;
      contextUsage = null;
    }
    announcement = 'Session deleted';
    await loadWorkspace(true, true);
  }

  async function handleProjectDeleted(projectId: string) {
    if (overview) overview = { ...overview, projects: overview.projects.filter((project) => project.id !== projectId) };
    projectActionTargetId = null;
    if (selectedProjectId === projectId) selectedProjectId = null;
    announcement = 'Project deleted';
    await loadWorkspace(true);
  }

  // Selecting a session is navigation, not authorization to create a Git
  // worktree. Worktrees are created only by an explicit project action.
  $effect(() => { if (profilePreferenceKey) void loadProfileUi(profilePreferenceKey); });
</script>

<svelte:head><title>{activeSession?.title ?? 'Hermes Companion'}</title><meta name="description" content="Desktop control plane for Hermes Agent" /></svelte:head>
<svelte:window onkeydown={handleKeyboard} />

<a href="#main-workspace" class="skip-link">Skip to workspace</a>
<div
  class="shell-boot"
  data-visible={!shellPresented}
  data-workspace-starting={workspaceStarting}
  data-layout-ready={workspaceLayoutReady}
  data-target-ready={workspaceTargetReady}
  role="status"
  aria-label="Starting Hermes Companion"
  aria-hidden={shellPresented}
><Sparkles aria-hidden="true" /></div>
<div class="companion-shell" data-shell-presented={shellPresented} data-preview-fullscreen={fullscreenPreview} data-native-platform={nativePlatform} data-sidebar-visible={sidebarVisible ? 'true' : 'false'} style={`visibility: ${shellPresented ? 'visible' : 'hidden'}; --shell-sidebar-width: ${sidebarWidth}px; --shell-inspector-width: ${inspectorWidth}px; --shell-terminal-height: ${terminalHeight}px;`}>
  <div class="shell-chrome" aria-label="Application controls">
    <div class="chrome-leading">
      <Button size="icon-sm" variant="ghost" onclick={toggleSidebar} aria-controls="session-sidebar" aria-expanded={sidebarVisible} aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'} title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}>{#if sidebarVisible}<PanelLeftClose />{:else}<PanelLeftOpen />{/if}</Button>
    </div>
    <div class="chrome-trailing">
      <Button size="icon-sm" variant={inspectorMode === 'focused' ? 'secondary' : 'ghost'} disabled={!workspaceLayoutInteractive || !inspectorVisible} onclick={toggleInspectorFocus} aria-controls="workspace-inspector" aria-pressed={inspectorMode === 'focused'} aria-label={inspectorMode === 'focused' ? 'Restore right panel' : 'Focus right panel'} title={inspectorMode === 'focused' ? 'Restore right panel' : 'Focus right panel'}>{#if inspectorMode === 'focused'}<Minimize2 />{:else}<Maximize2 />{/if}</Button>
      <Button size="icon-sm" variant="ghost" disabled={!workspaceLayoutInteractive} onclick={toggleInspector} aria-controls="workspace-inspector" aria-expanded={inspectorVisible} aria-label={inspectorVisible ? 'Hide right panel' : 'Show right panel'} title={inspectorVisible ? 'Hide right panel' : 'Show right panel'}>{#if inspectorVisible}<PanelRightClose />{:else}<PanelRightOpen />{/if}</Button>
    </div>
  </div>
  <aside id="session-sidebar" class="session-sidebar" aria-label="Hermes navigation" aria-hidden={!sidebarVisible} inert={!sidebarVisible}>
    {#if settingsActive}
      <SettingsNavigation activeSection={activeSettingsSection} onselect={(sectionId, itemId) => { activeSettingsSection = sectionId; activeSettingsItem = itemId; }} onback={closeSettings} />
    {:else}
    <header class="sidebar-header">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}<Button {...props} class="profile-switcher" variant="ghost"><strong>{activeProfile?.name ?? 'Hermes Agent'}</strong><ChevronDown class="profile-chevron" data-icon="inline-end" /></Button>{/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="profile-menu">
          {#each overview?.profiles ?? [] as profile (profile.id)}<DropdownMenu.Item onclick={() => selectProfile(profile.id)}><span class="profile-menu-copy"><strong>{profile.name}</strong><small>{profile.description || `${profile.skillCount} skills${profile.model ? ` · ${profile.model}` : ''}`}</small></span>{#if profile.id === overview?.activeProfileId}<Badge variant="secondary">Active</Badge>{/if}</DropdownMenu.Item>{/each}
          <DropdownMenu.Separator />
          <DropdownMenu.Item onclick={() => (profileOpen = true)}><Plus /> Add profile</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Button size="icon-sm" variant="ghost" onclick={() => (commandOpen = true)} aria-label="Search commands and sessions" title="Search commands and sessions"><Search /></Button>
    </header>
    <nav class="sidebar-actions" aria-label="Primary navigation">
      <Button variant="ghost" onclick={() => newSession()}><SquarePen data-icon="inline-start" /> New chat <kbd>⌘N</kbd></Button>
      <Button variant="ghost" onclick={() => chooseSurface('capabilities')}><Shapes data-icon="inline-start" /> Capabilities</Button>
      <Button variant="ghost" disabled={!capabilityFor('messaging')?.available} title={capabilityFor('messaging')?.reason ?? 'Open Hermes messaging'} onclick={() => chooseSurface('messaging')}><MessageCircle data-icon="inline-start" /> Messaging</Button>
      <Button variant="ghost" disabled={!capabilityFor('artifacts')?.available} title={capabilityFor('artifacts')?.reason ?? 'Open Hermes artifacts'} onclick={() => chooseSurface('artifacts')}><Sparkles data-icon="inline-start" /> Artifacts</Button>
    </nav>
    <SessionNavigation
      sessions={overview?.sessions ?? []} projects={overview?.projects ?? []} projectTree={overview?.projectTree.projects ?? []} {hydratedProjects} {projectLoadingIds} worktrees={overview?.worktrees ?? []} connections={overview?.connections ?? []}
      pinnedSessionIds={overview?.pinnedSessionIds ?? []} {activeSessionId} {selectedProjectId} activeProfileId={overview?.activeProfileId ?? 'default'} presentation={sessionPresentation}
      filter={profileUiPreferences?.sessionFilter ?? null} loading={workspaceStarting} archiveAvailable={sessionManagementAvailable}
      onselectsession={(id, projectId) => projectId ? void selectProjectThread(projectId, id) : void selectSession(id)}
      onselectproject={(id) => { selectedProjectId = id; newSession(true); }} onnewproject={() => openProjectDialog()}
      onprojectexpand={(id) => void hydrateProject(id)}
      onnewsession={(project) => { if (project) selectedProjectId = project.id; newSession(Boolean(project)); }}
      onnewworktree={(id, repositoryPaths) => { worktreeProjectTargetId = id; worktreeRepositoryPaths = repositoryPaths; worktreeOpen = true; }}
      onremoveworktree={(target) => { worktreeRemoveTarget = target; worktreeRemoveOpen = true; }}
      onprojectactions={(id) => { projectActionTargetId = id; projectActionsOpen = true; }} onprojectarchive={(id) => void toggleProjectArchived(id)}
      onactions={(id) => { sessionActionTargetId = id; sessionActionsOpen = true; }} ontogglepinned={(id) => void togglePinned(id)}
      onarchive={(id) => void toggleSessionArchived(id)}
      oncopytranscript={(id) => void copySessionTranscript(id)}
      onmarkunread={(id, unread) => void setSessionReadState(id, unread)}
      onpresentationchange={(value) => void selectSessionPresentation(value)} onfilterchange={(value) => void selectSessionFilter(value)}
      oncollapseall={() => { selectedProjectId = null; announcement = 'All projects collapsed'; }}
    />
    {/if}
    <AccountFooter name={desktopPreferences.account.displayName} email={desktopPreferences.account.email} {settingsActive} ontogglesettings={() => settingsActive ? closeSettings() : openSettings('model')} />
  </aside>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="pane-resizer sidebar-resizer" role="separator" aria-label="Resize left sidebar" aria-orientation="vertical" aria-valuemin="224" aria-valuemax="420" aria-valuenow={sidebarWidth} aria-hidden={!sidebarVisible} inert={!sidebarVisible} tabindex={sidebarVisible ? 0 : -1} onkeydown={(event) => resizePanelFromKeyboard(event, 'sidebar')} onpointerdown={(event) => startPanelResize(event, 'sidebar')}></div>

  <main id="main-workspace" tabindex="-1" class="workspace">
    <div class="workspace-panes" data-settings-active={settingsActive} data-inspector-visible={inspectorVisible ? 'true' : 'false'} data-inspector-mode={inspectorMode}>
        <section class="primary-pane" aria-label={settingsActive ? 'Settings' : workspaceIsProjectScoped ? 'Project workspace' : 'Conversation'} aria-hidden={inspectorVisible && inspectorMode === 'focused'} inert={inspectorVisible && inspectorMode === 'focused'}>
          {#if settingsActive}
            <SettingsPage sectionId={activeSettingsSection} itemId={activeSettingsItem} preferences={desktopPreferences} profileConnectionId={overview?.gateway.connection.id ?? null} {profileUiPreferences} {openRouterConfigured} {openRouterVerified} {openRouterVerificationError} {openRouterPolicy}
              availableSurfaces={overview?.capabilities.filter((capability) => capability.available).map((capability) => capability.family) ?? []} connectionAvailable={Boolean(overview?.gateway.connection)}
              onsaved={(preferences, configured, verified, verificationError) => { desktopPreferences = preferences; openRouterConfigured = configured; openRouterVerified = verified; openRouterVerificationError = verificationError; applyDesktopAppearance(preferences); }} onpolicysaved={(policy) => { openRouterPolicy = policy; }} onprofileuisaved={(preferences) => { profileUiPreferences = preferences; sessionPresentation = preferences.sessionPresentation; }} onsettingsaction={openSettingsAction} />
          {:else}
          <header class="workspace-header">
            <div class="header-context"><strong>{activeSurface ? activeSurface === 'capabilities' ? 'Capabilities' : capabilityLabel(activeSurface) : activeSession?.title ?? (workspaceIsProjectScoped ? 'Project session' : 'New conversation')}</strong><span class="context-meta">{activeSurface ? 'Hermes capability' : workspaceIsProjectScoped ? activeProject?.name ?? 'Project' : activeProfile?.name ?? 'Hermes Agent'}</span>{#if !activeSurface && activeWorktree}<Badge variant="outline">{activeWorktree.branch}</Badge>{/if}</div>
            <div class="header-drag-space" aria-hidden="true"></div>
            <div class="header-actions">
              {#if activeSurface}<Button size="sm" variant="ghost" onclick={() => chooseSurface(null)}><ArrowLeft data-icon="inline-start" /> Back</Button>{/if}
              {#if !activeSurface && primaryProfileAction}
                <ButtonGroup.Root><Button size="sm" variant="outline" disabled={!activeWorktree} onclick={() => void runProfileAction(primaryProfileAction)}><Play data-icon="inline-start" /> {primaryProfileAction.name}</Button><DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} size="icon-sm" variant="outline" aria-label="Choose profile action"><ChevronDown /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end"><DropdownMenu.Group>{#each profileUiPreferences?.header.customActions ?? [] as action (action.id)}<DropdownMenu.Item onclick={() => void runProfileAction(action)}><Play />{action.name}{#if action.keybinding}<DropdownMenu.Shortcut>{action.keybinding}</DropdownMenu.Shortcut>{/if}</DropdownMenu.Item>{/each}<DropdownMenu.Item onclick={() => chooseSurface('profiles')}><Plus />Configure actions</DropdownMenu.Item></DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root></ButtonGroup.Root>
              {/if}
              {#if !activeSurface && profileUiPreferences?.header.gitEnabled && activeWorktree}
                <ButtonGroup.Root><Button size="sm" variant="outline" onclick={() => chooseGitAction(profileUiPreferences?.header.primaryGitAction ?? 'commit')}>{#if profileUiPreferences?.header.primaryGitAction === 'push'}<Upload data-icon="inline-start" /> Push{:else if profileUiPreferences?.header.primaryGitAction === 'create-pr'}<GitPullRequest data-icon="inline-start" /> Create PR{:else}<GitCommitHorizontal data-icon="inline-start" /> Commit{/if}</Button><DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} size="icon-sm" variant="outline" aria-label="Choose Git action"><ChevronDown /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end"><DropdownMenu.Group><DropdownMenu.Item onclick={() => chooseGitAction('commit')}><GitCommitHorizontal />Commit</DropdownMenu.Item><DropdownMenu.Item onclick={() => chooseGitAction('push')}><Upload />Push</DropdownMenu.Item><DropdownMenu.Item onclick={() => chooseGitAction('create-pr')}><GitPullRequest />Create PR</DropdownMenu.Item></DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root></ButtonGroup.Root>
              {/if}
            </div>
          </header>
          <div class="primary-layout" data-terminal-open={terminalOpen}>
          <div class="primary-canvas">
          {#if activeSurface === 'capabilities'}
            <CapabilitiesCenter />
          {:else if activeSurface}
            <OperationsCenter family={activeSurface} />
          {:else}
            <Conversation.Root class="conversation-root"><Conversation.Content class={activeSessionId ? 'conversation-content' : 'new-conversation-content'}>
              {#if workspaceStarting}<div class="workspace-loading" role="status"><span class="workspace-loading-mark" aria-hidden="true"><Sparkles /></span><span>Preparing workspace…</span></div>
              {:else if messages.length}
                {#each messages as message, messageIndex (message.id)}
                  {@const role = message.role === 'user' ? 'user' : 'assistant'}
                  {@const streaming = message.generation?.status === 'streaming'}
                  <Message.Root from={role} class="conversation-message" data-generation-status={message.generation?.status ?? undefined}>
                    <div class="message-author" data-message-role={role}>
                      <span>{message.role === 'user' ? 'You' : message.role === 'tool' ? 'Tool result' : 'Hermes'}</span>
                      {#if message.createdAt}<time datetime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{/if}
                      {#if role === 'assistant' && message.inference}
                        <ModelProvenance inference={message.inference} />
                      {/if}
                    </div>
                    <Message.Content>
                      {#if message.reasoning}<Reasoning.Root defaultOpen={streaming} isStreaming={streaming} duration={streaming ? undefined : 12}><Reasoning.Trigger status={streaming && profileUiPreferences?.thinkingStatus === 'personality' ? message.thinkingStatus : null} /><Reasoning.Content content={message.reasoning} /></Reasoning.Root>{/if}
                      {#if message.text}<Message.Response content={message.text} />
                      {:else if streaming && profileUiPreferences?.thinkingStatus !== 'hidden'}<Shimmer class="response-pending">{profileUiPreferences?.thinkingStatus === 'personality' && message.thinkingStatus ? message.thinkingStatus : 'Thinking…'}</Shimmer>{/if}
                      {#if message.attachments.length}<Message.Attachments class="message-attachments">{#each message.attachments as attachment}<Message.Attachment class="message-attachment" data={attachment} />{/each}</Message.Attachments>{/if}
                      {#if message.toolCalls.length}<div class="tool-list">{#each message.toolCalls as tool}<div><Wrench /><span>{tool.name}</span><Badge variant="outline">{tool.status}</Badge></div>{/each}</div>{/if}
                      {#if activeTurnApproval && message.generation?.requestId === activeTurnApproval.requestId}
                        <div class="chat-approval" role="group" aria-label={`Respond to approval: ${activeTurnApproval.summary}`}>
                          <div><ShieldCheck /><span><strong>Hermes approval required</strong><small>{activeTurnApproval.summary}</small></span></div>
                          <div><Button size="xs" variant="outline" disabled={approvalResponsePending} onclick={() => void respondToActiveApproval('once')}>Allow once</Button><Button size="xs" variant="outline" disabled={approvalResponsePending} onclick={() => void respondToActiveApproval('session')}>Allow for session</Button>{#if activeTurnApproval.allowPermanent}<Button size="xs" variant="outline" disabled={approvalResponsePending} onclick={() => void respondToActiveApproval('always')}>Always allow</Button>{/if}<Button size="xs" variant="destructive" disabled={approvalResponsePending} onclick={() => void respondToActiveApproval('deny')}>Deny</Button></div>
                        </div>
                      {/if}
                      {#if message.generation?.status === 'failed' || message.generation?.status === 'interrupted'}<span class="message-generation-state" data-tone="negative">Response interrupted</span>
                      {:else if message.generation?.status === 'cancelled'}<span class="message-generation-state">Stopped</span>{/if}
                    </Message.Content>
                    {#if message.role === 'user' && message.text.trim()}<Button class="message-restore" size="icon-xs" variant="ghost" disabled={sending} aria-label="Restore checkpoint from this prompt" title="Restore checkpoint — rerun from this prompt" onclick={() => requestCheckpointRestore(messageIndex)}><RotateCcw /></Button>{/if}
                  </Message.Root>
                {/each}
              {:else if activeSessionId}<Conversation.EmptyState title="" description=""><div class="session-empty-state">{#if sessionHistoryError}<CircleAlert /><h1>History unavailable</h1><p>{sessionHistoryError}</p><div><Button size="sm" variant="outline" onclick={() => void selectSession(activeSessionId!)}>Retry</Button><Button size="sm" variant="ghost" onclick={() => { sessionActionTargetId = activeSessionId; sessionActionsOpen = true; }}>Manage session</Button><Button size="sm" variant="ghost" onclick={() => newSession()}>New chat</Button></div>{:else}<h1>No messages yet</h1><p>Send a message to begin this session.</p>{/if}</div></Conversation.EmptyState>
              {:else}<Conversation.EmptyState title="Start with Hermes" description=""><div class="welcome-state"><div class="welcome-mark"><Sparkles /></div><h1>Ask Hermes anything</h1><p>{composerAvailable ? 'Start a conversation, plan work, or continue an existing session.' : 'Connect Hermes or configure OpenRouter to begin.'}</p>
                <div class="new-session-composer"><ChatComposer
                  id="new-session-composer" placement="new-session" bind:prompt busy={sending}
                  project={activeComposerProjectContext} branchOptions={composerBranchOptions}
                  model={activeComposerModel} models={composerModels}
                  contextUsage={composerShowsContext ? contextUsage : null} contextReason={contextUsageReason} permission={composerShowsApproval ? composerPermission : null} permissionOptions={composerShowsApproval ? composerPermissionOptions : []} completions={composerCompletions}
                  quickActions={composerQuickActions} suggestions={composerSuggestions}
                  onSubmit={submitComposer} onStop={stopActiveTurn} onModelChange={(value) => (activeModelKey = modelSelectionKey(value.source, value.id, value.runtimeProvider))}
                  onPermissionChange={(id) => void setApprovalMode(id as 'manual' | 'smart' | 'off')} onCompletionSelect={selectComposerCompletion}
                /></div>
              </div></Conversation.EmptyState>{/if}
            </Conversation.Content><Conversation.ScrollButton /></Conversation.Root>
            {#if activeSessionId}<div class="composer-dock"><ChatComposer
              id="conversation-composer" placement="conversation" presentation="compact" bind:prompt busy={sending}
              project={activeComposerProjectContext} branchOptions={composerBranchOptions}
              onBranchChange={selectComposerBranch}
              model={activeComposerModel} models={composerModels}
              contextUsage={composerShowsContext ? contextUsage : null} contextReason={contextUsageReason} permission={composerShowsApproval ? composerPermission : null} permissionOptions={composerShowsApproval ? composerPermissionOptions : []} completions={composerCompletions}
              onSubmit={submitComposer} onStop={stopActiveTurn} onModelChange={(value) => (activeModelKey = modelSelectionKey(value.source, value.id, value.runtimeProvider))}
              onPermissionChange={(id) => void setApprovalMode(id as 'manual' | 'smart' | 'off')} onCompletionSelect={selectComposerCompletion}
            /></div>{/if}
          {/if}
          </div>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div class="pane-resizer terminal-resizer" role="separator" aria-label="Resize bottom panel" aria-orientation="horizontal" aria-valuemin="176" aria-valuemax="1000" aria-valuenow={terminalHeight} aria-hidden={!terminalOpen} inert={!terminalOpen} tabindex={terminalOpen ? 0 : -1} onkeydown={(event) => resizePanelFromKeyboard(event, 'terminal')} onpointerdown={(event) => startPanelResize(event, 'terminal')}></div>
          <div class="terminal-split-region" aria-hidden={!terminalOpen} inert={!terminalOpen}>
            {#if workspaceLayoutInteractive}<TerminalSplit bind:this={terminalSplit} worktree={activeWorktree} unavailableReason={workspaceUnavailableReason} oncollapse={() => { terminalOpen = false; queueWorkspaceLayoutPersistence(workspaceLayoutIdentity, snapshotWorkspaceLayout()); }} />{/if}
          </div>
          </div>
          {/if}
        </section>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="pane-resizer inspector-resizer" role="separator" aria-label="Resize right panel" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="1000" aria-valuenow={inspectorWidth} aria-hidden={!inspectorVisible} inert={!inspectorVisible} tabindex={inspectorVisible ? 0 : -1} onkeydown={(event) => resizePanelFromKeyboard(event, 'inspector')} onpointerdown={(event) => startPanelResize(event, 'inspector')}></div>
      <aside id="workspace-inspector" class="inspector-pane" aria-hidden={!inspectorVisible} inert={!inspectorVisible}><WorkspaceDock worktree={activeWorktree} gitWorkspace={activeGitWorkspace} unavailableReason={workspaceUnavailableReason} {browserOwnerKey} {browserLeaseId} visible={inspectorVisible} bind:dockTab bind:openTabs={dockTabs} onchanged={() => { void loadWorkspace(); }} onopenworktrees={() => openProjectDialog('worktrees')} onfullscreenchange={(value, identity) => { if (identity.ownerKey === browserOwnerKey && identity.browserLeaseId === browserLeaseId) fullscreenPreview = value; }} /></aside>
    </div>
  </main>
  {#if fullscreenPreview}<div class="floating-composer-shell">
    <Button class="preview-exit" type="button" size="icon-sm" variant="ghost" onclick={exitFullscreenPreview} aria-label="Exit full-screen preview"><Minimize2 /></Button>
    <ChatComposer id="preview-composer" placement="overlay" presentation="peek" bind:prompt busy={sending} placeholder="Ask Hermes to change this preview…"
      model={activeComposerModel} models={composerModels} contextUsage={composerShowsContext ? contextUsage : null} contextReason={contextUsageReason} completions={composerCompletions}
      onSubmit={submitComposer} onStop={stopActiveTurn} onModelChange={(value) => (activeModelKey = modelSelectionKey(value.source, value.id, value.runtimeProvider))}
      onCompletionSelect={selectComposerCompletion} />
  </div>{/if}
  <footer class="status-bar" aria-label="Workspace status">
    <div class="status-group status-left">
      <Button size="xs" variant="ghost" title="Command center" onclick={() => (commandOpen = true)}><CommandIcon data-icon="inline-start" /> Command center</Button>
      <Button class="status-gateway" size="xs" variant="ghost" data-tone={gatewayTone} title={overview?.gateway.compatibility.reason ?? 'Manage gateway connection'} onclick={() => (connectOpen = true)}><Wifi data-icon="inline-start" /><span>Gateway</span><small>{overview?.gateway.status ?? 'Checking'}</small></Button>
      {#if capabilityFor('agents')?.available}<Button size="xs" variant={inspectorVisible && dockTab === 'agents' ? 'secondary' : 'ghost'} disabled={!workspaceLayoutInteractive} title="Live Hermes subagents" onclick={openAgentsDock}><Bot data-icon="inline-start" /> Agents</Button>{/if}
      {#if capabilityFor('jobs')?.available}<Button size="xs" variant="ghost" title="Scheduled jobs" onclick={() => chooseSurface('jobs')}><Timer data-icon="inline-start" /> Cron</Button>{/if}
    </div>
    <div class="status-group status-right">
      {#if activeSession}<span class="status-item" title={activeSession.title}><Clock3 /> {sessionElapsed}</span>{/if}
      {#if statusShowsContext && contextUsage}<ContextUsagePopover id="status-context-usage" usage={contextUsage} compact trigger="status" />{/if}
      {#if statusShowsApproval && approvalMode}<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} size="xs" variant="ghost" title={`Hermes approval mode: ${composerPermission.label}`} disabled={approvalPending}><ShieldCheck data-icon="inline-start" /> {composerPermission.label}</Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content class="status-approval-menu" align="end" side="top" sideOffset={6}><DropdownMenu.Label>Approval mode</DropdownMenu.Label><DropdownMenu.Group>{#each composerPermissionOptions as option (option.id)}<DropdownMenu.Item onclick={() => void setApprovalMode(option.id as 'manual' | 'smart' | 'off')}><span class="status-menu-copy"><strong>{option.label}</strong><small>{option.description}</small></span>{#if option.id === approvalMode}<Check />{/if}</DropdownMenu.Item>{/each}</DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root>{/if}
      <Button size="xs" variant={terminalOpen ? 'secondary' : 'ghost'} disabled={!workspaceLayoutInteractive} onclick={toggleTerminal} aria-pressed={terminalOpen} aria-label={terminalOpen ? 'Hide terminal' : 'Show terminal'} title={terminalOpen ? 'Hide terminal' : 'Show terminal'}><SquareTerminal /></Button>
    </div>
  </footer>
  <div class="visually-hidden" aria-live="polite">{announcement}</div>
</div>

<AppNotification message={error} ondismiss={() => (error = '')} />

<ConnectionDialog bind:open={connectOpen} connection={overview?.connections.find((connection) => connection.id === overview?.gateway.connection.id) ?? overview?.gateway.connection ?? null} onconnected={() => void loadWorkspace(true, true)} />
<ProfileDialog bind:open={profileOpen} profiles={overview?.profiles ?? []} oncreated={() => { newSession(); void loadWorkspace(true, true); }} />
<RestoreCheckpointDialog bind:open={restoreDialogOpen} prompt={restoreTarget?.text ?? ''} pending={sending} onrestore={() => void confirmCheckpointRestore()} />
<ProjectDialog bind:open={projectsOpen} mode={projectDialogMode} projects={overview?.projects ?? []} worktrees={overview?.worktrees ?? []} connectionKind={overview?.gateway.connection.kind ?? 'local'} onchanged={() => loadWorkspace()} oncreated={startProjectThread} />
<ProjectActionsDialog bind:open={projectActionsOpen} project={overview?.projects.find((project) => project.id === projectActionTargetId) ?? null} onchanged={() => loadWorkspace(true)} ondeleted={(projectId) => void handleProjectDeleted(projectId)} />
<WorktreeDialog bind:open={worktreeOpen} project={overview?.projects.find((project) => project.id === worktreeProjectTargetId) ?? null} repositoryPaths={worktreeRepositoryPaths} oncreated={startWorktreeThread} />
<WorktreeRemoveDialog bind:open={worktreeRemoveOpen} target={worktreeRemoveTarget} onremoved={(path) => void handleWorktreeRemoved(path)} />
<SessionActionsDialog bind:open={sessionActionsOpen} session={overview?.sessions.find((session) => session.id === sessionActionTargetId) ?? activeSession} archiveAvailable={sessionManagementAvailable} onchanged={() => loadWorkspace(true)} ondeleted={(sessionId) => void handleSessionDeleted(sessionId)} />
<CommandMenu.Dialog bind:open={commandOpen} onOpenChange={(nextOpen) => { if (!nextOpen) resetCommandPaletteSearch(); }} filter={commandPaletteFilter} class="companion-command-palette" title="Hermes Companion commands" description="Run actions, reopen recent work, jump directly to settings, or send a prompt.">
  <CommandMenu.Input bind:value={commandQuery} placeholder="Search, navigate, or ask Hermes…" />
  <CommandMenu.List>
    <CommandMenu.Empty>No matching command.</CommandMenu.Empty>
    {#if commandQuery.trim()}
      <CommandMenu.Group heading="Send">
        <CommandMenu.Item value="send-to-hermes" onSelect={() => void submitCommandPalettePrompt()} class="command-prompt-item"><SquarePen /><span class="command-result-copy"><strong>Send to Hermes</strong><small>{commandQuery}</small></span><CommandMenu.Shortcut>↵</CommandMenu.Shortcut></CommandMenu.Item>
      </CommandMenu.Group>
      <CommandMenu.Separator />
    {/if}
    {#if commandQuery.trim().length >= 2 && (commandSessionSearching || commandSessionResults.length)}
      <CommandMenu.Group heading="Sessions">
        {#if commandSessionSearching && !commandSessionResults.length}
          <CommandMenu.Item value={`${commandQuery} searching sessions`} disabled><Search /><span>Searching sessions…</span></CommandMenu.Item>
        {:else}
          {#each commandSessionResults as result (`${result.profileId ?? 'default'}:${result.sessionId}`)}
            <CommandMenu.Item value={`session ${result.session.title} ${result.snippet}`} keywords={[result.profileId ?? 'default', result.role ?? '', result.session.source]} onSelect={() => void openCommandSessionResult(result)}><MessageCircle /><span class="command-result-copy"><strong>{result.session.title}</strong><small>{result.snippet}</small></span></CommandMenu.Item>
          {/each}
        {/if}
      </CommandMenu.Group>
      <CommandMenu.Separator />
    {/if}
    <CommandMenu.Group heading="Actions">
      {#each profileUiPreferences?.header.customActions ?? [] as action (action.id)}<CommandMenu.Item disabled={!activeWorktree} onclick={() => { commandOpen = false; void runProfileAction(action); }}><Play /><span>{action.name}</span>{#if action.keybinding}<CommandMenu.Shortcut>{action.keybinding}</CommandMenu.Shortcut>{/if}</CommandMenu.Item>{/each}
      <CommandMenu.Item onclick={() => { void newSession(); commandOpen = false; }}><SquarePen /><span>New chat</span><CommandMenu.Shortcut>⌘N</CommandMenu.Shortcut></CommandMenu.Item>
      <CommandMenu.Item onclick={() => { openProjectDialog(); commandOpen = false; }}><FolderGit2 /><span>Add project or folder</span></CommandMenu.Item>
    </CommandMenu.Group>
    <CommandMenu.Separator />
    <CommandMenu.Group heading="Recents">
      {#each recentSessions as session (session.id)}<CommandMenu.Item onclick={() => { void selectSession(session.id); commandOpen = false; }}><Clock3 /><span>{session.title}</span><small>{session.projectId ? overview?.projects.find((project) => project.id === session.projectId)?.name : session.source}</small></CommandMenu.Item>{/each}
    </CommandMenu.Group>
    <CommandMenu.Separator />
    <CommandMenu.Group heading="Command center">
      <CommandMenu.Item disabled={overview?.gateway.status === 'disconnected'} onclick={() => void runCommandCenterAction('gateway-restart')}><RotateCw /><span>Restart gateway</span></CommandMenu.Item>
      <CommandMenu.Item disabled={overview?.gateway.status === 'disconnected'} onclick={() => void runCommandCenterAction('doctor')}><Stethoscope /><span>Run diagnostics</span></CommandMenu.Item>
      <CommandMenu.Item onclick={() => chooseSurface('health')}><Server /><span>Open system health</span></CommandMenu.Item>
    </CommandMenu.Group>
    <CommandMenu.Separator />
    <CommandMenu.Group heading="Settings">
      {#each settingsSections as section (section.id)}
        {#each section.items as item (`${section.id}:${item.id}`)}
          <CommandMenu.Item value={`${section.label} ${item.label}`} keywords={[section.description, item.description, ...(item.keywords ?? [])]} onSelect={() => openSettings(section.id, item.id)} class="command-setting-item"><Settings /><span class="command-result-copy"><strong>{section.label} › {item.label}</strong><small>{item.description}</small></span></CommandMenu.Item>
        {/each}
      {/each}
    </CommandMenu.Group>
  </CommandMenu.List>
</CommandMenu.Dialog>

<style>
  .shell-boot { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; background: var(--surface-floor); color: var(--muted-foreground); opacity: 0; pointer-events: none; visibility: hidden; transition: opacity var(--motion-enter) var(--ease-standard), visibility 0s linear var(--motion-enter); }
  .shell-boot[data-visible='true'] { opacity: 1; visibility: visible; transition-delay: 0s; }
  .shell-boot :global(svg) { inline-size: 1rem; block-size: 1rem; animation: shell-boot-pulse var(--motion-status-cycle) var(--ease-standard) infinite; }
  .companion-shell[data-shell-presented='true'] { animation: shell-content-enter var(--motion-enter) var(--ease-standard) both; }
  .companion-shell { --window-safe-inline-start: .5rem; --shell-sidebar-track: min(var(--shell-sidebar-width), max(14rem, calc(30dvi - 4rem))); --shell-inspector-track: min(var(--shell-inspector-width), max(17.5rem, calc(37dvi - 4.5rem))); position: relative; block-size: 100dvh; display: grid; grid-template-columns: var(--shell-sidebar-track) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) var(--shell-status-height); overflow: hidden; background: var(--background); transition: --shell-sidebar-track var(--motion-layout) var(--ease-standard); }
  .companion-shell[data-sidebar-visible='false'] { --shell-sidebar-track: 0px; }
  .companion-shell[data-preview-fullscreen='true'] { grid-template-columns: minmax(0, 1fr); }
  .companion-shell[data-preview-fullscreen='true'] > .session-sidebar, .companion-shell[data-preview-fullscreen='true'] .workspace-header { display: none; }
  .companion-shell[data-preview-fullscreen='true'] .workspace { grid-column: 1; grid-template-rows: minmax(0, 1fr); }
  .companion-shell[data-sidebar-visible='false'] > .session-sidebar { border-inline-end-color: transparent; opacity: 0; translate: -100% 0; pointer-events: none; }
  .shell-chrome { display: contents; }
  .chrome-leading, .chrome-trailing { position: fixed; inset-block-start: 0; block-size: var(--shell-titlebar-height); display: flex; align-items: center; gap: .1rem; z-index: 100; pointer-events: auto; -webkit-app-region: no-drag; }
  .chrome-leading { inset-inline-start: var(--window-safe-inline-start); }
  .chrome-trailing { inset-inline-end: .45rem; }
  .shell-chrome :global(button) { position: relative; z-index: 1; pointer-events: auto; -webkit-app-region: no-drag; color: var(--muted-foreground); }
  .shell-chrome :global(button:hover:not(:disabled)), .shell-chrome :global(button:focus-visible) { color: var(--foreground); }
  .shell-chrome :global(button:disabled) { opacity: .3; }
  .session-sidebar { grid-column: 1; grid-row: 1; inline-size: var(--shell-sidebar-track); min-inline-size: var(--shell-sidebar-track); min-block-size: 0; justify-self: start; display: flex; flex-direction: column; overflow: hidden; padding-block-start: var(--shell-titlebar-height); border-inline-end: 1px solid var(--border); background: var(--surface-pane); opacity: 1; translate: 0; transition: opacity var(--motion-enter) var(--ease-standard), translate var(--motion-layout) var(--ease-standard); will-change: translate; }
  .sidebar-header { min-block-size: 3.4rem; display: flex; align-items: center; justify-content: space-between; gap: .25rem; padding: .2rem .5rem .35rem; }
  .sidebar-header > :global([data-slot='dropdown-menu-trigger']) { min-inline-size: 0; inline-size: fit-content; flex: 0 1 auto; }
  .sidebar-header :global(button), .workspace-header :global(button) { -webkit-app-region: no-drag; }
  :global(.profile-switcher) { inline-size: fit-content; max-inline-size: calc(var(--shell-sidebar-track) - 3.4rem); justify-content: flex-start; gap: .35rem; block-size: 2.55rem; padding-inline: .55rem .45rem; border-radius: .85rem; text-align: start; }
  :global(.profile-switcher strong) { min-inline-size: 0; overflow: hidden; font-size: 1rem; font-weight: 625; letter-spacing: -.02em; text-overflow: ellipsis; white-space: nowrap; }
  :global(.profile-switcher .profile-chevron) { inline-size: .9rem; opacity: 0; translate: -.15rem 0; transition: opacity var(--motion-fast) ease, translate var(--motion-fast) ease; }
  :global(.profile-switcher:hover .profile-chevron), :global(.profile-switcher:focus-visible .profile-chevron), :global(.profile-switcher[data-state='open'] .profile-chevron) { opacity: 1; translate: 0 0; }
  .profile-menu-copy { min-inline-size: 0; display: grid; gap: .08rem; } .profile-menu-copy strong { overflow: hidden; font-size: var(--type-small); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; } .profile-menu-copy small { overflow: hidden; color: var(--muted-foreground); font-size: var(--type-caption); text-overflow: ellipsis; white-space: nowrap; } :global(.profile-menu) { inline-size: min(18rem, calc(100vw - 1rem)); } :global(.profile-menu [data-slot='dropdown-menu-item']) { align-items: start; }
  .sidebar-actions { display: grid; gap: .05rem; padding: .05rem .45rem .35rem; } .sidebar-actions :global(button) { justify-content: flex-start; }
  kbd { margin-inline-start: auto; color: var(--muted-foreground); font-family: var(--font-mono); font-size: var(--type-caption); }
  .pane-resizer { position: absolute; z-index: 24; touch-action: none; background: transparent; }
  .pane-resizer::after { content: ''; position: absolute; inset: .15rem; border-radius: 999px; background: transparent; transition: background var(--motion-fast) var(--ease-standard); }
  .pane-resizer:focus-visible { outline: none; }
  .pane-resizer:focus-visible::after { background: var(--ring); }
  .sidebar-resizer { inset-block: 0 var(--shell-status-height); inset-inline-start: calc(var(--shell-sidebar-track) - .3rem); inline-size: .6rem; cursor: col-resize; }
  .companion-shell[data-sidebar-visible='false'] .sidebar-resizer { opacity: 0; pointer-events: none; }
  .workspace { grid-column: 2; grid-row: 1; min-inline-size: 0; min-block-size: 0; block-size: 100%; overflow: hidden; }
  .workspace-panes { position: relative; min-inline-size: 0; min-block-size: 0; block-size: 100%; display: grid; grid-template-columns: minmax(0, 1fr) var(--shell-inspector-track); overflow: hidden; transition: grid-template-columns var(--motion-layout) var(--ease-standard); }
  .workspace-panes[data-inspector-visible='false'] { grid-template-columns: minmax(0, 1fr) 0; }
  .workspace-panes[data-inspector-visible='true'][data-inspector-mode='focused'] { grid-template-columns: 0 minmax(0, 1fr); }
  .inspector-resizer { inset-block: 0; inset-inline-end: calc(var(--shell-inspector-track) - .3rem); inline-size: .6rem; cursor: col-resize; }
  .workspace-panes[data-inspector-visible='false'] .inspector-resizer { opacity: 0; pointer-events: none; }
  .inspector-pane { grid-column: 2; inline-size: var(--shell-inspector-track); min-inline-size: var(--shell-inspector-track); min-block-size: 0; justify-self: end; overflow: hidden; border-inline-start: 1px solid var(--border); background: var(--surface-pane); opacity: 1; translate: 0; transition: opacity var(--motion-enter) var(--ease-standard), translate var(--motion-layout) var(--ease-standard); will-change: translate; }
  .workspace-panes[data-inspector-mode='focused'] .inspector-pane { inline-size: 100%; min-inline-size: 0; border-inline-start-color: transparent; }
  .workspace-panes[data-inspector-mode='focused'] .primary-pane { opacity: 0; pointer-events: none; }
  .workspace-panes[data-inspector-visible='false'] .inspector-pane { border-inline-start-color: transparent; opacity: 0; translate: 100% 0; pointer-events: none; }
  .workspace-header { min-block-size: var(--shell-titlebar-height); display: flex; align-items: safe center; gap: .65rem; padding: .3rem var(--shell-chrome-trailing-width) .3rem max(.75rem, calc(var(--window-safe-inline-start) + var(--shell-chrome-leading-width) - var(--shell-sidebar-track))); border-block-end: 1px solid var(--border); background: var(--background); -webkit-app-region: no-drag; }
  .header-context { min-inline-size: 0; display: flex; align-items: center; gap: .45rem; -webkit-app-region: drag; user-select: none; } .header-context strong { min-inline-size: 0; overflow: hidden; font-size: var(--type-body); font-weight: 590; text-overflow: ellipsis; white-space: nowrap; } .context-meta { flex: none; color: var(--muted-foreground); font-size: var(--type-caption); } .header-context :global(.badge) { flex: none; } .header-drag-space { min-inline-size: 1rem; align-self: stretch; flex: 1; -webkit-app-region: drag; } .header-actions { display: flex; align-items: center; gap: .12rem; }
  .primary-pane { grid-column: 1; block-size: 100%; min-inline-size: 0; min-block-size: 0; position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: clip; background: var(--surface-base); container: primary-pane / inline-size; }
  .primary-pane > :global(.settings-scroll) { grid-row: 1 / -1; min-block-size: 0; }
  .primary-layout { min-block-size: 0; position: relative; display: grid; grid-template-rows: minmax(0, 1fr) 0 0; transition: grid-template-rows var(--motion-layout) var(--ease-standard); }
  .primary-layout[data-terminal-open='true'] { grid-template-rows: minmax(11rem, 1fr) .5rem var(--shell-terminal-height); }
  .primary-canvas { --chat-rail-max-inline-size: 52rem; --chat-rail-padding-inline: clamp(.75rem, 4cqi, 2.5rem); min-block-size: 0; position: relative; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
  .terminal-resizer { position: relative; z-index: 4; inline-size: 100%; block-size: .5rem; cursor: row-resize; opacity: 0; pointer-events: none; }
  .primary-layout[data-terminal-open='true'] .terminal-resizer { opacity: 1; pointer-events: auto; }
  .terminal-split-region { min-block-size: 0; opacity: 0; overflow: hidden; pointer-events: none; transform: translateY(.75rem); transition: opacity var(--motion-enter) var(--ease-standard), transform var(--motion-layout) var(--ease-standard); }
  .primary-layout[data-terminal-open='true'] .terminal-split-region { opacity: 1; pointer-events: auto; transform: translateY(0); }
  :global(html[data-resizing]) { cursor: col-resize; user-select: none; }
  :global(html[data-resizing='terminal']) { cursor: row-resize; }
  :global(html[data-resizing]) .companion-shell, :global(html[data-resizing]) .workspace-panes, :global(html[data-resizing]) .primary-layout { transition-duration: 0ms; }
  .session-sidebar :global(li > button), .inspector-pane :global(li > button) { min-inline-size: 0; max-inline-size: 100%; }
  .session-sidebar :global(li > button span:not(.session-icons)), .inspector-pane :global(li > button span) { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.conversation-root) { min-block-size: 0; } :global(.conversation-content) { inline-size: min(100%, var(--chat-rail-max-inline-size)); margin-inline: auto; padding: clamp(1rem, 3cqi, 2.2rem) var(--chat-rail-padding-inline) 1rem; gap: 1.5rem; }
  :global(.new-conversation-content) { inline-size: 100%; max-inline-size: none; margin: 0; padding: 0; gap: 0; }
  .message-author { max-inline-size: 100%; display: flex; align-items: center; gap: .45rem; color: var(--muted-foreground); font-family: var(--font-ui); font-size: var(--type-caption); font-weight: 650; }
  .message-author[data-message-role='user'] { align-self: flex-end; justify-content: flex-end; }
  .message-author time { flex: none; font-weight: 400; }
  :global(.conversation-message) { position: relative; min-inline-size: 0; }
  :global(.conversation-message .message-restore) { position: absolute; inset-inline-end: -.15rem; inset-block-end: -.3rem; opacity: 0; transition: opacity var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard); }
  :global(.conversation-message:is(:hover, :focus-within) .message-restore) { opacity: 1; }
  :global(.response-pending) { color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-body); }
  .message-generation-state { align-self: flex-start; color: var(--muted-foreground); font-family: var(--font-ui); font-size: var(--type-status); }
  .message-generation-state[data-tone='negative'] { color: var(--status-negative); }
  .tool-list { display: grid; gap: .25rem; margin-block-start: .45rem; } .tool-list > div { display: flex; align-items: center; gap: .45rem; border-block-start: 1px solid var(--border); padding: .4rem .1rem; font-size: var(--type-small); } .tool-list :global(svg) { inline-size: .85rem; color: var(--muted-foreground); } .tool-list span { flex: 1; }
  .chat-approval { display: grid; gap: .55rem; margin-block-start: .55rem; border-radius: var(--radius); background: color-mix(in oklab, var(--status-warning), transparent 92%); padding: .65rem; }
  .chat-approval > div { display: flex; align-items: flex-start; gap: .45rem; }
  .chat-approval > div:first-child > :global(svg) { inline-size: .9rem; flex: none; margin-block-start: .1rem; color: var(--status-warning); }
  .chat-approval span { min-inline-size: 0; display: grid; gap: .12rem; }
  .chat-approval strong { font-size: var(--type-small); font-weight: 620; }
  .chat-approval small { overflow-wrap: anywhere; color: var(--muted-foreground); font-family: var(--font-mono); font-size: var(--type-caption); line-height: 1.45; }
  .chat-approval > div:last-child { flex-wrap: wrap; }
  :global(.message-attachments) { inline-size: 100%; margin-block: .65rem .25rem; }
  :global(.message-attachment) { inline-size: min(100%, 28rem); block-size: auto; aspect-ratio: 1.6; margin-inline-start: 0; border: 1px solid var(--border); }
  .welcome-state { inline-size: min(56rem, calc(100cqi - 2rem)); display: flex; flex-direction: column; align-items: center; gap: .5rem; translate: 0 -3%; } .welcome-mark { display: grid; place-items: center; inline-size: 2.1rem; block-size: 2.1rem; border-radius: .7rem; background: color-mix(in oklab, var(--primary), transparent 82%); color: var(--primary); } .welcome-mark :global(svg) { inline-size: 1rem; } .welcome-state h1 { margin: .15rem 0 0; font-size: clamp(1.2rem, 4cqi, 1.55rem); font-weight: 610; letter-spacing: -.03em; text-wrap: balance; } .welcome-state p { max-inline-size: 44ch; margin: 0; color: var(--muted-foreground); font-size: .76rem; line-height: 1.55; text-wrap: pretty; }
  .session-empty-state { inline-size: min(100% - 2rem, 28rem); display: grid; justify-items: center; gap: .45rem; margin-inline: auto; color: var(--muted-foreground); text-align: center; }
  .session-empty-state > :global(svg) { inline-size: 1rem; color: var(--status-negative); }
  .session-empty-state h1, .session-empty-state p { margin: 0; }
  .session-empty-state h1 { color: var(--foreground); font-size: var(--type-body); font-weight: 600; }
  .session-empty-state p { max-inline-size: 42ch; overflow-wrap: anywhere; font-family: var(--font-body); font-size: var(--type-small); line-height: 1.5; }
  .session-empty-state > div { display: flex; gap: .25rem; }
  .new-session-composer { inline-size: 100%; margin-block-start: .85rem; text-align: start; }
  .workspace-loading { min-block-size: min(22rem, 56dvh); display: grid; place-content: center; justify-items: center; gap: .5rem; color: var(--muted-foreground); font-family: var(--font-ui); font-size: var(--type-status); }
  .workspace-loading-mark { display: grid; place-items: center; inline-size: 1.8rem; block-size: 1.8rem; border-radius: .6rem; background: color-mix(in oklab, var(--primary), transparent 84%); color: var(--primary); }
  .workspace-loading-mark :global(svg) { inline-size: .85rem; block-size: .85rem; }
  .composer-dock { inline-size: min(100%, var(--chat-rail-max-inline-size)); position: relative; z-index: 5; margin: 0 auto clamp(.6rem, 2cqi, .9rem); padding-inline: var(--chat-rail-padding-inline); }
  .floating-composer-shell { position: fixed; inset-inline-start: 50%; inset-block-end: 1rem; z-index: 60; inline-size: min(42rem, calc(100vw - 2rem)); transform: translateX(-50%); }
  :global(.preview-exit) { position: absolute; inset-inline-start: -2.5rem; inset-block-end: .25rem; opacity: 0; transition: opacity var(--motion-fast) var(--ease-standard); }
  .floating-composer-shell:is(:hover, :focus-within) :global(.preview-exit) { opacity: 1; }
  .status-bar { grid-column: 1 / -1; grid-row: 2; min-inline-size: 0; display: flex; align-items: center; justify-content: space-between; gap: .5rem; overflow: hidden; border-block-start: 1px solid var(--border); background: color-mix(in oklab, var(--sidebar), black 10%); color: var(--muted-foreground); font-size: var(--type-caption); }
  .status-bar, .status-bar :global(button), .status-bar :global(small), .status-bar :global(span) { font-family: var(--font-mono); letter-spacing: 0; }
  .status-group { min-inline-size: 0; display: flex; align-items: stretch; gap: .05rem; overflow: hidden; } .status-left { padding-inline-start: .2rem; } .status-right { justify-content: flex-end; padding-inline-end: .2rem; }
  .status-group :global(button) { block-size: var(--shell-status-height); border-radius: calc(var(--radius) * .45); color: var(--muted-foreground); font-size: var(--type-caption); } .status-group :global(button:hover:not(:disabled)) { background: var(--sidebar-accent); color: var(--foreground); } .status-group :global(button small) { color: var(--muted-foreground); font-size: var(--type-caption); } .status-group :global(button svg) { inline-size: .7rem; }
  .status-group :global(.status-gateway > span) { color: var(--muted-foreground); font-weight: 450; }
  .status-group :global(.status-gateway:hover > span), .status-group :global(.status-gateway:focus-visible > span) { color: var(--foreground); }
  .status-group :global(.status-gateway > small) { color: color-mix(in oklab, var(--muted-foreground), transparent 18%); font-weight: 400; }
  :global(.status-approval-menu) { inline-size: min(18rem, calc(100dvi - 1rem)); }
  .status-menu-copy { min-inline-size: 0; display: grid; gap: .05rem; } .status-menu-copy strong { font-size: var(--type-menu); font-weight: 560; } .status-menu-copy small { color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); line-height: 1.35; }
  .status-item { min-inline-size: 0; display: flex; align-items: center; gap: .3rem; padding-inline: .45rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .status-item :global(svg) { inline-size: .72rem; flex: none; }
  :global(.status-yolo) { color: var(--foreground) !important; }
  @media (max-width: 70rem) { .status-group :global(button span), .status-item { max-inline-size: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
  @media (max-width: 52rem) { .status-left :global(button:nth-child(2) span), .status-left :global(button:nth-child(3) span), .status-right :global(button:nth-last-child(-n+2) span), .status-right :global(button small) { display: none; } }
  .companion-shell[data-native-platform='darwin'] { --window-safe-inline-start: var(--titlebar-safe-inline-start); }
  @media (max-width: 70rem) { .context-meta { display: none; } }
  :global(.companion-command-palette) { inline-size: min(42rem, calc(100vw - 2rem)); max-inline-size: none; }
  :global(.companion-command-palette [data-slot='command-input-wrapper']) { padding: .45rem .45rem 0; }
  :global(.companion-command-palette [data-slot='command-input']) { font-size: .86rem; }
  :global(.companion-command-palette [data-slot='command-list']) { max-block-size: min(34rem, 62dvh); }
  :global(.companion-command-palette [data-slot='command-group']) { padding: .35rem; }
  :global(.companion-command-palette [data-slot='command-group'] [cmdk-group-heading]) { padding: .35rem .45rem; font-size: .65rem; letter-spacing: .02em; }
  :global(.companion-command-palette [data-slot='command-item']) { min-inline-size: 0; gap: .55rem; padding: .44rem .5rem; font-size: .72rem; line-height: 1.25; }
  :global(.companion-command-palette [data-slot='command-item'] > span:not(.command-result-copy)) { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .command-result-copy { min-inline-size: 0; display: flex; flex: 1; align-items: baseline; gap: .45rem; overflow: hidden; }
  .command-result-copy strong { min-inline-size: 0; overflow: hidden; font-size: .72rem; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
  .command-result-copy small { min-inline-size: 0; overflow: hidden; color: var(--muted-foreground); font-family: var(--font-body); font-size: .64rem; text-overflow: ellipsis; white-space: nowrap; }
  :global(.companion-command-palette .command-prompt-item) { background: color-mix(in oklab, var(--primary), transparent 92%); }
  :global(.companion-command-palette .command-prompt-item[data-selected]) { background: color-mix(in oklab, var(--primary), transparent 84%); }
  @media (max-width: 42rem) { :global(.companion-command-palette) { inline-size: calc(100vw - 1rem); } .command-result-copy small { display: none; } }
  @keyframes shell-content-enter { from { opacity: 0; } to { opacity: 1; } }
  @keyframes shell-boot-pulse { 50% { opacity: .45; scale: .88; } }
  @media (prefers-reduced-motion: reduce) { .shell-boot :global(svg) { animation: none; } .companion-shell[data-shell-presented='true'] { animation: none; } }
</style>
