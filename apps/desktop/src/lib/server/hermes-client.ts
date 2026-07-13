import {
  GatewayConnection,
  HERMES_API_CAPABILITY_CONTRACT_V1,
  HermesApiCapabilitiesDescriptor,
  z,
  type GatewayStatus,
  type HermesMessage,
  type HermesSession,
  type ModelInfo
} from '@hermes-companion/contracts';
import { getHermesServeAuth } from './hermes-serve-auth.js';
import { humanizeModelId, modelProviderFromId } from '../model-identity.js';

const DEFAULT_TIMEOUT_MS = 8_000;

const HermesSessionWire = z.object({
  id: z.string().min(1), title: z.string().nullable().optional(), model: z.string().nullable().optional(),
  started_at: z.union([z.string(), z.number()]).nullable().optional(), last_active: z.union([z.string(), z.number()]).nullable().optional(),
  message_count: z.number().int().nonnegative().optional(), archived: z.boolean().optional(), source: z.string().optional(), platform: z.string().optional(), channel: z.string().optional(), profile_id: z.string().optional(), provider: z.string().optional(), kind: z.string().optional(), project_id: z.string().optional(), branch: z.string().optional(), status: z.string().optional(), attention: z.string().optional(), needs_approval: z.boolean().optional(), awaiting_input: z.boolean().optional(), pr_state: z.string().optional(), environment: z.string().optional(), unread: z.boolean().optional()
}).passthrough();
const HermesMessageWire = z.object({
  id: z.string().min(1).optional(), session_id: z.string().optional(), role: z.string(), content: z.string().default(''),
  timestamp: z.union([z.string(), z.number()]).nullable().optional(), reasoning: z.string().nullable().optional(),
  reasoning_content: z.string().nullable().optional(), tool_calls: z.array(z.unknown()).optional()
}).passthrough();
const HermesSessionListWire = z.object({ object: z.literal('list'), data: z.array(HermesSessionWire) });
const HermesMessageListWire = z.object({ object: z.literal('list'), session_id: z.string(), data: z.array(HermesMessageWire) });
const HermesSessionEnvelopeWire = z.object({ object: z.literal('hermes.session'), session: HermesSessionWire });

