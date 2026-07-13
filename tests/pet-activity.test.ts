import { describe, expect, it } from 'vitest';
import { resolveCompanionPetActivity } from '../apps/desktop/src/lib/pet-activity.js';

describe('Hermes pet activity mapping', () => {
  it('matches Hermes activity priority', () => {
    expect(resolveCompanionPetActivity({ failed: true, awaitingApproval: true, toolRunning: true })).toBe('failed');
    expect(resolveCompanionPetActivity({ justCompleted: true, toolRunning: true })).toBe('wave');
    expect(resolveCompanionPetActivity({ awaitingApproval: true, sending: true })).toBe('waiting');
    expect(resolveCompanionPetActivity({ toolRunning: true, reasoning: true })).toBe('run');
    expect(resolveCompanionPetActivity({ reasoning: true, sending: true })).toBe('review');
    expect(resolveCompanionPetActivity({ sending: true })).toBe('run');
    expect(resolveCompanionPetActivity({})).toBe('idle');
  });
});
