import { describe, expect, it } from 'vitest';
import { normalizeOpenRouterModels } from '../apps/desktop/src/lib/server/direct-provider';
import { normalizeHermesModelOptions } from '../apps/desktop/src/lib/server/hermes-client';
import { humanizeModelId, modelProviderFromId, modelSelectionKey } from '../apps/desktop/src/lib/model-identity';
import { providerIcon } from '../apps/desktop/src/lib/provider-icon-catalog';

describe('model identity and OpenRouter catalog', () => {
  it('normalizes human labels, provider marks, sources, and modalities', () => {
    const models = normalizeOpenRouterModels({ data: [{
      id: 'google/gemini-3.5-flash',
      name: 'Google: Gemini 3.5 Flash',
      description: 'Fast multimodal model',
      context_length: 1_000_000,
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
      supported_parameters: ['tools']
    }] });
    expect(models[0]).toMatchObject({ id: 'openrouter/auto', name: 'Auto Router', source: 'openrouter', provider: 'openrouter' });
    expect(models[1]).toMatchObject({
      id: 'google/gemini-3.5-flash', name: 'Google: Gemini 3.5 Flash', source: 'openrouter', provider: 'google',
      contextLength: 1_000_000, inputModalities: ['text', 'image'], outputModalities: ['text'], supportedParameters: ['tools']
    });
  });

  it('keeps model source distinct when IDs collide', () => {
    expect(modelSelectionKey('hermes', 'google/gemini')).not.toBe(modelSelectionKey('openrouter', 'google/gemini'));
    expect(modelSelectionKey('hermes', 'google/gemini', 'openrouter')).not.toBe(modelSelectionKey('hermes', 'google/gemini', 'google'));
    expect(modelProviderFromId('deepseek/deepseek-v4', 'openrouter')).toBe('deepseek');
    expect(humanizeModelId('openrouter/auto')).toBe('Auto Router');
  });

  it('normalizes Hermes model.options without collapsing provider routes', () => {
    const models = normalizeHermesModelOptions({ providers: [
      { slug: 'openrouter', models: ['openrouter/auto', 'google/gemini-3.5-flash', '@preset/lumi'], pricing: { 'google/gemini-3.5-flash': { input: '$0.50', output: '$2.00' } }, capabilities: { 'google/gemini-3.5-flash': { fast: true, reasoning: true } } },
      { slug: 'google', models: ['google/gemini-3.5-flash'] }
    ] });
    expect(models).toHaveLength(4);
    expect(models[0]).toMatchObject({ id: 'openrouter/auto', runtimeProvider: 'openrouter', routeKind: 'router' });
    expect(models[1]).toMatchObject({ id: 'google/gemini-3.5-flash', provider: 'google', runtimeProvider: 'openrouter', supportedParameters: ['fast', 'reasoning'], pricing: { prompt: 0.0000005, completion: 0.000002 } });
    expect(models[2]).toMatchObject({ id: '@preset/lumi', runtimeProvider: 'openrouter', routeKind: 'preset' });
    expect(models[3]).toMatchObject({ id: 'google/gemini-3.5-flash', runtimeProvider: 'google' });
  });

  it('bundles provider marks and resolves common catalog aliases', () => {
    for (const provider of ['xai', 'x-ai', 'grok', 'meta-llama', 'mistralai', 'z-ai', 'nousresearch', 'bytedance-seed', 'allenai']) {
      expect(providerIcon(provider), provider).toMatch(/^(data:image\/svg\+xml|\/|file:|https?:)/);
    }
    expect(providerIcon('not-a-real-provider')).toBeNull();
  });
});
