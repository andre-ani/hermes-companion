import { z } from 'zod';

export { z };

export const AppMode = z.enum(['chat', 'code']);
export type AppMode = z.infer<typeof AppMode>;

export const ProfileKind = z.enum(['local', 'remote']);
export type ProfileKind = z.infer<typeof ProfileKind>;
export const GatewayConnection = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().max(280).default(''),
  kind: ProfileKind,
  url: z.string().url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), 'Gateway must use HTTP or HTTPS'),
  controlUrl: z.string().url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), 'Control service must use HTTP or HTTPS').nullable().default(null),
  serveUrl: z.string().url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), 'Hermes Serve must use HTTP or HTTPS').nullable().default(null),
  serveWsUrl: z.string().url().refine((url) => ['ws:', 'wss:'].includes(new URL(url).protocol), 'Hermes serve must use WS or WSS').nullable().default(null),
  bridgeUrl: z.string().url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), 'Bridge must use HTTP or HTTPS').nullable().default(null),
  hermesProfileId: z.string().min(1).nullable().default(null)
});
export type GatewayConnection = z.infer<typeof GatewayConnection>;

export const HermesProfile = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  isDefault: z.boolean().default(false),
  model: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  skillCount: z.number().int().nonnegative().default(0)
});
export type HermesProfile = z.infer<typeof HermesProfile>;

export const HermesSubagent = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable().default(null),
  goal: z.string().default('Subagent task'),
  model: z.string().nullable().default(null),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'interrupted', 'unknown']).default('unknown'),
  depth: z.number().int().nonnegative().default(0),
  startedAt: z.number().nonnegative().nullable().default(null),
  toolCount: z.number().int().nonnegative().default(0)
});
export type HermesSubagent = z.infer<typeof HermesSubagent>;

export const HermesDelegationStatus = z.object({
  active: z.array(HermesSubagent).default([]),
  paused: z.boolean().default(false),
  maxSpawnDepth: z.number().int().nonnegative().nullable().default(null),
  maxConcurrentChildren: z.number().int().nonnegative().nullable().default(null),
  updatedAt: z.string().datetime()
});
export type HermesDelegationStatus = z.infer<typeof HermesDelegationStatus>;

export const HermesKanbanTask = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().nullable().default(null),
  status: z.string().min(1),
  priority: z.number().int().default(0),
  assignee: z.string().nullable().default(null),
  tenant: z.string().nullable().default(null),
  projectId: z.string().nullable().default(null),
  branch: z.string().nullable().default(null),
  createdAt: z.number().int().nullable().default(null),
  startedAt: z.number().int().nullable().default(null),
  completedAt: z.number().int().nullable().default(null),
  summary: z.string().nullable().default(null),
  commentCount: z.number().int().nonnegative().default(0),
  parentCount: z.number().int().nonnegative().default(0),
  childCount: z.number().int().nonnegative().default(0)
});
export type HermesKanbanTask = z.infer<typeof HermesKanbanTask>;

export const HermesKanbanStatus = z.enum(['triage', 'todo', 'scheduled', 'ready', 'blocked', 'done', 'archived']);
export type HermesKanbanStatus = z.infer<typeof HermesKanbanStatus>;

const HermesKanbanBoardSlug = z.string().trim().min(1).max(240);
const HermesKanbanTaskId = z.string().trim().min(1).max(240);

export const HermesKanbanCreateInput = z.object({
  board: HermesKanbanBoardSlug,
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().max(20_000).default(''),
  assignee: z.string().trim().max(240).default(''),
  priority: z.number().int().min(-100).max(100).default(0),
  triage: z.boolean().default(true)
});
export type HermesKanbanCreateInput = z.infer<typeof HermesKanbanCreateInput>;

export const HermesKanbanUpdateInput = z.object({
  board: HermesKanbanBoardSlug,
  taskId: HermesKanbanTaskId,
  status: HermesKanbanStatus.optional(),
  assignee: z.string().trim().max(240).optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  body: z.string().max(20_000).optional(),
  summary: z.string().max(20_000).optional(),
  blockReason: z.string().max(2_000).optional()
});
export type HermesKanbanUpdateInput = z.infer<typeof HermesKanbanUpdateInput>;

export const HermesKanbanDeleteInput = z.object({ board: HermesKanbanBoardSlug, taskId: HermesKanbanTaskId });
export type HermesKanbanDeleteInput = z.infer<typeof HermesKanbanDeleteInput>;

export const HermesKanbanOverview = z.object({
  available: z.boolean(),
  currentBoard: z.string().nullable().default(null),
  boards: z.array(z.object({ slug: z.string().min(1), name: z.string().min(1), description: z.string().default(''), current: z.boolean().default(false), total: z.number().int().nonnegative().default(0) })).default([]),
  columns: z.array(z.object({ id: z.string().min(1), tasks: z.array(HermesKanbanTask).default([]) })).default([]),
  assignees: z.array(z.string()).default([]),
  error: z.string().nullable().default(null)
});
export type HermesKanbanOverview = z.infer<typeof HermesKanbanOverview>;

export const HermesLearningNode = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['memory', 'skill']),
  memorySource: z.enum(['memory', 'profile']).nullable().default(null),
  timestamp: z.number().nullable().default(null),
  category: z.string().default('Hermes'),
  useCount: z.number().int().nonnegative().default(0),
  state: z.string().default('active'),
  createdBy: z.string().nullable().default(null),
  pinned: z.boolean().default(false)
});
export type HermesLearningNode = z.infer<typeof HermesLearningNode>;