export class HermesApiError extends Error {
  constructor(message: string, readonly status: number, readonly path: string) {
    super(message);
    this.name = 'HermesApiError';
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const stringValue = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const nullableString = (value: unknown) => typeof value === 'string' ? value : null;
const numberValue = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const timestampValue = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1_000).toISOString() : null;
const perTokenPrice = (value: unknown) => {
  if (typeof value !== 'string') return null;
  if (value.trim().toLocaleLowerCase() === 'free') return 0;
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed / 1_000_000 : null;
};

export function normalizeHermesModelOptions(value: unknown): ModelInfo[] {
  const payload = record(value);
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  return providers.flatMap((rawProvider) => {
    const provider = record(rawProvider);
    const runtimeProvider = stringValue(provider.slug).trim().toLocaleLowerCase();
    if (!runtimeProvider) return [];
    const capabilities = record(provider.capabilities);
    const pricing = record(provider.pricing);
    return (Array.isArray(provider.models) ? provider.models : []).flatMap((rawModel) => {
      const id = stringValue(rawModel).trim();
      if (!id) return [];
      const modelCapabilities = record(capabilities[id]);
      const modelPricing = record(pricing[id]);
      const supportedParameters = [modelCapabilities.fast === true ? 'fast' : null, modelCapabilities.reasoning === true ? 'reasoning' : null].filter((item): item is string => item !== null);
      const routeKind = /(^|\/)auto$/i.test(id) ? 'router' as const : /^@?preset\//i.test(id) ? 'preset' as const : 'model' as const;
      return [{
        id,
        name: humanizeModelId(id),
        source: 'hermes' as const,
        provider: modelProviderFromId(id, runtimeProvider),
        runtimeProvider,
        description: null,
        contextLength: null,
        inputModalities: [],
        outputModalities: [],
        supportedParameters,
        routeKind,
        canonicalModelId: null,
        pricing: Object.keys(modelPricing).length ? { prompt: perTokenPrice(modelPricing.input), completion: perTokenPrice(modelPricing.output) } : null,
        policyStatus: 'unknown' as const,
        policyReason: null
      }];
    });
  });
}

export function normalizeHermesSession(value: unknown): HermesSession {
  const item = record(value);
  return {
    id: stringValue(item.id, stringValue(item.session_id)),
    title: stringValue(item.title, stringValue(item.preview, 'Untitled session')),
    model: nullableString(item.model),
    createdAt: timestampValue(item.started_at ?? item.created_at),
    updatedAt: timestampValue(item.last_active ?? item.updated_at),
    messageCount: numberValue(item.message_count),
    archived: item.archived === true,
    source: ['slack', 'discord', 'cron'].includes(String(item.source ?? item.platform)) ? String(item.source ?? item.platform) as 'slack' | 'discord' | 'cron' : 'chat',
    channel: nullableString(item.channel),
    profileId: nullableString(item.profile_id ?? item.profile),
    provider: nullableString(item.provider),
    kind: ['code', 'review', 'message', 'job'].includes(String(item.kind)) ? String(item.kind) as 'code' | 'review' | 'message' | 'job' : 'chat',
    projectId: nullableString(item.project_id),
    cwd: nullableString(item.cwd),
    branch: nullableString(item.branch ?? item.git_branch),
    status: ['ready', 'working', 'completed', 'failed'].includes(String(item.status)) ? String(item.status) as 'ready' | 'working' | 'completed' | 'failed' : 'active',
    attention: item.needs_approval === true ? 'approval' : item.awaiting_input === true ? 'input' : ['approval', 'input', 'review', 'blocked'].includes(String(item.attention)) ? String(item.attention) as 'approval' | 'input' | 'review' | 'blocked' : undefined,
    prState: ['draft', 'open', 'review-required', 'approved', 'merged'].includes(String(item.pr_state)) ? String(item.pr_state) as 'draft' | 'open' | 'review-required' | 'approved' | 'merged' : 'none',
    environment: ['remote', 'cloud'].includes(String(item.environment)) ? String(item.environment) as 'remote' | 'cloud' : 'local',
    unread: item.unread === true
  };
}

export class HermesClient {
  readonly connection;

  constructor(connection: GatewayConnection, private readonly token = '', private readonly controlToken = '') {
    this.connection = GatewayConnection.parse(connection);
  }

  executionContext() { return { connection: this.connection, token: this.token }; }

