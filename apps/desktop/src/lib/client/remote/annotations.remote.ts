import { command, query } from '$app/server';
import { AnnotationPayload, z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { requireExecutionHost } from '$lib/server/execution-host';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { getHermesServeRunManager } from '$lib/server/hermes-serve-runs';
import { invokeNative } from '$lib/server/native-client';
import { assertActiveWorktreeOwner, requireActiveWorktree } from '$lib/server/worktree-ownership';

export const listWorktreeAnnotations = query(z.object({ worktreeId: z.string().min(1) }), async ({ worktreeId }) => {
  await requireActiveWorktree(worktreeId);
  return getCompanionRepository().listAnnotations(worktreeId);
});

const annotationTask = z.object({ annotationId: z.string().uuid() });

function taskPrompt(annotation: Awaited<ReturnType<ReturnType<typeof getCompanionRepository>['getAnnotation']>>, worktree: { branch: string }) {
  if (!annotation) throw new Error('Design annotation was not found.');
  const element = JSON.stringify(annotation.selectedElement, null, 2);
  return `Implement this design annotation in the current Git worktree.\n\nRoute: ${annotation.route}\nBranch: ${worktree.branch}\nSelected element:\n${element}\n\nRequested change:\n${annotation.note}${annotation.screenshot ? `\n\nReference screenshot: ${annotation.screenshot}` : ''}\n\nKeep the change scoped to this annotation, verify it, and report the files changed.`;
}

async function startTask(annotationId: string) {
  const repository = getCompanionRepository(); const annotation = await repository.getAnnotation(annotationId);
  if (!annotation) throw new Error('Design annotation was not found.');
  if (annotation.runId && ['starting', 'running'].includes(annotation.taskStatus)) return annotation;
  if (annotation.taskStatus === 'completed') throw new Error('This design task is already complete.');
  const worktree = await requireActiveWorktree(annotation.sourceWorktreeId).catch(() => null);
  if (!worktree || worktree.threadId !== annotation.targetThreadId) throw new Error('Design task worktree binding is no longer valid.');
  try {
    const client = getActiveHermesClient(); const context = client.executionContext();
    if (context.connection.id !== worktree.connectionId || (context.connection.hermesProfileId ?? 'default') !== worktree.profileId) throw new Error('The active Hermes workspace changed before this design task could start.');
    await repository.updateAnnotationTask(annotationId, { taskStatus: 'starting', runId: null, lastEventSequence: 0 });
    const run = await getHermesServeRunManager().start({ harness: 'hermes', prompt: taskPrompt(annotation, worktree), worktree: { projectId: worktree.projectId, worktreeId: worktree.worktreeId, path: worktree.path, branch: worktree.branch } }, context.connection, context.token);
    await repository.updateAnnotationTask(annotationId, { taskStatus: 'running', runId: run.id, lastEventSequence: 0 });
    await repository.recordAudit('annotation.task.started', annotationId, { runId: run.id, worktreeId: worktree.worktreeId });
    return repository.getAnnotation(annotationId);
  } catch (error) {
    await repository.updateAnnotationTask(annotationId, { taskStatus: 'failed', runId: null });
    throw error;
  }
}

export const startAnnotationTask = command(annotationTask, async ({ annotationId }) => startTask(annotationId));

export const getAnnotationTaskEvents = query(annotationTask.extend({ after: z.number().int().nonnegative().default(0) }), async ({ annotationId, after }) => {
  const repository = getCompanionRepository(); const annotation = await repository.getAnnotation(annotationId);
  if (!annotation) throw new Error('Design annotation was not found.');
  const worktree = await requireActiveWorktree(annotation.sourceWorktreeId);
  if (worktree.threadId !== annotation.targetThreadId) throw new Error('Design task worktree binding is no longer valid.');
  if (!annotation.runId) return { annotationId, runId: null, status: annotation.taskStatus, events: [] };
  const manager = getHermesServeRunManager();
  if (!manager.has(annotation.runId)) throw new Error('The linked Hermes run is no longer available on this app instance.');
  const result = manager.events(annotation.runId, after); const latestSequence = result.events.at(-1)?.sequence ?? annotation.lastEventSequence;
  const terminal = ['completed', 'failed', 'cancelled'].includes(result.status);
  const previous = annotation.taskStatus;
  await repository.updateAnnotationTask(annotationId, { taskStatus: result.status, lastEventSequence: latestSequence });
  if (terminal && previous !== result.status) {
    await repository.recordAudit('annotation.task.finished', annotationId, { runId: annotation.runId, status: result.status, worktreeId: annotation.sourceWorktreeId });
    if (result.status === 'completed') {
      const preview = (await repository.listPreviews(annotation.sourceWorktreeId))[0];
      if (preview) {
        // Register the refreshed preview, but do not attach a native view from a
        // background annotation task. A visible, owner-bound dock must open it.
        assertActiveWorktreeOwner(worktree);
        await invokeNative('preview.register', preview).then(() => repository.recordAudit('annotation.preview.refreshed', annotationId, { previewId: preview.id, worktreeId: annotation.sourceWorktreeId })).catch(() => undefined);
      }
    }
  }
  return { annotationId, runId: annotation.runId, status: result.status, events: result.events };
});

export const createWorktreeAnnotation = command(AnnotationPayload, async (payload) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(payload.sourceWorktreeId).catch(() => null);
  if (!worktree) throw new Error('Annotation source worktree was not found for the active Hermes connection.');
  if (worktree.threadId !== payload.targetThreadId) throw new Error('Annotation target thread does not match its source worktree.');
  const host = requireExecutionHost(worktree.connectionId);
  if (host.connection.kind === 'remote') {
    if (!host.bridge) throw new Error('Remote annotation delivery requires an authenticated companion bridge.');
    const remote = await host.bridge.invoke<{ id?: string }>('annotations', { action: 'annotation.create', payload });
    const annotation = await repository.addAnnotation(payload, remote.id && z.string().uuid().safeParse(remote.id).success ? remote.id : undefined);
    if (host.connection.serveWsUrl && !worktree.writerRunId) return startTask(annotation.id).catch(() => repository.getAnnotation(annotation.id));
    return annotation;
  }
  const annotation = await repository.addAnnotation(payload);
  if (host.connection.serveWsUrl && !worktree.writerRunId) return startTask(annotation.id).catch(() => repository.getAnnotation(annotation.id));
  return annotation;
});