export const HermesLearningGraph = z.object({
  available: z.boolean(),
  nodes: z.array(HermesLearningNode).default([]),
  edges: z.array(z.object({ source: z.string().min(1), target: z.string().min(1) })).default([]),
  clusters: z.array(z.object({ category: z.string(), count: z.number().int().nonnegative() })).default([]),
  memory: z.array(z.object({ source: z.enum(['memory', 'profile']), timestamp: z.number().nullable().default(null), title: z.string(), body: z.string() })).default([]),
  stats: z.record(z.string(), z.unknown()).default({}),
  error: z.string().nullable().default(null)
});
export type HermesLearningGraph = z.infer<typeof HermesLearningGraph>;

export const HermesLearningNodeInput = z.object({ id: z.string().trim().min(1).max(500) });
export const HermesLearningNodeUpdateInput = HermesLearningNodeInput.extend({ content: z.string().max(100_000) });

export const HermesPetInfo = z.object({
  available: z.boolean().default(true), enabled: z.boolean().default(false), slug: z.string().nullable().default(null),
  displayName: z.string().nullable().default(null), scale: z.number().min(0.1).max(3).default(0.33),
  mime: z.string().nullable().default(null), spritesheetBase64: z.string().nullable().default(null),
  frameWidth: z.number().int().positive().nullable().default(null), frameHeight: z.number().int().positive().nullable().default(null),
  framesPerState: z.number().int().positive().default(6), framesByState: z.record(z.string(), z.number().int().positive()).default({}),
  framesByRow: z.record(z.string(), z.number().int().positive()).default({}), loopMs: z.number().int().positive().default(1100),
  stateRows: z.array(z.string()).default([]), error: z.string().nullable().default(null)
});
export type HermesPetInfo = z.infer<typeof HermesPetInfo>;

export const HermesPetGallery = z.object({
  available: z.boolean().default(true), enabled: z.boolean().default(false), active: z.string().default(''),
  pets: z.array(z.object({ slug: z.string().min(1), displayName: z.string().min(1), installed: z.boolean().default(false), curated: z.boolean().default(false), generated: z.boolean().default(false) })).default([]),
  info: HermesPetInfo, error: z.string().nullable().default(null)
});
export type HermesPetGallery = z.infer<typeof HermesPetGallery>;
export const HermesPetSelectInput = z.object({ slug: z.string().trim().min(1).max(240) });
export const HermesPetScaleInput = z.object({ scale: z.number().min(0.1).max(3) });

export const HermesAchievement = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().default('Hermes'),
  icon: z.string().default('award'),
  state: z.enum(['unlocked', 'discovered', 'secret']).default('discovered'),
  unlocked: z.boolean().default(false),
  tier: z.string().nullable().default(null),
  progress: z.number().nonnegative().default(0),
  progressPercent: z.number().min(0).max(100).default(0),
  nextThreshold: z.number().nonnegative().nullable().default(null),
  criteria: z.string().default('')
});
export type HermesAchievement = z.infer<typeof HermesAchievement>;

export const HermesAchievementsOverview = z.object({
  available: z.boolean(),
  achievements: z.array(HermesAchievement).default([]),
  unlockedCount: z.number().int().nonnegative().default(0),
  discoveredCount: z.number().int().nonnegative().default(0),
  secretCount: z.number().int().nonnegative().default(0),
  totalCount: z.number().int().nonnegative().default(0),
  stale: z.boolean().default(false),
  scanning: z.boolean().default(false),
  generatedAt: z.number().int().nullable().default(null),
  error: z.string().nullable().default(null)
});
export type HermesAchievementsOverview = z.infer<typeof HermesAchievementsOverview>;

export const SessionPresentation = z.enum(['sessions', 'projects', 'agents', 'chats', 'jobs']);
export type SessionPresentation = z.infer<typeof SessionPresentation>;

export const SessionTreeFilter = z.object({
  sources: z.array(z.enum(['chat', 'slack', 'discord', 'cron'])).default([]),
  profileIds: z.array(z.string().min(1)).default([]),
  projectIds: z.array(z.string().min(1)).default([]),
  statuses: z.array(z.enum(['active', 'ready', 'working', 'completed', 'failed'])).default([]),
  prStates: z.array(z.enum(['none', 'draft', 'open', 'review-required', 'approved', 'merged'])).default([]),
  environments: z.array(z.enum(['local', 'remote', 'cloud'])).default([]),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
  groupBy: z.array(z.enum(['pinned', 'profile', 'project', 'source', 'recency'])).default([]),
  sort: z.enum(['updated-desc', 'updated-asc', 'title-asc']).default('updated-desc')
});
export type SessionTreeFilter = z.infer<typeof SessionTreeFilter>;

export const ProfileCustomAction = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  command: z.string().trim().min(1).max(20_000),
  keybinding: z.string().trim().max(120).nullable().default(null),
  previewUrl: z.string().url().nullable().default(null),
  runOnWorktreeCreation: z.boolean().default(false),
  openPreview: z.boolean().default(false)
});
export type ProfileCustomAction = z.infer<typeof ProfileCustomAction>;

export const ProfileHeaderPreferences = z.object({
  customActions: z.array(ProfileCustomAction).max(50).default([]),
  primaryActionId: z.string().nullable().default(null),
  gitEnabled: z.boolean().default(false),
  primaryGitAction: z.enum(['commit', 'push', 'create-pr']).default('commit')
});
export type ProfileHeaderPreferences = z.infer<typeof ProfileHeaderPreferences>;

export const ProfileControlDisplay = z.enum(['composer', 'status', 'both', 'hidden']);
export type ProfileControlDisplay = z.infer<typeof ProfileControlDisplay>;

export const ProfileContextualControls = z.object({
  approval: ProfileControlDisplay.default('status'),
  context: ProfileControlDisplay.default('status')
});
export type ProfileContextualControls = z.infer<typeof ProfileContextualControls>;

