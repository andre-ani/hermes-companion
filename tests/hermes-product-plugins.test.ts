import { describe, expect, it } from 'vitest';
import { GatewayStatus, HermesAchievementsOverview, HermesCheckpointStoreOverview, HermesInsightsOverview, HermesKanbanCreateInput, HermesKanbanOverview, HermesKanbanUpdateInput, HermesLearningGraph, HermesPetGallery } from '@hermes-companion/contracts';
import { buildCapabilityRegistry } from '../apps/desktop/src/lib/server/capability-registry.js';

describe('Hermes product plugin contracts', () => {
  it('preserves Kanban workflow ownership without accepting private task paths', () => {
    const board = HermesKanbanOverview.parse({
      available: true,
      currentBoard: 'default',
      boards: [{ slug: 'default', name: 'Default', current: true, total: 1 }],
      columns: [{ id: 'running', tasks: [{ id: 'task-1', title: 'Verify deployment', status: 'running', assignee: 'code', childCount: 2 }] }]
    });

    expect(board.columns[0].tasks[0]).toMatchObject({ id: 'task-1', assignee: 'code', childCount: 2 });
    expect(board.columns[0].tasks[0]).not.toHaveProperty('workspace_path');
  });

  it('defaults every Kanban creation surface to triage before dispatch', () => {
    const input = HermesKanbanCreateInput.parse({ board: 'default', title: 'Review deployment' });
    expect(input).toMatchObject({ triage: true, priority: 0, assignee: '' });
  });

  it('accepts real workflow transitions and rejects invented states', () => {
    expect(HermesKanbanUpdateInput.parse({ board: 'default', taskId: 'task-1', status: 'archived' }).status).toBe('archived');
    expect(() => HermesKanbanUpdateInput.parse({ board: 'default', taskId: 'task-1', status: 'in-review' })).toThrow();
  });

  it('keeps discovered and secret achievement states distinct', () => {
    const overview = HermesAchievementsOverview.parse({
      available: true,
      achievements: [
        { id: 'delegate', name: 'Subagent Commander', state: 'discovered', progress: 3, progressPercent: 60 },
        { id: 'secret', name: '???', state: 'secret' }
      ],
      discoveredCount: 1,
      secretCount: 1,
      totalCount: 2
    });

    expect(overview.achievements.map((item) => item.state)).toEqual(['discovered', 'secret']);
  });

  it('advertises product tabs only when their mounted Hermes APIs answer', () => {
    const gateway = GatewayStatus.parse({
      connection: { id: 'remote', name: 'Hermes', kind: 'remote', url: 'https://hermes.example.com', controlUrl: 'https://hermes.example.com', serveUrl: 'https://hermes.example.com', serveWsUrl: null, bridgeUrl: null, hermesProfileId: 'default' },
      status: 'enhanced', latencyMs: 12,
      core: { health: true, chatCompletions: true, models: true, streaming: true },
      enhanced: { sessions: true, enhancedChat: true, profiles: true, memory: true, skills: true, config: true, jobs: true, approvals: true, mcp: true, analytics: true, operations: true, plugins: true, kanban: true, achievements: true, learning: true },
      checkedAt: '2026-07-12T11:00:00.000Z', error: null
    });

    const capabilities = buildCapabilityRegistry(gateway);
    expect(capabilities.find((item) => item.family === 'kanban')).toMatchObject({ available: true, owner: 'hermes' });
    expect(capabilities.find((item) => item.family === 'achievements')).toMatchObject({ available: true, owner: 'hermes' });
    expect(capabilities.find((item) => item.family === 'learning')).toMatchObject({ available: true, owner: 'hermes' });
  });

  it('keeps learned skills and memories distinct without exposing private paths', () => {
    const graph = HermesLearningGraph.parse({ available: true, nodes: [
      { id: 'skill-a', label: 'Deploy safely', kind: 'skill', category: 'Operations' },
      { id: 'memory-a', label: 'Production prefers blue-green', kind: 'memory', memorySource: 'profile' }
    ], edges: [{ source: 'skill-a', target: 'memory-a' }] });
    expect(graph.nodes.map((node) => node.kind)).toEqual(['skill', 'memory']);
    expect(graph.nodes[1]).not.toHaveProperty('path');
  });

  it('keeps pet selection profile-scoped and strips remote asset locations', () => {
    const gallery = HermesPetGallery.parse({ available: true, enabled: false, active: '', info: {}, pets: [
      { slug: 'boba', displayName: 'Boba', installed: true, spritesheetUrl: 'https://private.example/pet.png' }
    ] });
    expect(gallery.pets[0]).toEqual({ slug: 'boba', displayName: 'Boba', installed: true, curated: false, generated: false });
    expect(gallery.pets[0]).not.toHaveProperty('spritesheetUrl');
  });

  it('normalizes aggregate checkpoint storage without inventing per-file restore state', () => {
    const store = HermesCheckpointStoreOverview.parse({ sessions: [{ session: 'chat-123', files: 7, bytes: 4096 }], total_bytes: 4096 });
    expect(store).toEqual({ sessions: [{ session: 'chat-123', files: 7, bytes: 4096 }], total_bytes: 4096 });
    expect(store.sessions[0]).not.toHaveProperty('path');
    expect(store.sessions[0]).not.toHaveProperty('restore');
  });

  it('normalizes Hermes insights without reading private session storage', () => {
    const insights = HermesInsightsOverview.parse({
      daily: [{ day: '2026-07-12', input_tokens: 1200, output_tokens: 300, sessions: 1, api_calls: 2 }],
      by_model: [{ model: 'provider/model', input_tokens: 1200, output_tokens: 300, sessions: 1, api_calls: 2 }],
      totals: { total_input: 1200, total_output: 300, total_sessions: 1, total_api_calls: 2 }, period_days: 30,
      skills: { summary: {}, top_skills: [{ skill: 'testing', total_count: 2 }] }, tools: [{ tool: 'read_file', count: 4, percentage: 50 }]
    });
    expect(insights.totals.total_estimated_cost).toBe(0);
    expect(insights.skills.top_skills[0]).toMatchObject({ skill: 'testing', total_count: 2 });
    expect(insights).not.toHaveProperty('database_path');
  });
});
