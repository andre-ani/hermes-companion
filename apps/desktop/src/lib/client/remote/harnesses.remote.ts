import { command, query } from '$app/server';
import { StartRunInput, z, type HarnessCapabilities } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { getHermesRunCoordinator } from '$lib/server/hermes-run-coordinator';
import { buildHermesHarnessCapabilities } from '$lib/server/hermes-harness-capabilities';
import { requireActiveWorktree } from '$lib/server/worktree-ownership';

const runId = z.object({ runId: z.string().uuid() });

export const discoverHarnesses = query(z.object({}), async () => {
  const client = getActiveHermesClient(); const context = client.executionContext(); const status = await client.probe();
  return [buildHermesHarnessCapabilities(status, getHermesRunCoordinator().available(context.connection))] satisfies HarnessCapabilities[];
});

export const getActiveHarnessRun = query(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => {
  await requireActiveWorktree(worktreeId);
  const connection = getActiveHermesClient().executionContext().connection;
  return getHermesRunCoordinator().activeForWorktree(worktreeId, connection);
});

export const startHarnessRun = command(StartRunInput, async (input) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(input.worktree.worktreeId);
  const normalized = { ...input, worktree: { projectId: worktree.projectId, worktreeId: worktree.worktreeId, path: worktree.path, branch: worktree.branch } };
  const client = getActiveHermesClient(); const context = client.executionContext();
  if (context.connection.id !== worktree.connectionId || (context.connection.hermesProfileId ?? 'default') !== worktree.profileId) throw new Error('The active Hermes workspace changed before this run could start.');
  const result = await getHermesRunCoordinator().start(normalized, context.connection);
  await repository.recordAudit('hermes.run.started', result.id, { worktreeId: worktree.worktreeId });
  return result;
});

export const getHarnessRunEvents = query(runId.extend({ after: z.number().int().nonnegative().default(0) }), async ({ runId, after }) => {
  const connection = getActiveHermesClient().executionContext().connection;
  return { runId, ...await getHermesRunCoordinator().events(runId, after, connection) };
});

export const cancelHarnessRun = command(runId, async ({ runId }) => {
  const connection = getActiveHermesClient().executionContext().connection;
  const result = await getHermesRunCoordinator().cancel(runId, connection);
  await getCompanionRepository().recordAudit('hermes.run.cancelled', runId);
  return result;
});

export const respondHarnessApproval = command(runId.extend({ choice: z.enum(['once', 'session', 'always', 'deny']) }), async ({ runId, choice }) => {
  const connection = getActiveHermesClient().executionContext().connection;
  const result = await getHermesRunCoordinator().approve(runId, choice, connection);
  await getCompanionRepository().recordAudit('hermes.approval.responded', runId, { choice }); return result;
});

export const listHarnessApprovals = query(z.object({}), async () => {
  const connection = getActiveHermesClient().executionContext().connection;
  return getHermesRunCoordinator().pendingApprovals(connection);
});
