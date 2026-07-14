import WebSocket from 'ws';
import type { GatewayConnection, HarnessEvent, StartRunInput, WorktreeRecord } from '@hermes-companion/contracts';
import {
  UpstreamHermesSessionController,
  type ApprovalChoice,
  type HermesDurableSessionId,
  type HermesSessionController,
  type HermesSessionSnapshot
} from '@hermes-companion/hermes-adapter';
import { getCompanionRepository, type CompanionRepository } from './companion-repository.js';
import { resolveHermesServeWebSocketUrl, hasHermesServeAuth } from './hermes-serve-auth.js';
import { invokeNative } from './native-client.js';

type RunStatus = 'starting' | 'running' | 'completed' | 'cancelled' | 'failed';
type SequencedEvent = { sequence: number; event: HarnessEvent };
type RunView = {
  id: string;
  worktree: WorktreeRecord;
  controller: HermesSessionController;
  unsubscribe: () => void;
  snapshot: HermesSessionSnapshot | null;
  status: RunStatus;
  events: SequencedEvent[];
  lastAssistantText: string;
  lastReasoning: string;
  toolVersions: Map<string, string>;
  approvalVersion: string | null;
  submitted: boolean;
  released: boolean;
  finishPromise: Promise<void> | null;
};

export type HermesRunCoordinatorOptions = {
  controllerFactory?: (connection: GatewayConnection) => HermesSessionController;
  notify?: (title: string, body: string) => Promise<void>;
  reconnectDelaysMs?: readonly number[];
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const hasAssistantHistory = (snapshot: HermesSessionSnapshot) => snapshot.history.some((value) => {
  const item = record(value);
  return item.role === 'assistant' && Boolean(item.text || item.content || item.reasoning || item.reasoning_content);
});

export class HermesRunCoordinator {
  private readonly views = new Map<string, RunView>();

  constructor(
    private readonly repository: CompanionRepository = getCompanionRepository(),
    private readonly options: HermesRunCoordinatorOptions = {}
  ) {}

  available(connection: GatewayConnection) { return Boolean(connection.serveWsUrl) || hasHermesServeAuth(connection); }
  has(id: string) { return this.views.has(id); }

  dispose() {
    for (const view of this.views.values()) {
      view.unsubscribe();
      view.controller.dispose();
    }
    this.views.clear();
  }

  private createController(connection: GatewayConnection) {
    if (this.options.controllerFactory) return this.options.controllerFactory(connection);
    const profileId = connection.hermesProfileId ?? 'default';
    return new UpstreamHermesSessionController({
      profileId,
      socketProvider: {
        async getFreshSocketUrl() {
          const url = await resolveHermesServeWebSocketUrl(connection);
          if (!url) throw new Error('This profile does not expose an authorized Hermes Serve WebSocket URL.');
          return url;
        }
      },
      socketFactory: (url) => new WebSocket(url) as never,
      reconnectDelaysMs: this.options.reconnectDelaysMs
    });
  }

  private createView(id: string, worktree: WorktreeRecord, connection: GatewayConnection) {
    const controller = this.createController(connection);
    const view: RunView = {
      id, worktree, controller, unsubscribe: () => undefined, snapshot: null,
      status: 'starting', events: [], lastAssistantText: '', lastReasoning: '',
      toolVersions: new Map(), approvalVersion: null, submitted: false,
      released: false, finishPromise: null
    };
    view.unsubscribe = controller.subscribe((snapshot) => this.projectSnapshot(view, snapshot));
    this.views.set(id, view);
    return view;
  }

  async start(input: StartRunInput, connection: GatewayConnection) {
    const id = crypto.randomUUID();
    const profileId = connection.hermesProfileId ?? 'default';
    const worktree = await this.repository.getWorktree(input.worktree.worktreeId, connection.id, profileId);
    if (!worktree
      || worktree.projectId !== input.worktree.projectId
      || worktree.path !== input.worktree.path
      || worktree.branch !== input.worktree.branch) {
      throw new Error('The Hermes run worktree does not belong to the requested connection and profile.');
    }
    await this.repository.acquireWriter(worktree.worktreeId, {
      id, worktreeId: worktree.worktreeId, harness: 'hermes', durableSessionId: null,
      startedAt: new Date().toISOString(), finishedAt: null
    });
    const view = this.createView(id, worktree, connection);
    this.emit(view, { type: 'status', status: 'starting' });
    try {
      const durableSessionId = await view.controller.create({
        profileId,
        requireDurableSession: true,
        cols: 96,
        source: 'desktop',
        ...(connection.kind === 'local' ? { cwd: worktree.path } : {})
      });
      await this.repository.bindRunSession(id, durableSessionId);
      view.submitted = true;
      await view.controller.submit({ text: input.prompt });
      return this.describe(view);
    } catch (error) {
      await this.finish(view, 'failed', error instanceof Error ? error.message : 'Hermes run failed to start.');
      throw error;
    }
  }

  async activeForWorktree(worktreeId: string, connection: GatewayConnection) {
    const profileId = connection.hermesProfileId ?? 'default';
    const worktree = await this.repository.getWorktree(worktreeId, connection.id, profileId);
    if (!worktree?.writerRunId) return null;
    return this.describe(await this.ensure(worktree.writerRunId, connection));
  }

  async events(id: string, after: number, connection: GatewayConnection) {
    const view = await this.ensure(id, connection);
    const latest = view.events.at(-1)?.sequence ?? 0;
    const effectiveAfter = after > latest ? 0 : after;
    return { id, status: view.status, events: view.events.filter((item) => item.sequence > effectiveAfter) };
  }

  async approve(id: string, choice: ApprovalChoice, connection: GatewayConnection) {
    const view = await this.ensure(id, connection);
    if (!view.snapshot?.approval) throw new Error('This Hermes approval is no longer pending.');
    await view.controller.respondApproval(choice);
    return { id, status: view.status, resolved: 1 };
  }

  async cancel(id: string, connection: GatewayConnection) {
    const view = await this.ensure(id, connection);
    await view.controller.interrupt();
    await this.finish(view, 'cancelled');
    return this.describe(view);
  }

  async pendingApprovals(connection: GatewayConnection) {
    const profileId = connection.hermesProfileId ?? 'default';
    for (const worktree of await this.repository.listWorktrees(undefined, connection.id, profileId)) {
      if (worktree.writerRunId && !this.views.has(worktree.writerRunId)) await this.ensure(worktree.writerRunId, connection).catch(() => undefined);
    }
    return [...this.views.values()].flatMap((view) => view.snapshot?.approval ? [{
      runId: view.id,
      worktreeId: view.worktree.worktreeId,
      harness: 'hermes' as const,
      sequence: view.events.at(-1)?.sequence ?? 0,
      approvalId: `${view.id}:${view.snapshot.sequence}`,
      summary: view.snapshot.approval.summary,
      allowPermanent: view.snapshot.approval.allowPermanent
    }] : []);
  }

  private async ensure(id: string, connection: GatewayConnection) {
    const current = this.views.get(id);
    if (current) return current;
    const run = await this.repository.getRun(id);
    if (!run || run.finishedAt) throw new Error('Hermes run was not found.');
    const profileId = connection.hermesProfileId ?? 'default';
    const worktree = await this.repository.getWorktree(run.worktreeId, connection.id, profileId);
    if (!worktree || worktree.writerRunId !== id) throw new Error('The Hermes run no longer owns its authorized worktree.');
    const view = this.createView(id, worktree, connection);
    view.submitted = true;
    this.emit(view, { type: 'status', status: 'running', message: 'Recovering from Hermes…' });
    if (!run.durableSessionId) {
      await this.finish(view, 'failed', 'The app closed before Hermes returned a durable coding session. The prompt was not replayed.');
      return view;
    }
    try {
      await view.controller.resume(run.durableSessionId as HermesDurableSessionId);
      const snapshot = view.snapshot;
      if (!snapshot) throw new Error('Hermes did not return the coding session.');
      if (snapshot.status === 'running' || snapshot.status === 'awaiting-input') {
        this.setStatus(view, 'running', 'Recovered from Hermes');
      } else if (snapshot.status === 'completed') {
        await this.finish(view, 'completed');
      } else if (snapshot.status === 'interrupted') {
        await this.finish(view, 'cancelled');
      } else if (snapshot.status === 'failed') {
        await this.finish(view, 'failed', snapshot.error ?? 'Hermes reported that the coding run failed.');
      } else if (hasAssistantHistory(snapshot)) {
        await this.finish(view, 'completed');
      } else {
        await this.finish(view, 'failed', 'Hermes resumed the durable session but could not confirm a completed coding turn. The prompt was not replayed.');
      }
      return view;
    } catch (error) {
      view.unsubscribe();
      view.controller.dispose();
      this.views.delete(id);
      throw error;
    }
  }

  private projectSnapshot(view: RunView, snapshot: HermesSessionSnapshot) {
    if (view.released) return;
    view.snapshot = snapshot;
    const assistantSuffix = snapshot.assistant.text.startsWith(view.lastAssistantText)
      ? snapshot.assistant.text.slice(view.lastAssistantText.length)
      : snapshot.assistant.text;
    if (assistantSuffix) this.emit(view, { type: 'text', text: assistantSuffix });
    view.lastAssistantText = snapshot.assistant.text;
    const reasoningSuffix = snapshot.assistant.reasoning.startsWith(view.lastReasoning)
      ? snapshot.assistant.reasoning.slice(view.lastReasoning.length)
      : snapshot.assistant.reasoning;
    if (reasoningSuffix) this.emit(view, { type: 'text', text: reasoningSuffix });
    view.lastReasoning = snapshot.assistant.reasoning;
    for (const tool of snapshot.assistant.toolCalls) {
      const version = JSON.stringify(tool);
      if (view.toolVersions.get(tool.id) === version) continue;
      view.toolVersions.set(tool.id, version);
      this.emit(view, { type: 'tool', tool: { id: tool.id, name: tool.name, arguments: tool.arguments, result: tool.result, status: tool.status } });
    }
    const approvalVersion = snapshot.approval ? `${snapshot.approval.summary}:${snapshot.approval.allowPermanent}` : null;
    if (snapshot.approval && approvalVersion !== view.approvalVersion) {
      this.emit(view, {
        type: 'approval', approvalId: `${view.id}:${snapshot.sequence}`,
        summary: snapshot.approval.summary, nativeFallback: false,
        allowPermanent: snapshot.approval.allowPermanent
      });
      void this.notify('Hermes approval required', `${view.worktree.branch} · ${snapshot.approval.summary}`);
    }
    view.approvalVersion = approvalVersion;
    if (!view.submitted) return;
    if (snapshot.status === 'running' || snapshot.status === 'awaiting-input') this.setStatus(view, 'running', snapshot.error ?? undefined);
    else if (snapshot.status === 'completed') void this.finish(view, 'completed');
    else if (snapshot.status === 'interrupted') void this.finish(view, 'cancelled');
    else if (snapshot.status === 'failed') void this.finish(view, 'failed', snapshot.error ?? 'Hermes run failed.');
  }

  private setStatus(view: RunView, status: RunStatus, message?: string) {
    view.status = status;
    const last = view.events.at(-1)?.event;
    if (last?.type === 'status' && last.status === status && last.message === message) return;
    this.emit(view, { type: 'status', status, ...(message ? { message } : {}) });
  }

  private emit(view: RunView, event: HarnessEvent) {
    view.events.push({ sequence: (view.events.at(-1)?.sequence ?? 0) + 1, event });
  }

  private finish(view: RunView, status: Exclude<RunStatus, 'starting' | 'running'>, message?: string) {
    if (view.finishPromise) return view.finishPromise;
    view.finishPromise = (async () => {
      this.setStatus(view, status, message);
      let released = false;
      let lastError: unknown;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          released = await this.repository.releaseWriter(view.worktree.worktreeId, view.id, status);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await wait(50 * (attempt + 1));
        }
      }
      if (lastError) throw lastError instanceof Error ? lastError : new Error('Hermes could not release the coding writer.');
      view.released = true;
      view.unsubscribe();
      view.controller.dispose();
      if (released) await this.notify(`Hermes run ${status}`, `${view.worktree.branch} · ${message ?? 'Coding run finished.'}`);
    })();
    return view.finishPromise;
  }

  private notify(title: string, body: string) {
    return this.options.notify?.(title, body)
      ?? invokeNative('notification.show', { title, body }).then(() => undefined).catch(() => undefined);
  }

  private describe(view: RunView) {
    return { id: view.id, status: view.status, harness: 'hermes' as const, worktreeId: view.worktree.worktreeId };
  }
}

let singleton: HermesRunCoordinator | null = null;
export const getHermesRunCoordinator = () => singleton ??= new HermesRunCoordinator();
