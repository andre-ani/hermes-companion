import { dirname, join } from 'node:path';
import type { WorktreeRecord } from '@hermes-companion/contracts';
import { getCompanionRepository } from './companion-repository';
import { invokeExecutionHost } from './execution-host';
import { getActiveHermesClient } from './hermes-client';

const safeSegment = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 120) || 'thread';

export async function ensureThreadWorktree(input: { connectionId?: string; profileId?: string; projectId: string; threadId: string; branch?: string; base?: string; parentWorktreeId?: string | null }): Promise<WorktreeRecord> {
  const repository = getCompanionRepository();
  const connection = getActiveHermesClient().executionContext().connection;
  const connectionId = input.connectionId ?? connection.id;
  const profileId = input.profileId ?? connection.hermesProfileId ?? 'default';
  if (connection.id !== connectionId) throw new Error('The active Hermes connection changed before the worktree could be created.');
  const existing = await repository.getWorktreeForThread(input.threadId, input.projectId, connectionId, profileId);
  if (existing) return existing;
  const project = await repository.getProject(input.projectId, connectionId);
  if (!project) throw new Error('Project binding was not found.');
  const thread = safeSegment(input.threadId);
  const branch = input.branch?.trim() || `companion/${thread}`;
  const targetPath = join(dirname(project.repositoryPath), '.hermes-worktrees', project.id, thread);
  const created = await invokeExecutionHost<{ path: string; branch: string; worktreeId?: string }>({
    localCapability: 'git.worktree.create', localInput: { repositoryPath: project.repositoryPath, targetPath, branch, base: input.base ?? 'HEAD' },
    remoteCapability: 'worktrees', remotePayload: { action: 'worktree.create', connectionId, profileId, projectId: input.projectId, repositoryPath: project.repositoryPath, threadId: input.threadId, branch, base: input.base ?? 'HEAD', parentWorktreeId: input.parentWorktreeId ?? null },
    expectedConnectionId: connectionId
  });
  try {
    return await repository.addWorktree({ connectionId, profileId, projectId: input.projectId, worktreeId: created.worktreeId ?? crypto.randomUUID(), path: created.path, branch: created.branch, threadId: input.threadId, parentWorktreeId: input.parentWorktreeId ?? null, createdAt: new Date().toISOString() });
  } catch (error) {
    const raced = await repository.getWorktreeForThread(input.threadId, input.projectId, connectionId, profileId);
    if (raced) return raced;
    throw error;
  }
}

export async function removeThreadWorktree(worktreeId: string, force = false): Promise<void> {
  const repository = getCompanionRepository();
  const connection = getActiveHermesClient().executionContext().connection;
  const profileId = connection.hermesProfileId ?? 'default';
  const worktree = await repository.getWorktree(worktreeId, connection.id, profileId);
  if (!worktree) throw new Error('Worktree was not found for the active Hermes owner.');
  const project = await repository.getProject(worktree.projectId, connection.id);
  if (!project) throw new Error('Project binding was not found.');
  await invokeExecutionHost({
    localCapability: 'git.worktree.remove', localInput: { repositoryPath: project.repositoryPath, worktreePath: worktree.path, force },
    remoteCapability: 'worktrees', remotePayload: { action: 'worktree.remove', repositoryPath: project.repositoryPath, worktreeId, force }, expectedConnectionId: connection.id
  });
  await repository.removeWorktree(worktreeId, connection.id);
}
