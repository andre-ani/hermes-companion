import { describe, expect, it } from 'vitest';
import { modelProvenancePresentation } from '../apps/desktop/src/lib/model-provenance';

describe('model provenance presentation', () => {
  it('shows a distinct router before the resolved model', () => {
    const result = modelProvenancePresentation({
      source: 'openrouter',
      requested: { id: 'openrouter/auto', name: 'Auto Router', provider: 'openrouter' },
      resolved: { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'google' },
      upstreamProvider: 'Google AI Studio'
    });
    expect(result.route?.provider).toBe('openrouter');
    expect(result.effective.name).toBe('Gemini 3.5 Flash');
    expect(result.detail).toContain('Requested Auto Router');
    expect(result.detail).toContain('Served by Google AI Studio');
  });

  it('collapses aliases from the same provider', () => {
    const result = modelProvenancePresentation({
      source: 'hermes',
      requested: { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', provider: 'anthropic' },
      resolved: { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'Anthropic' },
      upstreamProvider: null
    });
    expect(result.route).toBeNull();
    expect(result.effective.name).toBe('Claude Sonnet 4.5');
  });

  it('uses the requested model when no authoritative resolution exists', () => {
    const result = modelProvenancePresentation({
      source: 'hermes',
      requested: { id: 'openrouter/auto', name: 'Auto Router', provider: 'openrouter' },
      resolved: null,
      upstreamProvider: null
    });
    expect(result.route).toBeNull();
    expect(result.effective.name).toBe('Auto Router');
    expect(result.detail).toBe('Resolved to Auto Router.');
  });
});