export const ProfileUiPreferences = z.object({
  presetId: z.string().min(1).default('default'),
  sessionPresentation: SessionPresentation.default('chats'),
  sessionTreeLabel: z.string().trim().min(1).max(48).nullable().default(null),
  sessionFilter: SessionTreeFilter.nullable().default(null),
  contextualControls: ProfileContextualControls.default({ approval: 'status', context: 'status' }),
  thinkingStatus: z.enum(['plain', 'personality', 'hidden']).default('personality'),
  header: ProfileHeaderPreferences.default({ customActions: [], primaryActionId: null, gitEnabled: false, primaryGitAction: 'commit' })
});
export type ProfileUiPreferences = z.infer<typeof ProfileUiPreferences>;

export const DesktopPreferences = z.object({
  account: z.object({
    displayName: z.string().trim().min(1).max(120).default('Hermes User'),
    email: z.string().trim().email().or(z.literal('')).default('')
  }).default({ displayName: 'Hermes User', email: '' }),
  appearance: z.object({
    mode: z.enum(['light', 'dark', 'system']).default('system'),
    palette: z.enum(['mono', 'nous', 'midnight', 'ember', 'cyberpunk', 'slate']).default('mono'),
    codeWordWrap: z.boolean().default(false),
    toolCallDensity: z.enum(['compact', 'balanced', 'detailed']).default('balanced')
  }).default({ mode: 'system', palette: 'mono', codeWordWrap: false, toolCallDensity: 'balanced' }),
  notifications: z.object({
    system: z.boolean().default(true),
    warnings: z.boolean().default(true),
    completionSound: z.boolean().default(false)
  }).default({ system: true, warnings: true, completionSound: false })
});
export type DesktopPreferences = z.infer<typeof DesktopPreferences>;

export const WorkspaceDockTab = z.enum(['surfaces', 'files', 'terminal', 'browser', 'changes', 'agents', 'run']);
export type WorkspaceDockTab = z.infer<typeof WorkspaceDockTab>;

export const WorkspaceLayoutOwner = z.object({
  connectionId: z.string().min(1),
  profileId: z.string().min(1),
  resource: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('session'), id: z.string().min(1) }),
    z.object({ kind: z.literal('draft'), id: z.string().uuid() })
  ])
});
export type WorkspaceLayoutOwner = z.infer<typeof WorkspaceLayoutOwner>;

export function workspaceLayoutOwnerKey(owner: WorkspaceLayoutOwner) {
  const parsed = WorkspaceLayoutOwner.parse(owner);
  return JSON.stringify([
    parsed.connectionId,
    parsed.profileId,
    [parsed.resource.kind, parsed.resource.id]
  ]);
}

export const WorkspaceLayoutPreferences = z.object({
  inspector: z.object({
    visible: z.boolean().default(false),
    mode: z.enum(['docked', 'focused']).default('docked'),
    activeTab: WorkspaceDockTab.default('surfaces'),
    openTabs: z.array(WorkspaceDockTab.exclude(['surfaces'])).max(7).default([]),
    width: z.number().int().min(280).max(960).default(480)
  }).default({ visible: false, mode: 'docked', activeTab: 'surfaces', openTabs: [], width: 480 }),
  terminal: z.object({
    visible: z.boolean().default(false),
    height: z.number().int().min(176).max(720).default(260)
  }).default({ visible: false, height: 260 })
});
export type WorkspaceLayoutPreferences = z.infer<typeof WorkspaceLayoutPreferences>;

// This is the only Hermes Agent capability descriptor that Companion accepts
// as a verified contract. New upstream versions must be consciously added here
// with their schema and compatibility policy before a release can claim support.
export const HERMES_API_CAPABILITY_CONTRACT_V1 = 'hermes.api_server.capabilities/v1' as const;
export const SupportedHermesApiCapabilityContract = z.literal(HERMES_API_CAPABILITY_CONTRACT_V1);
export const HermesApiCapabilitiesDescriptor = z.object({
  object: z.literal('hermes.api_server.capabilities'),
  platform: z.string().optional(),
  features: z.record(z.string(), z.unknown()),
  endpoints: z.record(z.string(), z.object({ method: z.string().optional(), path: z.string().optional() }).passthrough()),
  runtime: z.object({ mode: z.string().optional(), tool_execution: z.string().optional(), split_runtime: z.boolean().optional() }).passthrough().optional()
}).passthrough();
export type HermesApiCapabilitiesDescriptor = z.infer<typeof HermesApiCapabilitiesDescriptor>;

export const CoreCapabilities = z.object({
  health: z.boolean(),
  chatCompletions: z.boolean(),
  models: z.boolean(),
  streaming: z.boolean()
});

export const EnhancedCapabilities = z.object({
  sessions: z.boolean(),
  sessionManagement: z.boolean().default(false),
  enhancedChat: z.boolean(),
  profiles: z.boolean(),
  memory: z.boolean(),
  skills: z.boolean(),
  config: z.boolean(),
  jobs: z.boolean(),
  approvals: z.boolean(),
  mcp: z.boolean(),
  analytics: z.boolean(),
  operations: z.boolean(),
  logs: z.boolean().default(false),
  credentials: z.boolean().default(false),
  toolsets: z.boolean().default(false),
  permissions: z.boolean().default(false),
  messaging: z.boolean().default(false),
  webhooks: z.boolean().default(false),
  learning: z.boolean().default(false),
  curator: z.boolean().default(false),
  updates: z.boolean().default(false),
  plugins: z.boolean().default(false),
  kanban: z.boolean().default(false),
  achievements: z.boolean().default(false),
  checkpoints: z.boolean().default(false)
});

