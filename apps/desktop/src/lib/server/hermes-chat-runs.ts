import { ChatTurnSnapshot, HermesMessage, RecoverableChatTurn, type ChatAttachmentInput, type ChatTurnApproval, type ChatTurnSnapshot as ChatTurnSnapshotValue, type HermesMessage as HermesMessageValue, type RecoverableChatTurn as RecoverableChatTurnValue } from '@hermes-companion/contracts';
import { humanizeModelId, modelProviderFromId } from '../model-identity.js';
import { getActiveHermesClient } from './hermes-client.js';
import { HermesRpcSocket, HermesTransportDisconnectedError } from './hermes-serve-runs.js';
import { resolveHermesServeWebSocketUrl } from './hermes-serve-auth.js';
import { assistantAfter, inflightTurn, messageCount, reconcileAssistantText, sessionIsRunning, stableSessionKey, type HermesSessionResumePayload } from './hermes-session-recovery.js';
import { invokeNative } from './native-client.js';

type StartInput = { requestId: string; sessionId?: string; message: string; attachments?: ChatAttachmentInput[]; model?: string; modelProvider?: string; profileId?: string; cwd?: string; truncateBeforeUserOrdinal?: number; interruptFirst?: boolean; recoveryProbeMs?: number };
type State = {
  requestId: string;
  owner: { connectionId: string; profileId: string };
  sessionId: string;
  resumeSessionId: string;
  transportSessionId: string;
  baselineMessageCount: number;
  submittedText: string;
  promptDispatched: boolean;
  sequence: number;
  latest: ChatTurnSnapshotValue;
  userMessage: HermesMessageValue;
  message: HermesMessageValue;
  socket: HermesRpcSocket;
  waiters: Set<() => void>;
  terminal: boolean;
  completing: boolean;
  cancellationRequested: boolean;
  pendingApproval: ChatTurnApproval | null;
  recoveryProbeMs: number;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
  recoveryProbeInFlight: boolean;
};

const runs = new Map<string, State>();
const sessionClaims = new Map<string, string>();
const terminalStatuses = new Set<ChatTurnSnapshotValue['status']>(['completed', 'cancelled', 'failed', 'interrupted']);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';

const wake = (run: State) => { for (const waiter of run.waiters) waiter(); run.waiters.clear(); };
const sessionClaimKey = (connectionId: string, profileId: string, sessionId: string) => `${connectionId}\u0000${profileId}\u0000${sessionId}`;
const publish = (run: State, update: Partial<HermesMessageValue>, status: ChatTurnSnapshotValue['status'], error: string | null = null) => {
  const terminal = terminalStatuses.has(status);
  if (terminal && run.recoveryTimer) clearTimeout(run.recoveryTimer);
  if (terminal) run.recoveryTimer = null;
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
  const timer = setTimeout(() => {
    if (runs.get(run.requestId) !== run) return;
    runs.delete(run.requestId);
    const key = sessionClaimKey(run.owner.connectionId, run.owner.profileId, run.sessionId);
    if (sessionClaims.get(key) === run.requestId) sessionClaims.delete(key);
  }, 5 * 60_000);
  timer.unref?.();
};

