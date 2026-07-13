import { command, query } from '$app/server';
import { z, type FileEntry, type FilePreview, type FileSearchResult } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { invokeExecutionHost } from '$lib/server/execution-host';

const target = z.object({ worktreeId: z.string().min(1), path: z.string().max(4_096).default('') });

async function requireWorktree(worktreeId: string) {
  const worktree = (await getCompanionRepository().listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  return worktree;
}

export const listWorktreeFiles = query(target, async ({ worktreeId, path }) => {
  const worktree = await requireWorktree(worktreeId);
  return invokeExecutionHost<FileEntry[]>({
    localCapability: 'file.list', localInput: { root: worktree.path, path },
    remoteCapability: 'files', remotePayload: { action: 'file.list', worktreeId, path }
  });
});

export const readWorktreeFile = query(target.extend({ path: z.string().min(1).max(4_096) }), async ({ worktreeId, path }) => {
  const worktree = await requireWorktree(worktreeId);
  return invokeExecutionHost<{ path: string; content: string; size: number }>({
    localCapability: 'file.read', localInput: { root: worktree.path, path },
    remoteCapability: 'files', remotePayload: { action: 'file.read', worktreeId, path }
  });
});

export const previewWorktreeFile = query(target.extend({ path: z.string().min(1).max(4_096) }), async ({ worktreeId, path }) => {
  const worktree = await requireWorktree(worktreeId);
  return invokeExecutionHost<FilePreview>({ localCapability: 'file.preview', localInput: { root: worktree.path, path }, remoteCapability: 'files', remotePayload: { action: 'file.preview', worktreeId, path } });
});

export const saveWorktreeFile = command(target.extend({ path: z.string().min(1).max(4_096), content: z.string().max(2_097_152) }), async ({ worktreeId, path, content }) => {
  const worktree = await requireWorktree(worktreeId);
  const result = await invokeExecutionHost<{ path: string; size: number }>({
    localCapability: 'file.write', localInput: { root: worktree.path, path, content },
    remoteCapability: 'files', remotePayload: { action: 'file.write', worktreeId, path, content }
  });
  await getCompanionRepository().recordAudit('file.saved', worktreeId, { path, size: result.size });
  return result;
});

export const searchWorktreeFiles = query(target.extend({ query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(500).default(200) }), async ({ worktreeId, query: search, limit }) => {
  const worktree = await requireWorktree(worktreeId);
  return invokeExecutionHost<FileSearchResult[]>({
    localCapability: 'file.search', localInput: { root: worktree.path, query: search, limit },
    remoteCapability: 'files', remotePayload: { action: 'file.search', worktreeId, query: search, limit }
  });
});

export const createWorktreeFileEntry = command(target.extend({ path: z.string().min(1).max(4_096), kind: z.enum(['file', 'directory']) }), async ({ worktreeId, path, kind }) => {
  const worktree = await requireWorktree(worktreeId); const result = await invokeExecutionHost<{ path: string; kind: 'file' | 'directory' }>({
    localCapability: 'file.create', localInput: { root: worktree.path, path, kind }, remoteCapability: 'files', remotePayload: { action: 'file.create', worktreeId, path, kind }
  });
  await getCompanionRepository().recordAudit('file.created', worktreeId, result); return result;
});

export const moveWorktreeFileEntry = command(target.extend({ from: z.string().min(1).max(4_096), to: z.string().min(1).max(4_096) }), async ({ worktreeId, from, to }) => {
  const worktree = await requireWorktree(worktreeId); const result = await invokeExecutionHost<{ from: string; to: string }>({
    localCapability: 'file.move', localInput: { root: worktree.path, from, to }, remoteCapability: 'files', remotePayload: { action: 'file.move', worktreeId, from, to }
  });
  await getCompanionRepository().recordAudit('file.moved', worktreeId, result); return result;
});

export const deleteWorktreeFileEntry = command(target.extend({ path: z.string().min(1).max(4_096), recursive: z.boolean().default(false) }), async ({ worktreeId, path, recursive }) => {
  const worktree = await requireWorktree(worktreeId); const result = await invokeExecutionHost<{ path: string; kind: 'file' | 'directory' }>({
    localCapability: 'file.delete', localInput: { root: worktree.path, path, recursive }, remoteCapability: 'files', remotePayload: { action: 'file.delete', worktreeId, path, recursive }
  });
  await getCompanionRepository().recordAudit('file.deleted', worktreeId, result); return result;
});
