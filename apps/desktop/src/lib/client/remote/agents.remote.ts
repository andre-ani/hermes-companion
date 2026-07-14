import { command, query } from '$app/server';
import { HermesDelegationStatus, HermesSubagent, z } from '@hermes-companion/contracts';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { requestHermesServe } from '$lib/server/hermes-gateway';

const empty = z.object({});
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

const connection = () => getActiveHermesClient().executionContext().connection;

export const getHermesDelegationStatus = query(empty, async () => {
  const raw = await requestHermesServe<Record<string, unknown>>(connection(), 'delegation.status', {});
  const active = Array.isArray(raw.active) ? raw.active.flatMap((value) => {
    const item = asRecord(value);
    const id = typeof item.subagent_id === 'string' ? item.subagent_id.trim() : '';
    if (!id) return [];
    const status = typeof item.status === 'string' && ['queued', 'running', 'completed', 'failed', 'interrupted'].includes(item.status) ? item.status : 'unknown';
    return [HermesSubagent.parse({
      id,
      parentId: typeof item.parent_id === 'string' && item.parent_id ? item.parent_id : null,
      goal: typeof item.goal === 'string' && item.goal.trim() ? item.goal.trim() : 'Subagent task',
      model: typeof item.model === 'string' && item.model ? item.model : null,
      status,
      depth: typeof item.depth === 'number' ? item.depth : 0,
      startedAt: typeof item.started_at === 'number' ? item.started_at : null,
      toolCount: typeof item.tool_count === 'number' ? item.tool_count : 0
    })];
  }) : [];
  return HermesDelegationStatus.parse({
    active,
    paused: raw.paused === true,
    maxSpawnDepth: typeof raw.max_spawn_depth === 'number' ? raw.max_spawn_depth : null,
    maxConcurrentChildren: typeof raw.max_concurrent_children === 'number' ? raw.max_concurrent_children : null,
    updatedAt: new Date().toISOString()
  });
});

export const setHermesDelegationPaused = command(z.object({ paused: z.boolean() }), async ({ paused }) => {
  const result = await requestHermesServe<{ paused?: unknown }>(connection(), 'delegation.pause', { paused });
  return { paused: result.paused === true };
});

export const interruptHermesSubagent = command(z.object({ subagentId: z.string().min(1) }), async ({ subagentId }) => {
  const result = await requestHermesServe<{ found?: unknown; subagent_id?: unknown }>(connection(), 'subagent.interrupt', { subagent_id: subagentId });
  if (result.found !== true) throw new Error('The subagent is no longer active.');
  return { interrupted: true as const, subagentId };
});
