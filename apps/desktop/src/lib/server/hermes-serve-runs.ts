import WebSocket from 'ws';
import type { GatewayConnection, HarnessEvent, StartRunInput } from '@hermes-companion/contracts';
import { getCompanionRepository, type CompanionRepository } from './companion-repository.js';
import { invokeNative } from './native-client.js';
import { hasHermesServeAuth, resolveHermesServeWebSocketUrl } from './hermes-serve-auth.js';
import { assistantAfter, inflightTurn, messageCount, reconcileAssistantText, sessionIsRunning, stableSessionKey, type HermesSessionResumePayload } from './hermes-session-recovery.js';

type SequencedEvent = { sequence: number; event: HarnessEvent };
type RunStatus = 'starting' | 'running' | 'completed' | 'cancelled' | 'failed';
type RunState = {
  id: string;
  input: StartRunInput;
  owner: { connectionId: string; profileId: string };
  status: RunStatus;
  events: SequencedEvent[];
  socket: HermesRpcSocket;
  persistedSessionId: string | null;
  transportSessionId: string | null;
  baselineMessageCount: number;
  assistantText: string;
  promptDispatched: boolean;
  released: boolean;
  streamedText: boolean;
  pendingApproval: { sequence: number; approvalId: string; summary: string; allowPermanent: boolean } | null;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
  recoveryProbeInFlight: boolean;
};

type RpcEvent = { type: string; session_id?: string; payload?: Record<string, unknown> };
export type HermesTransportState = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';
export type HermesRpcSocketOptions = {
  autoReconnect?: boolean;
  reconnectDelaysMs?: number[];
  onStateChange?: (state: HermesTransportState) => void;
  onReconnect?: (socket: HermesRpcSocket) => Promise<void>;
  onPermanentClose?: (error: Error) => void;
  connectTimeoutMs?: number;
};
export type HermesServeRunManagerOptions = Pick<HermesRpcSocketOptions, 'reconnectDelaysMs' | 'connectTimeoutMs'> & { recoveryProbeMs?: number };

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class HermesTransportDisconnectedError extends Error {
  readonly recoverable = true;
  constructor(message = 'Hermes serve connection was interrupted.') { super(message); this.name = 'HermesTransportDisconnectedError'; }
}

export class HermesRpcSocket {
  private ws: WebSocket | null = null;
  private nextId = 0;
  private generation = 0;
  private connectedOnce = false;
  private intentionalClose = false;
  private reconnecting: Promise<void> | null = null;
  private state: HermesTransportState = 'closed';
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private recentEvents: RpcEvent[] = [];
  private eventWaiters = new Set<{ predicate: (event: RpcEvent) => boolean; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private eventDeliveryPaused = false;
  private deferredEvents: RpcEvent[] = [];

  constructor(
    private readonly urlFactory: string | (() => Promise<string | null>),
    private readonly onEvent: (event: RpcEvent) => void,
    private readonly options: HermesRpcSocketOptions = {}
  ) {}

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    this.setState('connecting');
    try {
      const physical = await this.openPhysicalSocket();
      if (
        physical.generation !== this.generation
        || this.ws !== physical.ws
        || physical.ws.readyState !== WebSocket.OPEN
      ) throw new HermesTransportDisconnectedError('Hermes serve disconnected while establishing the connection.');
      this.connectedOnce = true;
      this.setState('connected');
    } catch (error) {
      this.setState('failed');
      throw error;
    }
  }