export const GatewayStatus = z.object({
  connection: GatewayConnection,
  status: z.enum(['enhanced', 'connected', 'partial', 'disconnected']),
  latencyMs: z.number().nonnegative().nullable(),
  core: CoreCapabilities,
  enhanced: EnhancedCapabilities,
  compatibility: z.object({ mode: z.enum(['verified', 'legacy-probe', 'unavailable']), contract: z.string().nullable(), compatible: z.boolean(), reason: z.string() }).default({ mode: 'legacy-probe', contract: null, compatible: true, reason: 'Compatibility inferred from supported endpoint probes.' }),
  checkedAt: z.string().datetime(),
  error: z.string().nullable()
});
export type GatewayStatus = z.infer<typeof GatewayStatus>;

export const LocalHermesService = z.object({
  url: z.string().url(),
  available: z.boolean(),
  compatible: z.boolean(),
  authRequired: z.boolean().nullable(),
  externalAuthRequired: z.boolean().nullable().default(null),
  credentialAvailable: z.boolean().default(false),
  version: z.string().nullable(),
  detail: z.string()
});
export type LocalHermesService = z.infer<typeof LocalHermesService>;

export const LocalHermesDiscovery = z.object({
  agent: LocalHermesService,
  control: LocalHermesService,
  detectedAt: z.string().datetime()
});
export type LocalHermesDiscovery = z.infer<typeof LocalHermesDiscovery>;

export const HermesSession = z.object({
  id: z.string().min(1),
  title: z.string().default('Untitled session'),
  model: z.string().nullable().default(null),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  messageCount: z.number().int().nonnegative().default(0),
  archived: z.boolean().default(false),
  source: z.enum(['chat', 'slack', 'discord', 'cron']).default('chat'),
  channel: z.string().nullable().default(null),
  profileId: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  kind: z.enum(['chat', 'code', 'review', 'message', 'job']).default('chat'),
  projectId: z.string().nullable().default(null),
  cwd: z.string().nullable().default(null),
  branch: z.string().nullable().default(null),
  status: z.enum(['active', 'ready', 'working', 'completed', 'failed']).default('active'),
  attention: z.enum(['approval', 'input', 'review', 'blocked']).optional(),
  prState: z.enum(['none', 'draft', 'open', 'review-required', 'approved', 'merged']).default('none'),
  environment: z.enum(['local', 'remote', 'cloud']).default('local'),
  unread: z.boolean().default(false)
});
export type HermesSession = z.infer<typeof HermesSession>;

export const HermesProjectLane = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().nullable().default(null),
  sessions: z.array(HermesSession).default([]),
  sessionCount: z.number().int().nonnegative().default(0),
  isMain: z.boolean().default(false),
  isHome: z.boolean().default(false),
  isKanban: z.boolean().default(false)
});
export type HermesProjectLane = z.infer<typeof HermesProjectLane>;

export const HermesProjectRepository = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().nullable().default(null),
  groups: z.array(HermesProjectLane).default([]),
  sessionCount: z.number().int().nonnegative().default(0)
});
export type HermesProjectRepository = z.infer<typeof HermesProjectRepository>;

export const HermesProjectTreeNode = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().nullable().default(null),
  color: z.string().nullable().default(null),
  icon: z.string().nullable().default(null),
  archived: z.boolean().default(false),
  isAuto: z.boolean().default(false),
  isNoProject: z.boolean().default(false),
  repos: z.array(HermesProjectRepository).default([]),
  sessionCount: z.number().int().nonnegative().default(0),
  lastActive: z.number().nonnegative().default(0),
  previewSessions: z.array(HermesSession).default([])
});
export type HermesProjectTreeNode = z.infer<typeof HermesProjectTreeNode>;

export const HermesProjectTree = z.object({
  projects: z.array(HermesProjectTreeNode).default([]),
  activeId: z.string().nullable().default(null),
  scopedSessionIds: z.array(z.string().min(1)).default([])
});
export type HermesProjectTree = z.infer<typeof HermesProjectTree>;

export const ToolCall = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.unknown().optional(),
  result: z.unknown().optional(),
  status: z.enum(['pending', 'running', 'complete', 'error']).default('complete')
});

export const ModelSource = z.enum(['hermes', 'openrouter']);
export type ModelSource = z.infer<typeof ModelSource>;

export const ModelReference = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1).nullable().default(null)
});
export type ModelReference = z.infer<typeof ModelReference>;

export const MessageInference = z.object({
  source: ModelSource,
  requested: ModelReference,
  resolved: ModelReference.nullable().default(null),
  upstreamProvider: z.string().min(1).nullable().default(null)
});
export type MessageInference = z.infer<typeof MessageInference>;

export const MessageGeneration = z.object({
  requestId: z.string().uuid(),
  sequence: z.number().int().nonnegative().default(0),
  status: z.enum(['streaming', 'completed', 'cancelled', 'failed', 'interrupted']),
  responseId: z.string().min(1).nullable().default(null),
  finishReason: z.string().min(1).nullable().default(null),
  error: z.string().min(1).nullable().default(null)
});
export type MessageGeneration = z.infer<typeof MessageGeneration>;

export const HermesMessage = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  text: z.string(),
  createdAt: z.string().nullable().default(null),
  reasoning: z.string().nullable().default(null),
  thinkingStatus: z.string().nullable().default(null),
  toolCalls: z.array(ToolCall).default([]),
  attachments: z.array(z.object({ type: z.literal('file'), filename: z.string().optional(), mediaType: z.string().optional(), url: z.string().optional() })).default([]),
  checkpoints: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), detail: z.string().nullable().default(null) })).default([]),
  inference: MessageInference.nullable().default(null),
  generation: MessageGeneration.nullable().default(null)
});
export type HermesMessage = z.infer<typeof HermesMessage>;

