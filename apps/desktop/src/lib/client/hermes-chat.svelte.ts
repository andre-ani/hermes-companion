import { writable, type Readable } from 'svelte/store';
import {
  UpstreamHermesSessionController,
  type ApprovalChoice,
  type HermesDurableSessionId,
  type HermesSessionSnapshot
} from '@hermes-companion/hermes-adapter';
import { ContextUsage, HermesMessage, type ChatAttachmentInput, type ChatTurnApproval, type HermesMessage as HermesMessageValue } from '@hermes-companion/contracts';
import { mintHermesServeSocketUrl } from '$lib/client/remote/gateway.remote';
import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';

type SessionOwner = {
  connectionId: string;
  profileId: string;
};

type RequestPresentation = {
  requestId: string;
  modelId: string;
  modelName: string;
  provider: string | null;
  optimisticUser: HermesMessageValue;
  baselineMessageCount: number;
};

export type HermesChatView = {
  durableSessionId: HermesDurableSessionId | null;
  connectionState: HermesSessionSnapshot['connectionState'];
  status: HermesSessionSnapshot['status'];
  messages: HermesMessageValue[];
  requestId: string | null;
  approval: (ChatTurnApproval & { requestId: string }) | null;
  error: string | null;
};

export type HermesChatSubmit = {
  requestId: string;
  text: string;
  attachments: ChatAttachmentInput[];
  modelId?: string;
  modelName?: string;
  provider?: string | null;
  truncateBeforeUserOrdinal?: number;
};

export type HermesChatCreate = {
  model?: string;
  provider?: string;
  cwd?: string;
};

const initialView = (): HermesChatView => ({
  durableSessionId: null,
  connectionState: 'idle',
  status: 'idle',
  messages: [],
  requestId: null,
  approval: null,
  error: null
});

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object'
  ? value as Record<string, unknown>
  : {};

// Semantic port of pinned Desktop's textFromUnknown/displayContentForMessage.
// Hermes history content may be a string or nested provider content blocks;
// presentation must not stringify a valid transcript into "[object Object]".
const textFromUnknown = (value: unknown, depth = 0): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined || depth > 2) return '';
  if (Array.isArray(value)) return value.map((item) => textFromUnknown(item, depth + 1)).join('');
  if (typeof value === 'object') {
    const row = asRecord(value);
    const nested = textFromUnknown(row.text ?? row.output_text ?? row.content ?? row.message, depth + 1);
    if (nested) return nested;
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return String(value);
};

const historyMessages = (items: readonly unknown[], sessionId: HermesDurableSessionId): HermesMessageValue[] => items.map((value, index) => {
  const item = asRecord(value);
  const tools = Array.isArray(item.tool_calls) ? item.tool_calls : [];
  return HermesMessage.parse({
    id: typeof item.id === 'string' ? item.id : `${sessionId}-${index}`,
    sessionId,
    role: item.role,
    text: textFromUnknown(item.content ?? item.text),
    reasoning: typeof item.reasoning_content === 'string' ? item.reasoning_content : typeof item.reasoning === 'string' ? item.reasoning : null,
    createdAt: typeof item.timestamp === 'number'
      ? new Date(item.timestamp * 1_000).toISOString()
      : typeof item.timestamp === 'string' ? item.timestamp : null,
    toolCalls: tools.flatMap((value, toolIndex) => {
      const tool = asRecord(value);
      const fn = asRecord(tool.function);
      const name = typeof fn.name === 'string' ? fn.name : typeof tool.name === 'string' ? tool.name : '';
      return name ? [{
        id: typeof tool.id === 'string' ? tool.id : `${sessionId}-tool-${toolIndex}`,
        name,
        arguments: fn.arguments ?? tool.arguments,
        result: tool.result,
        status: 'complete' as const
      }] : [];
    })
  });
});

const generationStatus = (status: HermesSessionSnapshot['status']) => status === 'completed'
  ? 'completed' as const
  : status === 'interrupted'
    ? 'interrupted' as const
    : status === 'failed'
      ? 'failed' as const
      : 'streaming' as const;

export class HermesChatSession implements Readable<HermesChatView> {
  private readonly controller: UpstreamHermesSessionController;
  private readonly view = writable<HermesChatView>(initialView());
  private readonly unsubscribeController: () => void;
  private latest = initialView();
  private latestSnapshot: HermesSessionSnapshot | null = null;
  private request: RequestPresentation | null = null;
  private resumePromise: Promise<void> | null = null;

  readonly subscribe = this.view.subscribe;

  constructor(readonly owner: SessionOwner) {
    this.controller = new UpstreamHermesSessionController({
      profileId: owner.profileId,
      socketProvider: {
        getFreshSocketUrl: async (profileId) => {
          const result = await resolveRemoteResult(mintHermesServeSocketUrl({
            connectionId: owner.connectionId,
            profileId
          }));
          return result.url;
        }
      }
    });
    this.unsubscribeController = this.controller.subscribe((snapshot) => this.project(snapshot));
  }

