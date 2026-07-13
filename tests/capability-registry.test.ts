import { describe, expect, it } from 'vitest';
import { GatewayStatus } from '../packages/contracts/src/index';
import { buildCapabilityRegistry } from '../apps/desktop/src/lib/server/capability-registry';

describe('capability registry', () => {
  it('enables only exact observed Hermes families and leaves undocumented orchestration unavailable', () => {
    const status = GatewayStatus.parse({
      connection: { id: 'local', name: 'Hermes', kind: 'local', url: 'http://127.0.0.1:8642' },
      status: 'enhanced', latencyMs: 4,
      core: { health: true, chatCompletions: true, models: true, streaming: true },
      enhanced: {
        sessions: true, enhancedChat: true, profiles: true, memory: true, skills: true, config: true,
        jobs: true, approvals: true, mcp: true, analytics: true, operations: true,
        logs: true, credentials: true, toolsets: true, permissions: true, messaging: true, webhooks: true,
        learning: true, curator: true, updates: true
      },
      checkedAt: new Date().toISOString(), error: null
    });
    const registry = buildCapabilityRegistry(status);
    const available = (family: string) => registry.find((item) => item.family === family)?.available;
    expect(available('credentials')).toBe(true);
    expect(available('toolsets')).toBe(true);
    expect(available('messaging')).toBe(true);
    expect(available('webhooks')).toBe(true);
    expect(available('checkpoints')).toBe(false);
    expect(available('notifications')).toBe(true);
    expect(available('agents')).toBe(false);
    expect(available('crews')).toBe(false);
    expect(registry.find((item) => item.family === 'agents')?.reason).toContain('documented Hermes API');
  });

  it('advertises checkpoint management only after its exact Hermes endpoint answers', () => {
    const status = GatewayStatus.parse({
      connection: { id: 'remote', name: 'Hermes', kind: 'remote', url: 'https://hermes.example.com' },
      status: 'enhanced', latencyMs: 12,
      core: { health: true, chatCompletions: true, models: true, streaming: true },
      enhanced: { sessions: true, enhancedChat: true, profiles: true, memory: true, skills: true, config: true, jobs: true, approvals: true, mcp: true, analytics: true, operations: true, checkpoints: true },
      checkedAt: new Date().toISOString(), error: null
    });
    expect(buildCapabilityRegistry(status).find((item) => item.family === 'checkpoints')).toMatchObject({ available: true, owner: 'hermes', route: '/checkpoints' });
  });

  it('distinguishes Hermes projects from companion-owned remote capabilities', () => {
    const status = GatewayStatus.parse({
      connection: { id: 'remote', name: 'Remote', kind: 'remote', url: 'https://hermes.example.com' },
      status: 'connected', latencyMs: 20,
      core: { health: true, chatCompletions: true, models: false, streaming: true },
      enhanced: { sessions: false, enhancedChat: false, profiles: false, memory: false, skills: false, config: false, jobs: false, approvals: false, mcp: false, analytics: false, operations: false },
      checkedAt: new Date().toISOString(), error: null
    });
    const projects = buildCapabilityRegistry(status).find((item) => item.family === 'projects');
    expect(projects?.available).toBe(false);
    expect(projects).toMatchObject({ owner: 'hermes' });
    expect(projects?.reason).toContain('documented Hermes API');
    expect(buildCapabilityRegistry(status).find((item) => item.family === 'files')?.reason).toContain('companion bridge');
    expect(buildCapabilityRegistry(status).find((item) => item.family === 'notifications')?.available).toBe(true);
  });

  it('enables Hermes projects over authenticated Serve without a companion bridge', () => {
    const status = GatewayStatus.parse({
      connection: { id: 'remote', name: 'Remote', kind: 'remote', url: 'https://hermes.example.com', serveUrl: 'https://hermes.example.com' },
      status: 'enhanced', latencyMs: 20,
      core: { health: true, chatCompletions: true, models: true, streaming: true },
      enhanced: { sessions: true, enhancedChat: true, profiles: true, memory: true, skills: true, config: true, jobs: true, approvals: true, mcp: true, analytics: true, operations: true },
      checkedAt: new Date().toISOString(), error: null
    });
    expect(buildCapabilityRegistry(status).find((item) => item.family === 'projects')).toMatchObject({ available: true, owner: 'hermes' });
  });

  it('does not infer interceptable approvals from a control-service URL', () => {
    const status = GatewayStatus.parse({
      connection: { id: 'remote', name: 'Remote', kind: 'remote', url: 'https://agent.example.com', controlUrl: 'https://dashboard.example.com' },
      status: 'connected', latencyMs: 20,
      core: { health: true, chatCompletions: true, models: true, streaming: true },
      enhanced: { sessions: true, enhancedChat: false, profiles: true, memory: true, skills: true, config: true, jobs: true, approvals: false, mcp: true, analytics: true, operations: true },
      checkedAt: new Date().toISOString(), error: null
    });
    expect(buildCapabilityRegistry(status).find((item) => item.family === 'approvals')?.available).toBe(false);
  });

  it('disables Hermes-owned surfaces when the advertised platform is incompatible', () => {
    const status = GatewayStatus.parse({
      connection: { id: 'future', name: 'Future', kind: 'local', url: 'http://127.0.0.1:8642' }, status: 'enhanced', latencyMs: 5,
      core: { health: true, chatCompletions: true, models: true, streaming: true },
      enhanced: { sessions: true, enhancedChat: true, profiles: true, memory: true, skills: true, config: true, jobs: true, approvals: true, mcp: true, analytics: true, operations: true },
      compatibility: { mode: 'verified', contract: 'hermes.api_server.capabilities/v1', compatible: false, reason: 'Unsupported capability platform: other-agent' },
      checkedAt: new Date().toISOString(), error: null
    });
    const models = buildCapabilityRegistry(status).find((item) => item.family === 'models');
    expect(models?.available).toBe(false); expect(models?.reason).toContain('other-agent');
    expect(buildCapabilityRegistry(status).find((item) => item.family === 'files')?.available).toBe(true);
  });
});
