import {
  JsonRpcGatewayClient,
  resolveGatewayWsUrl,
  type ConnectionState as UpstreamConnectionState,
  type GatewayEvent,
  type WebSocketLike
} from '@hermes/shared';

declare const durableSessionBrand: unique symbol;
declare const transportSessionBrand: unique symbol;

export type HermesDurableSessionId = string & { readonly [durableSessionBrand]: true };
export type HermesTransportSessionId = string & { readonly [transportSessionBrand]: true };
export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

export type HermesAttachmentInput = {
  filename: string;
  mediaType: string;
  dataUrl: string;
};

export type CreateSessionInput = {
  profileId: string;
  model?: string;
  provider?: string;
  cwd?: string;
  cols?: number;
  source?: string;
};

export type SubmitPromptInput = {
  text: string;
  attachments?: HermesAttachmentInput[];
  truncateBeforeUserOrdinal?: number;
};

export type HermesApprovalRequest = {
  summary: string;
  allowPermanent: boolean;
};

export type HermesToolCall = {
  id: string;
  name: string;
  arguments?: unknown;
  result?: unknown;
  status: 'running' | 'complete';
};

export type HermesSessionStatus = 'idle' | 'ready' | 'running' | 'awaiting-input' | 'completed' | 'interrupted' | 'failed';
export type HermesTransportState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export type HermesSessionSnapshot = {
  sequence: number;
  connectionState: HermesTransportState;
  durableSessionId: HermesDurableSessionId | null;
  status: HermesSessionStatus;
  history: readonly unknown[];
  assistant: {
    text: string;
    reasoning: string;
    thinkingStatus: string | null;
    toolCalls: readonly HermesToolCall[];
  };
  approval: HermesApprovalRequest | null;
  sessionInfo: Readonly<Record<string, unknown>>;
  error: string | null;
};

export interface HermesSocketProvider {
  getFreshSocketUrl(profileId: string): Promise<string>;
}

export interface HermesSessionController {
  create(input: CreateSessionInput): Promise<HermesDurableSessionId>;
  resume(id: HermesDurableSessionId): Promise<void>;
  submit(input: SubmitPromptInput): Promise<void>;
  interrupt(): Promise<void>;
  respondApproval(choice: ApprovalChoice): Promise<void>;
  reconnect(): Promise<void>;
  subscribe(listener: (snapshot: HermesSessionSnapshot) => void): () => void;
  dispose(): void;
}

export type HermesSessionResumePayload = {
  session_id?: unknown;
  session_key?: unknown;
  stored_session_id?: unknown;
  resumed?: unknown;
  message_count?: unknown;
  messages?: unknown;
  running?: unknown;
  status?: unknown;
  inflight?: unknown;
  info?: unknown;
};

