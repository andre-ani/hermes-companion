import { ChatTurnSnapshot, HermesMessage, type ChatAttachmentInput, type ChatTurnApproval, type ChatTurnSnapshot as ChatTurnSnapshotValue, type HermesMessage as HermesMessageValue } from '@hermes-companion/contracts';
import { humanizeModelId, modelProviderFromId } from '../model-identity.js';
import { getActiveHermesClient } from './hermes-client.js';
import { HermesRpcSocket } from './hermes-serve-runs.js';
import { resolveHermesServeWebSocketUrl } from './hermes-serve-auth.js';
import { invokeNative } from './native-client.js';

type StartInput = { requestId: string; sessionId?: string; message: string; attachments?: ChatAttachmentInput[]; model?: string; modelProvider?: string; profileId?: string; cwd?: string; truncateBeforeUserOrdinal?: number; interruptFirst?: boolean };
type State = {
  requestId: string;
  sessionId: string;
  transportSessionId: string;
  sequence: number;
  latest: ChatTurnSnapshotValue;
  message: HermesMessageValue;
  socket: HermesRpcSocket;
  waiters: Set<() => void>;
  terminal: boolean;
  completing: boolean;
  cancellationRequested: boolean;
  pendingApproval: ChatTurnApproval | null;
};

const runs = new Map<string, State>();
const terminalStatuses = new Set<ChatTurnSnapshotValue['status']>(['completed', 'cancelled', 'failed', 'interrupted']);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';

const wake = (run: State) => { for (const waiter of run.waiters) waiter(); run.waiters.clear(); };
const publish = (run: State, update: Partial<HermesMessageValue>, status: ChatTurnSnapshotValue['status'], error: string | null = null) => {
  const terminal = terminalStatuses.has(status);
  run.sequence += 1;
  run.message = HermesMessage.parse({
    ...run.message,
    ...update,
    ...(terminal ? { thinkingStatus: null } : {}),
    generation: { ...(run.message.generation ?? {}), requestId: run.requestId, sequence: run.sequence, status, error }
  });
  run.latest = ChatTurnSnapshot.parse({ requestId: run.requestId, sequence: run.sequence, sessionId: run.sessionId, status, message: run.message, approval: run.pendingApproval, error });
  run.terminal = terminal;
  wake(run);
};

const retire = (run: State) => {
  const timer = setTimeout(() => { if (runs.get(run.requestId) === run) runs.delete(run.requestId); }, 5 * 60_000);
  timer.unref?.();
};

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function recoverCompletedMessage(run: State) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await delay(150 * attempt);
    try {
      const resumed = await run.socket.request<{ messages?: unknown[] }>('session.resume', { session_id: run.sessionId, cols: 96 });
      const messages = Array.isArray(resumed.messages) ? resumed.messages : [];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const item = record(messages[index]);
        if (item.role !== 'assistant') continue;
        const recoveredText = string(item.text) || string(item.content);
        const recoveredReasoning = string(item.reasoning_content) || string(item.reasoning);
        if (recoveredText || recoveredReasoning) return { text: recoveredText, reasoning: recoveredReasoning };
      }
    } catch {
      // A terminal event remains authoritative. Retry briefly because Hermes
      // may emit completion just before its persisted history becomes visible.
    }
  }
  return null;
}

async function completeRun(run: State, payload: Record<string, unknown>, streamedText: string, streamedReasoning: string) {
  if (run.terminal || run.completing) return;
  run.completing = true;
  let completedText = streamedText || string(payload.text);
  let completedReasoning = streamedReasoning || string(payload.reasoning);

  if (!completedText && !completedReasoning) {
    const recovered = await recoverCompletedMessage(run);
    if (recovered) {
      completedText = recovered.text;
      completedReasoning = recovered.reasoning;
    }
  }

  const status = string(payload.status);
  run.pendingApproval = null;
  if (!completedText && !completedReasoning && status !== 'interrupted') {
    publish(run, { thinkingStatus: null }, 'failed', 'Hermes completed without returning a visible response. Reload the session to retry history recovery.');
  } else {
    const terminalStatus = status === 'interrupted'
      ? run.cancellationRequested ? 'cancelled' : 'interrupted'
      : status === 'error' ? 'failed' : 'completed';
    publish(run, { text: completedText, reasoning: completedReasoning || null, thinkingStatus: null }, terminalStatus, status === 'error' ? string(payload.error) || 'Hermes did not complete the response.' : null);
  }
  run.socket.close();
  retire(run);
}

