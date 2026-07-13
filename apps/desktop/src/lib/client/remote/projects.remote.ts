import { command, query } from '$app/server';
import { GitCommitMetadata, HermesGitBranch, HermesGitWorkspace, HermesGitWorktree, HermesRepoStatus, HermesReviewList, HermesReviewScope, HermesReviewShipInfo, HermesWorktreeCreateInput, ProjectBinding, WorktreeRecord, z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { invokeExecutionHost } from '$lib/server/execution-host';
import { invokeNative } from '$lib/server/native-client';
import { ensureThreadWorktree, removeThreadWorktree } from '$lib/server/worktree-service';
import { getGitHubForgeStatus as getGitHubForgeStatusOnHost, getGitHubPullRequest as getGitHubPullRequestOnHost } from '$lib/server/github-forge';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { createHermesProject, deleteHermesProject, getHermesProjectSessions, listHermesProjects, renameHermesProject, setHermesProjectArchived } from '$lib/server/hermes-projects';

export const listProjectBindings = query(z.object({}), async () => {
  const repository = getCompanionRepository(); const connection = getActiveHermesClient().executionContext().connection;
  if (connection.serveUrl || connection.serveWsUrl) return listHermesProjects(connection).then((result) => result.projects).catch(() => repository.listProjects());
  return repository.listProjects();
});

export const getProjectSessions = query(z.object({ projectId: z.string().min(1) }), async ({ projectId }) => {
  const connection = getActiveHermesClient().executionContext().connection;
  if (!connection.serveUrl && !connection.serveWsUrl) return null;
  return getHermesProjectSessions(connection, projectId);
});

async function resolveHermesRepository(projectId: string, requestedPath?: string) {
  const client = getActiveHermesClient();
  const connection = client.executionContext().connection;
  if (!connection.controlUrl) throw new Error('This Hermes connection does not expose its authenticated Git service.');
  const [catalog, tree] = await Promise.all([listHermesProjects(connection), getHermesProjectSessions(connection, projectId)]);
  const project = catalog.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error('Hermes project was not found.');
  const allowed = new Set([project.repositoryPath, ...(tree?.repos.flatMap((repo) => [repo.path, ...repo.groups.map((group) => group.path)]).filter((path): path is string => Boolean(path)) ?? [])]);
  const repositoryPath = requestedPath?.trim() || project.repositoryPath;
  if (!allowed.has(repositoryPath)) throw new Error('The selected repository does not belong to this Hermes project.');
  return { client, repositoryPath };
}

export const listHermesProjectWorktrees = query(z.object({ projectId: z.string().min(1), repositoryPath: z.string().min(1).optional() }), async ({ projectId, repositoryPath }) => {
  const resolved = await resolveHermesRepository(projectId, repositoryPath);
  const payload = await resolved.client.requestControl<{ worktrees?: unknown[] }>(`/api/git/worktrees?path=${encodeURIComponent(resolved.repositoryPath)}`);
  return (payload.worktrees ?? []).map((worktree) => HermesGitWorktree.parse(worktree));
});

export const listHermesProjectBranches = query(z.object({ projectId: z.string().min(1), repositoryPath: z.string().min(1).optional() }), async ({ projectId, repositoryPath }) => {
  const resolved = await resolveHermesRepository(projectId, repositoryPath);
  const payload = await resolved.client.requestControl<{ branches?: unknown[] }>(`/api/git/branches?path=${encodeURIComponent(resolved.repositoryPath)}`);
  return (payload.branches ?? []).map((branch) => HermesGitBranch.parse(branch));
});

export const createHermesProjectWorktree = command(HermesWorktreeCreateInput, async (input) => {
  const repository = getCompanionRepository();
  const resolved = await resolveHermesRepository(input.projectId, input.repositoryPath);
  const worktree = HermesGitWorktree.parse(await resolved.client.requestControl('/api/git/worktree/add', {
    method: 'POST',
    body: JSON.stringify({ path: resolved.repositoryPath, name: input.name, branch: input.branch, base: input.base, existingBranch: input.existingBranch })
  }));
  await repository.recordAudit('hermes.worktree.created', worktree.path, { projectId: input.projectId, branch: worktree.branch });
  return worktree;
});

export const bindHermesProjectWorktree = command(z.object({
  projectId: z.string().min(1),
  repositoryPath: z.string().min(1),
  worktreePath: z.string().min(1),
  branch: z.string().min(1),
  sessionId: z.string().min(1)
}), async ({ projectId, repositoryPath, worktreePath, branch, sessionId }) => {
  const repository = getCompanionRepository();
  const existing = await repository.getWorktreeForThread(sessionId, projectId);
  if (existing) {
    if (existing.path !== worktreePath || existing.branch !== branch) throw new Error('This Hermes session is already bound to another worktree.');
    return existing;
  }
  const resolved = await resolveHermesRepository(projectId, repositoryPath);
  const payload = await resolved.client.requestControl<{ worktrees?: unknown[] }>(`/api/git/worktrees?path=${encodeURIComponent(resolved.repositoryPath)}`);
  const target = (payload.worktrees ?? []).map((value) => HermesGitWorktree.parse(value)).find((value) => value.path === worktreePath);
  if (!target || target.isMain || target.branch !== branch) throw new Error('The selected linked worktree no longer matches Hermes state.');
  const attached = await invokeExecutionHost<Partial<WorktreeRecord> & { path: string; branch: string }>({
    localCapability: 'git.worktree.attach',
    localInput: { repositoryPath: resolved.repositoryPath, worktreePath, branch },
    remoteCapability: 'worktrees',
    remotePayload: { action: 'worktree.attach', projectId, repositoryPath: resolved.repositoryPath, worktreePath, threadId: sessionId, branch }
  });
  const record = WorktreeRecord.parse({
    projectId,
    worktreeId: attached.worktreeId ?? crypto.randomUUID(),
    path: attached.path,
    branch: attached.branch,
    threadId: sessionId,
    parentWorktreeId: null,
    writerRunId: null,
    createdAt: attached.createdAt ?? new Date().toISOString()
  });
  const raced = await repository.getWorktreeForThread(sessionId, projectId);
  if (raced) return raced;
  await repository.addWorktree(record);
  await repository.recordAudit('session.worktree.bound', sessionId, { projectId, worktreeId: record.worktreeId, path: record.path });
  return record;
});

export const removeHermesProjectWorktree = command(z.object({ projectId: z.string().min(1), repositoryPath: z.string().min(1).optional(), worktreePath: z.string().min(1), force: z.boolean().default(false) }), async ({ projectId, repositoryPath, worktreePath, force }) => {
  const repository = getCompanionRepository();
  const resolved = await resolveHermesRepository(projectId, repositoryPath);
  const worktrees = await resolved.client.requestControl<{ worktrees?: unknown[] }>(`/api/git/worktrees?path=${encodeURIComponent(resolved.repositoryPath)}`);
  const target = (worktrees.worktrees ?? []).map((worktree) => HermesGitWorktree.parse(worktree)).find((worktree) => worktree.path === worktreePath);
  if (!target || target.isMain) throw new Error('Only a linked worktree in this Hermes project can be removed.');
  await resolved.client.requestControl('/api/git/worktree/remove', { method: 'POST', body: JSON.stringify({ path: resolved.repositoryPath, worktreePath, force }) });
  await repository.recordAudit('hermes.worktree.removed', worktreePath, { projectId, force });
  return { removed: worktreePath };
});

async function resolveHermesGitWorkspace(input: z.infer<typeof HermesGitWorkspace>) {
  const resolved = await resolveHermesRepository(input.projectId, input.repositoryPath);
  const payload = await resolved.client.requestControl<{ worktrees?: unknown[] }>(`/api/git/worktrees?path=${encodeURIComponent(resolved.repositoryPath)}`);
  const worktrees = (payload.worktrees ?? []).map((worktree) => HermesGitWorktree.parse(worktree));
  if (!worktrees.some((worktree) => worktree.path === input.path)) throw new Error('The selected checkout is not an active worktree in this Hermes project.');
  return { client: resolved.client, path: input.path };
}

const gitQuery = (route: string, values: Record<string, boolean | null | string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined) params.set(key, String(value));
  return `/api/git/${route}?${params.toString()}`;
};

