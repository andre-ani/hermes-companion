export type HermesSessionResumePayload = {
  session_id?: string;
  session_key?: string;
  stored_session_id?: string;
  resumed?: string;
  message_count?: number;
  messages?: unknown[];
  running?: boolean;
  status?: string;
  inflight?: unknown;
  info?: unknown;
};

export type RecoveredAssistantMessage = { text: string; reasoning: string };

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object'
  ? value as Record<string, unknown>
  : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';

export const messageCount = (payload: HermesSessionResumePayload) => {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return typeof payload.message_count === 'number' && Number.isFinite(payload.message_count)
    ? Math.max(0, payload.message_count)
    : messages.length;
};

export const inflightTurn = (payload: HermesSessionResumePayload) => {
  const value = record(payload.inflight);
  return {
    assistant: text(value.assistant),
    user: text(value.user),
    streaming: value.streaming === true
  };
};

export const sessionIsRunning = (payload: HermesSessionResumePayload) => {
  const inflight = inflightTurn(payload);
  return payload.running === true
    || payload.status === 'running'
    || payload.status === 'streaming'
    || inflight.streaming;
};

export const reconcileAssistantText = (current: string, authoritative: string) => {
  if (!authoritative) return current;
  if (!current || authoritative.startsWith(current)) return authoritative;
  if (current.startsWith(authoritative)) return current;
  return null;
};

export const assistantAfter = (
  payload: HermesSessionResumePayload,
  baselineMessageCount: number
): RecoveredAssistantMessage | null => {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  for (let index = messages.length - 1; index >= baselineMessageCount; index -= 1) {
    const item = record(messages[index]);
    if (item.role !== 'assistant') continue;
    const recoveredText = text(item.text) || text(item.content);
    const recoveredReasoning = text(item.reasoning_content) || text(item.reasoning);
    if (recoveredText || recoveredReasoning) return { text: recoveredText, reasoning: recoveredReasoning };
  }
  return null;
};

export const stableSessionKey = (payload: HermesSessionResumePayload, fallback: string) =>
  text(payload.session_key) || text(payload.stored_session_id) || text(payload.resumed) || fallback;
