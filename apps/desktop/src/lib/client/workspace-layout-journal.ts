import {
  workspaceLayoutOwnerKey,
  WorkspaceLayoutPreferences,
  type WorkspaceLayoutOwner
} from '@hermes-companion/contracts';

type LayoutPreferences = ReturnType<typeof WorkspaceLayoutPreferences.parse>;
type LayoutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const journalPrefix = 'hermes-companion.workspace-layout.pending.v1:';

function browserStorage(): LayoutStorage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; }
  catch { return null; }
}

export function workspaceLayoutJournalKey(owner: WorkspaceLayoutOwner) {
  return `${journalPrefix}${workspaceLayoutOwnerKey(owner)}`;
}

export function readWorkspaceLayoutJournal(owner: WorkspaceLayoutOwner, storage: LayoutStorage | null = browserStorage()) {
  if (!storage) return null;
  const key = workspaceLayoutJournalKey(owner);
  try {
    const value = storage.getItem(key);
    return value ? WorkspaceLayoutPreferences.parse(JSON.parse(value)) : null;
  } catch {
    try { storage.removeItem(key); } catch { /* Ignore unavailable storage. */ }
    return null;
  }
}

export function writeWorkspaceLayoutJournal(
  owner: WorkspaceLayoutOwner,
  preferences: LayoutPreferences,
  storage: LayoutStorage | null = browserStorage()
) {
  const parsed = WorkspaceLayoutPreferences.parse(preferences);
  if (!storage) return parsed;
  try { storage.setItem(workspaceLayoutJournalKey(owner), JSON.stringify(parsed)); }
  catch { /* Persistence still proceeds through the authoritative server store. */ }
  return parsed;
}

export function clearWorkspaceLayoutJournal(
  owner: WorkspaceLayoutOwner,
  expected?: LayoutPreferences,
  storage: LayoutStorage | null = browserStorage()
) {
  if (!storage) return false;
  try {
    const key = workspaceLayoutJournalKey(owner);
    if (expected) {
      const current = storage.getItem(key);
      if (current !== JSON.stringify(WorkspaceLayoutPreferences.parse(expected))) return false;
    }
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
