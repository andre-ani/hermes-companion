import { command, query } from '$app/server';
import { HermesLearningGraph, HermesLearningNodeInput, HermesLearningNodeUpdateInput, z } from '@hermes-companion/contracts';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { getCompanionRepository } from '$lib/server/companion-repository';

const empty = z.object({});
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const nullableNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export const getHermesLearningGraph = query(empty, async () => {
  try {
    const root = record(await getActiveHermesClient().requestControl<unknown>('/api/learning/graph', {}, 30_000));
    const nodes = list(root.nodes).map((value) => { const item = record(value); return {
      id: string(item.id), label: string(item.label) || string(item.id), kind: item.kind === 'skill' ? 'skill' as const : 'memory' as const,
      memorySource: item.memorySource === 'profile' || item.memory_source === 'profile' ? 'profile' as const : item.memorySource === 'memory' || item.memory_source === 'memory' ? 'memory' as const : null,
      timestamp: nullableNumber(item.timestamp), category: string(item.category) || 'Hermes', useCount: number(item.useCount ?? item.use_count),
      state: string(item.state) || 'active', createdBy: string(item.createdBy ?? item.created_by) || null, pinned: item.pinned === true
    }; }).filter((item) => item.id);
    return HermesLearningGraph.parse({ available: true, nodes,
      edges: list(root.edges).map((value) => { const item = record(value); return { source: string(item.source), target: string(item.target) }; }).filter((edge) => edge.source && edge.target),
      clusters: list(root.clusters).map((value) => { const item = record(value); return { category: string(item.category), count: number(item.count) }; }).filter((cluster) => cluster.category),
      memory: list(root.memory), stats: record(root.stats), error: null });
  } catch (cause) { return HermesLearningGraph.parse({ available: false, error: cause instanceof Error ? cause.message : 'Hermes Learning is unavailable.' }); }
});

export const getHermesLearningNode = query(HermesLearningNodeInput, ({ id }) =>
  getActiveHermesClient().requestControl(`/api/learning/node?id=${encodeURIComponent(id)}`, {}, 30_000));

export const updateHermesLearningNode = command(HermesLearningNodeUpdateInput, async ({ id, content }) => {
  const result = await getActiveHermesClient().requestControl('/api/learning/node', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, content }) }, 30_000);
  await getCompanionRepository().recordAudit('hermes.learning.node.updated', id, {});
  return result;
});

export const archiveHermesLearningNode = command(HermesLearningNodeInput, async ({ id }) => {
  const result = await getActiveHermesClient().requestControl('/api/learning/node', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }, 30_000);
  await getCompanionRepository().recordAudit('hermes.learning.node.archived', id, {});
  return result;
});
