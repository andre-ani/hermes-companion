import { ModelInfo, z, type ModelInfo as ModelInfoValue } from '@hermes-companion/contracts';
import { humanizeModelId, modelProviderFromId } from '../model-identity.js';
import { invokeNative } from './native-client.js';

export const openRouterSecretKey = 'provider:openrouter';

const OpenRouterModel = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  context_length: z.number().int().positive().nullable().optional(),
  architecture: z.object({
    input_modalities: z.array(z.string()).default([]),
    output_modalities: z.array(z.string()).default([])
  }).default({ input_modalities: [], output_modalities: [] }),
  supported_parameters: z.array(z.string()).default([])
  , pricing: z.object({ prompt: z.string().optional(), completion: z.string().optional() }).default({})
}).passthrough();

const OpenRouterPreset = z.object({
  name: z.string().min(1), slug: z.string().min(1), description: z.string().nullable().optional(), status: z.string().default('active')
}).passthrough();

let catalogCache: { credential: string; expiresAt: number; models: ModelInfoValue[] } | null = null;

export async function getOpenRouterCredential() {
  const stored = await invokeNative<{ value: string | null }>('secret.get', { key: openRouterSecretKey })
    .then((result) => result.value)
    .catch(() => null);
  if (stored) return { apiKey: stored, source: 'secure-storage' as const };
  const environment = process.env.OPENROUTER_API_KEY?.trim();
  if (environment) return { apiKey: environment, source: 'environment' as const };
  return { apiKey: null, source: 'none' as const };
}

export function normalizeOpenRouterModels(value: unknown): ModelInfoValue[] {
  const body = z.object({ data: z.array(OpenRouterModel).default([]) }).parse(value);
  const models = body.data
    .filter((model) => model.architecture.output_modalities.length === 0 || model.architecture.output_modalities.includes('text'))
    .map((model) => ModelInfo.parse({
      id: model.id,
      name: model.name?.trim() || humanizeModelId(model.id),
      source: 'openrouter',
      provider: modelProviderFromId(model.id, 'openrouter'),
      description: model.description ?? null,
      contextLength: model.context_length ?? null,
      inputModalities: model.architecture.input_modalities,
      outputModalities: model.architecture.output_modalities,
      supportedParameters: model.supported_parameters
      , routeKind: model.id === 'openrouter/auto' ? 'router' : 'model'
      , pricing: { prompt: model.pricing.prompt ? Number(model.pricing.prompt) : null, completion: model.pricing.completion ? Number(model.pricing.completion) : null }
    }));
  if (!models.some((model) => model.id === 'openrouter/auto')) {
    models.unshift(ModelInfo.parse({
      id: 'openrouter/auto', name: 'Auto Router', source: 'openrouter', provider: 'openrouter',
      description: 'Let OpenRouter choose the best available model for this request.',
      inputModalities: ['text'], outputModalities: ['text'], routeKind: 'router'
    }));
  }
  return models.toSorted((left, right) => left.id === 'openrouter/auto' ? -1 : right.id === 'openrouter/auto' ? 1 : 0);
}

export async function listOpenRouterModels() {
  const credential = await getOpenRouterCredential();
  if (!credential.apiKey) return [];
  if (catalogCache?.credential === credential.apiKey && catalogCache.expiresAt > Date.now()) return catalogCache.models;
  const headers = { authorization: `Bearer ${credential.apiKey}` };
  const [response, presetsResponse] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/models/user', { headers, signal: AbortSignal.timeout(20_000) }),
    fetch('https://openrouter.ai/api/v1/presets?limit=100', { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null)
  ]);
  if (!response.ok) throw new Error(`OpenRouter model discovery failed (${response.status}).`);
  const models = normalizeOpenRouterModels(await response.json());
  if (presetsResponse?.ok) {
    const presetBody = z.object({ data: z.array(OpenRouterPreset).default([]) }).parse(await presetsResponse.json());
    models.splice(1, 0, ...presetBody.data.filter((preset) => preset.status === 'active').map((preset) => ModelInfo.parse({
      id: `@preset/${preset.slug}`, name: preset.name, source: 'openrouter', provider: 'openrouter',
      description: preset.description ?? 'Saved OpenRouter routing and generation configuration.', routeKind: 'preset',
      inputModalities: ['text'], outputModalities: ['text']
    })));
  }
  catalogCache = { credential: credential.apiKey, expiresAt: Date.now() + 5 * 60_000, models };
  return models;
}

export async function verifyOpenRouterCredential(apiKey?: string | null) {
  const effectiveKey = apiKey ?? (await getOpenRouterCredential()).apiKey;
  if (!effectiveKey) return { verified: false as const, error: 'No OpenRouter credential is stored.' };
  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { authorization: `Bearer ${effectiveKey}` },
      signal: AbortSignal.timeout(15_000)
    });
    if (response.ok) return { verified: true as const, error: null };
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const providerMessage = body.error?.message?.trim();
    const detail = providerMessage ? `${response.status}: ${providerMessage}` : String(response.status);
    return { verified: false as const, error: `OpenRouter rejected this credential (${detail}). Replace it with an active OpenRouter API key.` };
  } catch (cause) {
    return { verified: false as const, error: cause instanceof Error ? cause.message : 'OpenRouter credential verification failed.' };
  }
}
