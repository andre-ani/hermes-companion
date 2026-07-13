import { describe, expect, it } from 'vitest';
import { errorMessage } from '../apps/desktop/src/lib/error-message';

describe('errorMessage', () => {
  it('preserves native and string errors', () => {
    expect(errorMessage(new Error('Native failure'), 'Fallback')).toBe('Native failure');
    expect(errorMessage('String failure', 'Fallback')).toBe('String failure');
  });

  it('unwraps structured remote errors', () => {
    expect(errorMessage({ message: 'Top-level failure' }, 'Fallback')).toBe('Top-level failure');
    expect(errorMessage({ error: { message: 'Remote command failed' } }, 'Fallback')).toBe('Remote command failed');
    expect(errorMessage({ cause: { error: 'Nested failure' } }, 'Fallback')).toBe('Nested failure');
  });

  it('uses the contextual fallback only when no detail exists', () => {
    expect(errorMessage({ status: 500 }, 'Could not complete action.')).toBe('Could not complete action.');
  });
});
