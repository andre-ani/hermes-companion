import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { PreviewLease, WorktreeRecord } from '@hermes-companion/contracts';

const StoredPreview = PreviewLease.extend({ accessToken: z.string().min(32) });
const State = z.object({ version: z.literal(1), worktrees: z.array(WorktreeRecord), previews: z.array(StoredPreview) });
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
      this.state = { version: 1, worktrees: [], previews: [] };
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
  async listWorktrees(connectionId: string, projectId?: string, profileId?: string) {
    return (await this.load()).worktrees.filter((item) => item.connectionId === connectionId
      && (!projectId || item.projectId === projectId)
      && (!profileId || item.profileId === profileId));
  }
  async getWorktree(id: string) { return (await this.load()).worktrees.find((item) => item.worktreeId === id) ?? null; }
  async addWorktree(worktree: z.infer<typeof WorktreeRecord>) {
    const state = await this.load();
    const sameThread = state.worktrees.find((item) => item.connectionId === worktree.connectionId && item.profileId === worktree.profileId && item.projectId === worktree.projectId && item.threadId === worktree.threadId);
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
  async addPreview(preview: z.infer<typeof StoredPreview>) { const state = await this.load(); state.previews.push(preview); await this.save(); return preview; }
  async getPreview(id: string) { return (await this.load()).previews.find((item) => item.id === id) ?? null; }
  async listPreviews(worktreeId?: string) { return (await this.load()).previews.filter((item) => Date.parse(item.expiresAt) > Date.now() && (!worktreeId || item.worktreeId === worktreeId)); }
  async removePreview(id: string) { const state = await this.load(); state.previews = state.previews.filter((item) => item.id !== id); await this.save(); }
}