export type HermesSessionControllerOptions = {
  profileId: string;
  socketProvider: HermesSocketProvider;
  socketFactory?: (url: string) => WebSocketLike;
  reconnectDelaysMs?: readonly number[];
  requestTimeoutMs?: number;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object'
  ? value as Record<string, unknown>
  : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const messages = (payload: HermesSessionResumePayload) => Array.isArray(payload.messages) ? payload.messages : [];
const durableId = (payload: HermesSessionResumePayload, fallback?: string): HermesDurableSessionId | null => {
  const value = text(payload.stored_session_id) || text(payload.session_key) || text(payload.resumed) || fallback || '';
  return value ? value as HermesDurableSessionId : null;
};
const transportId = (payload: HermesSessionResumePayload): HermesTransportSessionId | null => {
  const value = text(payload.session_id);
  return value ? value as HermesTransportSessionId : null;
};
const inflight = (payload: HermesSessionResumePayload) => {
  const value = record(payload.inflight);
  return { assistant: text(value.assistant), user: text(value.user), streaming: value.streaming === true };
};
const isRunning = (payload: HermesSessionResumePayload) => {
  const active = inflight(payload);
  return payload.running === true || payload.status === 'running' || payload.status === 'streaming' || active.streaming;
};
const lastAssistantAfter = (items: readonly unknown[], baseline: number) => {
  for (let index = items.length - 1; index >= baseline; index -= 1) {
    const item = record(items[index]);
    if (item.role !== 'assistant') continue;
    const assistantText = text(item.text) || text(item.content);
    const reasoning = text(item.reasoning_content) || text(item.reasoning);
    if (assistantText || reasoning) return { text: assistantText, reasoning };
  }
  return null;
};
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const initialSnapshot = (): HermesSessionSnapshot => ({
  sequence: 0,
  connectionState: 'idle',
  durableSessionId: null,
  status: 'idle',
  history: [],
  assistant: { text: '', reasoning: '', thinkingStatus: null, toolCalls: [] },
  approval: null,
  sessionInfo: {},
  error: null
});

export class UpstreamHermesSessionController implements HermesSessionController {
  private client: JsonRpcGatewayClient | null = null;
  private currentTransportId: HermesTransportSessionId | null = null;
  private snapshotValue = initialSnapshot();
  private readonly listeners = new Set<(snapshot: HermesSessionSnapshot) => void>();
  private readonly ignoredClients = new WeakSet<JsonRpcGatewayClient>();
  private reconnectPromise: Promise<void> | null = null;
  private disposed = false;
  private baselineMessageCount = 0;

  constructor(private readonly options: HermesSessionControllerOptions) {}

  subscribe(listener: (snapshot: HermesSessionSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshotValue);
    return () => this.listeners.delete(listener);
  }

  private publish(update: Partial<HermesSessionSnapshot>) {
    this.snapshotValue = { ...this.snapshotValue, ...update, sequence: this.snapshotValue.sequence + 1 };
    for (const listener of this.listeners) listener(this.snapshotValue);
  }

  private publishAssistant(update: Partial<HermesSessionSnapshot['assistant']>) {
    this.publish({ assistant: { ...this.snapshotValue.assistant, ...update } });
  }

  private mapConnectionState(state: UpstreamConnectionState, reconnecting = false): HermesTransportState {
    if (reconnecting && state !== 'open') return 'reconnecting';
    return state;
  }

  private async openPhysicalSocket(reconnecting: boolean) {
    if (this.disposed) throw new Error('Hermes session controller is closed.');
    const previous = this.client;
    if (previous) {
      this.ignoredClients.add(previous);
      previous.close();
    }
    const client = new JsonRpcGatewayClient({
      requestTimeoutMs: this.options.requestTimeoutMs ?? 120_000,
      socketFactory: this.options.socketFactory
    });
    this.client = client;
    client.onEvent((event) => {
      if (this.client === client && !this.disposed) this.handleEvent(event);
    });
    client.onState((state) => {
      if (this.client !== client || this.disposed || this.ignoredClients.has(client)) return;
      this.publish({ connectionState: this.mapConnectionState(state, reconnecting) });
      if (state === 'closed' || state === 'error') void this.startReconnect();
    });
    const url = await resolveGatewayWsUrl(
      { getGatewayWsUrl: () => this.options.socketProvider.getFreshSocketUrl(this.options.profileId) },
      { authMode: 'oauth', profile: this.options.profileId, wsUrl: '' }
    );
    await client.connect(url);
    return client;
  }

  private async ensureOpen() {
    if (this.client?.connectionState === 'open') return this.client;
    await this.startReconnect();
    const client = this.client as JsonRpcGatewayClient | null;
    if (!client || client.connectionState !== 'open') throw new Error('Hermes connection is unavailable.');
    return client;
  }

  reconnect() { return this.startReconnect(); }

  private startReconnect() {
    if (this.reconnectPromise) return this.reconnectPromise;
    this.reconnectPromise = (async () => {
      let lastError: unknown;
      const reconnecting = Boolean(this.snapshotValue.durableSessionId);
      for (const waitMs of this.options.reconnectDelaysMs ?? [0, 1_000, 2_000, 4_000, 8_000, 15_000]) {
        if (this.disposed) return;
        if (waitMs) await delay(waitMs);
        try {
          this.publish({ connectionState: reconnecting ? 'reconnecting' : 'connecting', error: null });
          const client = await this.openPhysicalSocket(reconnecting);
          if (this.snapshotValue.durableSessionId) {
            const resumed = await client.request<HermesSessionResumePayload>('session.resume', {
              session_id: this.snapshotValue.durableSessionId,
              cols: 96,
              profile: this.options.profileId
            });
            this.applyResume(resumed, this.snapshotValue.durableSessionId, true);
          }
          this.publish({ connectionState: 'open', error: null });
          return;
        } catch (error) {
          lastError = error;
        }
      }
      const message = lastError instanceof Error ? lastError.message : 'Hermes reconnection failed.';
      this.publish({ connectionState: 'error', status: 'failed', error: message });
      throw lastError instanceof Error ? lastError : new Error(message);
    })().finally(() => { this.reconnectPromise = null; });
    return this.reconnectPromise;
  }

  async create(input: CreateSessionInput) {
    const client = await this.ensureOpen();
    const created = await client.request<HermesSessionResumePayload>('session.create', {
      cols: input.cols ?? 96,
      source: input.source ?? 'desktop',
      profile: input.profileId,
      ...(input.model ? { model: input.model } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.cwd ? { cwd: input.cwd } : {})
    });
    const persisted = durableId(created, text(created.session_id));
    if (!persisted || !transportId(created)) throw new Error('Hermes did not return a usable session identity.');
    this.applyResume(created, persisted, false);
    this.publish({ status: 'ready', error: null });
    return persisted;
  }

  async resume(id: HermesDurableSessionId) {
    const client = await this.ensureOpen();
    const resumed = await client.request<HermesSessionResumePayload>('session.resume', {
      session_id: id,
      cols: 96,
      profile: this.options.profileId
    });
    this.applyResume(resumed, id, false);
  }

  private applyResume(payload: HermesSessionResumePayload, fallback: HermesDurableSessionId, recovering: boolean) {
    const currentTransport = transportId(payload);
    if (!currentTransport) throw new Error('Hermes did not return a runtime session identity.');
    const persisted = durableId(payload, fallback);
    if (!persisted) throw new Error('Hermes did not return a durable session identity.');
    this.currentTransportId = currentTransport;
    const history = messages(payload);
    const active = inflight(payload);
    const running = isRunning(payload);
    const recovered = running ? null : lastAssistantAfter(history, this.baselineMessageCount);
    const wasActive = ['running', 'awaiting-input'].includes(this.snapshotValue.status) || recovering;
    this.publish({
      durableSessionId: persisted,
      history,
      sessionInfo: record(payload.info),
      status: running ? 'running' : wasActive && recovered ? 'completed' : 'ready',
      assistant: running
        ? { ...this.snapshotValue.assistant, text: active.assistant || this.snapshotValue.assistant.text }
        : recovered
          ? { ...this.snapshotValue.assistant, ...recovered, thinkingStatus: null }
          : this.snapshotValue.assistant,
      approval: null,
      error: null
    });
  }

  async submit(input: SubmitPromptInput) {
    const client = await this.ensureOpen();
    const sessionId = this.currentTransportId;
    if (!sessionId) throw new Error('Resume or create a Hermes session before submitting.');
    const refs: string[] = [];
    let visual = false;
    for (const attachment of input.attachments ?? []) {
      if (attachment.mediaType.startsWith('image/')) {
        await client.request('image.attach_bytes', { session_id: sessionId, content_base64: attachment.dataUrl, filename: attachment.filename });
        visual = true;
      } else if (attachment.mediaType === 'application/pdf') {
        await client.request('pdf.attach', { session_id: sessionId, content_base64: attachment.dataUrl, filename: attachment.filename });
        visual = true;
      } else {
        const attached = await client.request<{ ref_text?: unknown }>('file.attach', { session_id: sessionId, data_url: attachment.dataUrl, name: attachment.filename });
        if (typeof attached.ref_text === 'string' && attached.ref_text) refs.push(attached.ref_text);
      }
    }
    const submittedText = [refs.join('\n'), input.text].filter(Boolean).join('\n\n') || (visual ? 'Review the attached content.' : '');
    if (!submittedText) throw new Error('Enter a message or attach a supported file.');
    this.baselineMessageCount = this.snapshotValue.history.length;
    this.publish({
      status: 'running',
      assistant: { text: '', reasoning: '', thinkingStatus: null, toolCalls: [] },
      approval: null,
      error: null
    });
    try {
      await client.request('prompt.submit', {
        session_id: sessionId,
        text: submittedText,
        ...(input.truncateBeforeUserOrdinal !== undefined ? { truncate_before_user_ordinal: input.truncateBeforeUserOrdinal } : {})
      }, 1_800_000);
    } catch (error) {
      if (client.connectionState !== 'open') {
        void this.startReconnect();
        return;
      }
      const message = error instanceof Error ? error.message : 'Hermes rejected the prompt.';
      this.publish({ status: 'failed', error: message });
      throw error;
    }
  }

  async interrupt() {
    const client = await this.ensureOpen();
    const sessionId = this.currentTransportId;
    if (!sessionId) return;
    await client.request('session.interrupt', { session_id: sessionId }, 15_000).catch(() => undefined);
    this.publish({ status: 'interrupted', approval: null });
  }

  async respondApproval(choice: ApprovalChoice) {
    const client = await this.ensureOpen();
    const sessionId = this.currentTransportId;
    if (!sessionId || !this.snapshotValue.approval) throw new Error('This Hermes approval is no longer pending.');
    const result = await client.request<{ resolved?: unknown }>('approval.respond', { session_id: sessionId, choice }, 15_000);
    if (result.resolved === 0) throw new Error('This Hermes approval is no longer pending.');
    this.publish({ status: 'running', approval: null });
  }

  private handleEvent(event: GatewayEvent) {
    if (this.currentTransportId && event.session_id && event.session_id !== this.currentTransportId) return;
    const payload = record(event.payload);
    if (event.type === 'message.delta') {
      this.publishAssistant({ text: this.snapshotValue.assistant.text + text(payload.text), thinkingStatus: null });
    } else if (event.type === 'thinking.delta') {
      this.publishAssistant({ thinkingStatus: text(payload.text).trim() || null });
    } else if (event.type === 'reasoning.delta') {
      this.publishAssistant({ reasoning: this.snapshotValue.assistant.reasoning + text(payload.text) });
    } else if (event.type === 'tool.start' || event.type === 'tool.complete') {
      const id = text(payload.tool_id) || text(payload.id) || crypto.randomUUID();
      const existing = this.snapshotValue.assistant.toolCalls.find((tool) => tool.id === id);
      const tool: HermesToolCall = {
        id,
        name: text(payload.name) || existing?.name || 'tool',
        arguments: payload.args ?? payload.args_text ?? existing?.arguments,
        ...(event.type === 'tool.complete' ? { result: payload.result } : {}),
        status: event.type === 'tool.complete' ? 'complete' : 'running'
      };
      this.publishAssistant({ toolCalls: [...this.snapshotValue.assistant.toolCalls.filter((candidate) => candidate.id !== id), tool] });
    } else if (event.type === 'approval.request') {
      this.publish({
        status: 'awaiting-input',
        approval: {
          summary: text(payload.description) || text(payload.command) || 'Hermes approval required',
          allowPermanent: payload.allow_permanent !== false
        }
      });
    } else if (event.type === 'session.info') {
      this.publish({ sessionInfo: { ...this.snapshotValue.sessionInfo, ...payload } });
    } else if (event.type === 'message.complete') {
      const status = text(payload.status);
      const completedText = this.snapshotValue.assistant.text || text(payload.text);
      const completedReasoning = this.snapshotValue.assistant.reasoning || text(payload.reasoning);
      this.publish({
        status: status === 'interrupted' ? 'interrupted' : status === 'error' ? 'failed' : 'completed',
        assistant: { ...this.snapshotValue.assistant, text: completedText, reasoning: completedReasoning, thinkingStatus: null },
        approval: null,
        error: status === 'error' ? text(payload.error) || 'Hermes did not complete the response.' : null
      });
      if (!completedText && !completedReasoning && this.snapshotValue.durableSessionId) void this.resume(this.snapshotValue.durableSessionId);
    } else if (event.type === 'error') {
      this.publish({ status: 'failed', approval: null, error: text(payload.message) || 'Hermes reported an error.' });
    }
  }

  dispose() {
    this.disposed = true;
    if (this.client) {
      this.ignoredClients.add(this.client);
      this.client.close();
      this.client = null;
    }
    this.currentTransportId = null;
    this.publish({ connectionState: 'closed' });
    this.listeners.clear();
  }
}