export async function startHermesChatTurn(input: StartInput) {
  const existing = runs.get(input.requestId);
  if (existing) return existing.latest;
  const connection = getActiveHermesClient().executionContext().connection;
  const url = await resolveHermesServeWebSocketUrl(connection);
  if (!url) throw new Error('Connect an authenticated Hermes Serve profile before sending a message.');

  let run!: State;
  let text = '';
  let reasoning = '';
  let thinkingStatus: string | null = null;
  const socket = new HermesRpcSocket(url, (event) => {
    if (!run || (event.session_id && event.session_id !== run.transportSessionId)) return;
    const payload = record(event.payload);
    if (event.type === 'message.delta') {
      text += string(payload.text);
      thinkingStatus = null;
      publish(run, { text, thinkingStatus }, 'streaming');
    } else if (event.type === 'thinking.delta') {
      thinkingStatus = string(payload.text).trim() || null;
      publish(run, { thinkingStatus }, 'streaming');
    } else if (event.type === 'reasoning.delta') {
      reasoning += string(payload.text);
      publish(run, { reasoning }, 'streaming');
    } else if (event.type === 'tool.start') {
      const id = string(payload.tool_id) || crypto.randomUUID();
      const tool = { id, name: string(payload.name) || 'tool', arguments: payload.args ?? payload.args_text ?? payload.context, status: 'running' as const };
      publish(run, { toolCalls: [...run.message.toolCalls.filter((candidate) => candidate.id !== id), tool] }, 'streaming');
    } else if (event.type === 'tool.complete') {
      const id = string(payload.tool_id) || crypto.randomUUID();
      const existing = run.message.toolCalls.find((candidate) => candidate.id === id);
      const tool = { id, name: string(payload.name) || existing?.name || 'tool', arguments: payload.args ?? existing?.arguments, result: payload.result, status: 'complete' as const };
      publish(run, { toolCalls: [...run.message.toolCalls.filter((candidate) => candidate.id !== id), tool] }, 'streaming');
    } else if (event.type === 'approval.request') {
      run.pendingApproval = {
        id: string(payload.id) || run.requestId,
        summary: string(payload.description) || string(payload.command) || 'Hermes approval required',
        allowPermanent: payload.allow_permanent !== false
      };
      publish(run, {}, 'streaming');
      void invokeNative('notification.show', { title: 'Hermes approval required', body: run.pendingApproval.summary }).catch(() => undefined);
    } else if (event.type === 'message.complete') {
      thinkingStatus = null;
      void completeRun(run, payload, text, reasoning);
    } else if (event.type === 'error') {
      thinkingStatus = null;
      run.pendingApproval = null;
      publish(run, { text, reasoning: reasoning || null, thinkingStatus }, 'failed', string(payload.message) || 'Hermes did not complete the response.');
      run.socket.close();
      retire(run);
    }
  });

  await socket.connect();
  const session = input.sessionId
    ? await socket.request<{ session_id: string; session_key?: string; stored_session_id?: string }>('session.resume', { session_id: input.sessionId, cols: 96, ...(input.profileId ? { profile: input.profileId } : {}) })
    : await socket.request<{ session_id: string; session_key?: string; stored_session_id?: string }>('session.create', { cols: 96, source: 'desktop', profile: input.profileId ?? connection.hermesProfileId ?? 'default', ...(input.model ? { model: input.model } : {}), ...(input.modelProvider ? { provider: input.modelProvider } : {}), ...(input.cwd ? { cwd: input.cwd } : {}) });
  if (!session.session_id) { socket.close(); throw new Error('Hermes did not return a session id.'); }
  const persistedSessionId = input.sessionId ?? session.stored_session_id ?? session.session_key ?? session.session_id;
  if (input.interruptFirst) await socket.request('session.interrupt', { session_id: session.session_id }).catch(() => undefined);
  const contextRefs: string[] = [];
  let hasVisualAttachment = false;
  try {
    for (const attachment of input.attachments ?? []) {
      if (attachment.mediaType.startsWith('image/')) {
        await socket.request('image.attach_bytes', { session_id: session.session_id, content_base64: attachment.dataUrl, filename: attachment.filename });
        hasVisualAttachment = true;
      } else if (attachment.mediaType === 'application/pdf') {
        await socket.request('pdf.attach', { session_id: session.session_id, content_base64: attachment.dataUrl, filename: attachment.filename });
        hasVisualAttachment = true;
      } else {
        const result = await socket.request<{ ref_text?: string }>('file.attach', { session_id: session.session_id, data_url: attachment.dataUrl, name: attachment.filename });
        if (result.ref_text) contextRefs.push(result.ref_text);
      }
    }
  } catch (cause) {
    socket.close();
    throw new Error(cause instanceof Error ? `Hermes could not attach the selected file: ${cause.message}` : 'Hermes could not attach the selected file.');
  }
  const submittedText = [contextRefs.join('\n'), input.message].filter(Boolean).join('\n\n') || (hasVisualAttachment ? 'Review the attached content.' : '');
  if (!submittedText) { socket.close(); throw new Error('Enter a message or attach a supported file.'); }
  const modelId = input.model || 'default';
  const message = HermesMessage.parse({
    id: `hermes-assistant-${input.requestId}`,
    sessionId: persistedSessionId,
    role: 'assistant',
    text: '',
    createdAt: new Date().toISOString(),
    inference: {
      source: 'hermes',
      requested: { id: modelId, name: humanizeModelId(modelId), provider: modelProviderFromId(modelId, input.modelProvider) },
      resolved: null,
      upstreamProvider: null
    },
    generation: { requestId: input.requestId, sequence: 0, status: 'streaming' }
  });
  const initial = ChatTurnSnapshot.parse({ requestId: input.requestId, sequence: 0, sessionId: persistedSessionId, status: 'streaming', message, approval: null, error: null });
  run = { requestId: input.requestId, sessionId: persistedSessionId, transportSessionId: session.session_id, sequence: 0, latest: initial, message, socket, waiters: new Set(), terminal: false, completing: false, cancellationRequested: false, pendingApproval: null };
  runs.set(input.requestId, run);
  void socket.request('prompt.submit', { session_id: session.session_id, text: submittedText, ...(input.truncateBeforeUserOrdinal !== undefined ? { truncate_before_user_ordinal: input.truncateBeforeUserOrdinal } : {}) }, 1_800_000).catch((cause) => {
    if (!run.terminal) publish(run, {}, 'failed', cause instanceof Error ? cause.message : 'Hermes rejected the prompt.');
    socket.close();
    retire(run);
  });
  return initial;
}

