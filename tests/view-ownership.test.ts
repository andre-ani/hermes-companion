import { describe, expect, it } from 'vitest';
import { SerializedSelectionQueue, ViewOwnership, viewResourceKey } from '../apps/desktop/src/lib/view-ownership.js';

describe('renderer view ownership', () => {
  it('rejects completions from a view that navigation replaced', () => {
    const ownership = new ViewOwnership();
    const sessionA = ownership.begin({ connectionId: 'railway', profileId: 'code', sessionId: 'a', draftId: null, location: 'chat' });
    const sessionB = ownership.begin({ connectionId: 'railway', profileId: 'code', sessionId: 'b', draftId: null, location: 'chat' });

    expect(ownership.owns(sessionA)).toBe(false);
    expect(ownership.owns(sessionB)).toBe(true);
  });

  it('treats profile and connection as part of session identity', () => {
    const ownership = new ViewOwnership();
    const oldProfile = ownership.begin({ connectionId: 'railway', profileId: 'agent', sessionId: 'shared-id', draftId: null, location: 'chat' });
    const newProfile = ownership.begin({ connectionId: 'railway', profileId: 'code', sessionId: 'shared-id', draftId: null, location: 'chat' });

    expect(ownership.owns(oldProfile)).toBe(false);
    expect(ownership.owns(newProfile)).toBe(true);
  });

  it('adopts a server session only while the provisional new-chat view still owns it', () => {
    const ownership = new ViewOwnership();
    const provisional = ownership.begin({ connectionId: 'railway', profileId: 'agent', sessionId: null, draftId: 'draft-a', location: 'chat' });
    const adopted = ownership.adoptSession(provisional, 'server-session');

    expect(adopted?.sessionId).toBe('server-session');
    expect(ownership.owns(provisional)).toBe(false);
    expect(ownership.owns(adopted)).toBe(true);

    const abandoned = ownership.begin({ connectionId: 'railway', profileId: 'agent', sessionId: null, draftId: 'draft-b', location: 'chat' });
    ownership.begin({ connectionId: 'railway', profileId: 'agent', sessionId: 'elsewhere', draftId: null, location: 'chat' });
    expect(ownership.adoptSession(abandoned, 'late-session')).toBeNull();
  });

  it('invalidates chat projection when a different center surface takes ownership', () => {
    const ownership = new ViewOwnership();
    const chat = ownership.begin({ connectionId: 'railway', profileId: 'agent', sessionId: 'a', draftId: null, location: 'chat' });
    const settings = ownership.begin({ connectionId: 'railway', profileId: 'agent', sessionId: 'a', draftId: null, location: 'settings' });

    expect(ownership.owns(chat)).toBe(false);
    expect(ownership.owns(settings)).toBe(true);
  });

  it('distinguishes separate new-chat drafts before Hermes assigns session IDs', () => {
    const ownership = new ViewOwnership();
    const first = ownership.begin({ connectionId: 'railway', profileId: 'agent', sessionId: null, draftId: 'draft-a', location: 'chat' });
    const second = ownership.begin({ connectionId: 'railway', profileId: 'agent', sessionId: null, draftId: 'draft-b', location: 'chat' });

    expect(ownership.owns(first)).toBe(false);
    expect(ownership.owns(second)).toBe(true);
    expect(viewResourceKey(first)).not.toBe(viewResourceKey(second));
  });

  it('cannot collide a real session ID with a provisional draft ID', () => {
    expect(viewResourceKey({ connectionId: 'railway', profileId: 'agent', sessionId: 'draft:x', draftId: null }))
      .not.toBe(viewResourceKey({ connectionId: 'railway', profileId: 'agent', sessionId: null, draftId: 'x' }));
  });
});

describe('serialized backend selection', () => {
  it('serializes remote mutations while only the newest intent may reconcile', async () => {
    const selections = new SerializedSelectionQueue<string>();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = selections.enqueue('code', async (target) => {
      order.push(`start:${target}`);
      await firstBlocked;
      order.push(`finish:${target}`);
    });
    const second = selections.enqueue('agent', async (target) => {
      order.push(`start:${target}`);
      order.push(`finish:${target}`);
    });

    await Promise.resolve();
    expect(order).toEqual(['start:code']);
    expect(selections.isLatest(first)).toBe(false);
    expect(selections.isLatest(second)).toBe(true);

    releaseFirst();
    await Promise.all([first.completion, second.completion]);
    expect(order).toEqual(['start:code', 'finish:code', 'start:agent', 'finish:agent']);
  });

  it('continues the queue after a failed remote mutation', async () => {
    const selections = new SerializedSelectionQueue<string>();
    const first = selections.enqueue('broken', async () => { throw new Error('offline'); });
    const second = selections.enqueue('agent', async () => undefined);

    await expect(first.completion).rejects.toThrow('offline');
    await expect(second.completion).resolves.toBeUndefined();
    expect(selections.isLatest(second)).toBe(true);
  });

  it('retains the last successful backend target when a newer selection fails', async () => {
    const selections = new SerializedSelectionQueue<string>();
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = selections.enqueue('code', async () => { await firstBlocked; });
    const second = selections.enqueue('broken', async () => { throw new Error('unavailable'); });

    releaseFirst();
    await first.completion;
    await expect(second.completion).rejects.toThrow('unavailable');

    expect(selections.isLatest(second)).toBe(true);
    expect(selections.lastSuccessfulTarget).toBe('code');
  });
});