  requestAgent<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!path.startsWith('/api/') && !path.startsWith('/v1/')) throw new Error('Hermes requests must use a supported API path.');
    return this.request<T>(path, init, timeoutMs);
  }

  private url(path: string) {
    return new URL(path, `${this.connection.url.replace(/\/$/, '')}/`);
  }

  private controlUrl(path: string) {
    const origin = this.connection.controlUrl;
    if (!origin) throw new Error('This connection does not define a Hermes Dashboard control-service URL.');
    return new URL(path, `${origin.replace(/\/$/, '')}/`);
  }

  private async request<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    const request = { ...init, headers, signal: init.signal ?? AbortSignal.timeout(timeoutMs) };
    const auth = getHermesServeAuth(this.connection);
    const response = auth && this.connection.serveUrl === this.connection.url
      ? await auth.request(path, request)
      : await fetch(this.url(path), request);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new HermesApiError(body.slice(0, 500) || `Hermes request failed (${response.status})`, response.status, path);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async requestControl<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    if (!path.startsWith('/api/')) throw new Error('Hermes control requests must use a supported /api path.');
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (this.controlToken) headers.set('x-hermes-session-token', this.controlToken);
    const request = { ...init, headers, signal: init.signal ?? AbortSignal.timeout(timeoutMs) };
    const auth = getHermesServeAuth(this.connection);
    const response = auth && this.connection.serveUrl === this.connection.controlUrl
      ? await auth.request(path, request)
      : await fetch(this.controlUrl(path), request);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new HermesApiError(body.slice(0, 500) || `Hermes control request failed (${response.status})`, response.status, path);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private requestSessionResource<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    // Session resources live on the Hermes control surface in split local
    // installs and on authenticated Serve in the lean remote deployment.
    return this.connection.controlUrl
      ? this.requestControl<T>(path, init, timeoutMs)
      : this.request<T>(path, init, timeoutMs);
  }

  private async endpointAvailable(path: string, method = 'GET', control = false): Promise<boolean> {
    try {
      if (control && !this.connection.controlUrl) return false;
      const credential = control ? this.controlToken : this.token;
      const headers = new Headers();
      if (credential) headers.set(control ? 'x-hermes-session-token' : 'authorization', control ? credential : `Bearer ${credential}`);
      const auth = getHermesServeAuth(this.connection);
      const origin = control ? this.connection.controlUrl : this.connection.url;
      const response = auth && this.connection.serveUrl === origin
        ? await auth.request(path, { method, headers, signal: AbortSignal.timeout(3_000) })
        : await fetch(control ? this.controlUrl(path) : this.url(path), { method, headers, signal: AbortSignal.timeout(3_000) });
      if (!response.ok) return false;
      const type = response.headers.get('content-type') ?? '';
      if ((path.startsWith('/api/') || path.startsWith('/v1/')) && !type.includes('application/json')) return false;
      if (type.includes('application/json')) await response.json();
      return true;
    } catch {
      return false;
    }
  }

  private async capabilities(): Promise<HermesApiCapabilitiesDescriptor | null> {
    try {
      return HermesApiCapabilitiesDescriptor.parse(await this.request<unknown>('/v1/capabilities'));
    } catch {
      return null;
    }
  }

  async probe(): Promise<GatewayStatus> {
    const started = performance.now();
    const serveAuth = getHermesServeAuth(this.connection);
    const serveReachable = Boolean(this.connection.serveWsUrl) || Boolean(serveAuth && await serveAuth.mintWebSocketUrl().then(() => true).catch(() => false));
    const advertised = await this.capabilities();
    const feature = (name: string) => advertised?.features[name] === true;
    const endpoint = (name: string) => Boolean(advertised?.endpoints[name]?.path);
    const [healthFallback, modelsFallback, modelOptions, profiles, memory, controlSkills, config, jobsFallback, mcp, analytics, operations, logs, credentials, toolsets, permissions, messaging, webhooks, learning, curator, updates, plugins, kanban, achievements, checkpoints] = await Promise.all([
      advertised ? false : this.endpointAvailable('/health'),
      advertised ? false : this.endpointAvailable('/v1/models'),
      this.endpointAvailable('/api/model/options?explicit_only=1', 'GET', true),
      this.endpointAvailable('/api/profiles', 'GET', true),
      this.endpointAvailable('/api/memory', 'GET', true),
      this.endpointAvailable('/api/skills', 'GET', true),
      this.endpointAvailable('/api/config/schema', 'GET', true),
      endpoint('jobs') ? false : this.endpointAvailable('/api/jobs'),
      this.endpointAvailable('/api/mcp/servers', 'GET', true),
      this.endpointAvailable('/api/analytics/usage?days=1', 'GET', true),
      this.endpointAvailable('/api/status', 'GET', true)
      , this.endpointAvailable('/api/logs', 'GET', true)
      , this.endpointAvailable('/api/env', 'GET', true)
      , this.endpointAvailable('/api/tools/toolsets', 'GET', true)
      , this.endpointAvailable('/api/tools/computer-use/status', 'GET', true)
      , this.endpointAvailable('/api/messaging/platforms', 'GET', true)
      , this.endpointAvailable('/api/webhooks', 'GET', true)
      , this.endpointAvailable('/api/learning/graph', 'GET', true)
      , this.endpointAvailable('/api/curator', 'GET', true)
      , this.endpointAvailable('/api/hermes/update/check', 'GET', true)
      , this.endpointAvailable('/api/dashboard/plugins/hub', 'GET', true)
      , this.endpointAvailable('/api/plugins/kanban/boards', 'GET', true)
      , this.endpointAvailable('/api/plugins/hermes-achievements/achievements', 'GET', true)
      , this.endpointAvailable('/api/ops/checkpoints', 'GET', true)
    ]);
    const health = endpoint('health') || healthFallback || serveReachable;
    const models = endpoint('models') || modelsFallback || modelOptions;
    const chatCompletions = feature('chat_completions') || endpoint('chat_completions');
    const sessions = feature('session_resources') || endpoint('sessions') || serveReachable;
    const enhancedChat = feature('session_chat_streaming') || endpoint('session_chat_stream') || serveReachable;
    const skills = feature('skills_api') || endpoint('skills') || controlSkills;
    const jobs = endpoint('jobs') || jobsFallback;
    const approvals = (feature('run_approval_response') && endpoint('run_approval')) || serveReachable;
    const connected = health || chatCompletions || sessions;
    const anyEnhanced = [sessions, profiles, memory, skills, config, jobs, approvals, mcp, analytics, operations, logs, credentials, toolsets, permissions, messaging, webhooks, learning, curator, updates, plugins, kanban, achievements, checkpoints].some(Boolean);
    return {
      connection: this.connection,
      status: connected && anyEnhanced && sessions ? 'enhanced' : connected && !anyEnhanced ? 'connected' : anyEnhanced ? 'partial' : 'disconnected',
      latencyMs: connected || anyEnhanced ? Math.round(performance.now() - started) : null,
      core: { health, chatCompletions, models, streaming: chatCompletions || enhancedChat },
      enhanced: { sessions, enhancedChat, profiles, memory, skills, config, jobs, approvals, mcp, analytics, operations, logs, credentials, toolsets, permissions, messaging, webhooks, learning, curator, updates, plugins, kanban, achievements, checkpoints },
      compatibility: advertised
        ? { mode: 'verified', contract: HERMES_API_CAPABILITY_CONTRACT_V1, compatible: advertised.platform === undefined || advertised.platform === 'hermes-agent', reason: advertised.platform && advertised.platform !== 'hermes-agent' ? `Unsupported capability platform: ${advertised.platform}` : `Verified from ${HERMES_API_CAPABILITY_CONTRACT_V1}.` }
        : connected
          ? { mode: 'legacy-probe', contract: null, compatible: true, reason: serveReachable ? 'Connected through the authenticated upstream Hermes Serve RPC transport.' : 'Connected through endpoint probes; this host does not advertise a versioned capability descriptor.' }
          : anyEnhanced
            ? { mode: 'unavailable', contract: null, compatible: false, reason: 'The Hermes control service is available, but no compatible Agent API descriptor or fallback endpoint responded.' }
            : { mode: 'unavailable', contract: null, compatible: false, reason: 'No supported Hermes capability descriptor or compatible fallback endpoint responded.' },
      checkedAt: new Date().toISOString(),
      error: connected || anyEnhanced ? null : 'No supported Hermes or OpenAI-compatible endpoint responded.'
    };
  }

  async listSessions(limit = 50, offset = 0): Promise<HermesSession[]> {
    const response = HermesSessionListWire.parse(await this.request<unknown>(`/api/sessions?limit=${limit}&offset=${offset}`));
    return response.data.map((item) => this.normalizeSession(item));
  }

  async getSession(sessionId: string, profileId?: string): Promise<HermesSession> {
    const profileQuery = profileId ? `?profile=${encodeURIComponent(profileId)}` : '';
    return this.normalizeSession(await this.requestSessionResource<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}${profileQuery}`));
  }

  async createSession(input: { title?: string; model?: string }): Promise<HermesSession> {
    const response = HermesSessionEnvelopeWire.parse(await this.request<unknown>('/api/sessions', { method: 'POST', body: JSON.stringify(input) }));
    return this.normalizeSession(response.session);
  }

  async updateSession(sessionId: string, title: string, profileId?: string): Promise<HermesSession> {
    const profileQuery = profileId ? `?profile=${encodeURIComponent(profileId)}` : '';
    await this.requestSessionResource<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH', body: JSON.stringify({ title, ...(profileId ? { profile: profileId } : {}) })
    });
    return this.getSession(sessionId, profileId);
  }

  async deleteSession(sessionId: string, profileId?: string): Promise<void> {
    const profileQuery = profileId ? `?profile=${encodeURIComponent(profileId)}` : '';
    await this.requestSessionResource(`/api/sessions/${encodeURIComponent(sessionId)}${profileQuery}`, { method: 'DELETE' });
  }

  async setSessionArchived(sessionId: string, archived: boolean, profileId?: string): Promise<void> {
    await this.requestSessionResource(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH', body: JSON.stringify({ archived, ...(profileId ? { profile: profileId } : {}) })
    });
  }

  async searchSessions(query: string, profileId?: string, limit = 12): Promise<Array<{ sessionId: string; lineageRoot: string | null; model: string | null; role: string | null; snippet: string; source: string | null; startedAt: number | null; profileId: string | null }>> {
    const params = new URLSearchParams({ q: query, limit: String(Math.max(1, Math.min(limit, 100))) });
    if (profileId) params.set('profile', profileId);
    const response = record(await this.requestSessionResource<unknown>(`/api/sessions/search?${params}`));
    const results = Array.isArray(response.results) ? response.results : [];
    return results.map((value) => { const item = record(value); return {
      sessionId: stringValue(item.session_id), lineageRoot: nullableString(item.lineage_root), model: nullableString(item.model),
      role: nullableString(item.role), snippet: stringValue(item.snippet), source: nullableString(item.source),
      startedAt: typeof item.session_started === 'number' ? item.session_started : null, profileId: profileId ?? null
    }; }).filter((item) => item.sessionId);
  }

  async getMessages(sessionId: string): Promise<HermesMessage[]> {
    const response = HermesMessageListWire.parse(await this.request<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`));
    return response.data.map((item, index) => this.normalizeMessage(item, response.session_id, index));
  }

  async sendMessage(input: { sessionId?: string; message: string; model?: string }): Promise<{ sessionId: string; message: HermesMessage }> {
    if (input.sessionId) {
      const response = record(await this.request<unknown>(`/api/sessions/${encodeURIComponent(input.sessionId)}/chat`, {
        method: 'POST', body: JSON.stringify({ message: input.message, model: input.model })
      }, 120_000));
      const effectiveSessionId = stringValue(response.session_id, input.sessionId);
      return { sessionId: effectiveSessionId, message: this.normalizeMessage(response.message ?? response, effectiveSessionId, Date.now()) };
    }

    const response = record(await this.request<unknown>('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: input.model ?? 'default', stream: false, messages: [{ role: 'user', content: input.message }] })
    }, 120_000));
    const choices = Array.isArray(response.choices) ? response.choices : [];
    const first = record(choices[0]);
    const message = record(first.message);
    const localSessionId = `local-${crypto.randomUUID()}`;
    return {
      sessionId: localSessionId,
      message: {
        id: stringValue(response.id, crypto.randomUUID()), sessionId: localSessionId, role: 'assistant',
        text: stringValue(message.content), createdAt: new Date().toISOString(), reasoning: nullableString(message.reasoning_content), thinkingStatus: null, toolCalls: [], attachments: [], checkpoints: [], inference: null, generation: null
      }
    };
  }

  async listModels(profileId?: string): Promise<ModelInfo[]> {
    const query = new URLSearchParams({ explicit_only: '1' });
    if (profileId) query.set('profile', profileId);
    const options = await this.request<unknown>(`/api/model/options?${query.toString()}`).catch(() => null);
    if (options) {
      const normalized = normalizeHermesModelOptions(options);
      if (normalized.length) return normalized;
    }
    const response = record(await this.request<unknown>('/v1/models'));
    const items = Array.isArray(response.data) ? response.data : Array.isArray(response.models) ? response.models : [];
    return items.map((item) => {
      const model = record(item);
      const id = stringValue(model.id, stringValue(model.name));
      return {
        id,
        name: stringValue(model.name, id),
        source: 'hermes' as const,
        provider: nullableString(model.provider ?? model.owned_by),
        runtimeProvider: nullableString(model.provider ?? model.owned_by),
        description: nullableString(model.description),
        contextLength: typeof model.context_length === 'number' && model.context_length > 0 ? Math.floor(model.context_length) : null,
        inputModalities: Array.isArray(model.input_modalities) ? model.input_modalities.filter((item): item is string => typeof item === 'string') : [],
        outputModalities: Array.isArray(model.output_modalities) ? model.output_modalities.filter((item): item is string => typeof item === 'string') : [],
        supportedParameters: Array.isArray(model.supported_parameters) ? model.supported_parameters.filter((item): item is string => typeof item === 'string') : [],
        routeKind: 'model' as const,
        canonicalModelId: null,
        pricing: null,
        policyStatus: 'unknown' as const,
        policyReason: null
      };
    }).filter((model) => model.id);
  }

  async getCapability(path: string): Promise<unknown> {
    if (!path.startsWith('/api/') && path !== '/health' && path !== '/v1/models') throw new Error('Unsupported Hermes capability path.');
    return this.request(path);
  }

  private normalizeSession(value: unknown): HermesSession {
    return normalizeHermesSession(value);
  }

  private normalizeMessage(value: unknown, sessionId: string, index: number): HermesMessage {
    const item = record(value);
    const calls = Array.isArray(item.tool_calls) ? item.tool_calls : [];
    return {
      id: stringValue(item.id, `${sessionId}-${index}`), sessionId,
      role: ['system', 'user', 'assistant', 'tool'].includes(String(item.role)) ? item.role as HermesMessage['role'] : 'assistant',
      text: stringValue(item.content, stringValue(item.text)),
      createdAt: timestampValue(item.timestamp),
      reasoning: nullableString(item.reasoning ?? item.reasoning_content),
      thinkingStatus: null,
      toolCalls: calls.map((call, callIndex) => {
        const tool = record(call); const fn = record(tool.function);
        return { id: stringValue(tool.id, `${sessionId}-tool-${callIndex}`), name: stringValue(fn.name, stringValue(tool.name, 'tool')), arguments: fn.arguments ?? tool.arguments, status: 'complete' as const };
      }),
      attachments: [],
      checkpoints: [],
      inference: null,
      generation: null
    };
  }
}

let activeClient: HermesClient | null = null;

export const getActiveHermesClient = () => {
  if (activeClient) return activeClient;
  const url = process.env.HERMES_API_URL ?? 'http://127.0.0.1:8642';
  activeClient = new HermesClient({ id: 'default', name: 'Hermes Agent', description: 'Default local Hermes profile', kind: 'local', url, controlUrl: process.env.HERMES_CONTROL_URL ?? null, serveUrl: process.env.HERMES_SERVE_URL ?? null, serveWsUrl: process.env.HERMES_SERVE_WS_URL ?? null, bridgeUrl: process.env.HERMES_BRIDGE_URL ?? null, hermesProfileId: null }, process.env.HERMES_API_TOKEN ?? '', process.env.HERMES_CONTROL_TOKEN ?? '');
  return activeClient;
};

export const setActiveHermesClient = (connection: GatewayConnection, token = '', controlToken = '') => {
  activeClient = new HermesClient(connection, token, controlToken);
  return activeClient;
};
