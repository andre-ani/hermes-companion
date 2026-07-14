import { command, query } from '$app/server';
import { GitCommitMetadata, GitCommitResult, GitRemoteStatus, HermesGitBranch, HermesGitWorkspace, HermesGitWorktree, HermesRepoStatus, HermesReviewList, HermesReviewScope, HermesWorktreeCreateInput, SessionWorkspaceTarget, WorktreeRecord, z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { invokeExecutionHost } from '$lib/server/execution-host';
import { invokeNative } from '$lib/server/native-client';
import { ensureThreadWorktree, removeThreadWorktree } from '$lib/server/worktree-service';
import { getGitHubForgeStatus as getGitHubForgeStatusOnHost, getGitHubPullRequest as getGitHubPullRequestOnHost } from '$lib/server/github-forge';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { createHermesProject, deleteHermesProject, getHermesProjectSessions, listHermesProjects, renameHermesProject, setHermesProjectArchived } from '$lib/server/hermes-projects';
import { listActiveWorktrees, requireActiveWorktree } from '$lib/server/worktree-ownership';
import { validateSessionWorkspaceSession, validateSessionWorkspaceWorktree } from '$lib/server/session-workspace-identity';

export const listProjectBindings = query(z.object({}), async () => {
  const repository = getCompanionRepository(); const connection = getActiveHermesClient().executionContext().connection;
  if (connection.serveUrl || connection.serveWsUrl) return listHermesProjects(connection).then((result) => result.projects).catch(() => repository.listProjects(connection.id));
  return repository.listProjects(connection.id);
});

export const getProjectSessions = query(z.object({ projectId: z.string().min(1) }), async ({ projectId }) => {
  const connection = getActiveHermesClient().executionContext().connection;
  if (!connection.serveUrl && !connection.serveWsUrl) return null;
  return getHermesProjectSessions(connection, projectId);
});

async function resolveHermesRepository(projectId: string, requestedPath?: string, client = getActiveHermesClient()) {
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

const SessionWorktreeBindingInput = z.object({
  connectionId: z.string().min(1),
  profileId: z.string().min(1),
  projectId: z.string().min(1),
  repositoryPath: z.string().min(1),
  worktreePath: z.string().min(1),
  branch: z.string().min(1),
  sessionId: z.string().min(1)
});

function activeWorkspaceOwnerMatches(connectionId: string, profileId: string) {
  const client = getActiveHermesClient();
  const connection = client.executionContext().connection;
  if (connection.id !== connectionId) return { ok: false as const, reason: 'This session belongs to another Hermes connection.', connection };
  if (connection.hermesProfileId && connection.hermesProfileId !== profileId) return { ok: false as const, reason: 'This session belongs to another Hermes profile.', connection };
  return { ok: true as const, connection, client };
}

async function findVerifiedHermesWorktree(input: z.infer<typeof SessionWorktreeBindingInput>, client = getActiveHermesClient()) {
  const session = await client.getSession(input.sessionId, input.profileId);
  const sessionIdentity = validateSessionWorkspaceSession(input, session);
  if (!sessionIdentity.ok) return sessionIdentity;
  const resolved = await resolveHermesRepository(input.projectId, input.repositoryPath, client);
  const payload = await resolved.client.requestControl<{ worktrees?: unknown[] }>(`/api/git/worktrees?path=${encodeURIComponent(resolved.repositoryPath)}`);
  const worktreeIdentity = validateSessionWorkspaceWorktree(input, (payload.worktrees ?? []).map((value) => HermesGitWorktree.parse(value)));
  if (!worktreeIdentity.ok) return worktreeIdentity;
  return { ok: true as const, resolved, target: worktreeIdentity.target };
}

async function attachVerifiedHermesWorktree(
  input: z.infer<typeof SessionWorktreeBindingInput>,
  verifiedResult?: Awaited<ReturnType<typeof findVerifiedHermesWorktree>>,
  client = getActiveHermesClient()
) {
  const repository = getCompanionRepository();
  const existing = await repository.getWorktreeForThread(input.sessionId, input.projectId, input.connectionId, input.profileId);
  const verified = verifiedResult ?? await findVerifiedHermesWorktree(input, client);
  if (!verified.ok) throw new Error(verified.reason);
  const branch = verified.target.branch;
  if (!branch) throw new Error('The verified Hermes worktree has no branch.');
  const currentOwner = activeWorkspaceOwnerMatches(input.connectionId, input.profileId);
  if (!currentOwner.ok || currentOwner.client !== client) throw new Error(currentOwner.ok ? 'The active Hermes connection changed before the worktree could be attached.' : currentOwner.reason);
  const attached = await invokeExecutionHost<Partial<WorktreeRecord> & { path: string; branch: string }>({
    localCapability: 'git.worktree.attach',
    localInput: { repositoryPath: verified.resolved.repositoryPath, worktreePath: verified.target.path, branch },
    remoteCapability: 'worktrees',
    remotePayload: { action: 'worktree.attach', connectionId: input.connectionId, profileId: input.profileId, projectId: input.projectId, repositoryPath: verified.resolved.repositoryPath, worktreePath: verified.target.path, threadId: input.sessionId, branch },
    expectedConnectionId: input.connectionId
  });
  if (attached.path !== verified.target.path || attached.branch !== branch) throw new Error('The execution host attached a different worktree than Hermes verified.');
  const worktree = WorktreeRecord.parse({
    connectionId: input.connectionId,
    profileId: input.profileId,
    projectId: input.projectId,
    worktreeId: attached.worktreeId ?? existing?.worktreeId ?? crypto.randomUUID(),
    path: attached.path,
    branch: attached.branch,
    threadId: input.sessionId,
    parentWorktreeId: existing?.parentWorktreeId ?? null,
    writerRunId: existing?.writerRunId ?? null,
    createdAt: attached.createdAt ?? existing?.createdAt ?? new Date().toISOString()
  });
  return repository.upsertWorktreeBinding(worktree);
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

export const bindHermesProjectWorktree = command(SessionWorktreeBindingInput, async (input) => {
  const owner = activeWorkspaceOwnerMatches(input.connectionId, input.profileId);
  if (!owner.ok) throw new Error(owner.reason);
  return attachVerifiedHermesWorktree(input, undefined, owner.client);
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
  const [status, review] = await Promise.all([
    resolved.client.requestControl<unknown>(gitQuery('status', { path: resolved.path })),
    resolved.client.requestControl<unknown>(gitQuery('review/list', { path: resolved.path, scope: input.scope }))
  ]);
  return {
    status: HermesRepoStatus.nullable().parse(status),
    review: HermesReviewList.parse(review)
  };
});

export const getHermesGitReviewDiff = query(HermesGitReviewQuery.extend({ file: z.string().min(1).max(4_096), staged: z.boolean().default(false) }), async (input) => {
  const resolved = await resolveHermesGitWorkspace(input);
  const payload = await resolved.client.requestControl<{ diff?: unknown }>(gitQuery('review/diff', { path: resolved.path, scope: input.scope, file: input.file, staged: input.scope === 'uncommitted' && input.staged }));
  return { diff: z.string().parse(payload.diff ?? '') };
});

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
    localCapability: 'git.inspect', localInput: { repositoryPath, initialize }, remoteCapability: 'projects', remotePayload: { action: 'project.inspect', repositoryPath, initialize }, expectedConnectionId: connection.id
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
  const project = await repository.getProject(projectId, connection.id); if (!project) throw new Error('Project was not found.');
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
  const project = await repository.getProject(projectId, connection.id); if (!project) throw new Error('Project was not found.');
  await repository.upsertProject({ ...project, archived });
  return { ok: true as const };
});

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
  const repository = getCompanionRepository(); const parent = await requireActiveWorktree(parentWorktreeId);
  if (parent.parentWorktreeId) throw new Error('Nested child worktrees are not supported.');
  const child = await ensureThreadWorktree({ projectId: parent.projectId, threadId: `${parent.threadId}:child:${crypto.randomUUID()}`, branch, base: parent.branch, parentWorktreeId });
  await repository.recordAudit('worktree.child.created', child.worktreeId, { parentWorktreeId, branch }); return child;
});