export const ModelInfo = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: ModelSource.default('hermes'),
  provider: z.string().min(1).nullable().default(null),
  runtimeProvider: z.string().min(1).nullable().default(null),
  description: z.string().nullable().default(null),
  contextLength: z.number().int().positive().nullable().default(null),
  inputModalities: z.array(z.string()).default([]),
  outputModalities: z.array(z.string()).default([]),
  supportedParameters: z.array(z.string()).default([])
  , routeKind: z.enum(['model', 'router', 'preset']).default('model')
  , canonicalModelId: z.string().min(1).nullable().default(null)
  , pricing: z.object({ prompt: z.number().nonnegative().nullable().default(null), completion: z.number().nonnegative().nullable().default(null) }).nullable().default(null)
  , policyStatus: z.enum(['allowed', 'restricted', 'unknown']).default('unknown')
  , policyReason: z.string().min(1).nullable().default(null)
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export const OpenRouterGuardrailSummary = z.object({
  id: z.string().min(1), name: z.string().min(1), description: z.string().nullable().default(null),
  allowedModels: z.array(z.string()).nullable().default(null), ignoredModels: z.array(z.string()).nullable().default(null),
  allowedProviders: z.array(z.string()).nullable().default(null), ignoredProviders: z.array(z.string()).nullable().default(null),
  limitUsd: z.number().nonnegative().nullable().default(null), resetInterval: z.enum(['daily', 'weekly', 'monthly']).nullable().default(null),
  enforceZdr: z.boolean().default(false), contentFilterCount: z.number().int().nonnegative().default(0)
});
export type OpenRouterGuardrailSummary = z.infer<typeof OpenRouterGuardrailSummary>;

export const OpenRouterPolicyOverview = z.object({
  configured: z.boolean().default(false), verified: z.boolean().default(false), keyLabel: z.string().nullable().default(null),
  eligibleModelIds: z.array(z.string()).default([]), eligibleModelCount: z.number().int().nonnegative().default(0),
  keyLimitUsd: z.number().nonnegative().nullable().default(null), keyLimitRemainingUsd: z.number().nonnegative().nullable().default(null),
  managementConfigured: z.boolean().default(false), guardrailsVisible: z.boolean().default(false),
  guardrails: z.array(OpenRouterGuardrailSummary).default([]), assignmentCount: z.number().int().nonnegative().default(0),
  error: z.string().nullable().default(null), managementError: z.string().nullable().default(null), checkedAt: z.string().nullable().default(null)
});
export type OpenRouterPolicyOverview = z.infer<typeof OpenRouterPolicyOverview>;

export const ChatTurnApproval = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  allowPermanent: z.boolean().default(true)
});
export type ChatTurnApproval = z.infer<typeof ChatTurnApproval>;

export const ChatAttachmentInput = z.object({
  filename: z.string().trim().min(1).max(255),
  mediaType: z.string().trim().min(1).max(160),
  dataUrl: z.string().startsWith('data:').max(35_000_000)
});
export type ChatAttachmentInput = z.infer<typeof ChatAttachmentInput>;

export const ContextUsageCategory = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  tokens: z.number().int().nonnegative(),
  color: z.string().optional()
});
export type ContextUsageCategory = z.infer<typeof ContextUsageCategory>;

export const ContextUsage = z.object({
  categories: z.array(ContextUsageCategory).default([]),
  contextMax: z.number().int().nonnegative(),
  contextPercent: z.number().min(0).max(100),
  contextUsed: z.number().int().nonnegative(),
  estimatedTotal: z.number().int().nonnegative().default(0),
  model: z.string().default('')
});
export type ContextUsage = z.infer<typeof ContextUsage>;

// Hermes is the sole agent runtime. Provider/CLI credentials are connected
// through Hermes and must never be treated as independently launchable peers.
export const HarnessId = z.literal('hermes');
export type HarnessId = z.infer<typeof HarnessId>;

export const WorktreeContext = z.object({
  projectId: z.string().min(1),
  worktreeId: z.string().min(1),
  path: z.string().min(1),
  branch: z.string().min(1)
});
export type WorktreeContext = z.infer<typeof WorktreeContext>;

export const HarnessCapabilities = z.object({
  id: HarnessId,
  displayName: z.string().min(1),
  installed: z.boolean(),
  authenticated: z.boolean(),
  supportsStructuredApprovals: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsWorktrees: z.boolean(),
  supportsNativeFallback: z.boolean()
});
export type HarnessCapabilities = z.infer<typeof HarnessCapabilities>;

export const StartRunInput = z.object({
  harness: HarnessId,
  prompt: z.string().trim().min(1).max(20_000),
  worktree: WorktreeContext
});
export type StartRunInput = z.infer<typeof StartRunInput>;

export const HarnessEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), status: z.enum(['starting', 'running', 'completed', 'cancelled', 'failed']), message: z.string().optional() }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('tool'), tool: ToolCall }),
  z.object({ type: z.literal('approval'), approvalId: z.string(), summary: z.string(), nativeFallback: z.boolean(), allowPermanent: z.boolean().default(true) }),
  z.object({ type: z.literal('git'), commit: z.string().optional(), filesChanged: z.number().int().nonnegative() })
]);
export type HarnessEvent = z.infer<typeof HarnessEvent>;

export const ProjectBinding = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  repositoryPath: z.string().min(1),
  remoteUrl: z.string().nullable(),
  defaultBranch: z.string().min(1),
  connectionId: z.string().min(1),
  archived: z.boolean().optional()
});
export type ProjectBinding = z.infer<typeof ProjectBinding>;

