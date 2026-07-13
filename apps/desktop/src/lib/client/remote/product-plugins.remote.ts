import { command, query } from '$app/server';
import { HermesAchievementsOverview, HermesKanbanCreateInput, HermesKanbanDeleteInput, HermesKanbanOverview, HermesKanbanUpdateInput, z } from '@hermes-companion/contracts';
import { getActiveHermesClient } from '$lib/server/hermes-client';
import { getCompanionRepository } from '$lib/server/companion-repository';

type Row = Record<string, unknown>;
const empty = z.object({});
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const nullableNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const list = (value: unknown) => Array.isArray(value) ? value : [];
const client = () => getActiveHermesClient();
const body = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });

async function audited<T>(action: string, subject: string, request: () => Promise<T>, detail: Record<string, unknown> = {}) {
  const result = await request();
  await getCompanionRepository().recordAudit(action, subject, detail);
  return result;
}

function normalizeKanbanTask(value: unknown) {
  const item = record(value);
  const links = record(item.link_counts);
  return {
    id: string(item.id), title: string(item.title) || 'Untitled task', body: string(item.body) || null,
    status: string(item.status) || 'todo', priority: number(item.priority), assignee: string(item.assignee) || null,
    tenant: string(item.tenant) || null, projectId: string(item.project_id) || null, branch: string(item.branch_name) || null,
    createdAt: nullableNumber(item.created_at), startedAt: nullableNumber(item.started_at), completedAt: nullableNumber(item.completed_at),
    summary: string(item.latest_summary) || string(item.result) || null, commentCount: number(item.comment_count),
    parentCount: number(links.parents), childCount: number(links.children)
  };
}

export const getHermesKanbanOverview = query(z.object({ board: z.string().trim().min(1).max(240).optional(), includeArchived: z.boolean().default(false) }), async ({ board, includeArchived }) => {
  try {
    const params = new URLSearchParams();
    if (board) params.set('board', board);
    if (includeArchived) params.set('include_archived', 'true');
    const suffix = params.size ? `?${params.toString()}` : '';
    const [boardsValue, boardValue] = await Promise.all([
      client().requestControl<unknown>('/api/plugins/kanban/boards', {}, 30_000),
      client().requestControl<unknown>(`/api/plugins/kanban/board${suffix}`, {}, 30_000)
    ]);
    const boardsRoot = record(boardsValue);
    const boardRoot = record(boardValue);
    return HermesKanbanOverview.parse({
      available: true,
      currentBoard: string(boardsRoot.current) || null,
      boards: list(boardsRoot.boards).map((value) => { const item = record(value); const slug = string(item.slug); return { slug, name: string(item.name) || slug, description: string(item.description), current: item.is_current === true, total: number(item.total) }; }).filter((item) => item.slug),
      columns: list(boardRoot.columns).map((value) => { const item = record(value); return { id: string(item.name), tasks: list(item.tasks).map(normalizeKanbanTask).filter((task) => task.id) }; }).filter((column) => column.id),
      assignees: list(boardRoot.assignees).filter((value): value is string => typeof value === 'string'), error: null
    });
  } catch (cause) {
    return HermesKanbanOverview.parse({ available: false, error: cause instanceof Error ? cause.message : 'Hermes Kanban is unavailable.' });
  }
});

export const createHermesKanbanTask = command(HermesKanbanCreateInput, async ({ board, title, body: taskBody, assignee, priority, triage }) => audited('hermes.kanban.task.created', title, async () => {
  const value = record(await client().requestControl<unknown>(`/api/plugins/kanban/tasks?board=${encodeURIComponent(board)}`, body({
    title, body: taskBody || null, assignee: assignee || null, priority, triage,
    workspace_kind: 'scratch', idempotency_key: crypto.randomUUID()
  }), 30_000));
  return { task: normalizeKanbanTask(value.task), warning: string(value.warning) || null };
}, { board, assignee: assignee || null, priority, triage }));

export const updateHermesKanbanTask = command(HermesKanbanUpdateInput, async ({ board, taskId: id, blockReason, ...updates }) => audited('hermes.kanban.task.updated', id, async () => {
  const value = record(await client().requestControl<unknown>(`/api/plugins/kanban/tasks/${encodeURIComponent(id)}?board=${encodeURIComponent(board)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...updates, block_reason: blockReason })
  }, 30_000));
  return { task: normalizeKanbanTask(value.task) };
}, { board, status: updates.status ?? null }));

export const deleteHermesKanbanTask = command(HermesKanbanDeleteInput, async ({ board, taskId: id }) => audited('hermes.kanban.task.deleted', id, () =>
  client().requestControl(`/api/plugins/kanban/tasks/${encodeURIComponent(id)}?board=${encodeURIComponent(board)}`, { method: 'DELETE' }, 30_000), { board }
));

function normalizeAchievement(value: unknown) {
  const item = record(value);
  const unlocked = item.unlocked === true;
  const rawState = string(item.state);
  return {
    id: string(item.id), name: string(item.name) || '???', description: string(item.description), category: string(item.category) || 'Hermes',
    icon: string(item.icon) || 'award', state: unlocked ? 'unlocked' : rawState === 'secret' ? 'secret' : 'discovered', unlocked,
    tier: string(item.tier) || null, progress: number(item.progress), progressPercent: Math.max(0, Math.min(100, number(item.progress_pct))),
    nextThreshold: nullableNumber(item.next_threshold), criteria: string(item.criteria)
  };
}

export const getHermesAchievementsOverview = query(empty, async () => {
  try {
    const value = record(await client().requestControl<unknown>('/api/plugins/hermes-achievements/achievements', {}, 30_000));
    const scan = record(record(value.scan_meta).status);
    return HermesAchievementsOverview.parse({
      available: true, achievements: list(value.achievements).map(normalizeAchievement).filter((item) => item.id),
      unlockedCount: number(value.unlocked_count), discoveredCount: number(value.discovered_count), secretCount: number(value.secret_count), totalCount: number(value.total_count),
      stale: value.is_stale === true, scanning: ['queued', 'running'].includes(string(scan.state)), generatedAt: nullableNumber(value.generated_at), error: string(value.error) || null
    });
  } catch (cause) {
    return HermesAchievementsOverview.parse({ available: false, error: cause instanceof Error ? cause.message : 'Hermes Achievements is unavailable.' });
  }
});

export const rescanHermesAchievements = command(empty, async () => {
  await client().requestControl('/api/plugins/hermes-achievements/rescan', { method: 'POST', body: '{}' }, 125_000);
  return { ok: true };
});