export const removeProjectWorktree = command(z.object({ worktreeId: z.string().min(1), force: z.boolean().default(false) }), async ({ worktreeId, force }) => {
  await removeThreadWorktree(worktreeId, force);
  return { ok: true as const };
});

export const getWorktreeReview = command(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => {
  const worktree = await requireActiveWorktree(worktreeId);
  const [status, diff, cachedDiff, head] = await Promise.all([
    invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.status', localInput: { cwd: worktree.path }, remoteCapability: 'git', remotePayload: { action: 'git.status', worktreeId }, expectedConnectionId: worktree.connectionId }),
    invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.diff', localInput: { cwd: worktree.path, cached: false }, remoteCapability: 'git', remotePayload: { action: 'git.diff', worktreeId, cached: false }, expectedConnectionId: worktree.connectionId }),
    invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.diff', localInput: { cwd: worktree.path, cached: true }, remoteCapability: 'git', remotePayload: { action: 'git.diff', worktreeId, cached: true }, expectedConnectionId: worktree.connectionId }),
    invokeExecutionHost<unknown>({ localCapability: 'git.commit.metadata', localInput: { cwd: worktree.path }, remoteCapability: 'git', remotePayload: { action: 'git.commit.metadata', worktreeId }, expectedConnectionId: worktree.connectionId })
  ]);
  return { status: status.stdout, diff: diff.stdout, cachedDiff: cachedDiff.stdout, head: GitCommitMetadata.parse(head) };
});

