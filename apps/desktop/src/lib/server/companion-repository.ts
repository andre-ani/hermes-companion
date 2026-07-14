import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { AnnotationPayload, DesktopPreferences, GatewayConnection, PreviewLease, ProfileUiPreferences, ProjectBinding, workspaceLayoutOwnerKey, WorkspaceLayoutOwner, WorkspaceLayoutPreferences, WorktreeRecord } from '@hermes-companion/contracts';

const AuditEvent = z.object({ id: z.string().uuid(), action: z.string(), subject: z.string(), at: z.string().datetime(), detail: z.record(z.string(), z.unknown()).default({}) });
const RunRecord = z.object({
  id: z.string().uuid(), worktreeId: z.string(), harness: z.string(),
  durableSessionId: z.string().min(1).nullable().default(null),
  startedAt: z.string().datetime(), finishedAt: z.string().datetime().nullable()
});
const AnnotationTaskStatus = z.enum(['queued', 'starting', 'running', 'completed', 'cancelled', 'failed']);
const AnnotationRecord = AnnotationPayload.extend({
  id: z.string().uuid(), createdAt: z.string().datetime(),
  taskStatus: AnnotationTaskStatus.default('queued'), runId: z.string().uuid().nullable().default(null),
  finishedAt: z.string().datetime().nullable().default(null), lastEventSequence: z.number().int().nonnegative().default(0)
});
const LegacyAnnotationRecord = z.object({ id: z.string().uuid(), worktreeId: z.string(), threadId: z.string(), route: z.string(), selector: z.string(), note: z.string(), screenshot: z.string().nullable(), createdAt: z.string().datetime() });
const PreviewRecord = z.object({ id: z.string().uuid(), worktreeId: z.string(), origin: z.string().url(), relayUrl: z.string().url().nullable(), designModeAllowed: z.boolean(), expiresAt: z.string().datetime() });
const StoredWorkspaceLayout = WorkspaceLayoutPreferences.catch(WorkspaceLayoutPreferences.parse({}));

const CompanionState = z.object({
  version: z.literal(1),
  activeConnectionId: z.string().nullable(),
  connections: z.array(GatewayConnection),
  projects: z.array(ProjectBinding),
  worktrees: z.array(WorktreeRecord),
  runs: z.array(RunRecord),
  annotations: z.array(AnnotationRecord),
  previews: z.array(PreviewRecord),
  profileUi: z.record(z.string(), ProfileUiPreferences).default({}),
  desktopPreferences: DesktopPreferences.default(DesktopPreferences.parse({})),
  workspaceLayouts: z.record(z.string(), StoredWorkspaceLayout).default({}),
  pinnedSessionIds: z.array(z.string()).default([]),
  unreadSessionIds: z.array(z.string()).default([]),
  audit: z.array(AuditEvent)
});
const LegacyCompanionState = CompanionState.extend({ annotations: z.array(LegacyAnnotationRecord) });

type CompanionState = z.infer<typeof CompanionState>;

const initialState = (): CompanionState => ({
  version: 1,
  activeConnectionId: 'default',
  connections: [{
    id: 'default', name: 'Hermes Agent', description: 'Default local Hermes profile', kind: 'local',
    url: process.env.HERMES_API_URL ?? 'http://127.0.0.1:8642',
    controlUrl: process.env.HERMES_CONTROL_URL ?? null,
    serveUrl: process.env.HERMES_SERVE_URL ?? null,
    serveWsUrl: process.env.HERMES_SERVE_WS_URL ?? null,
    bridgeUrl: process.env.HERMES_BRIDGE_URL ?? null,
    hermesProfileId: null
  }],
  projects: [], worktrees: [], runs: [], annotations: [], previews: [], profileUi: {}, desktopPreferences: DesktopPreferences.parse({}), workspaceLayouts: {}, pinnedSessionIds: [], unreadSessionIds: [], audit: []
});

export class CompanionRepository {
  private state: CompanionState | null = null;
  private writeQueue = Promise.resolve();

  constructor(private readonly file = join(process.env.COMPANION_DATA_DIR ?? join(homedir(), '.hermes-companion'), 'state.json')) {}

