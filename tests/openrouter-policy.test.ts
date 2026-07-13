import { describe, expect, it } from 'vitest';
import { OpenRouterPolicyOverview, ModelInfo } from '../packages/contracts/src/index';
import { applyOpenRouterPolicy } from '../apps/desktop/src/lib/openrouter-policy';

const model = (id: string, routeKind: 'model' | 'router' | 'preset' = 'model') => ModelInfo.parse({ id, name: id, source: 'hermes', provider: id.split('/')[0], runtimeProvider: 'openrouter', routeKind });

describe('OpenRouter effective policy', () => {
  it('marks unavailable concrete models while leaving routes runtime-enforced', () => {
    const policy = OpenRouterPolicyOverview.parse({ configured: true, verified: true, eligibleModelIds: ['google/allowed'], eligibleModelCount: 1 });
    const result = applyOpenRouterPolicy([model('google/allowed'), model('anthropic/restricted'), model('openrouter/auto', 'router'), model('@preset/lumi', 'preset')], policy);
    expect(result.map((item) => item.policyStatus)).toEqual(['allowed', 'restricted', 'unknown', 'unknown']);
    expect(result[1].policyReason).toContain('guardrails');
    expect(result[2].policyReason).toContain('resolves');
  });

  it('does not claim eligibility without a verified policy response', () => {
    const original = [model('google/model')];
    expect(applyOpenRouterPolicy(original, OpenRouterPolicyOverview.parse({ configured: true, verified: false }))).toEqual(original);
  });
});