const HermesGitReviewQuery = HermesGitWorkspace.extend({ scope: HermesReviewScope.default('uncommitted') });

export const getHermesGitReview = query(HermesGitReviewQuery, async (input) => {
  const resolved = await resolveHermesGitWorkspace(input);
  const [status, review, ship] = await Promise.all([
    resolved.client.requestControl<unknown>(gitQuery('status', { path: resolved.path })),
    resolved.client.requestControl<unknown>(gitQuery('review/list', { path: resolved.path, scope: input.scope })),
    resolved.client.requestControl<unknown>(gitQuery('review/ship-info', { path: resolved.path }))
  ]);
  return {
    status: HermesRepoStatus.nullable().parse(status),
    review: HermesReviewList.parse(review),
    ship: HermesReviewShipInfo.parse(ship)
  };
});

export const getHermesGitReviewDiff = query(HermesGitReviewQuery.extend({ file: z.string().min(1).max(4_096), staged: z.boolean().default(false) }), async (input) => {
  const resolved = await resolveHermesGitWorkspace(input);
  const payload = await resolved.client.requestControl<{ diff?: unknown }>(gitQuery('review/diff', { path: resolved.path, scope: input.scope, file: input.file, staged: input.scope === 'uncommitted' && input.staged }));
  return { diff: z.string().parse(payload.diff ?? '') };
});