export const getWorktreeGitHubStatus = query(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => getGitHubForgeStatusOnHost(worktreeId));
export const getWorktreePullRequest = query(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => getGitHubPullRequestOnHost(worktreeId));

export const getWorktreeRemoteStatus = query(z.object({ worktreeId: z.string().min(1), remote: z.string().min(1).default('origin') }), async ({ worktreeId, remote }) => {
  const worktree = await requireActiveWorktree(worktreeId);
  return GitRemoteStatus.parse(await invokeExecutionHost<unknown>({
    localCapability: 'git.remote.status',
    localInput: { cwd: worktree.path, branch: worktree.branch, remote },
    remoteCapability: 'git',
    remotePayload: { action: 'git.remote.status', worktreeId, remote },
    expectedConnectionId: worktree.connectionId
  }));
});

export const resolveSessionWorkspaceTarget = command(SessionWorktreeBindingInput, async (input) => {
  const owner = activeWorkspaceOwnerMatches(input.connectionId, input.profileId);
  if (!owner.ok) return SessionWorkspaceTarget.parse({ available: false, reason: owner.reason });
  if (!owner.connection.controlUrl) {
    return SessionWorkspaceTarget.parse({ available: false, reason: 'This connection cannot verify the session worktree.' });
  }

  const verified = await findVerifiedHermesWorktree(input, owner.client).catch(() => ({ ok: false as const, reason: 'Hermes could not verify this session worktree.' }));
  if (!verified.ok) return SessionWorkspaceTarget.parse({ available: false, reason: verified.reason });
  return SessionWorkspaceTarget.parse({ available: true, worktree: await attachVerifiedHermesWorktree(input, verified, owner.client) });
});

export const getWorktreeCommitMetadata = query(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => {
  const worktree = await requireActiveWorktree(worktreeId);
  return GitCommitMetadata.parse(await invokeExecutionHost<unknown>({
    localCapability: 'git.commit.metadata',
    localInput: { cwd: worktree.path },
    remoteCapability: 'git',
    remotePayload: { action: 'git.commit.metadata', worktreeId },
    expectedConnectionId: worktree.connectionId
  }));
});

export const stageWorktree = command(z.object({ worktreeId: z.string().min(1), paths: z.array(z.string().min(1)).max(2_000).default(['.']) }), async ({ worktreeId, paths }) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(worktreeId);
  const result = await invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.stage', localInput: { cwd: worktree.path, paths }, remoteCapability: 'git', remotePayload: { action: 'git.stage', worktreeId, paths }, expectedConnectionId: worktree.connectionId });
  await repository.recordAudit('git.stage', worktreeId, { paths }); return result;
});

export const unstageWorktree = command(z.object({ worktreeId: z.string().min(1), paths: z.array(z.string().min(1)).max(2_000).default(['.']) }), async ({ worktreeId, paths }) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(worktreeId);
  const result = await invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.unstage', localInput: { cwd: worktree.path, paths }, remoteCapability: 'git', remotePayload: { action: 'git.unstage', worktreeId, paths }, expectedConnectionId: worktree.connectionId });
  await repository.recordAudit('git.unstage', worktreeId, { paths }); return result;
});

export const revertWorktree = command(z.object({ worktreeId: z.string().min(1), paths: z.array(z.string().min(1)).min(1).max(2_000) }), async ({ worktreeId, paths }) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(worktreeId);
  const result = await invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.revert', localInput: { cwd: worktree.path, paths }, remoteCapability: 'git', remotePayload: { action: 'git.revert', worktreeId, paths }, expectedConnectionId: worktree.connectionId });
  await repository.recordAudit('git.revert', worktreeId, { paths }); return result;
});

