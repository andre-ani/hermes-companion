import { describe, expect, it } from 'vitest';
import { reconcileAssistantText } from '../apps/desktop/src/lib/server/hermes-session-recovery';

describe('Hermes session recovery', () => {
  it('accepts a longer authoritative completion after streamed text', () => {
    expect(reconcileAssistantText('Hello', 'Hello world')).toBe('Hello world');
  });

  it('accepts transport-only boundary whitespace differences', () => {
    expect(reconcileAssistantText('\nLIVE_APPROVAL_OK\n', 'LIVE_APPROVAL_OK')).toBe('LIVE_APPROVAL_OK');
    expect(reconcileAssistantText('LIVE_APPROVAL_OK', '\nLIVE_APPROVAL_OK\n')).toBe('\nLIVE_APPROVAL_OK\n');
  });

  it('rejects substantive completion divergence', () => {
    expect(reconcileAssistantText('first answer', 'different answer')).toBeNull();
  });
});