const HermesGitFileMutation = HermesGitWorkspace.extend({ file: z.string().min(1).max(4_096).nullable().default(null) });
async function mutateHermesReview(input: z.infer<typeof HermesGitFileMutation>, action: 'stage' | 'unstage' | 'revert') {
  const repository = getCompanionRepository();
  const resolved = await resolveHermesGitWorkspace(input);
  await resolved.client.requestControl(`/api/git/review/${action}`, { method: 'POST', body: JSON.stringify({ path: resolved.path, file: input.file }) });
  await repository.recordAudit(`hermes.git.${action}`, resolved.path, { projectId: input.projectId, file: input.file });
  return { ok: true as const };
}
export const stageHermesGitReview = command(HermesGitFileMutation, async (input) => mutateHermesReview(input, 'stage'));
export const unstageHermesGitReview = command(HermesGitFileMutation, async (input) => mutateHermesReview(input, 'unstage'));
export const revertHermesGitReview = command(HermesGitFileMutation, async (input) => mutateHermesReview(input, 'revert'));

export const commitHermesGitReview = command(HermesGitWorkspace.extend({ message: z.string().trim().min(1).max(5_000), push: z.boolean().default(false) }), async (input) => {
  const repository = getCompanionRepository();
  const resolved = await resolveHermesGitWorkspace(input);
  await resolved.client.requestControl('/api/git/review/commit', { method: 'POST', body: JSON.stringify({ path: resolved.path, message: input.message, push: input.push }) });
  await repository.recordAudit('hermes.git.commit', resolved.path, { projectId: input.projectId, push: input.push });
  return { ok: true as const };
});

export const pushHermesGitReview = command(HermesGitWorkspace, async (input) => {
  const repository = getCompanionRepository();
  const resolved = await resolveHermesGitWorkspace(input);
  await resolved.client.requestControl('/api/git/review/push', { method: 'POST', body: JSON.stringify({ path: resolved.path }) });
  await repository.recordAudit('hermes.git.push', resolved.path, { projectId: input.projectId });
  return { ok: true as const };
});

export const createHermesGitPullRequest = command(HermesGitWorkspace, async (input) => {
  const repository = getCompanionRepository();
  const resolved = await resolveHermesGitWorkspace(input);
  const result = z.object({ url: z.string().url() }).parse(await resolved.client.requestControl('/api/git/review/create-pr', { method: 'POST', body: JSON.stringify({ path: resolved.path }) }));
  await repository.recordAudit('hermes.git.pr.created', resolved.path, { projectId: input.projectId, url: result.url });
  return result;
});

