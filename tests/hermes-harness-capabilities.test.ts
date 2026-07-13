import { describe, expect, it } from 'vitest';
import type { GatewayStatus } from '@hermes-companion/contracts';
import { buildHermesHarnessCapabilities } from '../apps/desktop/src/lib/server/hermes-harness-capabilities';

const status = (overrides: Partial<GatewayStatus> = {}): GatewayStatus => ({
  connection: { id: 'remote', name: 'Remote', kind: 'remote', url: 'https://agent.example.com', controlUrl: null, serveWsUrl: null, bridgeUrl: 'https://bridge.example.com', hermesProfileId: null },
  status: 'enhanced', latencyMs: 4,
  core: { health: true, chatCompletions: true, models: true, streaming: true },
  enhanced: { sessions: true, enhancedChat: true, profiles: false, memory: false, skills: true, config: false, jobs: true, approvals: true, mcp: false, analytics: false, operations: false, logs: false, credentials: false, toolsets: true, permissions: false, messaging: false, webhooks: false, learning: false, curator: false, updates: false },
  compatibility: { mode: 'verified', contract: 'hermes.api_server.capabilities/v1', compatible: true, reason: 'Verified.' },
  checkedAt: new Date().toISOString(), error: null,
  ...overrides
});

describe('Hermes coding transport capabilities', () => {
  it('does not claim worktree execution from Agent API run approvals alone', () => {
    expect(buildHermesHarnessCapabilities(status(), false)).toEqual(expect.objectContaining({
      installed: true,
      authenticated: true,
      supportsStructuredApprovals: false,
      supportsStreaming: false,
      supportsWorktrees: false
    }));
  });

  it('enables the complete coding transport only for an authorized Serve URL', () => {
    expect(buildHermesHarnessCapabilities(status(), true)).toEqual(expect.objectContaining({
      supportsStructuredApprovals: true,
      supportsStreaming: true,
      supportsWorktrees: true
    }));
  });

  it('does not treat a control-only partial connection as Agent authentication', () => {
    const controlOnly = status({
      status: 'partial',
      core: { health: false, chatCompletions: false, models: false, streaming: false },
      enhanced: { ...status().enhanced, sessions: false, approvals: false, operations: true }
    });
    expect(buildHermesHarnessCapabilities(controlOnly, false)).toEqual(expect.objectContaining({ installed: true, authenticated: false }));
  });
});
