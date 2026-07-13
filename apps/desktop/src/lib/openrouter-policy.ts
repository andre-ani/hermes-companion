import type { ModelInfo, OpenRouterPolicyOverview } from '@hermes-companion/contracts';

export function applyOpenRouterPolicy<T extends Pick<ModelInfo, 'id' | 'runtimeProvider' | 'routeKind' | 'policyStatus' | 'policyReason'>>(models: T[], policy: OpenRouterPolicyOverview | null): T[] {
  if (!policy?.configured || !policy.verified) return models;
  const eligible = new Set(policy.eligibleModelIds);
  return models.map((model) => {
    if (model.runtimeProvider !== 'openrouter') return model;
    if (model.routeKind === 'router' || model.routeKind === 'preset') return { ...model, policyStatus: 'unknown', policyReason: 'OpenRouter applies account policy when this route resolves.' };
    const allowed = eligible.has(model.id);
    return { ...model, policyStatus: allowed ? 'allowed' : 'restricted', policyReason: allowed ? 'Available under this OpenRouter key’s effective policy.' : 'Unavailable under this OpenRouter key’s provider preferences, privacy settings, or guardrails.' };
  });
}
