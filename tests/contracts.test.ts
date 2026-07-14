import { describe, expect, it } from 'vitest';
import { BridgeEnvelope, DesktopPreferences, HERMES_API_CAPABILITY_CONTRACT_V1, HermesActionStatus, HermesApiCapabilitiesDescriptor, SupportedHermesApiCapabilityContract } from '@hermes-companion/contracts';

describe('companion contracts', () => {
  it('does not expose a fixture mode in desktop preferences', () => {
    expect(DesktopPreferences.parse({})).not.toHaveProperty('development');
    expect(DesktopPreferences.parse({ development: { dataMode: 'fixtures' } })).not.toHaveProperty('development');
  });

  it('pins verified Hermes capability discovery to an explicit supported contract', () => {
    expect(SupportedHermesApiCapabilityContract.parse(HERMES_API_CAPABILITY_CONTRACT_V1)).toBe(HERMES_API_CAPABILITY_CONTRACT_V1);
    expect(() => SupportedHermesApiCapabilityContract.parse('hermes.api_server.capabilities/v2')).toThrow();
    expect(HermesApiCapabilitiesDescriptor.parse({ object: 'hermes.api_server.capabilities', features: {}, endpoints: {} }).object).toBe('hermes.api_server.capabilities');
  });

  it('versions all bridge capability envelopes', () => {
    expect(BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability: 'preview', payload: { action: 'preview.stop', leaseId: crypto.randomUUID() } }).capability).toBe('preview');
  });

  it('scopes GitHub CLI status to Git bridge access', () => {
    expect(BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.github.status', worktreeId: 'wt-1' } }).capability).toBe('git');
    expect(() => BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability: 'projects', payload: { action: 'git.github.status', worktreeId: 'wt-1' } })).toThrow('Capability must be git');
  });

  it('scopes GitHub pull-request metadata to Git bridge access', () => {
    expect(BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.pr.view', worktreeId: 'wt-1' } }).payload.action).toBe('git.pr.view');
  });

  it('scopes commit metadata to Git bridge access', () => {
    expect(BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.commit.metadata', worktreeId: 'wt-1' } }).payload.action).toBe('git.commit.metadata');
  });

  it('normalizes Hermes asynchronous action tails', () => {
    expect(HermesActionStatus.parse({ name: 'doctor-123', pid: 42, running: true, exit_code: null, lines: ['checking'] })).toEqual(expect.objectContaining({ running: true, lines: ['checking'] }));
    expect(() => HermesActionStatus.parse({ name: 'doctor', running: 'yes', lines: [] })).toThrow();
  });

  it('rejects mismatched bridge categories', () => {
    expect(() => BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'preview.stop', leaseId: crypto.randomUUID() } })).toThrow('Capability must be preview');
  });

  it('does not expose provider login or agent-run bridge capabilities', () => {
    expect(() => BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability: 'harness-login', payload: { action: 'harness.discover' } })).toThrow();
    expect(() => BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability: 'runs', payload: { action: 'run.get', runId: crypto.randomUUID() } })).toThrow();
  });
});