export const commitWorktree = command(z.object({ worktreeId: z.string().min(1), message: z.string().trim().min(1).max(5_000), amend: z.boolean().default(false) }), async ({ worktreeId, message, amend }) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(worktreeId);
  const result = GitCommitResult.parse(await invokeExecutionHost<unknown>({ localCapability: 'git.commit', localInput: { cwd: worktree.path, message, amend }, remoteCapability: 'git', remotePayload: { action: 'git.commit', worktreeId, message, amend }, expectedConnectionId: worktree.connectionId }));
  await repository.recordAudit('git.commit', worktreeId, { amend });
  return result;
});

export const pushWorktree = command(z.object({ worktreeId: z.string().min(1), remote: z.string().default('origin'), forceWithLease: z.boolean().default(false) }), async ({ worktreeId, remote, forceWithLease }) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(worktreeId);
  const result = await invokeExecutionHost<{ stdout: string; stderr: string }>({ localCapability: 'git.push', localInput: { cwd: worktree.path, branch: worktree.branch, remote, forceWithLease }, remoteCapability: 'git', remotePayload: { action: 'git.push', worktreeId, remote, forceWithLease }, expectedConnectionId: worktree.connectionId });
  await repository.recordAudit('git.push', worktreeId, { remote, forceWithLease });
  return result;
});

export const createWorktreePullRequest = command(z.object({ worktreeId: z.string().min(1), title: z.string().trim().min(1).max(256), body: z.string().max(20_000).default(''), base: z.string().min(1).max(240), draft: z.boolean().default(true) }), async ({ worktreeId, title, body, base, draft }) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(worktreeId);
  const forge = await getGitHubForgeStatusOnHost(worktreeId);
  if (!forge.authenticated) throw new Error(forge.message);
  const result = await invokeExecutionHost<{ stdout: string; stderr: string; url: string | null }>({ localCapability: 'git.pr.create', localInput: { cwd: worktree.path, title, body, base, draft }, remoteCapability: 'git', remotePayload: { action: 'git.pr.create', worktreeId, title, body, base, draft }, expectedConnectionId: worktree.connectionId });
  await repository.recordAudit('git.pr.create', worktreeId, { base, draft, url: result.url }); return result;
});

export const mergeChildWorktree = command(z.object({ parentWorktreeId: z.string().min(1), childWorktreeId: z.string().min(1), message: z.string().trim().min(1).max(5_000) }), async ({ parentWorktreeId, childWorktreeId, message }) => {
  const repository = getCompanionRepository(); const worktrees = await listActiveWorktrees();
  const parent = worktrees.find((item) => item.worktreeId === parentWorktreeId); const child = worktrees.find((item) => item.worktreeId === childWorktreeId);
  if (!parent || !child) throw new Error('Parent or child worktree was not found.');
  if (child.parentWorktreeId !== parent.worktreeId || child.projectId !== parent.projectId) throw new Error('Child worktree is not linked to this parent.');
  if (parent.writerRunId || child.writerRunId) throw new Error('Cannot merge while either worktree has an active writer.');
  const result = await invokeExecutionHost<{ stdout: string; stderr: string; alreadyMerged: boolean }>({
    localCapability: 'git.merge', localInput: { parentPath: parent.path, childPath: child.path, childBranch: child.branch, message },
    remoteCapability: 'git', remotePayload: { action: 'git.merge', parentWorktreeId, childWorktreeId, message }, expectedConnectionId: parent.connectionId
  });
  await repository.recordAudit(result.alreadyMerged ? 'worktree.child.already-merged' : 'worktree.child.merged', childWorktreeId, { parentWorktreeId, branch: child.branch }); return result;
});

export const acquireWorktreeWriter = command(z.object({
  worktreeId: z.string().min(1), harness: z.literal('hermes')
}), async ({ worktreeId, harness }) => {
  const id = crypto.randomUUID();
  await requireActiveWorktree(worktreeId);
  const worktree = await getCompanionRepository().acquireWriter(worktreeId, {
    id, worktreeId, harness, durableSessionId: null, startedAt: new Date().toISOString(), finishedAt: null
  });
  return { runId: id, worktree };
});

export const releaseWorktreeWriter = command(z.object({
  worktreeId: z.string().min(1), runId: z.string().uuid(), status: z.enum(['completed', 'cancelled', 'failed'])
}), async ({ worktreeId, runId, status }) => {
  await requireActiveWorktree(worktreeId);
  await getCompanionRepository().releaseWriter(worktreeId, runId, status);
  return { ok: true as const };
});