  private project(snapshot: HermesSessionSnapshot) {
    this.latestSnapshot = snapshot;
    const durableSessionId = snapshot.durableSessionId;
    const history = durableSessionId ? historyMessages(snapshot.history, durableSessionId) : [];
    if (snapshot.status === 'ready') this.request = null;
    if (!this.request && durableSessionId && ['running', 'awaiting-input'].includes(snapshot.status)) {
      const requestId = crypto.randomUUID();
      this.request = {
        requestId,
        modelId: 'default',
        modelName: 'Hermes',
        provider: null,
        baselineMessageCount: history.length,
        optimisticUser: HermesMessage.parse({
          id: `recovered-user-${requestId}`,
          sessionId: durableSessionId,
          role: 'user',
          text: '',
          createdAt: null
        })
      };
    }
    const request = this.request;
    const optimisticUser = request && history.length <= request.baselineMessageCount && request.optimisticUser.text
      ? request.optimisticUser
      : null;
    const hasAssistantProjection = Boolean(request && durableSessionId && (
      snapshot.assistant.text
      || snapshot.assistant.reasoning
      || snapshot.assistant.toolCalls.length
      || ['running', 'awaiting-input', 'interrupted', 'failed'].includes(snapshot.status)
    ));
    const assistant = hasAssistantProjection && request && durableSessionId ? HermesMessage.parse({
      id: `hermes-assistant-${request.requestId}`,
      sessionId: durableSessionId,
      role: 'assistant',
      text: snapshot.assistant.text,
      reasoning: snapshot.assistant.reasoning || null,
      thinkingStatus: snapshot.assistant.thinkingStatus,
      createdAt: new Date().toISOString(),
      toolCalls: snapshot.assistant.toolCalls,
      inference: {
        source: 'hermes',
        requested: { id: request.modelId, name: request.modelName, provider: request.provider },
        resolved: null,
        upstreamProvider: null
      },
      generation: {
        requestId: request.requestId,
        sequence: snapshot.sequence,
        status: generationStatus(snapshot.status),
        error: snapshot.error
      }
    }) : null;
    const next: HermesChatView = {
      durableSessionId,
      connectionState: snapshot.connectionState,
      status: snapshot.status,
      messages: [...history, ...(optimisticUser ? [optimisticUser] : []), ...(assistant ? [assistant] : [])],
      requestId: request?.requestId ?? null,
      approval: snapshot.approval && request ? {
        id: `approval-${request.requestId}`,
        requestId: request.requestId,
        summary: snapshot.approval.summary,
        allowPermanent: snapshot.approval.allowPermanent
      } : null,
      error: snapshot.error
    };
    this.latest = next;
    this.view.set(next);
  }

  async create(input: HermesChatCreate) {
    return this.controller.create({
      profileId: this.owner.profileId,
      source: 'desktop',
      model: input.model,
      provider: input.provider,
      cwd: input.cwd
    });
  }

  resume(id: HermesDurableSessionId) {
    if (this.latest.durableSessionId === id && this.latest.connectionState === 'open') return Promise.resolve();
    if (this.resumePromise) return this.resumePromise;
    this.resumePromise = this.controller.resume(id).finally(() => { this.resumePromise = null; });
    return this.resumePromise;
  }

  async submit(input: HermesChatSubmit) {
    const sessionId = this.latest.durableSessionId;
    if (!sessionId) throw new Error('Create or resume a Hermes session before submitting.');
    this.request = {
      requestId: input.requestId,
      modelId: input.modelId ?? 'default',
      modelName: input.modelName ?? input.modelId ?? 'Hermes',
      provider: input.provider ?? null,
      baselineMessageCount: this.latest.messages.length,
      optimisticUser: HermesMessage.parse({
        id: `optimistic-user-${input.requestId}`,
        sessionId,
        role: 'user',
        text: input.text,
        createdAt: new Date().toISOString(),
        attachments: input.attachments.map((attachment) => ({
          type: 'file' as const,
          filename: attachment.filename,
          mediaType: attachment.mediaType,
          url: attachment.mediaType.startsWith('image/') ? attachment.dataUrl : undefined
        }))
      })
    };
    await this.controller.submit({
      text: input.text,
      attachments: input.attachments,
      truncateBeforeUserOrdinal: input.truncateBeforeUserOrdinal
    });
  }

  interrupt() { return this.controller.interrupt(); }
  respondApproval(choice: ApprovalChoice) { return this.controller.respondApproval(choice); }
  async contextUsage() {
    try {
      const raw = await this.controller.getContextBreakdown();
      const data = ContextUsage.parse({
        categories: raw.categories,
        contextMax: raw.context_max,
        contextPercent: raw.context_percent,
        contextUsed: raw.context_used,
        estimatedTotal: raw.estimated_total,
        model: raw.model
      });
      if (data.contextMax <= 0 || data.contextUsed > data.contextMax || Math.abs(data.contextPercent - ((data.contextUsed / data.contextMax) * 100)) > 1) {
        return { available: false as const, data: null, reason: 'Hermes did not return usable context bounds for this session.' };
      }
      return { available: true as const, data, reason: null };
    } catch (cause) {
      return { available: false as const, data: null, reason: cause instanceof Error ? cause.message : 'Hermes context usage is unavailable for this session.' };
    }
  }
  reconnect() { return this.controller.reconnect(); }
  current() { return this.latest; }

  dispose() {
    this.unsubscribeController();
    this.controller.dispose();
  }
}

const registry = new Map<string, HermesChatSession>();

export const acquireHermesChatSession = (key: string, owner: SessionOwner) => {
  const existing = registry.get(key);
  if (existing && existing.owner.connectionId === owner.connectionId && existing.owner.profileId === owner.profileId) return existing;
  existing?.dispose();
  const created = new HermesChatSession(owner);
  registry.set(key, created);
  return created;
};

export const adoptHermesChatSession = (draftKey: string, sessionKey: string) => {
  const session = registry.get(draftKey);
  if (!session) return null;
  registry.delete(draftKey);
  registry.get(sessionKey)?.dispose();
  registry.set(sessionKey, session);
  return session;
};

export const disposeHermesChatSession = (key: string) => {
  const session = registry.get(key);
  session?.dispose();
  registry.delete(key);
};
