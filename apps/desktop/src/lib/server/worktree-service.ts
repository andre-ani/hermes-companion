import { dirname, join } from 'node:path';
import type { WorktreeRecord } from '@hermes-companion/contracts';
import { getCompanionRepository } from './companion-repository';
import { invokeExecutionHost } from './execution-host';

const safeSegment = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 120) || 'thread';

export async function ensureThreadWorktree(input: { projectId: string; threadId: string; branch?: string; base?: string; parentWorktreeId?: string | null }): Promise<WorktreeRecord> {
  const repository = getCompanionRepository();
  const existing = await repository.getWorktreeForThread(input.threadId, input.projectId);
  if (existing) return existing;
  const project = await repository.getProject(input.projectId);
  if (!project) throw new Error('Project binding was not found.');
  const thread = safeSegment(input.threadId);
  const branch = input.branch?.trim() || `companion/${thread}`;
  const targetPath = join(dirname(project.repositoryPath), '.hermes-worktrees', project.id, thread);
  const created = await invokeExecutionHost<{ path: string; branch: string; worktreeId?: string }>({
    localCapability: 'git.worktree.create', localInput: { repositoryPath: project.repositoryPath, targetPath, branch, base: input.base ?? 'HEAD' },
    remoteCapability: 'worktrees', remotePayload: { action: 'worktree.create', projectId: input.projectId, repositoryPath: project.repositoryPath, threadId: input.threadId, branch, base: input.base ?? 'HEAD', parentWorktreeId: input.parentWorktreeId ?? null }
  });
  try {
    return await repository.addWorktree({ projectId: input.projectId, worktreeId: created.worktreeId ?? crypto.randomUUID(), path: created.path, branch: created.branch, threadId: input.threadId, parentWorktreeId: input.parentWorktreeId ?? null, writerRunId: null, createdAt: new Date().toISOString() });
  } catch (error) {
    const raced = await repository.getWorktreeForThread(input.threadId, input.projectId);
    if (raced) return raced;
    throw error;
  }
}

export async function removeThreadWorktree(worktreeId: string, force = false): Promise<void> {
  const repository = getCompanionRepository();
  const worktree = (await repository.listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) return;
  if (worktree.writerRunId) throw new Error('Cannot remove a worktree with an active writer.');
  const project = await repository.getProject(worktree.projectId);
  if (!project) throw new Error('Project binding was not found.');
  await invokeExecutionHost({
    localCapability: 'git.worktree.remove', localInput: { repositoryPath: project.repositoryPath, worktreePath: worktree.path, force },
    remoteCapability: 'worktrees', remotePayload: { action: 'worktree.remove', repositoryPath: project.repositoryPath, worktreeId, force }
  });
  await repository.removeWorktree(worktreeId);
}