export const bindProject = command(ProjectBinding, async (project) => getCompanionRepository().upsertProject(project));

export const chooseLocalProjectDirectory = command(z.object({}), async () => {
  const connection = await getCompanionRepository().getActiveConnection();
  if (connection?.kind === 'remote') throw new Error('Remote projects require a host path entered manually.');
  return invokeNative<{ path: string | null }>('dialog.directory', { title: 'Choose or create a Git repository' });
});

export const inspectAndBindProject = command(z.object({ repositoryPath: z.string().min(1), name: z.string().trim().max(240).optional(), initialize: z.boolean().default(false) }), async ({ repositoryPath, name, initialize }) => {
  const repository = getCompanionRepository(); const connection = await repository.getActiveConnection(); if (!connection) throw new Error('No active connection.');
  if (connection.kind === 'remote' && (connection.serveUrl || connection.serveWsUrl)) {
    const project = await createHermesProject(connection, { repositoryPath, name });
    await repository.recordAudit('hermes.project.created', project.id, { repositoryPath: project.repositoryPath });
    return project;
  }
  const inspected = await invokeExecutionHost<{ name: string; repositoryPath: string; remoteUrl: string | null; defaultBranch: string }>({
    localCapability: 'git.inspect', localInput: { repositoryPath, initialize }, remoteCapability: 'projects', remotePayload: { action: 'project.inspect', repositoryPath, initialize }
  });
  if (connection.serveUrl || connection.serveWsUrl) {
    const project = await createHermesProject(connection, { repositoryPath: inspected.repositoryPath, name: name?.trim() || inspected.name });
    await repository.recordAudit('hermes.project.created', project.id, { repositoryPath: project.repositoryPath });
    return { ...project, remoteUrl: inspected.remoteUrl, defaultBranch: inspected.defaultBranch };
  }
  return repository.upsertProject({ id: crypto.randomUUID(), name: name?.trim() || inspected.name, repositoryPath: inspected.repositoryPath, remoteUrl: inspected.remoteUrl, defaultBranch: inspected.defaultBranch, connectionId: connection.id });
});

export const deleteProject = command(z.object({ projectId: z.string().min(1) }), async ({ projectId }) => {
  const repository = getCompanionRepository(); const connection = await repository.getActiveConnection();
  if (!connection) throw new Error('No active connection.');
  if (connection.serveUrl || connection.serveWsUrl) {
    await deleteHermesProject(connection, projectId);
    await repository.recordAudit('hermes.project.deleted', projectId);
    return { ok: true as const };
  }
  throw new Error('Project deletion requires a Hermes Serve connection.');
});

export const renameProject = command(z.object({ projectId: z.string().min(1), name: z.string().trim().min(1).max(240) }), async ({ projectId, name }) => {
  const repository = getCompanionRepository(); const connection = await repository.getActiveConnection();
  if (!connection) throw new Error('No active connection.');
  if (connection.serveUrl || connection.serveWsUrl) {
    const project = await renameHermesProject(connection, projectId, name);
    await repository.recordAudit('hermes.project.renamed', projectId, { name });
    return project;
  }
  const project = await repository.getProject(projectId); if (!project) throw new Error('Project was not found.');
  return repository.upsertProject({ ...project, name });
});

export const setProjectArchived = command(z.object({ projectId: z.string().min(1), archived: z.boolean() }), async ({ projectId, archived }) => {
  const repository = getCompanionRepository(); const connection = await repository.getActiveConnection();
  if (!connection) throw new Error('No active connection.');
  if (connection.serveUrl || connection.serveWsUrl) {
    await setHermesProjectArchived(connection, projectId, archived);
    await repository.recordAudit(archived ? 'hermes.project.archived' : 'hermes.project.restored', projectId);
    return { ok: true as const };
  }
  const project = await repository.getProject(projectId); if (!project) throw new Error('Project was not found.');
  await repository.upsertProject({ ...project, archived });
  return { ok: true as const };
});

