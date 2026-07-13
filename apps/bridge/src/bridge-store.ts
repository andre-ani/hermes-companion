import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { AnnotationPayload, PreviewLease, WorktreeRecord } from '@hermes-companion/contracts';

const StoredPreview = PreviewLease.extend({ accessToken: z.string().min(32) });
const StoredAnnotation = AnnotationPayload.extend({ id: z.string().uuid(), createdAt: z.string().datetime() });
const State = z.object({ version: z.literal(1), worktrees: z.array(WorktreeRecord), previews: z.array(StoredPreview), annotations: z.array(StoredAnnotation) });
type State = z.infer<typeof State>;

export class BridgeStore {
  private state: State | null = null;
  private writes = Promise.resolve();
  constructor(private readonly file = join(process.env.BRIDGE_STATE_DIR ?? '/opt/data/hermes-companion', 'bridge-state.json')) {}
  private async load() {
    if (this.state) return this.state;
    try { this.state = State.parse(JSON.parse(await readFile(this.file, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[bridge] Resetting unreadable companion state.', error);
      this.state = { version: 1, worktrees: [], previews: [], annotations: [] };
      await this.save();
    }
    return this.state;
  }
  private async save() {
    if (!this.state) return;
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writes = this.writes.then(async () => {
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      const temp = `${this.file}.${process.pid}.tmp`;
      await writeFile(temp, snapshot, { mode: 0o600 }); await rename(temp, this.file);
    });
    await this.writes;
  }
  async listWorktrees(projectId?: string) { return (await this.load()).worktrees.filter((item) => !projectId || item.projectId === projectId); }
  async getWorktree(id: string) { return (await this.load()).worktrees.find((item) => item.worktreeId === id) ?? null; }
  async addWorktree(worktree: z.infer<typeof WorktreeRecord>) {
    const state = await this.load();
    const sameThread = state.worktrees.find((item) => item.projectId === worktree.projectId && item.threadId === worktree.threadId);
    if (sameThread) {
      if (sameThread.path === worktree.path && sameThread.branch === worktree.branch) return sameThread;
      throw new Error('This Hermes session is already attached to another worktree.');
    }
    const samePath = state.worktrees.find((item) => item.path === worktree.path);
    if (samePath) throw new Error('This worktree is already attached to another Hermes session.');
    if (state.worktrees.some((item) => item.worktreeId === worktree.worktreeId)) throw new Error('Worktree identifier already exists.');
    if (worktree.parentWorktreeId) { const parent = state.worktrees.find((item) => item.worktreeId === worktree.parentWorktreeId); if (!parent || parent.projectId !== worktree.projectId || parent.parentWorktreeId) throw new Error('Child worktree requires a top-level parent in the same project.'); }
    state.worktrees.push(worktree); await this.save(); return worktree;
  }
  async removeWorktree(id: string) { const state = await this.load(); state.worktrees = state.worktrees.filter((item) => item.worktreeId !== id); await this.save(); }
  async acquireWriter(worktreeId: string, runId: string) {
    const state = await this.load(); const worktree = state.worktrees.find((item) => item.worktreeId === worktreeId);
    if (!worktree) throw new Error('Worktree not found.');
    if (worktree.writerRunId && worktree.writerRunId !== runId) throw new Error('This worktree already has an active writer.');
    worktree.writerRunId = runId; await this.save(); return worktree;
  }
  async releaseWriter(worktreeId: string, runId: string) { const state = await this.load(); const worktree = state.worktrees.find((item) => item.worktreeId === worktreeId); if (worktree?.writerRunId === runId) worktree.writerRunId = null; await this.save(); }
  async addPreview(preview: z.infer<typeof StoredPreview>) { const state = await this.load(); state.previews.push(preview); await this.save(); return preview; }
  async getPreview(id: string) { return (await this.load()).previews.find((item) => item.id === id) ?? null; }
  async listPreviews(worktreeId?: string) { return (await this.load()).previews.filter((item) => Date.parse(item.expiresAt) > Date.now() && (!worktreeId || item.worktreeId === worktreeId)); }
  async removePreview(id: string) { const state = await this.load(); state.previews = state.previews.filter((item) => item.id !== id); await this.save(); }
  async addAnnotation(input: z.infer<typeof AnnotationPayload>) { const state = await this.load(); const annotation = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; state.annotations.push(annotation); await this.save(); return annotation; }
}
