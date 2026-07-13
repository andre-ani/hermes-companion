import type { MessageInference, ModelReference } from '@hermes-companion/contracts';

const normalizedProvider = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() || null;

export type ModelProvenancePresentation = {
  effective: ModelReference;
  route: ModelReference | null;
  detail: string;
};

/**
 * Produce the compact, truthful model attribution shown beside an assistant
 * message. A route is only rendered when it adds information; aliases and
 * direct routes collapse to the effective model instead of producing
 * redundant labels such as “Claude via Claude”.
 */
export function modelProvenancePresentation(inference: MessageInference): ModelProvenancePresentation {
  const effective = inference.resolved ?? inference.requested;
  const requestedProvider = normalizedProvider(inference.requested.provider);
  const effectiveProvider = normalizedProvider(effective.provider);
  const resolvedDiffers = Boolean(inference.resolved && inference.resolved.id !== inference.requested.id);
  const routeAddsProvider = resolvedDiffers && requestedProvider !== null && requestedProvider !== effectiveProvider;
  const route = routeAddsProvider ? inference.requested : null;

  const requestedDetail = resolvedDiffers ? `Requested ${inference.requested.name}. ` : '';
  const providerDetail = inference.upstreamProvider ? `Served by ${inference.upstreamProvider}.` : '';
  return {
    effective,
    route,
    detail: `${requestedDetail}Resolved to ${effective.name}. ${providerDetail}`.trim()
  };
}