export const registerWorktree = command(WorktreeRecord, async (worktree) => getCompanionRepository().addWorktree(worktree));

export const createProjectWorktree = command(z.object({
  projectId: z.string().min(1), threadId: z.string().min(1), branch: z.string().min(1).max(240), base: z.string().min(1).default('HEAD')
}), async ({ projectId, threadId, branch, base }) => {
  return ensureThreadWorktree({ projectId, threadId, branch, base });
});

export const ensureSessionWorktree = command(z.object({ projectId: z.string().min(1), sessionId: z.string().min(1) }), async ({ projectId, sessionId }) => {
  const worktree = await ensureThreadWorktree({ projectId, threadId: sessionId });
  await getCompanionRepository().recordAudit('session.worktree.bound', sessionId, { projectId, worktreeId: worktree.worktreeId });
  return worktree;
});

export const createChildWorktree = command(z.object({ parentWorktreeId: z.string().min(1), branch: z.string().trim().min(1).max(240) }), async ({ parentWorktreeId, branch }) => {
  const repository = getCompanionRepository(); const parent = (await repository.listWorktrees()).find((item) => item.worktreeId === parentWorktreeId);
  if (!parent) throw new Error('Parent worktree was not found.'); if (parent.parentWorktreeId) throw new Error('Nested child worktrees are not supported.');
  const child = await ensureThreadWorktree({ projectId: parent.projectId, threadId: `${parent.threadId}:child:${crypto.randomUUID()}`, branch, base: parent.branch, parentWorktreeId });
  await repository.recordAudit('worktree.child.created', child.worktreeId, { parentWorktreeId, branch }); return child;
});

export const removeProjectWorktree = command(z.object({ worktreeId: z.string().min(1), force: z.boolean().default(false) }), async ({ worktreeId, force }) => {
  await removeThreadWorktree(worktreeId, force);
  return { ok: true as const };
});

