import type { ModelSource } from '@hermes-companion/contracts';

const acronym = (value: string) => ['ai', 'gpt', 'llm', 'mcp', 'vl'].includes(value.toLocaleLowerCase())
  ? value.toLocaleUpperCase()
  : value;

export function modelProviderFromId(modelId?: string | null, fallback?: string | null) {
  const provider = modelId?.includes('/') ? modelId.slice(0, modelId.indexOf('/')) : fallback;
  return provider?.trim().toLocaleLowerCase() || 'hermes';
}

export function humanizeModelId(modelId: string) {
  if (modelId === 'openrouter/auto') return 'Auto Router';
  const slug = modelId.includes('/') ? modelId.slice(modelId.lastIndexOf('/') + 1) : modelId;
  return slug
    .replace(/:(free|extended|thinking)$/i, ' · $1')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => acronym(part.length <= 4 ? part : `${part[0]?.toLocaleUpperCase()}${part.slice(1)}`))
    .join(' ');
}

export function modelSelectionKey(source: ModelSource, modelId: string, runtimeProvider?: string | null) {
  return `${source}:${runtimeProvider?.trim().toLocaleLowerCase() || ''}:${modelId}`;
}
