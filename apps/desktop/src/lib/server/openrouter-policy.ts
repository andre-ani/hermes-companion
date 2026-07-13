import { OpenRouterPolicyOverview, type OpenRouterPolicyOverview as OpenRouterPolicyOverviewValue } from '@hermes-companion/contracts';
import { getOpenRouterCredential } from './direct-provider.js';
import { invokeNative } from './native-client.js';

export const openRouterManagementSecretKey = 'provider:openrouter:management';
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const stringsOrNull = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null;
const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const stringOrNull = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

let cache: { key: string; managementKey: string; expiresAt: number; value: OpenRouterPolicyOverviewValue } | null = null;

export async function getOpenRouterManagementCredential() {
  const stored = await invokeNative<{ value: string | null }>('secret.get', { key: openRouterManagementSecretKey }).then((result) => result.value).catch(() => null);
  return stored || process.env.OPENROUTER_MANAGEMENT_API_KEY?.trim() || null;
}

const openRouterRequest = async (path: string, apiKey: string) => {
  const response = await fetch(`https://openrouter.ai/api/v1${path}`, { headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    const body = asRecord(await response.json().catch(() => ({})));
    throw new Error(stringOrNull(asRecord(body.error).message) ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
};

export async function verifyOpenRouterManagementCredential(apiKey: string | null | undefined) {
  if (!apiKey) return { verified: false as const, error: 'No OpenRouter management key is stored.' };
  try { await openRouterRequest('/guardrails?limit=1', apiKey); return { verified: true as const, error: null }; }
  catch (cause) { return { verified: false as const, error: cause instanceof Error ? cause.message : 'OpenRouter rejected the management key.' }; }
}

export async function loadOpenRouterPolicy(refresh = false): Promise<OpenRouterPolicyOverviewValue> {
  const [credential, managementKey] = await Promise.all([getOpenRouterCredential(), getOpenRouterManagementCredential()]);
  const apiKey = credential.apiKey ?? ''; const adminKey = managementKey ?? '';
  if (!refresh && cache?.key === apiKey && cache.managementKey === adminKey && cache.expiresAt > Date.now()) return cache.value;

  let keyInfo: Record<string, unknown> = {}; let eligibleModelIds: string[] = []; let error: string | null = null;
  if (apiKey) {
    try {
      const [keyPayload, modelsPayload] = await Promise.all([openRouterRequest('/key', apiKey), openRouterRequest('/models/user', apiKey)]);
      keyInfo = asRecord(asRecord(keyPayload).data);
      const rows = Array.isArray(asRecord(modelsPayload).data) ? asRecord(modelsPayload).data as unknown[] : [];
      eligibleModelIds = rows.map((item) => stringOrNull(asRecord(item).id)).filter((item): item is string => Boolean(item));
    } catch (cause) { error = cause instanceof Error ? cause.message : 'OpenRouter policy could not be loaded.'; }
  }

  let guardrails: OpenRouterPolicyOverviewValue['guardrails'] = []; let assignmentCount = 0; let managementError: string | null = null;
  if (adminKey) {
    try {
      const [guardrailPayload, assignmentPayload] = await Promise.all([openRouterRequest('/guardrails?limit=100', adminKey), openRouterRequest('/guardrails/assignments/keys?limit=100', adminKey)]);
      const rows = Array.isArray(asRecord(guardrailPayload).data) ? asRecord(guardrailPayload).data as unknown[] : [];
      guardrails = rows.flatMap((raw) => {
        const item = asRecord(raw); const id = stringOrNull(item.id); const name = stringOrNull(item.name); if (!id || !name) return [];
        const filterCount = Array.isArray(item.content_filters) ? item.content_filters.length : Array.isArray(item.custom_content_filters) ? item.custom_content_filters.length : 0;
        return [{ id, name, description: stringOrNull(item.description), allowedModels: stringsOrNull(item.allowed_models), ignoredModels: stringsOrNull(item.ignored_models), allowedProviders: stringsOrNull(item.allowed_providers), ignoredProviders: stringsOrNull(item.ignored_providers), limitUsd: numberOrNull(item.limit_usd), resetInterval: ['daily', 'weekly', 'monthly'].includes(String(item.reset_interval)) ? item.reset_interval as 'daily' | 'weekly' | 'monthly' : null, enforceZdr: item.enforce_zdr === true || item.enforce_zdr_anthropic === true || item.enforce_zdr_openai === true || item.enforce_zdr_google === true || item.enforce_zdr_other === true, contentFilterCount: filterCount }];
      });
      const total = asRecord(assignmentPayload).total_count;
      assignmentCount = typeof total === 'number' && Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
    } catch (cause) { managementError = cause instanceof Error ? cause.message : 'OpenRouter guardrails could not be loaded.'; }
  }

  const value = OpenRouterPolicyOverview.parse({ configured: Boolean(apiKey), verified: Boolean(apiKey) && !error, keyLabel: stringOrNull(keyInfo.label), eligibleModelIds, eligibleModelCount: eligibleModelIds.length, keyLimitUsd: numberOrNull(keyInfo.limit), keyLimitRemainingUsd: numberOrNull(keyInfo.limit_remaining), managementConfigured: Boolean(adminKey), guardrailsVisible: Boolean(adminKey) && !managementError, guardrails, assignmentCount, error, managementError, checkedAt: new Date().toISOString() });
  cache = { key: apiKey, managementKey: adminKey, expiresAt: Date.now() + 5 * 60_000, value };
  return value;
}