  private async load() {
    if (this.state) return this.state;
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      const current = CompanionState.safeParse(raw);
      if (current.success) this.state = current.data;
      else {
        const legacy = LegacyCompanionState.parse(raw);
        this.state = { ...legacy, annotations: legacy.annotations.map((item) => ({
          id: item.id, createdAt: item.createdAt, route: item.route, selectedElement: { selector: item.selector, attributes: {} },
          ...(item.screenshot ? { screenshot: item.screenshot } : {}), note: item.note,
          sourceWorktreeId: item.worktreeId, targetThreadId: item.threadId,
          taskStatus: 'queued' as const, runId: null, finishedAt: null, lastEventSequence: 0
        })) };
        await this.persist();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[companion] State was unreadable; starting with a clean companion store.', error);
      this.state = initialState();
      await this.persist();
    }
    const isSynthetic = (id: string) => id.startsWith('showcase-') || id.startsWith('generated-');
    const before = JSON.stringify([this.state.connections, this.state.projects, this.state.worktrees, this.state.pinnedSessionIds]);
    this.state.connections = this.state.connections.filter((item) => !isSynthetic(item.id));
    this.state.projects = this.state.projects.filter((item) => !isSynthetic(item.id));
    this.state.worktrees = this.state.worktrees.filter((item) => !isSynthetic(item.worktreeId));
    this.state.pinnedSessionIds = this.state.pinnedSessionIds.filter((id) => !isSynthetic(id));
    for (const id of Object.keys(this.state.profileUi)) if (isSynthetic(id)) delete this.state.profileUi[id];
    if (before !== JSON.stringify([this.state.connections, this.state.projects, this.state.worktrees, this.state.pinnedSessionIds])) await this.persist();
    return this.state;
  }

