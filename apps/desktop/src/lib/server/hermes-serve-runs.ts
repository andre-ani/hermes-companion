import WebSocket from 'ws';
import type { GatewayConnection, HarnessEvent, StartRunInput } from '@hermes-companion/contracts';
import { getCompanionRepository, type CompanionRepository } from './companion-repository.js';
import { invokeNative } from './native-client.js';
import { hasHermesServeAuth, resolveHermesServeWebSocketUrl } from './hermes-serve-auth.js';

type SequencedEvent = { sequence: number; event: HarnessEvent };
type RunStatus = 'starting' | 'running' | 'completed' | 'cancelled' | 'failed';
type RunState = {
  id: string;
  input: StartRunInput;
  status: RunStatus;
  events: SequencedEvent[];
  socket: HermesRpcSocket;
  sessionId: string | null;
  released: boolean;
  streamedText: boolean;
  pendingApproval: { sequence: number; approvalId: string; summary: string; allowPermanent: boolean } | null;
};

type RpcEvent = { type: string; session_id?: string; payload?: Record<string, unknown> };

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';

export class HermesRpcSocket {
  private ws: WebSocket | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private recentEvents: RpcEvent[] = [];
  private eventWaiters = new Set<{ predicate: (event: RpcEvent) => boolean; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly url: string, private readonly onEvent: (event: RpcEvent) => void) {}

  async connect() {
    await new Promise<void>((resolve, reject) => {
      // serveWsUrl is already authorized by its owning host (for example with a
      // dashboard WS ticket or token query parameter). The Hermes API bearer
      // token is a different credential and must never be forwarded here.
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => { ws.terminate(); reject(new Error('Timed out connecting to Hermes serve.')); }, 15_000);
      ws.once('open', () => { clearTimeout(timer); resolve(); });
      ws.once('error', (error) => { clearTimeout(timer); reject(error); });
      ws.on('message', (data) => this.receive(data.toString()));
      ws.on('close', () => this.failPending(new Error('Hermes serve connection closed.')));
    });
  }

  request<T>(method: string, params: Record<string, unknown>, timeoutMs = 120_000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Hermes serve is not connected.'));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Hermes request timed out: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  close() { this.ws?.close(); this.ws = null; }

  waitFor(predicate: (event: RpcEvent) => boolean, timeoutMs = 120_000) {
    if (this.recentEvents.some(predicate)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter = { predicate, resolve: () => { clearTimeout(waiter.timer); this.eventWaiters.delete(waiter); resolve(); }, reject, timer: undefined as unknown as ReturnType<typeof setTimeout> };
      waiter.timer = setTimeout(() => { this.eventWaiters.delete(waiter); reject(new Error('Timed out waiting for Hermes session readiness.')); }, timeoutMs);
      this.eventWaiters.add(waiter);
    });
  }

  private receive(raw: string) {
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      let frame: Record<string, unknown>; try { frame = asRecord(JSON.parse(line)); } catch { continue; }
      const id = typeof frame.id === 'number' ? frame.id : null;
      if (id !== null) {
        const pending = this.pending.get(id); if (!pending) continue;
        clearTimeout(pending.timer); this.pending.delete(id);
        if (frame.error) pending.reject(new Error(text(asRecord(frame.error).message) || 'Hermes request failed.'));
        else pending.resolve(frame.result);
        continue;
      }
      if (frame.method === 'event') {
        const event = asRecord(frame.params) as RpcEvent;
        this.recentEvents.push(event); if (this.recentEvents.length > 100) this.recentEvents.shift();
        for (const waiter of [...this.eventWaiters]) if (waiter.predicate(event)) waiter.resolve();
        this.onEvent(event);
      }
    }
  }

  private failPending(error: Error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    for (const waiter of this.eventWaiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.eventWaiters.clear();
  }
}

export async function requestHermesServe<T>(
  connection: GatewayConnection,
  method: string,
  params: Record<string, unknown>,
  timeoutMs = 15_000
): Promise<T> {
  const url = await resolveHermesServeWebSocketUrl(connection);
  if (!url) throw new Error('This profile does not expose an authorized Hermes Serve WebSocket URL.');
  const socket = new HermesRpcSocket(url, () => undefined);
  try {
    await socket.connect();
    return await socket.request<T>(method, params, timeoutMs);
  } finally {
    socket.close();
  }
}

export class HermesServeRunManager {
  private runs = new Map<string, RunState>();

  constructor(private readonly repository: CompanionRepository = getCompanionRepository()) {}

  available(connection: GatewayConnection) { return Boolean(connection.serveWsUrl) || hasHermesServeAuth(connection); }
  has(id: string) { return this.runs.has(id); }

  async start(input: StartRunInput, connection: GatewayConnection, _token = '') {
    const url = await resolveHermesServeWebSocketUrl(connection);
    if (!url) throw new Error('Hermes coding runs require an explicitly authorized Hermes Serve WebSocket URL.');
    const id = crypto.randomUUID();
    let run!: RunState;
    const socket = new HermesRpcSocket(url, (event) => void this.handle(run, event));
    run = { id, input, status: 'starting', events: [], socket, sessionId: null, released: false, streamedText: false, pendingApproval: null };
    try { await this.repository.acquireWriter(input.worktree.worktreeId, { id, worktreeId: input.worktree.worktreeId, harness: 'hermes', status: 'starting', startedAt: new Date().toISOString(), finishedAt: null }); }
    catch (error) { throw error; }
    this.runs.set(id, run); this.emit(run, { type: 'status', status: 'starting' });
    try {
      await socket.connect();
      const sessionCreateInput = connection.kind === 'local'
        ? { cols: 96, cwd: input.worktree.path, source: 'desktop', profile: connection.hermesProfileId ?? 'default' }
        : { cols: 96, source: 'desktop', profile: connection.hermesProfileId ?? 'default' };
      const created = await socket.request<{ session_id: string; info?: unknown }>('session.create', sessionCreateInput);
      if (!created.session_id) throw new Error('Hermes serve did not return a session id.');
      run.sessionId = created.session_id; run.status = 'running'; this.emit(run, { type: 'status', status: 'running' });
      if (!created.info) await socket.waitFor((event) => event.type === 'session.info' && event.session_id === created.session_id);
      await socket.request('prompt.submit', { session_id: created.session_id, text: input.prompt }, 1_800_000);
      return this.describe(run);
    } catch (error) {
      await this.finish(run, 'failed', error instanceof Error ? error.message : 'Hermes run failed to start.');
      throw error;
    }
  }

