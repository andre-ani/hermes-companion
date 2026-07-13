import { randomBytes } from 'node:crypto';
import { BridgeEnvelope, type WorktreeContext } from '@hermes-companion/contracts';
import { BridgeStore } from './bridge-store.js';
import { attachWorktree, commit, commitMetadata, createPullRequest, createWorktree, diff, githubForgeStatus, inspectRepository, mergeWorktree, push, remoteStatus, removeWorktree, revert, stage, status, unstage, viewPullRequest } from './git-service.js';
import { TerminalManager } from './terminal-manager.js';
import { createFileEntry, deleteFileEntry, listFiles, moveFileEntry, previewFile, readTextFile, searchTextFiles, writeTextFile } from './file-service.js';

export interface CompanionBridge {
  createWorktree(projectId: string, branch: string): Promise<WorktreeContext>;
  handle(envelope: unknown): Promise<unknown>;
}

const allowedPreviewHosts = () => new Set(['127.0.0.1', 'localhost', '::1', ...(process.env.BRIDGE_PREVIEW_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean)]);
const validatePreviewOrigin = (origin: string) => {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || !allowedPreviewHosts().has(url.hostname)) throw new Error('Preview origin is not an authorized host-local HTTP service.');
  return url;
};

export class DefaultCompanionBridge implements CompanionBridge {
  readonly store: BridgeStore;
  readonly terminals: TerminalManager;
  constructor(store = new BridgeStore()) { this.store = store; this.terminals = new TerminalManager(store); }

  async createWorktree(_projectId: string, _branch: string): Promise<WorktreeContext> { throw new Error('Use the typed worktree.create bridge capability with repository and thread context.'); }