export const getWorktreeReview = command(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => {
  const worktree = (await getCompanionRepository().listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  const [status, diff, cachedDiff, head] = await Promise.all([
    invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.status', localInput: { cwd: worktree.path }, remoteCapability: 'git', remotePayload: { action: 'git.status', worktreeId } }),
    invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.diff', localInput: { cwd: worktree.path, cached: false }, remoteCapability: 'git', remotePayload: { action: 'git.diff', worktreeId, cached: false } }),
    invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.diff', localInput: { cwd: worktree.path, cached: true }, remoteCapability: 'git', remotePayload: { action: 'git.diff', worktreeId, cached: true } }),
    invokeExecutionHost<unknown>({ localCapability: 'git.commit.metadata', localInput: { cwd: worktree.path }, remoteCapability: 'git', remotePayload: { action: 'git.commit.metadata', worktreeId } })
  ]);
  return { status: status.stdout, diff: diff.stdout, cachedDiff: cachedDiff.stdout, head: GitCommitMetadata.parse(head) };
});

export const getWorktreeGitHubStatus = query(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => getGitHubForgeStatusOnHost(worktreeId));
export const getWorktreePullRequest = query(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => getGitHubPullRequestOnHost(worktreeId));

export const stageWorktree = command(z.object({ worktreeId: z.string().min(1), paths: z.array(z.string().min(1)).max(2_000).default(['.']) }), async ({ worktreeId, paths }) => {
  const repository = getCompanionRepository();
  const worktree = (await repository.listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  const result = await invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.stage', localInput: { cwd: worktree.path, paths }, remoteCapability: 'git', remotePayload: { action: 'git.stage', worktreeId, paths } });
  await repository.recordAudit('git.stage', worktreeId, { paths }); return result;
});

export const commitWorktree = command(z.object({ worktreeId: z.string().min(1), message: z.string().trim().min(1).max(5_000), amend: z.boolean().default(false) }), async ({ worktreeId, message, amend }) => {
  const repository = getCompanionRepository();
  const worktree = (await repository.listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  const result = await invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.commit', localInput: { cwd: worktree.path, message, amend }, remoteCapability: 'git', remotePayload: { action: 'git.commit', worktreeId, message, amend } });
  await repository.recordAudit('git.commit', worktreeId, { amend });
  return result;
});

export const pushWorktree = command(z.object({ worktreeId: z.string().min(1), remote: z.string().default('origin'), forceWithLease: z.boolean().default(false) }), async ({ worktreeId, remote, forceWithLease }) => {
  const repository = getCompanionRepository();
  const worktree = (await repository.listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  const result = await invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.push', localInput: { cwd: worktree.path, branch: worktree.branch, remote, forceWithLease }, remoteCapability: 'git', remotePayload: { action: 'git.push', worktreeId, remote, forceWithLease } });
  await repository.recordAudit('git.push', worktreeId, { remote, forceWithLease });
  return result;
});

export const createWorktreePullRequest = command(z.object({ worktreeId: z.string().min(1), title: z.string().trim().min(1).max(256), body: z.string().max(20_000).default(''), base: z.string().min(1).max(240), draft: z.boolean().default(true) }), async ({ worktreeId, title, body, base, draft }) => {
  const repository = getCompanionRepository();
  const worktree = (await repository.listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  const forge = await getGitHubForgeStatusOnHost(worktreeId);
  if (!forge.authenticated) throw new Error(forge.message);
  const result = await invokeExecutionHost<{ stdout: string; stderr: string; url: string | null }>({ localCapability: 'git.pr.create', localInput: { cwd: worktree.path, title, body, base, draft }, remoteCapability: 'git', remotePayload: { action: 'git.pr.create', worktreeId, title, body, base, draft } });
  await repository.recordAudit('git.pr.create', worktreeId, { base, draft, url: result.url }); return result;
});

export const mergeChildWorktree = command(z.object({ parentWorktreeId: z.string().min(1), childWorktreeId: z.string().min(1), message: z.string().trim().min(1).max(5_000) }), async ({ parentWorktreeId, childWorktreeId, message }) => {
  const repository = getCompanionRepository(); const worktrees = await repository.listWorktrees();
  const parent = worktrees.find((item) => item.worktreeId === parentWorktreeId); const child = worktrees.find((item) => item.worktreeId === childWorktreeId);
  if (!parent || !child) throw new Error('Parent or child worktree was not found.');
  if (child.parentWorktreeId !== parent.worktreeId || child.projectId !== parent.projectId) throw new Error('Child worktree is not linked to this parent.');
  if (parent.writerRunId || child.writerRunId) throw new Error('Cannot merge while either worktree has an active writer.');
  const result = await invokeExecutionHost<{ stdout: string; stderr: string; alreadyMerged: boolean }>({
    localCapability: 'git.merge', localInput: { parentPath: parent.path, childPath: child.path, childBranch: child.branch, message },
    remoteCapability: 'git', remotePayload: { action: 'git.merge', parentWorktreeId, childWorktreeId, message }
  });
  await repository.recordAudit(result.alreadyMerged ? 'worktree.child.already-merged' : 'worktree.child.merged', childWorktreeId, { parentWorktreeId, branch: child.branch }); return result;
});

export const acquireWorktreeWriter = command(z.object({
  worktreeId: z.string().min(1), harness: z.literal('hermes')
}), async ({ worktreeId, harness }) => {
  const id = crypto.randomUUID();
  const worktree = await getCompanionRepository().acquireWriter(worktreeId, {
    id, worktreeId, harness, status: 'starting', startedAt: new Date().toISOString(), finishedAt: null
  });
  return { runId: id, worktree };
});

export const releaseWorktreeWriter = command(z.object({
  worktreeId: z.string().min(1), runId: z.string().uuid(), status: z.enum(['completed', 'cancelled', 'failed'])
}), async ({ worktreeId, runId, status }) => {
  await getCompanionRepository().releaseWriter(worktreeId, runId, status);
  return { ok: true as const };
});