  events(id: string, after = 0) {
    const run = this.require(id); return { id, status: run.status, events: run.events.filter((item) => item.sequence > after) };
  }

  pendingApprovals() {
    return [...this.runs.values()].flatMap((run) => run.pendingApproval ? [{ runId: run.id, worktreeId: run.input.worktree.worktreeId, harness: 'hermes' as const, ...run.pendingApproval }] : []);
  }

  async approve(id: string, choice: 'once' | 'session' | 'always' | 'deny') {
    const run = this.require(id); if (!run.sessionId) throw new Error('Hermes session is not ready.');
    const result = await run.socket.request<{ resolved: number }>('approval.respond', { session_id: run.sessionId, choice });
    if (!result.resolved) throw new Error('This approval is no longer pending.');
    run.pendingApproval = null;
    this.emit(run, { type: 'status', status: 'running', message: choice === 'deny' ? 'Approval denied' : 'Approval granted' });
    return { id, status: run.status, resolved: result.resolved };
  }

  async cancel(id: string) {
    const run = this.require(id);
    if (run.sessionId) await run.socket.request('session.interrupt', { session_id: run.sessionId }, 15_000).catch(() => undefined);
    await this.finish(run, 'cancelled'); return this.describe(run);
  }

  private handle(run: RunState, event: RpcEvent) {
    if (!run || (run.sessionId && event.session_id && event.session_id !== run.sessionId)) return;
    const payload = event.payload ?? {};
    switch (event.type) {
      case 'message.delta': { const value = text(payload.text); if (value) { run.streamedText = true; this.emit(run, { type: 'text', text: value }); } break; }
      case 'reasoning.delta': case 'thinking.delta': { const value = text(payload.text); if (value) this.emit(run, { type: 'text', text: value }); break; }
      case 'tool.start': this.emit(run, { type: 'tool', tool: { id: text(payload.tool_id) || crypto.randomUUID(), name: text(payload.name) || 'tool', arguments: payload.args_text ?? payload.context, status: 'running' } }); break;
      case 'tool.complete': this.emit(run, { type: 'tool', tool: { id: text(payload.tool_id) || crypto.randomUUID(), name: text(payload.name) || 'tool', arguments: payload.args, result: payload.result, status: 'complete' } }); break;
      case 'approval.request': {
        const approval = { type: 'approval' as const, approvalId: text(payload.id) || run.id, summary: text(payload.description) || text(payload.command) || 'Hermes approval required', nativeFallback: false, allowPermanent: payload.allow_permanent !== false };
        this.emit(run, approval); run.pendingApproval = { sequence: run.events.at(-1)!.sequence, approvalId: approval.approvalId, summary: approval.summary, allowPermanent: approval.allowPermanent };
        void invokeNative('notification.show', { title: 'Hermes approval required', body: `${run.input.worktree.branch} · ${approval.summary}` }).catch(() => undefined);
        break;
      }
      case 'status.update': this.emit(run, { type: 'status', status: 'running', message: text(payload.text) || undefined }); break;
      case 'message.complete': {
        const finalText = text(payload.text); if (finalText && !run.streamedText) this.emit(run, { type: 'text', text: finalText });
        void this.finish(run, payload.status === 'error' ? 'failed' : payload.status === 'interrupted' ? 'cancelled' : 'completed'); break;
      }
      case 'error': void this.finish(run, 'failed', text(payload.message) || 'Hermes run failed.'); break;
    }
  }

  private emit(run: RunState, event: HarnessEvent) {
    run.events.push({ sequence: (run.events.at(-1)?.sequence ?? 0) + 1, event });
    if (run.events.length > 10_000) run.events.splice(0, run.events.length - 10_000);
  }

  private async finish(run: RunState, status: Exclude<RunStatus, 'starting' | 'running'>, message?: string) {
    if (run.released) return; run.released = true; run.status = status;
    run.pendingApproval = null;
    this.emit(run, { type: 'status', status, ...(message ? { message } : {}) }); run.socket.close();
    await this.repository.releaseWriter(run.input.worktree.worktreeId, run.id, status);
    await invokeNative('notification.show', { title: `Hermes run ${status}`, body: `${run.input.worktree.branch} · ${message ?? 'Coding run finished.'}` }).catch(() => undefined);
  }

  private require(id: string) { const run = this.runs.get(id); if (!run) throw new Error('Hermes run was not found.'); return run; }
  private describe(run: RunState) { return { id: run.id, status: run.status, harness: 'hermes' as const, worktreeId: run.input.worktree.worktreeId }; }
}

let singleton: HermesServeRunManager | null = null;
export const getHermesServeRunManager = () => singleton ??= new HermesServeRunManager();