export async function nextHermesChatTurn(requestId: string, afterSequence: number) {
  const run = runs.get(requestId);
  if (!run) throw new Error('This Hermes response stream is no longer available.');
  if (run.sequence > afterSequence || run.terminal) return run.latest;
  await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { run.waiters.delete(done); resolve(); }, 15_000);
    run.waiters.add(done);
  });
  return run.latest;
}

export async function cancelHermesChatTurn(requestId: string) {
  const run = runs.get(requestId);
  if (!run || run.terminal) return false;
  // Mark intent before awaiting the interrupt response. Hermes can emit its
  // terminal `message.complete { status: interrupted }` frame before replying
  // to `session.interrupt`; without this bit the polling request races ahead
  // and presents an intentional Stop as a failed turn.
  run.cancellationRequested = true;
  run.pendingApproval = null;
  await run.socket.request('session.interrupt', { session_id: run.transportSessionId }, 15_000).catch(() => undefined);
  if (!run.terminal) publish(run, { thinkingStatus: null }, 'cancelled');
  run.socket.close();
  retire(run);
  return true;
}

export async function respondHermesChatApproval(requestId: string, choice: 'once' | 'session' | 'always' | 'deny') {
  const run = runs.get(requestId);
  if (!run || run.terminal) throw new Error('This Hermes response is no longer active.');
  if (!run.pendingApproval) throw new Error('This Hermes approval is no longer pending.');
  const result = await run.socket.request<{ resolved?: number }>('approval.respond', { session_id: run.transportSessionId, choice }, 15_000);
  if (result.resolved === 0) throw new Error('This Hermes approval is no longer pending.');
  // Hermes may complete the turn immediately after accepting the decision.
  // Never overwrite that terminal snapshot with a synthetic streaming update.
  if (run.terminal) return run.latest;
  run.pendingApproval = null;
  publish(run, {}, 'streaming');
  return run.latest;
}