  async handle(value: unknown): Promise<unknown> {
    const envelope = BridgeEnvelope.parse(value); const payload = envelope.payload;
    switch (payload.action) {
      case 'project.inspect': return inspectRepository(payload.repositoryPath, payload.initialize);
      case 'worktree.create': {
        const created = await createWorktree(payload); return this.store.addWorktree({ connectionId: payload.connectionId, profileId: payload.profileId, projectId: payload.projectId, worktreeId: crypto.randomUUID(), path: created.path, branch: created.branch, threadId: payload.threadId, parentWorktreeId: payload.parentWorktreeId, writerRunId: null, createdAt: new Date().toISOString() });
      }
      case 'worktree.attach': {
        const attached = await attachWorktree(payload);
        return this.store.addWorktree({ connectionId: payload.connectionId, profileId: payload.profileId, projectId: payload.projectId, worktreeId: crypto.randomUUID(), path: attached.path, branch: attached.branch, threadId: payload.threadId, parentWorktreeId: null, writerRunId: null, createdAt: new Date().toISOString() });
      }
      case 'worktree.detach': this.terminals.closeWorktree(payload.worktreeId); await this.store.removeWorktree(payload.worktreeId); return { ok: true };
      case 'worktree.list': return this.store.listWorktrees(payload.connectionId, payload.projectId, payload.profileId);
      case 'worktree.remove': {
        const worktree = await this.requireWorktree(payload.worktreeId); if (worktree.writerRunId) throw new Error('Cannot remove a worktree with an active writer.');
        await removeWorktree(payload.repositoryPath, worktree.path, payload.force); await this.store.removeWorktree(payload.worktreeId); return { ok: true };
      }
      case 'worktree.writer.acquire': return this.store.acquireWriter(payload.worktreeId, payload.runId);
      case 'worktree.writer.release': await this.store.releaseWriter(payload.worktreeId, payload.runId); return { ok: true };
      case 'pty.open': return this.terminals.open(payload);
      case 'pty.write': this.terminals.write(payload.terminalId, payload.data); return { ok: true };
      case 'pty.resize': this.terminals.resize(payload.terminalId, payload.cols, payload.rows); return { ok: true };
      case 'pty.read': return this.terminals.read(payload.terminalId);
      case 'pty.close': this.terminals.close(payload.terminalId); return { ok: true };
      case 'git.status': return status((await this.requireWorktree(payload.worktreeId)).path);
      case 'git.diff': return diff((await this.requireWorktree(payload.worktreeId)).path, payload.cached);
      case 'git.commit.metadata': return commitMetadata((await this.requireWorktree(payload.worktreeId)).path);
      case 'git.stage': return stage((await this.requireWorktree(payload.worktreeId)).path, payload.paths);
      case 'git.unstage': return unstage((await this.requireWorktree(payload.worktreeId)).path, payload.paths);
      case 'git.revert': return revert((await this.requireWorktree(payload.worktreeId)).path, payload.paths);
      case 'git.commit': return commit((await this.requireWorktree(payload.worktreeId)).path, payload.message, payload.amend);
      case 'git.remote.status': { const worktree = await this.requireWorktree(payload.worktreeId); return remoteStatus(worktree.path, worktree.branch, payload.remote); }
      case 'git.push': { const worktree = await this.requireWorktree(payload.worktreeId); return push(worktree.path, worktree.branch, payload.remote, payload.forceWithLease); }
      case 'git.github.status': return githubForgeStatus();
      case 'git.pr.view': return viewPullRequest((await this.requireWorktree(payload.worktreeId)).path);
      case 'git.pr.create': return createPullRequest((await this.requireWorktree(payload.worktreeId)).path, payload);
      case 'git.merge': {
        const parent = await this.requireWorktree(payload.parentWorktreeId); const child = await this.requireWorktree(payload.childWorktreeId);
        if (child.parentWorktreeId !== parent.worktreeId || child.projectId !== parent.projectId) throw new Error('Child worktree is not linked to this parent.');
        if (parent.writerRunId || child.writerRunId) throw new Error('Cannot merge while either worktree has an active writer.');
        return mergeWorktree(parent.path, child.path, child.branch, payload.message);
      }
      case 'file.list': return listFiles((await this.requireWorktree(payload.worktreeId)).path, payload.path);
      case 'file.read': return readTextFile((await this.requireWorktree(payload.worktreeId)).path, payload.path);
      case 'file.write': return writeTextFile((await this.requireWorktree(payload.worktreeId)).path, payload.path, payload.content);
      case 'file.search': return searchTextFiles((await this.requireWorktree(payload.worktreeId)).path, payload.query, payload.limit);
      case 'file.create': return createFileEntry((await this.requireWorktree(payload.worktreeId)).path, payload.path, payload.kind);
      case 'file.move': return moveFileEntry((await this.requireWorktree(payload.worktreeId)).path, payload.from, payload.to);
      case 'file.delete': return deleteFileEntry((await this.requireWorktree(payload.worktreeId)).path, payload.path, payload.recursive);
      case 'file.preview': return previewFile((await this.requireWorktree(payload.worktreeId)).path, payload.path);
      case 'preview.start': {
        const worktree = await this.requireWorktree(payload.worktreeId); const origin = validatePreviewOrigin(payload.origin); const id = crypto.randomUUID(); const accessToken = randomBytes(32).toString('base64url');
        const publicUrl = (process.env.BRIDGE_PUBLIC_URL ?? '').replace(/\/$/, ''); const relayUrl = publicUrl ? `${publicUrl}/preview/${id}/?token=${accessToken}` : null;
        const stored = await this.store.addPreview({ id, worktreeId: worktree.worktreeId, origin: origin.toString(), relayUrl, designModeAllowed: payload.designModeAllowed, expiresAt: new Date(Date.now() + payload.ttlSeconds * 1_000).toISOString(), accessToken });
        const { accessToken: _, ...lease } = stored; return lease;
      }
      case 'preview.stop': await this.store.removePreview(payload.leaseId); return { ok: true };
      case 'preview.list': return (await this.store.listPreviews(payload.worktreeId)).map(({ accessToken: _, ...lease }) => lease);
      case 'annotation.create': {
        await this.requireWorktree(payload.payload.sourceWorktreeId); return this.store.addAnnotation(payload.payload);
      }
    }
  }

  private async requireWorktree(id: string) { const worktree = await this.store.getWorktree(id); if (!worktree) throw new Error('Worktree not found.'); return worktree; }
}

export const parseBridgeRequest = (value: unknown) => BridgeEnvelope.parse(value);