export const WorktreeRecord = WorktreeContext.extend({
  // Legacy records intentionally fail closed until they are re-verified and
  // rebound through the active Hermes connection/profile.
  connectionId: z.string().min(1).default('legacy-unscoped'),
  profileId: z.string().min(1).default('legacy-unscoped'),
  threadId: z.string().min(1),
  parentWorktreeId: z.string().min(1).nullable().default(null),
  writerRunId: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type WorktreeRecord = z.infer<typeof WorktreeRecord>;

export const SessionWorkspaceTarget = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), worktree: WorktreeRecord }),
  z.object({ available: z.literal(false), reason: z.string().min(1) })
]);
export type SessionWorkspaceTarget = z.infer<typeof SessionWorkspaceTarget>;

export const HermesGitWorktree = z.object({
  path: z.string().min(1),
  branch: z.string().nullable().default(null),
  isMain: z.boolean().default(false),
  detached: z.boolean().default(false),
  locked: z.boolean().default(false)
});
export type HermesGitWorktree = z.infer<typeof HermesGitWorktree>;

export const HermesGitBranch = z.object({
  name: z.string().min(1),
  checkedOut: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  worktreePath: z.string().nullable().default(null)
});
export type HermesGitBranch = z.infer<typeof HermesGitBranch>;

export const HermesGitWorkspace = z.object({
  projectId: z.string().min(1),
  repositoryPath: z.string().min(1),
  path: z.string().min(1),
  branch: z.string().nullable().default(null)
});
export type HermesGitWorkspace = z.infer<typeof HermesGitWorkspace>;

export const HermesRepoStatusFile = z.object({
  path: z.string().min(1),
  staged: z.boolean(),
  unstaged: z.boolean(),
  untracked: z.boolean(),
  conflicted: z.boolean()
});
export type HermesRepoStatusFile = z.infer<typeof HermesRepoStatusFile>;

export const HermesRepoStatus = z.object({
  branch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  detached: z.boolean(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  staged: z.number().int().nonnegative(),
  unstaged: z.number().int().nonnegative(),
  untracked: z.number().int().nonnegative(),
  conflicted: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  files: z.array(HermesRepoStatusFile).max(200)
});
export type HermesRepoStatus = z.infer<typeof HermesRepoStatus>;

export const HermesReviewScope = z.enum(['uncommitted', 'branch']);
export type HermesReviewScope = z.infer<typeof HermesReviewScope>;

export const HermesReviewFile = z.object({
  path: z.string().min(1),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  status: z.string().min(1),
  staged: z.boolean()
});
export type HermesReviewFile = z.infer<typeof HermesReviewFile>;

export const HermesReviewList = z.object({
  files: z.array(HermesReviewFile).max(2_000),
  base: z.string().nullable()
});
export type HermesReviewList = z.infer<typeof HermesReviewList>;

export const HermesReviewShipInfo = z.object({
  ghReady: z.boolean(),
  pr: z.object({ url: z.string().url(), state: z.string(), number: z.number().int().positive() }).nullable()
});
export type HermesReviewShipInfo = z.infer<typeof HermesReviewShipInfo>;

export const HermesWorktreeCreateInput = z.object({
  projectId: z.string().min(1),
  repositoryPath: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  branch: z.string().trim().min(1).max(240).optional(),
  base: z.string().trim().min(1).max(240).optional(),
  existingBranch: z.string().trim().min(1).max(240).optional()
}).refine((input) => !(input.existingBranch && (input.name || input.branch || input.base)), { message: 'Choose an existing branch or create a new worktree, not both.' });
export type HermesWorktreeCreateInput = z.infer<typeof HermesWorktreeCreateInput>;

export const PreviewLease = z.object({
  id: z.string().uuid(),
  worktreeId: z.string().min(1),
  origin: z.string().url(),
  relayUrl: z.string().url().nullable(),
  designModeAllowed: z.boolean(),
  expiresAt: z.string().datetime()
});
export type PreviewLease = z.infer<typeof PreviewLease>;

export const AnnotationPayload = z.object({
  route: z.string().startsWith('/'),
  selectedElement: z.object({ selector: z.string().min(1), label: z.string().optional(), attributes: z.record(z.string(), z.string()).default({}) }),
  screenshot: z.string().url().optional(),
  note: z.string().trim().min(1).max(5_000),
  sourceWorktreeId: z.string().min(1),
  targetThreadId: z.string().min(1)
});

export const FileEntry = z.object({
  name: z.string().min(1),
  path: z.string(),
  kind: z.enum(['file', 'directory']),
  size: z.number().int().nonnegative().nullable()
});
export type FileEntry = z.infer<typeof FileEntry>;

export const FileSearchResult = z.object({ path: z.string().min(1), line: z.number().int().positive(), text: z.string() });
export type FileSearchResult = z.infer<typeof FileSearchResult>;

export const FilePreview = z.object({ path: z.string().min(1), mime: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']), dataUrl: z.string().startsWith('data:'), size: z.number().int().nonnegative() });
export type FilePreview = z.infer<typeof FilePreview>;

export const GitHubForgeStatus = z.object({
  installed: z.boolean(),
  authenticated: z.boolean(),
  message: z.string()
});
export type GitHubForgeStatus = z.infer<typeof GitHubForgeStatus>;

export const GitHubPullRequest = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  state: z.string(),
  isDraft: z.boolean(),
  reviewDecision: z.string().nullable()
});
export type GitHubPullRequest = z.infer<typeof GitHubPullRequest>;

export const GitCommitMetadata = z.object({
  subject: z.string(),
  body: z.string()
});
export type GitCommitMetadata = z.infer<typeof GitCommitMetadata>;

export const GitCommitResult = z.object({
  stdout: z.string(),
  stderr: z.string(),
  sha: z.string().regex(/^[0-9a-f]{40,64}$/)
});
export type GitCommitResult = z.infer<typeof GitCommitResult>;

export const GitRemoteStatus = z.object({
  remote: z.string().min(1),
  configured: z.boolean(),
  upstream: z.string().min(1).nullable(),
  canPush: z.boolean(),
  reason: z.string().min(1).nullable()
});
export type GitRemoteStatus = z.infer<typeof GitRemoteStatus>;

export const HermesActionStatus = z.object({ name: z.string().min(1), pid: z.number().int().positive().nullable(), running: z.boolean(), exit_code: z.number().int().nullable(), lines: z.array(z.string()).max(2_000) });
export type HermesActionStatus = z.infer<typeof HermesActionStatus>;

export const HermesCheckpointStoreOverview = z.object({
  sessions: z.array(z.object({
    session: z.string().min(1),
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative()
  })).default([]),
  total_bytes: z.number().int().nonnegative().default(0)
});
export type HermesCheckpointStoreOverview = z.infer<typeof HermesCheckpointStoreOverview>;

const nullableMetric = z.number().nonnegative().nullable().default(null);
export const HermesInsightsOverview = z.object({
  daily: z.array(z.object({
    day: z.string().min(1), input_tokens: z.number().nonnegative().default(0), output_tokens: z.number().nonnegative().default(0),
    cache_read_tokens: z.number().nonnegative().default(0), reasoning_tokens: z.number().nonnegative().default(0),
    estimated_cost: z.number().nonnegative().default(0), actual_cost: z.number().nonnegative().default(0),
    sessions: z.number().int().nonnegative().default(0), api_calls: z.number().int().nonnegative().default(0)
  })).default([]),
  by_model: z.array(z.object({
    model: z.string().min(1), input_tokens: z.number().nonnegative().default(0), output_tokens: z.number().nonnegative().default(0),
    estimated_cost: z.number().nonnegative().default(0), sessions: z.number().int().nonnegative().default(0), api_calls: z.number().int().nonnegative().default(0)
  })).default([]),
  totals: z.object({
    total_input: nullableMetric, total_output: nullableMetric, total_cache_read: nullableMetric, total_reasoning: nullableMetric,
    total_estimated_cost: z.number().nonnegative().default(0), total_actual_cost: z.number().nonnegative().default(0),
    total_sessions: z.number().int().nonnegative().default(0), total_api_calls: z.number().int().nonnegative().nullable().default(null)
  }),
  period_days: z.number().int().positive(),
  skills: z.object({
    summary: z.object({ distinct_skills_used: z.number().int().nonnegative().default(0), total_skill_actions: z.number().int().nonnegative().default(0), total_skill_edits: z.number().int().nonnegative().default(0), total_skill_loads: z.number().int().nonnegative().default(0) }),
    top_skills: z.array(z.object({ skill: z.string().min(1), total_count: z.number().int().nonnegative().default(0), view_count: z.number().int().nonnegative().default(0), manage_count: z.number().int().nonnegative().default(0), percentage: z.number().nonnegative().default(0), last_used_at: z.number().nullable().default(null) })).default([])
  }),
  tools: z.array(z.object({ tool: z.string().min(1), count: z.number().int().nonnegative().default(0), percentage: z.number().nonnegative().default(0) })).default([])
});
export type HermesInsightsOverview = z.infer<typeof HermesInsightsOverview>;

export const ApprovalEvent = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  worktreeId: z.string().min(1),
  summary: z.string().min(1),
  source: z.enum(['hermes', 'harness']),
  nativeFallback: z.boolean().default(false)
});