  async request<T>(method: string, params: Record<string, unknown>, timeoutMs = 120_000): Promise<T> {
    if ((!this.ws || this.ws.readyState !== WebSocket.OPEN) && this.reconnecting) await this.reconnecting;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Hermes serve is not connected.');
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Hermes request timed out: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      try {
        this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      } catch (cause) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(cause instanceof Error ? cause : new Error('Hermes request could not be sent.'));
      }
    });
  }

  close() {
    this.intentionalClose = true;
    this.generation += 1;
    this.eventDeliveryPaused = false;
    this.deferredEvents = [];
    const ws = this.ws; this.ws = null;
    this.failPending(new Error('Hermes serve connection closed.'));
    if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
    this.setState('closed');
  }

  transportState() { return this.state; }
  async waitUntilConnected() {
    if (this.reconnecting) await this.reconnecting;
    if (this.state !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Hermes serve reconnection failed.');
  }

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
        // Reconnect restoration can receive a resume response and the first
        // event in one newline-delimited frame. The owning run must install
        // the resumed transport id before it is allowed to filter that event.
        if (this.eventDeliveryPaused) this.deferredEvents.push(event);
        else this.onEvent(event);
      }
    }
  }

  private async resolveUrl() {
    const url = typeof this.urlFactory === 'string' ? this.urlFactory : await this.urlFactory();
    if (!url) throw new Error('This profile does not expose an authorized Hermes Serve WebSocket URL.');
    return url;
  }

  private async openPhysicalSocket() {
    const url = await this.resolveUrl();
    const generation = ++this.generation;
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      // The URL factory mints a fresh owning-host ticket for every physical
      // socket. The Hermes API bearer token is a different credential and is
      // never forwarded to Serve.
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;
      const finish = (callback: () => void) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
      const invalidate = () => {
        if (generation === this.generation) this.generation += 1;
        if (this.ws === ws) this.ws = null;
      };
      const timer = setTimeout(() => {
        invalidate();
        ws.terminate();
        finish(() => reject(new Error('Timed out connecting to Hermes serve.')));
      }, this.options.connectTimeoutMs ?? 15_000);
      ws.once('open', () => finish(() => resolve(ws)));
      ws.once('error', (error) => {
        finish(() => {
          invalidate();
          reject(error);
        });
      });
      ws.on('message', (data) => { if (generation === this.generation) this.receive(data.toString()); });
      ws.on('close', () => this.handleUnexpectedClose(ws, generation));
    });
    return { ws, generation };
  }

  private handleUnexpectedClose(ws: WebSocket, generation: number) {
    if (generation !== this.generation) return;
    if (this.ws === ws) this.ws = null;
    if (this.intentionalClose) return;
    const error = new HermesTransportDisconnectedError();
    this.failPending(error);
    if (!this.connectedOnce || this.options.autoReconnect === false) {
      this.setState('failed');
      this.options.onPermanentClose?.(error);
      return;
    }
    void this.reconnect(error);
  }

  private reconnect(initialError: Error) {
    if (this.reconnecting) return this.reconnecting;
    this.setState('reconnecting');
    this.reconnecting = (async () => {
      let lastError = initialError;
      for (const delayMs of this.options.reconnectDelaysMs ?? [0, 250, 750, 1_500]) {
        if (this.intentionalClose) return;
        if (delayMs) await wait(delayMs);
        if (this.intentionalClose) return;
        try {
          this.eventDeliveryPaused = true;
          this.deferredEvents = [];
          const physical = await this.openPhysicalSocket();
          await this.options.onReconnect?.(this);
          if (this.intentionalClose) {
            this.eventDeliveryPaused = false;
            this.deferredEvents = [];
            return;
          }
          if (
            physical.generation !== this.generation
            || this.ws !== physical.ws
            || physical.ws.readyState !== WebSocket.OPEN
          ) throw new HermesTransportDisconnectedError('Hermes serve disconnected while restoring the session.');
          this.flushDeferredEvents();
          this.setState('connected');
          return;
        } catch (error) {
          this.eventDeliveryPaused = false;
          this.deferredEvents = [];
          lastError = error instanceof Error ? error : new Error('Hermes serve reconnection failed.');
          const ws = this.ws; this.ws = null;
          this.generation += 1;
          if (ws && ws.readyState < WebSocket.CLOSING) ws.terminate();
        }
      }
      if (this.intentionalClose) return;
      this.eventDeliveryPaused = false;
      this.deferredEvents = [];
      this.setState('failed');
      this.failPending(lastError);
      this.options.onPermanentClose?.(lastError);
    })().finally(() => { this.reconnecting = null; });
    return this.reconnecting;
  }

  private setState(state: HermesTransportState) {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private flushDeferredEvents() {
    const events = this.deferredEvents;
    this.deferredEvents = [];
    this.eventDeliveryPaused = false;
    for (const event of events) this.onEvent(event);
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
  const socket = new HermesRpcSocket(() => resolveHermesServeWebSocketUrl(connection), () => undefined, { autoReconnect: false });
  try {
    await socket.connect();
    return await socket.request<T>(method, params, timeoutMs);
  } finally {
    socket.close();
  }
}

export class HermesServeRunManager {
  private runs = new Map<string, RunState>();

  constructor(
    private readonly repository: CompanionRepository = getCompanionRepository(),
    private readonly options: HermesServeRunManagerOptions = {}
  ) {}

  available(connection: GatewayConnection) { return Boolean(connection.serveWsUrl) || hasHermesServeAuth(connection); }
  has(id: string) { return this.runs.has(id); }

  async start(input: StartRunInput, connection: GatewayConnection, _token = '') {
    const id = crypto.randomUUID();
    let run!: RunState;
    const profileId = connection.hermesProfileId ?? 'default';
    const socket = new HermesRpcSocket(
      () => resolveHermesServeWebSocketUrl(connection),
      (event) => void this.handle(run, event),
      {
        ...this.options,
        onStateChange: (state) => {
          if (!run || run.released || state !== 'reconnecting') return;
          this.emit(run, { type: 'status', status: 'running', message: 'Reconnecting to Hermes…' });
        },
        onReconnect: async (transport) => {
          if (!run?.persistedSessionId || run.released) throw new Error('The Hermes coding session cannot be resumed.');
          const resumed = await transport.request<HermesSessionResumePayload>('session.resume', { session_id: run.persistedSessionId, cols: 96, profile: run.owner.profileId });
          if (!resumed.session_id) throw new Error('Hermes did not resume the coding session.');
          run.transportSessionId = resumed.session_id;
          run.persistedSessionId = stableSessionKey(resumed, run.persistedSessionId);
          if (!run.promptDispatched) {
            this.emit(run, { type: 'status', status: 'running', message: 'Reconnected to Hermes' });
            return;
          }
          await this.reconcileResumedRun(run, resumed, 'Reconnected to Hermes');
        },
        onPermanentClose: (error) => {
          if (run && !run.released) void this.finish(run, 'failed', `Hermes connection was lost: ${error.message}`);
        }
      }
    );
    run = { id, input, owner: { connectionId: connection.id, profileId }, status: 'starting', events: [], socket, persistedSessionId: null, transportSessionId: null, baselineMessageCount: 0, assistantText: '', promptDispatched: false, released: false, streamedText: false, pendingApproval: null, recoveryTimer: null, recoveryProbeInFlight: false };
    try { await this.repository.acquireWriter(input.worktree.worktreeId, { id, worktreeId: input.worktree.worktreeId, harness: 'hermes', status: 'starting', startedAt: new Date().toISOString(), finishedAt: null }); }
    catch (error) { throw error; }
    this.runs.set(id, run); this.emit(run, { type: 'status', status: 'starting' });
    try {
      await socket.connect();
      const sessionCreateInput = connection.kind === 'local'
        ? { cols: 96, cwd: input.worktree.path, source: 'desktop', profile: connection.hermesProfileId ?? 'default' }
        : { cols: 96, source: 'desktop', profile: connection.hermesProfileId ?? 'default' };
      const created = await socket.request<HermesSessionResumePayload>('session.create', sessionCreateInput);
      if (!created.session_id) throw new Error('Hermes serve did not return a session id.');
      run.transportSessionId = created.session_id;
      run.persistedSessionId = stableSessionKey(created, String(created.session_id));
      run.baselineMessageCount = messageCount(created);
      run.status = 'running'; this.emit(run, { type: 'status', status: 'running' });
      if (!created.info) {
        try {
          await socket.waitFor((event) => event.type === 'session.info' && event.session_id === run.transportSessionId);
        } catch (error) {
          if (!(error instanceof HermesTransportDisconnectedError)) throw error;
          await socket.waitUntilConnected();
          if (run.released) return this.describe(run);
        }
      }
      run.promptDispatched = true;
      await socket.request('prompt.submit', { session_id: run.transportSessionId, text: input.prompt }, 1_800_000);
      return this.describe(run);
    } catch (error) {
      if (error instanceof HermesTransportDisconnectedError) {
        try {
          await socket.waitUntilConnected();
          return this.describe(run);
        } catch (recoveryError) {
          if (!run.released) await this.finish(run, 'failed', recoveryError instanceof Error ? recoveryError.message : 'Hermes could not restore the coding session.');
          throw recoveryError;
        }
      }
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
    const run = this.require(id); if (!run.transportSessionId) throw new Error('Hermes session is not ready.');
    const result = await run.socket.request<{ resolved: number }>('approval.respond', { session_id: run.transportSessionId, choice });
    if (!result.resolved) throw new Error('This approval is no longer pending.');
    run.pendingApproval = null;
    this.emit(run, { type: 'status', status: 'running', message: choice === 'deny' ? 'Approval denied' : 'Approval granted' });
    return { id, status: run.status, resolved: result.resolved };
  }

  async cancel(id: string) {
    const run = this.require(id);
    if (run.transportSessionId) await run.socket.request('session.interrupt', { session_id: run.transportSessionId }, 15_000).catch(() => undefined);
    await this.finish(run, 'cancelled'); return this.describe(run);
  }

  private armRecoveryProbe(run: RunState) {
    if (run.released || run.status !== 'running') return;
    if (run.recoveryTimer) clearTimeout(run.recoveryTimer);
    run.recoveryTimer = setTimeout(() => void this.probeRecoveredRun(run), this.options.recoveryProbeMs ?? 30_000);
    run.recoveryTimer.unref?.();
  }

  private async probeRecoveredRun(run: RunState) {
    if (run.released || run.status !== 'running' || run.recoveryProbeInFlight || !run.persistedSessionId) return;
    run.recoveryProbeInFlight = true;
    try {
      const resumed = await run.socket.request<HermesSessionResumePayload>('session.resume', { session_id: run.persistedSessionId, cols: 96, profile: run.owner.profileId });
      if (!resumed.session_id) throw new Error('Hermes did not return the recovered coding session.');
      run.transportSessionId = resumed.session_id;
      run.persistedSessionId = stableSessionKey(resumed, run.persistedSessionId);
      await this.reconcileResumedRun(run, resumed);
    } catch {
      if (!run.released && run.socket.transportState() === 'connected') this.armRecoveryProbe(run);
    } finally {
      run.recoveryProbeInFlight = false;
    }
  }

  private async reconcileResumedRun(run: RunState, resumed: HermesSessionResumePayload, statusMessage?: string) {
    const inflight = inflightTurn(resumed);
    if (sessionIsRunning(resumed)) {
      if (inflight.user && inflight.user !== run.input.prompt) {
        await this.finish(run, 'failed', 'Hermes resumed a different in-flight coding turn. Start a new run to retry safely.');
        return false;
      }
      const reconciled = reconcileAssistantText(run.assistantText, inflight.assistant);
      if (reconciled === null) {
        await this.finish(run, 'failed', 'Hermes resumed with response text that does not match the streamed coding turn. Start a new run to retry safely.');
        return false;
      }
      const suffix = reconciled.slice(run.assistantText.length);
      if (suffix) this.emit(run, { type: 'text', text: suffix });
      run.assistantText = reconciled;
      run.streamedText ||= Boolean(reconciled);
      if (statusMessage) this.emit(run, { type: 'status', status: 'running', message: statusMessage });
      this.armRecoveryProbe(run);
      return true;
    }
    const recovered = assistantAfter(resumed, run.baselineMessageCount);
    if (recovered) {
      const reconciled = reconcileAssistantText(run.assistantText, recovered.text);
      if (reconciled === null) {
        await this.finish(run, 'failed', 'Hermes recovered response text that does not match the streamed coding turn. Start a new run to retry safely.');
        return false;
      }
      const suffix = reconciled.slice(run.assistantText.length);
      if (suffix) this.emit(run, { type: 'text', text: suffix });
      run.assistantText = reconciled;
      run.streamedText ||= Boolean(reconciled);
      await this.finish(run, 'completed');
      return false;
    }
    await this.finish(run, 'failed', 'Hermes reconnected, but could not confirm that the coding turn completed. Start a new turn to retry safely.');
    return false;
  }

  private handle(run: RunState, event: RpcEvent) {
    if (!run || (run.transportSessionId && event.session_id && event.session_id !== run.transportSessionId)) return;
    if (run.recoveryTimer) this.armRecoveryProbe(run);
    const payload = event.payload ?? {};
    switch (event.type) {
      case 'message.delta': { const value = text(payload.text); if (value) { run.assistantText += value; run.streamedText = true; this.emit(run, { type: 'text', text: value }); } break; }
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
        const finalText = text(payload.text);
        const reconciled = reconcileAssistantText(run.assistantText, finalText);
        if (reconciled === null) {
          void this.finish(run, 'failed', 'Hermes completed with response text that does not match the streamed coding turn. Reload the session to recover its authoritative history.');
          break;
        }
        const suffix = reconciled.slice(run.assistantText.length);
        if (suffix) this.emit(run, { type: 'text', text: suffix });
        run.assistantText = reconciled;
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
    if (run.released) return;
    if (run.recoveryTimer) clearTimeout(run.recoveryTimer);
    run.recoveryTimer = null;
    const alreadyTerminal = run.status !== 'starting' && run.status !== 'running';
    run.status = status;
    run.pendingApproval = null;
    if (!alreadyTerminal) this.emit(run, { type: 'status', status, ...(message ? { message } : {}) });
    run.socket.close();
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await this.repository.releaseWriter(run.input.worktree.worktreeId, run.id, status);
        run.released = true;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await wait(50 * (attempt + 1));
      }
    }
    if (!run.released) throw lastError instanceof Error ? lastError : new Error('Hermes could not release the coding writer.');
    await invokeNative('notification.show', { title: `Hermes run ${status}`, body: `${run.input.worktree.branch} · ${message ?? 'Coding run finished.'}` }).catch(() => undefined);
  }

  private require(id: string) { const run = this.runs.get(id); if (!run) throw new Error('Hermes run was not found.'); return run; }
  private describe(run: RunState) { return { id: run.id, status: run.status, harness: 'hermes' as const, worktreeId: run.input.worktree.worktreeId }; }
}

let singleton: HermesServeRunManager | null = null;
export const getHermesServeRunManager = () => singleton ??= new HermesServeRunManager();
