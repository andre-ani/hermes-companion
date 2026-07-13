import { describe, expect, it } from 'vitest';
import {
  clearWorkspaceLayoutJournal,
  readWorkspaceLayoutJournal,
  workspaceLayoutJournalKey,
  writeWorkspaceLayoutJournal
} from '../apps/desktop/src/lib/client/workspace-layout-journal';

const owner = { connectionId: 'railway', profileId: 'code', resource: { kind: 'session' as const, id: 'session-1' } };
const otherOwner = { ...owner, resource: { kind: 'session' as const, id: 'session-2' } };
const first = {
  inspector: { visible: true, mode: 'docked' as const, activeTab: 'files' as const, openTabs: ['files' as const], width: 520 },
  terminal: { visible: false, height: 260 }
};
const latest = {
  inspector: { visible: true, mode: 'focused' as const, activeTab: 'terminal' as const, openTabs: ['files' as const, 'terminal' as const], width: 612 },
  terminal: { visible: true, height: 344 }
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

describe('workspace layout recovery journal', () => {
  it('recovers the latest owner-scoped layout after an immediate renderer reload', () => {
    const storage = memoryStorage();
    writeWorkspaceLayoutJournal(owner, first, storage);
    writeWorkspaceLayoutJournal(owner, latest, storage);

    // A new renderer reads the synchronous journal even when the remote write
    // from the previous renderer was cancelled during teardown.
    expect(readWorkspaceLayoutJournal(owner, storage)).toEqual(latest);
    expect(readWorkspaceLayoutJournal(otherOwner, storage)).toBeNull();
  });

  it('does not let an older completed write clear a newer pending layout', () => {
    const storage = memoryStorage();
    writeWorkspaceLayoutJournal(owner, first, storage);
    writeWorkspaceLayoutJournal(owner, latest, storage);

    expect(clearWorkspaceLayoutJournal(owner, first, storage)).toBe(false);
    expect(readWorkspaceLayoutJournal(owner, storage)).toEqual(latest);
    expect(clearWorkspaceLayoutJournal(owner, latest, storage)).toBe(true);
    expect(storage.getItem(workspaceLayoutJournalKey(owner))).toBeNull();
  });

  it('ignores malformed recovery data without crossing owner boundaries', () => {
    const storage = memoryStorage();
    storage.setItem(workspaceLayoutJournalKey(owner), '{broken');
    writeWorkspaceLayoutJournal(otherOwner, first, storage);

    expect(readWorkspaceLayoutJournal(owner, storage)).toBeNull();
    expect(storage.getItem(workspaceLayoutJournalKey(owner))).toBeNull();
    expect(readWorkspaceLayoutJournal(otherOwner, storage)).toEqual(first);
  });
});