  private async persist() {
    if (!this.state) return;
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      const temp = `${this.file}.${process.pid}.tmp`;
      await writeFile(temp, snapshot, { encoding: 'utf8', mode: 0o600 });
      await rename(temp, this.file);
    });
    await this.writeQueue;
  }

  async getConnections() { return (await this.load()).connections; }
  async getActiveConnection() {
    const state = await this.load();
    return state.connections.find((item) => item.id === state.activeConnectionId) ?? state.connections[0];
  }
  async upsertConnection(connection: z.infer<typeof GatewayConnection>) {
    const state = await this.load();
    const index = state.connections.findIndex((item) => item.id === connection.id);
    if (index === -1) state.connections.push(connection); else state.connections[index] = connection;
    state.activeConnectionId = connection.id;
    this.addAuditToState(state, 'connection.selected', connection.id);
    await this.persist();
    return connection;
  }

  async getProfileUi(profileKey: string) {
    const state = await this.load(); const connectionId = profileKey.split(':', 1)[0];
    return ProfileUiPreferences.parse(state.profileUi[profileKey] ?? state.profileUi[connectionId] ?? {});
  }

  async setProfileUi(profileKey: string, preferences: z.infer<typeof ProfileUiPreferences>) {
    const state = await this.load();
    const connectionId = profileKey.split(':', 1)[0];
    if (!state.connections.some((connection) => connection.id === connectionId)) throw new Error('Profile not found.');
    state.profileUi[profileKey] = ProfileUiPreferences.parse(preferences);
    this.addAuditToState(state, 'profile.ui.updated', profileKey, state.profileUi[profileKey]);
    await this.persist();
    return state.profileUi[profileKey];
  }

  async getDesktopPreferences() { return DesktopPreferences.parse((await this.load()).desktopPreferences); }

  async setDesktopPreferences(preferences: z.infer<typeof DesktopPreferences>) {
    const state = await this.load();
    state.desktopPreferences = DesktopPreferences.parse(preferences);
    this.addAuditToState(state, 'desktop.settings.updated', 'desktop');
    await this.persist();
    return state.desktopPreferences;
  }

  async getWorkspaceLayout(owner: z.infer<typeof WorkspaceLayoutOwner>) {
    const state = await this.load();
    return WorkspaceLayoutPreferences.parse(state.workspaceLayouts[workspaceLayoutOwnerKey(owner)] ?? {});
  }

  async setWorkspaceLayout(owner: z.infer<typeof WorkspaceLayoutOwner>, preferences: z.infer<typeof WorkspaceLayoutPreferences>) {
    const state = await this.load();
    const parsedOwner = WorkspaceLayoutOwner.parse(owner);
    const parsedPreferences = WorkspaceLayoutPreferences.parse(preferences);
    state.workspaceLayouts[workspaceLayoutOwnerKey(parsedOwner)] = parsedPreferences;
    await this.persist();
    return parsedPreferences;
  }

  async adoptWorkspaceLayout(from: z.infer<typeof WorkspaceLayoutOwner>, to: z.infer<typeof WorkspaceLayoutOwner>, preferences?: z.infer<typeof WorkspaceLayoutPreferences>) {
    const state = await this.load();
    const parsedFrom = WorkspaceLayoutOwner.parse(from);
    const parsedTo = WorkspaceLayoutOwner.parse(to);
    const fromKey = workspaceLayoutOwnerKey(parsedFrom);
    const toKey = workspaceLayoutOwnerKey(parsedTo);
    const adopted = WorkspaceLayoutPreferences.parse(preferences ?? state.workspaceLayouts[fromKey] ?? state.workspaceLayouts[toKey] ?? {});
    state.workspaceLayouts[toKey] = adopted;
    delete state.workspaceLayouts[fromKey];
    await this.persist();
    return adopted;
  }

  async deleteWorkspaceLayout(owner: z.infer<typeof WorkspaceLayoutOwner>) {
    const state = await this.load();
    delete state.workspaceLayouts[workspaceLayoutOwnerKey(owner)];
    await this.persist();
    return { ok: true as const };
  }

  async getUnreadSessionIds() { return (await this.load()).unreadSessionIds; }

  async setSessionUnread(sessionId: string, unread: boolean) {
    const state = await this.load();
    state.unreadSessionIds = unread ? [...new Set([...state.unreadSessionIds, sessionId])] : state.unreadSessionIds.filter((id) => id !== sessionId);
    await this.persist();
  }

  async getPinnedSessionIds() { return (await this.load()).pinnedSessionIds; }

  async setSessionPinned(sessionId: string, pinned: boolean) {
    const state = await this.load();
    const existing = state.pinnedSessionIds.includes(sessionId);
    if (pinned && !existing) state.pinnedSessionIds.push(sessionId);
    if (!pinned && existing) state.pinnedSessionIds = state.pinnedSessionIds.filter((id) => id !== sessionId);
    this.addAuditToState(state, pinned ? 'session.pinned' : 'session.unpinned', sessionId);
    await this.persist();
    return { sessionId, pinned };
  }

  async clearSessionPresentationState(sessionId: string, connectionId: string, profileId: string) {
    const state = await this.load();
    state.pinnedSessionIds = state.pinnedSessionIds.filter((id) => id !== sessionId);
    state.unreadSessionIds = state.unreadSessionIds.filter((id) => id !== sessionId);
    delete state.workspaceLayouts[workspaceLayoutOwnerKey({
      connectionId,
      profileId,
      resource: { kind: 'session', id: sessionId }
    })];
    await this.persist();
  }

  async listProjects(connectionId?: string) {
    return (await this.load()).projects.filter((project) => !connectionId || project.connectionId === connectionId);
  }
  async getProject(id: string, connectionId?: string) {
    return (await this.load()).projects.find((project) => project.id === id && (!connectionId || project.connectionId === connectionId)) ?? null;
  }
  async upsertProject(project: z.infer<typeof ProjectBinding>) {
    const state = await this.load();
    const index = state.projects.findIndex((item) => item.connectionId === project.connectionId && item.id === project.id);
    if (index === -1) state.projects.push(project); else state.projects[index] = project;
    this.addAuditToState(state, 'project.bound', project.id, { repositoryPath: project.repositoryPath });
    await this.persist();
    return project;
  }

  async listWorktrees(projectId?: string, connectionId?: string, profileId?: string) {
    const worktrees = (await this.load()).worktrees;
    return worktrees.filter((worktree) => (!projectId || worktree.projectId === projectId)
      && (!connectionId || worktree.connectionId === connectionId)
      && (!profileId || worktree.profileId === profileId));
  }
  async getWorktree(worktreeId: string, connectionId: string, profileId?: string) {
    return (await this.load()).worktrees.find((worktree) => worktree.worktreeId === worktreeId
      && worktree.connectionId === connectionId
      && (!profileId || worktree.profileId === profileId)) ?? null;
  }
  async getWorktreeForThread(threadId: string, projectId: string | undefined, connectionId: string, profileId: string) {
    return (await this.load()).worktrees.find((worktree) => worktree.threadId === threadId
      && worktree.connectionId === connectionId
      && worktree.profileId === profileId
      && (!projectId || worktree.projectId === projectId)) ?? null;
  }
  async addWorktree(worktree: z.infer<typeof WorktreeRecord>) {
    const state = await this.load();
    const parsed = WorktreeRecord.parse(worktree);
    if (state.worktrees.some((item) => item.worktreeId === parsed.worktreeId)) throw new Error('Worktree already exists.');
    if (state.worktrees.some((item) => item.connectionId === parsed.connectionId && item.profileId === parsed.profileId && item.projectId === parsed.projectId && item.threadId === parsed.threadId)) throw new Error('This Hermes session already has a worktree in the selected project.');
    if (state.worktrees.some((item) => item.connectionId === parsed.connectionId && item.path === parsed.path)) throw new Error('This worktree path is already bound to another Hermes session.');
    if (parsed.parentWorktreeId) {
      const parent = state.worktrees.find((item) => item.connectionId === parsed.connectionId && item.profileId === parsed.profileId && item.worktreeId === parsed.parentWorktreeId);
      if (!parent || parent.projectId !== parsed.projectId || parent.parentWorktreeId) throw new Error('Child worktree requires a top-level parent in the same project.');
    }
    state.worktrees.push(parsed);
    this.addAuditToState(state, 'worktree.created', parsed.worktreeId, { connectionId: parsed.connectionId, profileId: parsed.profileId, branch: parsed.branch, parentWorktreeId: parsed.parentWorktreeId });
    await this.persist();
    return parsed;
  }
  async upsertWorktreeBinding(worktree: z.infer<typeof WorktreeRecord>) {
    const state = await this.load();
    const parsed = WorktreeRecord.parse(worktree);
    const conflictingId = state.worktrees.find((item) => item.worktreeId === parsed.worktreeId
      && (item.connectionId !== parsed.connectionId || item.profileId !== parsed.profileId || item.projectId !== parsed.projectId || item.threadId !== parsed.threadId));
    if (conflictingId) throw new Error('Worktree identity is already bound to another Hermes session.');
    const existing = state.worktrees.find((item) => item.connectionId === parsed.connectionId && item.profileId === parsed.profileId && item.projectId === parsed.projectId && item.threadId === parsed.threadId);
    const identityChanged = existing && (existing.worktreeId !== parsed.worktreeId || existing.path !== parsed.path || existing.branch !== parsed.branch);
    if (existing?.writerRunId && identityChanged) throw new Error('Cannot repair a worktree binding while it has an active writer.');
    const samePath = state.worktrees.find((item) => item.connectionId === parsed.connectionId && item.path === parsed.path && item !== existing);
    if (samePath) throw new Error('This worktree path is already bound to another Hermes session.');
    state.worktrees = state.worktrees.filter((item) => !(item.connectionId === parsed.connectionId && item.worktreeId === parsed.worktreeId)
      && !(item.connectionId === parsed.connectionId && item.profileId === parsed.profileId && item.projectId === parsed.projectId && item.threadId === parsed.threadId));
    state.worktrees.push({ ...parsed, writerRunId: existing?.writerRunId ?? parsed.writerRunId });
    this.addAuditToState(state, existing ? 'session.worktree.repaired' : 'session.worktree.bound', parsed.threadId, { projectId: parsed.projectId, worktreeId: parsed.worktreeId, path: parsed.path });
    await this.persist();
    return state.worktrees.at(-1)!;
  }
  async removeWorktree(id: string, connectionId?: string) {
    const state = await this.load(); const worktree = state.worktrees.find((item) => item.worktreeId === id && (!connectionId || item.connectionId === connectionId));
    if (!worktree) throw new Error('Worktree was not found for the requested owner.');
    if (worktree?.writerRunId) throw new Error('Cannot remove a worktree with an active writer.');
    state.worktrees = state.worktrees.filter((item) => item !== worktree); this.addAuditToState(state, 'worktree.removed', id); await this.persist();
  }

  async acquireWriter(worktreeId: string, run: z.infer<typeof RunRecord>) {
    const state = await this.load();
    const worktree = state.worktrees.find((item) => item.worktreeId === worktreeId);
    if (!worktree) throw new Error('Worktree not found.');
    if (worktree.writerRunId && worktree.writerRunId !== run.id) throw new Error('This worktree already has an active writer. Use a child worktree for parallel implementation.');
    worktree.writerRunId = run.id;
    state.runs.push(run);
    this.addAuditToState(state, 'writer.acquired', worktreeId, { runId: run.id, harness: run.harness });
    await this.persist();
    return worktree;
  }

  async bindRunSession(runId: string, durableSessionId: string) {
    const state = await this.load();
    const run = state.runs.find((item) => item.id === runId && item.finishedAt === null);
    if (!run) throw new Error('Active Hermes run was not found.');
    if (run.durableSessionId && run.durableSessionId !== durableSessionId) throw new Error('Hermes run is already bound to another durable session.');
    run.durableSessionId = durableSessionId;
    this.addAuditToState(state, 'hermes.run.session-bound', runId, { worktreeId: run.worktreeId });
    await this.persist();
    return run;
  }

  async getRun(runId: string) { return (await this.load()).runs.find((item) => item.id === runId) ?? null; }

  async releaseWriter(worktreeId: string, runId: string, status: 'completed' | 'cancelled' | 'failed') {
    const state = await this.load();
    const worktree = state.worktrees.find((item) => item.worktreeId === worktreeId);
    if (!worktree || worktree.writerRunId !== runId) return false;
    worktree.writerRunId = null;
    const run = state.runs.find((item) => item.id === runId);
    if (run) run.finishedAt = new Date().toISOString();
    this.addAuditToState(state, 'writer.released', worktreeId, { runId, status });
    await this.persist();
    return true;
  }

  async listPreviews(worktreeId?: string) {
    return (await this.load()).previews.filter((item) => Date.parse(item.expiresAt) > Date.now() && (!worktreeId || item.worktreeId === worktreeId));
  }
  async addPreview(preview: z.infer<typeof PreviewLease>) {
    const state = await this.load(); state.previews = state.previews.filter((item) => item.id !== preview.id); state.previews.push(preview);
    this.addAuditToState(state, 'preview.started', preview.id, { worktreeId: preview.worktreeId, designModeAllowed: preview.designModeAllowed });
    await this.persist(); return preview;
  }
  async removePreview(id: string) {
    const state = await this.load(); state.previews = state.previews.filter((item) => item.id !== id);
    this.addAuditToState(state, 'preview.stopped', id); await this.persist();
  }

  async listAnnotations(worktreeId?: string) {
    return (await this.load()).annotations.filter((item) => !worktreeId || item.sourceWorktreeId === worktreeId);
  }
  async addAnnotation(payload: z.infer<typeof AnnotationPayload>, id: string = crypto.randomUUID()) {
    const state = await this.load(); const annotation = AnnotationRecord.parse({ ...payload, id, createdAt: new Date().toISOString() });
    state.annotations.push(annotation); this.addAuditToState(state, 'annotation.created', id, { worktreeId: payload.sourceWorktreeId, threadId: payload.targetThreadId, route: payload.route });
    await this.persist(); return annotation;
  }
  async getAnnotation(id: string) { return (await this.load()).annotations.find((item) => item.id === id) ?? null; }
  async getAnnotationForRun(runId: string) { return (await this.load()).annotations.find((item) => item.runId === runId) ?? null; }
  async updateAnnotationTask(id: string, update: { taskStatus: z.infer<typeof AnnotationTaskStatus>; runId?: string | null; lastEventSequence?: number }) {
    const state = await this.load(); const annotation = state.annotations.find((item) => item.id === id);
    if (!annotation) throw new Error('Design annotation was not found.');
    const previous = annotation.taskStatus; annotation.taskStatus = update.taskStatus;
    if (update.runId !== undefined) annotation.runId = update.runId;
    if (update.lastEventSequence !== undefined) annotation.lastEventSequence = Math.max(annotation.lastEventSequence, update.lastEventSequence);
    if (['completed', 'cancelled', 'failed'].includes(update.taskStatus)) annotation.finishedAt ??= new Date().toISOString();
    else annotation.finishedAt = null;
    if (previous !== update.taskStatus || update.runId !== undefined) this.addAuditToState(state, 'annotation.task.updated', id, { previous, status: update.taskStatus, runId: annotation.runId, worktreeId: annotation.sourceWorktreeId });
    await this.persist(); return annotation;
  }

  async recentAudit(limit = 50) { return (await this.load()).audit.slice(-limit).reverse(); }
  async recordAudit(action: string, subject: string, detail: Record<string, unknown> = {}) {
    const state = await this.load();
    this.addAuditToState(state, action, subject, detail);
    await this.persist();
  }

  private addAuditToState(state: CompanionState, action: string, subject: string, detail: Record<string, unknown> = {}) {
    state.audit.push({ id: crypto.randomUUID(), action, subject, detail, at: new Date().toISOString() });
    if (state.audit.length > 5_000) state.audit.splice(0, state.audit.length - 5_000);
  }
}

let singleton: CompanionRepository | null = null;
export const getCompanionRepository = () => singleton ??= new CompanionRepository();