const failRun = (run: State, error: string, text = run.message.text, reasoning = run.message.reasoning ?? '') => {
  if (run.terminal) return;
  run.pendingApproval = null;
  publish(run, { text, reasoning: reasoning || null, thinkingStatus: null }, 'failed', error);
  run.socket.close();
  retire(run);
};

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function recoverCompletedMessage(run: State) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await delay(150 * attempt);
    try {
      const resumed = await run.socket.request<HermesSessionResumePayload>('session.resume', { session_id: run.resumeSessionId, cols: 96, profile: run.owner.profileId });
      if (resumed.session_id) run.transportSessionId = resumed.session_id;
      run.resumeSessionId = stableSessionKey(resumed, run.resumeSessionId);
      const recovered = assistantAfter(resumed, run.baselineMessageCount);
      if (recovered) return recovered;
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
  const payloadText = string(payload.text);
  const reconciledText = reconcileAssistantText(streamedText, payloadText);
  if (reconciledText === null) {
    failRun(run, 'Hermes completed with response text that does not match the streamed turn. Reload the session to recover its authoritative history.', streamedText, streamedReasoning);
    return;
  }
  let completedText = reconciledText;
  let completedReasoning = streamedReasoning || string(payload.reasoning);

  if (!completedText && !completedReasoning) {
    const recovered = await recoverCompletedMessage(run);
    if (run.terminal) return;
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
  const profileId = input.profileId ?? connection.hermesProfileId ?? 'default';

  let claimedSessionKey: string | null = null;
  const claimSession = (sessionId: string) => {
    const key = sessionClaimKey(connection.id, profileId, sessionId);
    const claimantId = sessionClaims.get(key);
    const claimant = claimantId ? runs.get(claimantId) : null;
    if (claimant && !claimant.terminal && claimant.requestId !== input.requestId) throw new Error('This Hermes session already has an active response.');
    sessionClaims.set(key, input.requestId);
    claimedSessionKey = key;
  };
  if (input.sessionId) claimSession(input.sessionId);

  try {
  let run!: State;
  let resumeSessionId = input.sessionId ?? '';
  let transportSessionId = '';
  let baselineMessageCount = 0;
  let resumedBeforeRun: HermesSessionResumePayload | null = null;
  let text = '';
  let reasoning = '';
  let thinkingStatus: string | null = null;
  const armRecoveryProbe = () => {
    if (!run || run.terminal) return;
    if (run.recoveryTimer) clearTimeout(run.recoveryTimer);
    run.recoveryTimer = setTimeout(() => void probeRecoveredRun(), run.recoveryProbeMs);
    run.recoveryTimer.unref?.();
  };
  const reconcileResumedRun = async (resumed: HermesSessionResumePayload) => {
    const inflight = inflightTurn(resumed);
    if (sessionIsRunning(resumed)) {
      if (inflight.user && inflight.user !== run.submittedText) {
        failRun(run, 'Hermes resumed a different in-flight turn. Start a new message to retry safely.', text, reasoning);
        return false;
      }
      const reconciled = reconcileAssistantText(text, inflight.assistant);
      if (reconciled === null) {
        failRun(run, 'Hermes resumed with response text that does not match the streamed turn. Start a new message to retry safely.', text, reasoning);
        return false;
      }
      text = reconciled;
      publish(run, { text, reasoning: reasoning || null, thinkingStatus: null }, 'streaming');
      armRecoveryProbe();
      return true;
    }
    const recovered = assistantAfter(resumed, run.baselineMessageCount);
    if (recovered) {
      const reconciled = reconcileAssistantText(text, recovered.text);
      if (reconciled === null) {
        failRun(run, 'Hermes recovered response text that does not match the streamed turn. Reload the session to recover its authoritative history.', text, reasoning);
        return false;
      }
      text = reconciled;
      reasoning = recovered.reasoning || reasoning;
      await completeRun(run, { status: 'complete', text }, text, reasoning);
      return false;
    }
    failRun(run, 'Hermes reconnected, but could not confirm that this response completed. Start a new message to retry safely.', text, reasoning);
    return false;
  };
  const probeRecoveredRun = async () => {
    if (!run || run.terminal || run.recoveryProbeInFlight) return;
    run.recoveryProbeInFlight = true;
    try {
      const resumed = await run.socket.request<HermesSessionResumePayload>('session.resume', { session_id: run.resumeSessionId, cols: 96, profile: run.owner.profileId });
      if (resumed.session_id) run.transportSessionId = resumed.session_id;
      run.resumeSessionId = stableSessionKey(resumed, run.resumeSessionId);
      await reconcileResumedRun(resumed);
    } catch {
      if (!run.terminal && run.socket.transportState() === 'connected') armRecoveryProbe();
    } finally {
      run.recoveryProbeInFlight = false;
    }
  };
  const socket = new HermesRpcSocket(
    () => resolveHermesServeWebSocketUrl(connection),
    (event) => {
      if (!run || run.terminal || (event.session_id && event.session_id !== run.transportSessionId)) return;
      if (run.recoveryTimer) armRecoveryProbe();
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
        failRun(run, string(payload.message) || 'Hermes did not complete the response.', text, reasoning);
      }
    },
    {
      onStateChange: (state) => {
        if (!run || run.terminal || state !== 'reconnecting') return;
        thinkingStatus = 'Reconnecting…';
        publish(run, { thinkingStatus }, 'streaming');
      },
      onReconnect: async (transport) => {
        if (run?.terminal) throw new Error('The Hermes turn is no longer active.');
        const stableId = run?.resumeSessionId || resumeSessionId;
        if (!stableId) throw new Error('Hermes disconnected before the session could be made resumable.');
        const resumed = await transport.request<HermesSessionResumePayload>('session.resume', {
          session_id: stableId,
          cols: 96,
          profile: run?.owner.profileId ?? profileId
        });
        if (!resumed.session_id) throw new Error('Hermes did not resume the active session.');
        transportSessionId = resumed.session_id;
        resumeSessionId = stableSessionKey(resumed, stableId);
        if (!run) {
          resumedBeforeRun = resumed;
          return;
        }
        run.transportSessionId = transportSessionId;
        run.resumeSessionId = resumeSessionId;
        if (!run.promptDispatched) {
          thinkingStatus = null;
          publish(run, { thinkingStatus }, 'streaming');
          return;
        }
        thinkingStatus = null;
        await reconcileResumedRun(resumed);
      },
      onPermanentClose: (error) => {
        if (!run || run.terminal) return;
        failRun(run, `Hermes connection was lost: ${error.message}`, text, reasoning);
      }
    }
  );

  await socket.connect();
  let session: HermesSessionResumePayload;
  try {
    session = input.sessionId
      ? await socket.request<HermesSessionResumePayload>('session.resume', { session_id: input.sessionId, cols: 96, profile: profileId })
      : await socket.request<HermesSessionResumePayload>('session.create', { cols: 96, source: 'desktop', profile: profileId, ...(input.model ? { model: input.model } : {}), ...(input.modelProvider ? { provider: input.modelProvider } : {}), ...(input.cwd ? { cwd: input.cwd } : {}) });
  } catch (cause) {
    if (cause instanceof HermesTransportDisconnectedError && input.sessionId) {
      try {
        await socket.waitUntilConnected();
        if (!resumedBeforeRun) throw new Error('Hermes reconnected without restoring the requested session.');
        session = resumedBeforeRun;
      } catch (recoveryError) {
        socket.close();
        throw recoveryError;
      }
    } else {
      socket.close();
      throw cause;
    }
  }
  if (!session.session_id) { socket.close(); throw new Error('Hermes did not return a session id.'); }
  const persistedSessionId = input.sessionId ?? session.stored_session_id ?? session.session_key ?? session.session_id;
  if (!claimedSessionKey) claimSession(persistedSessionId);
  transportSessionId = session.session_id;
  resumeSessionId = stableSessionKey(session, persistedSessionId);
  baselineMessageCount = messageCount(session);
  if (input.interruptFirst) await socket.request('session.interrupt', { session_id: transportSessionId }).catch(() => undefined);
  const contextRefs: string[] = [];
  let hasVisualAttachment = false;
  try {
    for (const attachment of input.attachments ?? []) {
      if (attachment.mediaType.startsWith('image/')) {
        await socket.request('image.attach_bytes', { session_id: transportSessionId, content_base64: attachment.dataUrl, filename: attachment.filename });
        hasVisualAttachment = true;
      } else if (attachment.mediaType === 'application/pdf') {
        await socket.request('pdf.attach', { session_id: transportSessionId, content_base64: attachment.dataUrl, filename: attachment.filename });
        hasVisualAttachment = true;
      } else {
        const result = await socket.request<{ ref_text?: string }>('file.attach', { session_id: transportSessionId, data_url: attachment.dataUrl, name: attachment.filename });
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
  const userMessage = HermesMessage.parse({
    id: `optimistic-user-${input.requestId}`,
    sessionId: persistedSessionId,
    role: 'user',
    text: input.message,
    createdAt: new Date().toISOString(),
    attachments: (input.attachments ?? []).map((attachment) => ({ type: 'file' as const, filename: attachment.filename, mediaType: attachment.mediaType }))
  });
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
  run = {
    requestId: input.requestId,
    owner: { connectionId: connection.id, profileId },
    sessionId: persistedSessionId,
    resumeSessionId,
    transportSessionId,
    baselineMessageCount,
    submittedText,
    promptDispatched: false,
    sequence: 0,
    latest: initial,
    userMessage,
    message,
    socket,
    waiters: new Set(),
    terminal: false,
    completing: false,
    cancellationRequested: false,
    pendingApproval: null,
    recoveryProbeMs: input.recoveryProbeMs ?? 30_000,
    recoveryTimer: null,
    recoveryProbeInFlight: false
  };
  runs.set(input.requestId, run);
  run.promptDispatched = true;
  void socket.request('prompt.submit', { session_id: run.transportSessionId, text: submittedText, ...(input.truncateBeforeUserOrdinal !== undefined ? { truncate_before_user_ordinal: input.truncateBeforeUserOrdinal } : {}) }, 1_800_000).catch(async (cause) => {
    if (cause instanceof HermesTransportDisconnectedError) {
      await socket.waitUntilConnected().catch(() => undefined);
      return;
    }
    failRun(run, cause instanceof Error ? cause.message : 'Hermes rejected the prompt.', text, reasoning);
  });
  return initial;
  } catch (cause) {
    if (claimedSessionKey && sessionClaims.get(claimedSessionKey) === input.requestId && !runs.has(input.requestId)) sessionClaims.delete(claimedSessionKey);
    throw cause;
  }
}

export function getHermesChatTurnRecovery(sessionId: string, profileId?: string): RecoverableChatTurnValue | null {
  const connection = getActiveHermesClient().executionContext().connection;
  const ownerProfileId = profileId ?? connection.hermesProfileId ?? 'default';
  const requestId = sessionClaims.get(sessionClaimKey(connection.id, ownerProfileId, sessionId));
  if (!requestId) return null;
  const run = runs.get(requestId);
  if (!run || run.sessionId !== sessionId || run.owner.connectionId !== connection.id || run.owner.profileId !== ownerProfileId) return null;
  return RecoverableChatTurn.parse({ userMessage: run.userMessage, snapshot: run.latest, baselineMessageCount: run.baselineMessageCount });
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