export const CapabilityFamily = z.enum([
  'chat', 'sessions', 'profiles', 'projects', 'files', 'terminal', 'memory', 'skills', 'mcp', 'models', 'artifacts',
  'credentials', 'toolsets', 'permissions', 'approvals', 'jobs', 'webhooks', 'audit', 'analytics', 'backup',
  'updates', 'health', 'messaging', 'agents', 'crews', 'conductor', 'tasks', 'checkpoints', 'reports', 'notifications',
  'git', 'browser', 'previews', 'annotations', 'harnesses', 'plugins', 'kanban', 'achievements', 'learning'
]);
export type CapabilityFamily = z.infer<typeof CapabilityFamily>;

export const CapabilityAvailability = z.object({
  family: CapabilityFamily,
  owner: z.enum(['hermes', 'companion']),
  available: z.boolean(),
  reason: z.string().nullable(),
  route: z.string()
});
export type CapabilityAvailability = z.infer<typeof CapabilityAvailability>;

export const BridgeEnvelope = z.object({
  version: z.literal('v1'),
  requestId: z.string().uuid(),
  capability: z.enum(['projects', 'worktrees', 'pty', 'git', 'files', 'preview', 'annotations']),
  payload: z.discriminatedUnion('action', [
    z.object({ action: z.literal('project.inspect'), repositoryPath: z.string().min(1), initialize: z.boolean().default(false) }),
    z.object({ action: z.literal('worktree.create'), connectionId: z.string().min(1).default('legacy-unscoped'), profileId: z.string().min(1).default('legacy-unscoped'), projectId: z.string().min(1), repositoryPath: z.string().min(1), threadId: z.string().min(1), branch: z.string().min(1), base: z.string().min(1).default('HEAD'), parentWorktreeId: z.string().min(1).nullable().default(null) }),
    z.object({ action: z.literal('worktree.attach'), connectionId: z.string().min(1).default('legacy-unscoped'), profileId: z.string().min(1).default('legacy-unscoped'), projectId: z.string().min(1), repositoryPath: z.string().min(1), worktreePath: z.string().min(1), threadId: z.string().min(1), branch: z.string().min(1) }),
    z.object({ action: z.literal('worktree.detach'), worktreeId: z.string().min(1) }),
    z.object({ action: z.literal('worktree.list'), connectionId: z.string().min(1).default('legacy-unscoped'), profileId: z.string().min(1).optional(), projectId: z.string().min(1).optional() }),
    z.object({ action: z.literal('worktree.remove'), repositoryPath: z.string().min(1), worktreeId: z.string().min(1), force: z.boolean().default(false) }),
    z.object({ action: z.literal('worktree.writer.acquire'), worktreeId: z.string().min(1), runId: z.string().uuid() }),
    z.object({ action: z.literal('worktree.writer.release'), worktreeId: z.string().min(1), runId: z.string().uuid() }),
    z.object({ action: z.literal('pty.open'), worktreeId: z.string().min(1), cols: z.number().int().min(20).max(500).default(100), rows: z.number().int().min(5).max(200).default(30), shell: z.string().optional() }),
    z.object({ action: z.literal('pty.write'), terminalId: z.string().uuid(), data: z.string().max(64_000) }),
    z.object({ action: z.literal('pty.resize'), terminalId: z.string().uuid(), cols: z.number().int().min(20).max(500), rows: z.number().int().min(5).max(200) }),
    z.object({ action: z.literal('pty.read'), terminalId: z.string().uuid() }),
    z.object({ action: z.literal('pty.close'), terminalId: z.string().uuid() }),
    z.object({ action: z.literal('git.status'), worktreeId: z.string().min(1) }),
    z.object({ action: z.literal('git.diff'), worktreeId: z.string().min(1), cached: z.boolean().default(false) }),
    z.object({ action: z.literal('git.commit.metadata'), worktreeId: z.string().min(1) }),
    z.object({ action: z.literal('git.stage'), worktreeId: z.string().min(1), paths: z.array(z.string().min(1)).max(2_000).default(['.']) }),
    z.object({ action: z.literal('git.unstage'), worktreeId: z.string().min(1), paths: z.array(z.string().min(1)).max(2_000).default(['.']) }),
    z.object({ action: z.literal('git.revert'), worktreeId: z.string().min(1), paths: z.array(z.string().min(1)).min(1).max(2_000) }),
    z.object({ action: z.literal('git.commit'), worktreeId: z.string().min(1), message: z.string().trim().min(1).max(5_000), amend: z.boolean().default(false) }),
    z.object({ action: z.literal('git.remote.status'), worktreeId: z.string().min(1), remote: z.string().min(1).max(255).default('origin') }),
    z.object({ action: z.literal('git.push'), worktreeId: z.string().min(1), remote: z.string().default('origin'), forceWithLease: z.boolean().default(false) }),
    z.object({ action: z.literal('git.github.status'), worktreeId: z.string().min(1) }),
    z.object({ action: z.literal('git.pr.view'), worktreeId: z.string().min(1) }),
    z.object({ action: z.literal('git.pr.create'), worktreeId: z.string().min(1), title: z.string().trim().min(1).max(256), body: z.string().max(20_000).default(''), base: z.string().min(1).max(240), draft: z.boolean().default(true) }),
    z.object({ action: z.literal('git.merge'), parentWorktreeId: z.string().min(1), childWorktreeId: z.string().min(1), message: z.string().trim().min(1).max(5_000) }),
    z.object({ action: z.literal('file.list'), worktreeId: z.string().min(1), path: z.string().max(4_096).default('') }),
    z.object({ action: z.literal('file.read'), worktreeId: z.string().min(1), path: z.string().min(1).max(4_096) }),
    z.object({ action: z.literal('file.write'), worktreeId: z.string().min(1), path: z.string().min(1).max(4_096), content: z.string().max(2_097_152) }),
    z.object({ action: z.literal('file.search'), worktreeId: z.string().min(1), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(500).default(200) }),
    z.object({ action: z.literal('file.create'), worktreeId: z.string().min(1), path: z.string().min(1).max(4_096), kind: z.enum(['file', 'directory']) }),
    z.object({ action: z.literal('file.move'), worktreeId: z.string().min(1), from: z.string().min(1).max(4_096), to: z.string().min(1).max(4_096) }),
    z.object({ action: z.literal('file.delete'), worktreeId: z.string().min(1), path: z.string().min(1).max(4_096), recursive: z.boolean().default(false) }),
    z.object({ action: z.literal('file.preview'), worktreeId: z.string().min(1), path: z.string().min(1).max(4_096) }),
    z.object({ action: z.literal('preview.start'), worktreeId: z.string().min(1), origin: z.string().url(), designModeAllowed: z.boolean().default(false), ttlSeconds: z.number().int().min(60).max(86_400).default(3_600) }),
    z.object({ action: z.literal('preview.stop'), leaseId: z.string().uuid() }),
    z.object({ action: z.literal('preview.list'), worktreeId: z.string().min(1).optional() }),
    z.object({ action: z.literal('annotation.create'), payload: AnnotationPayload })
  ])
}).superRefine((value, context) => {
  const expected = value.payload.action.split('.')[0];
  const category = expected === 'project' ? 'projects' : expected === 'worktree' ? 'worktrees' : expected === 'file' ? 'files' : expected === 'annotation' ? 'annotations' : expected;
  if (category !== value.capability) context.addIssue({ code: 'custom', path: ['capability'], message: `Capability must be ${category} for ${value.payload.action}.` });
});
export type BridgeEnvelope = z.infer<typeof BridgeEnvelope>;
