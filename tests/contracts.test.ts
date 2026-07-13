import { describe, expect, it } from 'vitest';
import { AnnotationPayload, BridgeEnvelope, DesktopPreferences, HERMES_API_CAPABILITY_CONTRACT_V1, HermesActionStatus, HermesApiCapabilitiesDescriptor, RecoverableChatTurn, StartRunInput, SupportedHermesApiCapabilityContract } from '@hermes-companion/contracts';

describe('companion contracts', () => {
  it('does not expose a fixture mode in desktop preferences', () => {
    expect(DesktopPreferences.parse({})).not.toHaveProperty('development');
    expect(DesktopPreferences.parse({ development: { dataMode: 'fixtures' } })).not.toHaveProperty('development');
  });

  it('requires a scoped worktree for every Hermes background run', () => {
    expect(() => StartRunInput.parse({ harness: 'hermes', prompt: 'Ship it' })).toThrow();
  });

  it('requires recoverable turns to pair a user message with the same session snapshot', () => {
    const requestId = crypto.randomUUID();
    const userMessage = { id: 'user-1', sessionId: 'session-1', role: 'user', text: 'Keep working', createdAt: new Date().toISOString() };
    const snapshot = {
      requestId, sequence: 1, sessionId: 'session-1', status: 'streaming',
      message: { id: 'assistant-1', sessionId: 'session-1', role: 'assistant', text: 'Working', createdAt: new Date().toISOString(), generation: { requestId, sequence: 1, status: 'streaming' } }
    };
    expect(RecoverableChatTurn.parse({ userMessage, snapshot, baselineMessageCount: 0 }).userMessage.role).toBe('user');
    expect(() => RecoverableChatTurn.parse({ userMessage: { ...userMessage, role: 'assistant' }, snapshot, baselineMessageCount: 0 })).toThrow('must include its user message');
    expect(() => RecoverableChatTurn.parse({ userMessage: { ...userMessage, sessionId: 'other-session' }, snapshot, baselineMessageCount: 0 })).toThrow('same session');
  });

  it('pins verified Hermes capability discovery to an explicit supported contract', () => {
    expect(SupportedHermesApiCapabilityContract.parse(HERMES_API_CAPABILITY_CONTRACT_V1)).toBe(HERMES_API_CAPABILITY_CONTRACT_V1);
    expect(() => SupportedHermesApiCapabilityContract.parse('hermes.api_server.capabilities/v2')).toThrow();
    expect(HermesApiCapabilitiesDescriptor.parse({ object: 'hermes.api_server.capabilities', features: {}, endpoints: {} }).object).toBe('hermes.api_server.capabilities');
  });

  it('rejects provider CLIs as companion-owned runtimes', () => {
    const worktree = { projectId: 'p-1', worktreeId: 'wt-1', path: '/tmp/wt-1', branch: 'task/wt-1' };
    for (const harness of ['codex', 'claude-code', 'opencode', 'cursor']) {
      expect(() => StartRunInput.parse({ harness, prompt: 'Ship it', worktree })).toThrow();
    }
  });

  it('keeps annotation delivery auditable and worktree-scoped', () => {
    const annotation = AnnotationPayload.parse({
      route: '/settings', selectedElement: { selector: '[data-setting="model"]' }, note: 'Clarify this option',
      sourceWorktreeId: 'wt-1', targetThreadId: 'thread-1'
    });
    expect(annotation.sourceWorktreeId).toBe('wt-1');
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
