import { command, query } from '$app/server';
import { StartRunInput, z, type HarnessCapabilities } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { getHermesServeRunManager } from '$lib/server/hermes-serve-runs';
import { buildHermesHarnessCapabilities } from '$lib/server/hermes-harness-capabilities';
import { invokeNative } from '$lib/server/native-client';
import { listActiveWorktrees, requireActiveWorktree } from '$lib/server/worktree-ownership';

const runId = z.object({ runId: z.string().uuid() });

export const discoverHarnesses = query(z.object({}), async () => {
  const client = getActiveHermesClient(); const context = client.executionContext(); const status = await client.probe();
  return [buildHermesHarnessCapabilities(status, getHermesServeRunManager().available(context.connection))] satisfies HarnessCapabilities[];
});

export const startHarnessRun = command(StartRunInput, async (input) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(input.worktree.worktreeId);
  const normalized = { ...input, worktree: { projectId: worktree.projectId, worktreeId: worktree.worktreeId, path: worktree.path, branch: worktree.branch } };
  const client = getActiveHermesClient(); const context = client.executionContext();
  if (context.connection.id !== worktree.connectionId || (context.connection.hermesProfileId ?? 'default') !== worktree.profileId) throw new Error('The active Hermes workspace changed before this run could start.');
  const result = await getHermesServeRunManager().start(normalized, context.connection, context.token);
  await repository.recordAudit('hermes.run.started', result.id, { worktreeId: worktree.worktreeId });
  return result;
});

export const getHarnessRunEvents = query(runId.extend({ after: z.number().int().nonnegative().default(0) }), async ({ runId, after }) => {
  const hermesRuns = getHermesServeRunManager();
  if (!hermesRuns.has(runId)) throw new Error('Hermes run not found.');
  const normalized = { runId, ...hermesRuns.events(runId, after) };
  const statusEvent = [...normalized.events].reverse().find((item) => item.event.type === 'status');
  const terminalStatus = normalized.status ?? (statusEvent?.event.type === 'status' ? statusEvent.event.status : null);
  if (terminalStatus && ['completed', 'failed', 'cancelled'].includes(terminalStatus)) {
    const run = (await listActiveWorktrees()).find((item) => item.writerRunId === runId);
    if (run) {
      await getCompanionRepository().releaseWriter(run.worktreeId, runId, terminalStatus as 'completed' | 'failed' | 'cancelled');
      await invokeNative('notification.show', { title: `Harness run ${terminalStatus}`, body: `${run.branch} · Background coding run finished.` }).catch(() => undefined);
    }
  }
  return normalized;
});

export const cancelHarnessRun = command(runId, async ({ runId }) => {
  const hermesRuns = getHermesServeRunManager();
  if (!hermesRuns.has(runId)) throw new Error('Hermes run not found.');
  const result = await hermesRuns.cancel(runId);
  await getCompanionRepository().recordAudit('hermes.run.cancelled', runId);
  const worktree = (await listActiveWorktrees()).find((item) => item.writerRunId === runId);
  if (worktree) await getCompanionRepository().releaseWriter(worktree.worktreeId, runId, 'cancelled');
  return result;
});

export const respondHarnessApproval = command(runId.extend({ choice: z.enum(['once', 'session', 'always', 'deny']) }), async ({ runId, choice }) => {
  const runs = getHermesServeRunManager();
  if (!runs.has(runId)) throw new Error('Hermes run not found.');
  const result = await runs.approve(runId, choice);
  await getCompanionRepository().recordAudit('hermes.approval.responded', runId, { choice }); return result;
});

export const listHarnessApprovals = query(z.object({}), async () => getHermesServeRunManager().pendingApprovals());
