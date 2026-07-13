import { describe, expect, it } from 'vitest';
import { GatewayStatus, HermesDelegationStatus } from '@hermes-companion/contracts';
import { buildCapabilityRegistry } from '../apps/desktop/src/lib/server/capability-registry.js';
import { readFileSync } from 'node:fs';

describe('Hermes delegation contract', () => {
  it('preserves live hierarchy and execution telemetry', () => {
    const status = HermesDelegationStatus.parse({
      active: [
        { id: 'parent', goal: 'Plan work', status: 'running', depth: 0, toolCount: 2 },
        { id: 'child', parentId: 'parent', goal: 'Inspect tests', model: 'openrouter/auto', status: 'queued', depth: 1, startedAt: 42, toolCount: 0 }
      ],
      paused: false,
      maxSpawnDepth: 2,
      maxConcurrentChildren: 3,
      updatedAt: '2026-07-12T11:00:00.000Z'
    });

    expect(status.active[1]).toMatchObject({ id: 'child', parentId: 'parent', depth: 1, model: 'openrouter/auto' });
    expect(status.maxConcurrentChildren).toBe(3);
  });

  it('advertises Agents only for authenticated enhanced Serve connections', () => {
    const gateway = GatewayStatus.parse({
      connection: { id: 'remote', name: 'Hermes', kind: 'remote', url: 'https://hermes.example.com', controlUrl: 'https://hermes.example.com', serveUrl: 'https://hermes.example.com', serveWsUrl: null, bridgeUrl: null, hermesProfileId: 'default' },
      status: 'enhanced', latencyMs: 12,
      core: { health: true, chatCompletions: true, models: true, streaming: true },
      enhanced: { sessions: true, enhancedChat: true, profiles: true, memory: true, skills: true, config: true, jobs: true, approvals: true, mcp: true, analytics: true, operations: true, logs: true, credentials: true, toolsets: true, permissions: true, messaging: true, webhooks: true, learning: true, curator: true, updates: true },
      compatibility: { mode: 'verified', contract: 'hermes.api_server.capabilities/v1', compatible: true, reason: 'Verified.' },
      checkedAt: '2026-07-12T11:00:00.000Z', error: null
    });

    expect(buildCapabilityRegistry(gateway).find((item) => item.family === 'agents')).toMatchObject({ available: true, owner: 'hermes' });
  });

  it('exposes the dock as a semantic hierarchy with explicit parent context', () => {
    const source = readFileSync(new URL('../apps/desktop/src/lib/components/companion/agents-dock.svelte', import.meta.url), 'utf8');
    expect(source).toContain('role="tree"');
    expect(source).toContain('role="treeitem"');
    expect(source).toContain('aria-level={row.depth + 1}');
    expect(source).toContain('<dt>Parent</dt>');
    expect(source).toContain('Max depth');
  });
});
