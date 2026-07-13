import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { AnnotationPayload, DesktopPreferences, GatewayConnection, PreviewLease, ProfileUiPreferences, ProjectBinding, WorktreeRecord } from '@hermes-companion/contracts';

const AuditEvent = z.object({ id: z.string().uuid(), action: z.string(), subject: z.string(), at: z.string().datetime(), detail: z.record(z.string(), z.unknown()).default({}) });
const RunRecord = z.object({
  id: z.string().uuid(), worktreeId: z.string(), harness: z.string(), status: z.enum(['starting', 'running', 'completed', 'cancelled', 'failed']),
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
  pinnedSessionIds: z.array(z.string()).default([]),
  archivedSessionIds: z.array(z.string()).default([]),
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
  projects: [], worktrees: [], runs: [], annotations: [], previews: [], profileUi: {}, desktopPreferences: DesktopPreferences.parse({}), pinnedSessionIds: [], archivedSessionIds: [], unreadSessionIds: [], audit: []
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

  async getArchivedSessionIds() { return (await this.load()).archivedSessionIds; }
  async getUnreadSessionIds() { return (await this.load()).unreadSessionIds; }

  async setSessionArchiveOverride(sessionId: string, archived: boolean) {
    const state = await this.load();
    state.archivedSessionIds = archived
      ? [...new Set([...state.archivedSessionIds, sessionId])]
      : state.archivedSessionIds.filter((id) => id !== sessionId);
    await this.persist();
  }

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

  async listProjects() { return (await this.load()).projects; }
  async getProject(id: string) { return (await this.load()).projects.find((project) => project.id === id) ?? null; }
  async upsertProject(project: z.infer<typeof ProjectBinding>) {
    const state = await this.load();
    const index = state.projects.findIndex((item) => item.id === project.id);
    if (index === -1) state.projects.push(project); else state.projects[index] = project;
    this.addAuditToState(state, 'project.bound', project.id, { repositoryPath: project.repositoryPath });
    await this.persist();
    return project;
  }

  async listWorktrees(projectId?: string) {
    const worktrees = (await this.load()).worktrees;
    return worktrees.filter((worktree) => !projectId || worktree.projectId === projectId);
  }
  async getWorktreeForThread(threadId: string, projectId?: string) {
    return (await this.load()).worktrees.find((worktree) => worktree.threadId === threadId && (!projectId || worktree.projectId === projectId)) ?? null;
  }
  async addWorktree(worktree: z.infer<typeof WorktreeRecord>) {
    const state = await this.load();
    if (state.worktrees.some((item) => item.worktreeId === worktree.worktreeId)) throw new Error('Worktree already exists.');
    if (state.worktrees.some((item) => item.projectId === worktree.projectId && item.threadId === worktree.threadId)) throw new Error('This Hermes session already has a worktree in the selected project.');
    if (worktree.parentWorktreeId) {
      const parent = state.worktrees.find((item) => item.worktreeId === worktree.parentWorktreeId);
      if (!parent || parent.projectId !== worktree.projectId || parent.parentWorktreeId) throw new Error('Child worktree requires a top-level parent in the same project.');
    }
    state.worktrees.push(worktree);
    this.addAuditToState(state, 'worktree.created', worktree.worktreeId, { branch: worktree.branch, parentWorktreeId: worktree.parentWorktreeId });
    await this.persist();
    return worktree;
  }
  async removeWorktree(id: string) {
    const state = await this.load(); const worktree = state.worktrees.find((item) => item.worktreeId === id);
    if (worktree?.writerRunId) throw new Error('Cannot remove a worktree with an active writer.');
    state.worktrees = state.worktrees.filter((item) => item.worktreeId !== id); this.addAuditToState(state, 'worktree.removed', id); await this.persist();
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

  async releaseWriter(worktreeId: string, runId: string, status: 'completed' | 'cancelled' | 'failed') {
    const state = await this.load();
    const worktree = state.worktrees.find((item) => item.worktreeId === worktreeId);
    if (worktree?.writerRunId === runId) worktree.writerRunId = null;
    const run = state.runs.find((item) => item.id === runId);
    if (run) { run.status = status; run.finishedAt = new Date().toISOString(); }
    this.addAuditToState(state, 'writer.released', worktreeId, { runId, status });
    await this.persist();
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
