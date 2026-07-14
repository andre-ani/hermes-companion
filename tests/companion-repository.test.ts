import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompanionRepository } from '../apps/desktop/src/lib/server/companion-repository';

const paths: string[] = [];
const owner = { connectionId: 'default', profileId: 'default' } as const;
afterEach(async () => Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const repository = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-companion-'));
  paths.push(directory);
  const repo = new CompanionRepository(join(directory, 'state.json'));
  return repo;
};

describe('CompanionRepository', () => {
  it('persists desktop settings without putting provider secrets in companion state', async () => {
    const repo = await repository();
    const settings = await repo.getDesktopPreferences();
    const saved = await repo.setDesktopPreferences({ ...settings, account: { displayName: 'Andre Ani', email: 'andre@example.com' } });
    expect(saved).toMatchObject({ account: { displayName: 'Andre Ani', email: 'andre@example.com' } });
    expect(JSON.stringify(saved)).not.toContain('apiKey');
  });

  it('persists workspace layout per connection, profile, and session and adopts drafts atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-companion-')); paths.push(directory); const file = join(directory, 'state.json');
    const repo = new CompanionRepository(file);
    const draft = { connectionId: 'railway', profileId: 'code', resource: { kind: 'draft' as const, id: crypto.randomUUID() } };
    const session = { connectionId: 'railway', profileId: 'code', resource: { kind: 'session' as const, id: 'session-1' } };
    await repo.setWorkspaceLayout(draft, {
      inspector: { visible: true, mode: 'focused', activeTab: 'files', openTabs: ['files', 'terminal'], width: 612 },
      terminal: { visible: true, height: 344 }
    });
    await repo.adoptWorkspaceLayout(draft, session, {
      inspector: { visible: true, mode: 'docked', activeTab: 'terminal', openTabs: ['terminal'], width: 540 },
      terminal: { visible: false, height: 300 }
    });

    const reloaded = new CompanionRepository(file);
    expect(await reloaded.getWorkspaceLayout(session)).toEqual({
      inspector: { visible: true, mode: 'docked', activeTab: 'terminal', openTabs: ['terminal'], width: 540 },
      terminal: { visible: false, height: 300 }
    });
    expect(await reloaded.getWorkspaceLayout(draft)).toEqual({
      inspector: { visible: false, mode: 'docked', activeTab: 'surfaces', openTabs: [], width: 480 },
      terminal: { visible: false, height: 260 }
    });
    expect(await reloaded.getWorkspaceLayout({ ...session, profileId: 'default' })).toEqual({
      inspector: { visible: false, mode: 'docked', activeTab: 'surfaces', openTabs: [], width: 480 },
      terminal: { visible: false, height: 260 }
    });
  });

  it('clears companion-owned session presentation state after authoritative deletion', async () => {
    const repo = await repository();
    const session = { connectionId: 'railway', profileId: 'code', resource: { kind: 'session' as const, id: 'deleted-session' } };
    await repo.setSessionPinned('deleted-session', true);
    await repo.setSessionUnread('deleted-session', true);
    await repo.setWorkspaceLayout(session, {
      inspector: { visible: true, mode: 'docked', activeTab: 'files', openTabs: ['files'], width: 520 },
      terminal: { visible: true, height: 320 }
    });

    await repo.clearSessionPresentationState('deleted-session', 'railway', 'code');

    expect(await repo.getPinnedSessionIds()).toEqual([]);
    expect(await repo.getUnreadSessionIds()).toEqual([]);
    expect(await repo.getWorkspaceLayout(session)).toMatchObject({
      inspector: { visible: false, activeTab: 'surfaces', openTabs: [] },
      terminal: { visible: false }
    });
  });

  it('recovers one malformed workspace layout without resetting other companion state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-companion-')); paths.push(directory); const file = join(directory, 'state.json');
    const validOwner = { connectionId: 'default', profileId: 'default', resource: { kind: 'session' as const, id: 'valid' } };
    const badOwner = { ...validOwner, resource: { kind: 'session' as const, id: 'bad' } };
    await writeFile(file, JSON.stringify({
      version: 1, activeConnectionId: 'default',
      connections: [{ id: 'default', name: 'Hermes Agent', description: '', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null, serveUrl: null, serveWsUrl: null, bridgeUrl: null, hermesProfileId: null }],
      projects: [], worktrees: [], previews: [], profileUi: {}, pinnedSessionIds: [], archivedSessionIds: [], unreadSessionIds: [], audit: [],
      workspaceLayouts: {
        [JSON.stringify(['default', 'default', ['session', 'valid']])]: { inspector: { visible: true, mode: 'docked', activeTab: 'files', openTabs: ['files'], width: 500 }, terminal: { visible: false, height: 260 } },
        [JSON.stringify(['default', 'default', ['session', 'bad']])]: { inspector: { width: 'impossible' } }
      }
    }));
    const repo = new CompanionRepository(file);
    expect((await repo.getWorkspaceLayout(validOwner)).inspector.activeTab).toBe('files');
    expect(await repo.getWorkspaceLayout(badOwner)).toMatchObject({ inspector: { visible: false, activeTab: 'surfaces' }, terminal: { visible: false } });
    expect((await repo.getConnections())[0]?.id).toBe('default');
  });

  it('persists only companion-owned project and worktree metadata', async () => {
    const repo = await repository();
    await repo.upsertProject({ id: 'p-1', name: 'Companion', repositoryPath: '/repo', remoteUrl: null, defaultBranch: 'main', connectionId: 'default' });
    await repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'wt-1', path: '/repo-wt', branch: 'thread/one', threadId: 't-1', createdAt: new Date().toISOString() });
    expect(await repo.listProjects()).toEqual([expect.objectContaining({ id: 'p-1' })]);
    expect(await repo.listWorktrees('p-1')).toEqual([expect.objectContaining({ worktreeId: 'wt-1' })]);
  });

  it('never serializes Hermes transport, transcript, approval, context, model-status, or subagent state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-companion-')); paths.push(directory); const file = join(directory, 'state.json');
    const repo = new CompanionRepository(file);
    await repo.setWorkspaceLayout({ ...owner, resource: { kind: 'session', id: 'opaque-durable-id' } }, {
      inspector: { visible: true, mode: 'docked', activeTab: 'surfaces', openTabs: [], width: 480 },
      terminal: { visible: false, height: 260 }
    });
    const serialized = await readFile(file, 'utf8');
    for (const prohibited of ['transportSessionId', 'pendingApproval', 'contextUsage', 'modelStatus', 'subagents', 'hermesMessages', 'hermesRunning']) {
      expect(serialized).not.toContain(prohibited);
    }
    expect(serialized).toContain('opaque-durable-id');
  });

  it('isolates identical project identifiers by connection ownership', async () => {
    const repo = await repository();
    await repo.upsertProject({ id: 'shared', name: 'Local', repositoryPath: '/local/repo', remoteUrl: null, defaultBranch: 'main', connectionId: 'default' });
    await repo.upsertProject({ id: 'shared', name: 'Remote', repositoryPath: '/remote/repo', remoteUrl: null, defaultBranch: 'trunk', connectionId: 'railway' });
    expect(await repo.getProject('shared', 'default')).toMatchObject({ name: 'Local', repositoryPath: '/local/repo' });
    expect(await repo.getProject('shared', 'railway')).toMatchObject({ name: 'Remote', repositoryPath: '/remote/repo' });
    expect(await repo.listProjects('railway')).toEqual([expect.objectContaining({ name: 'Remote' })]);
  });

  it('keeps legacy worktree records outside every active owner scope', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-companion-')); paths.push(directory); const file = join(directory, 'state.json');
    await writeFile(file, JSON.stringify({
      version: 1, activeConnectionId: 'default',
      connections: [{ id: 'default', name: 'Hermes Agent', description: '', kind: 'local', url: 'http://127.0.0.1:8642', controlUrl: null, serveUrl: null, serveWsUrl: null, bridgeUrl: null, hermesProfileId: null }],
      projects: [],
      worktrees: [{ projectId: 'p-1', worktreeId: 'legacy', path: '/legacy', branch: 'legacy', threadId: 'legacy-thread', createdAt: new Date().toISOString() }],
      previews: [], audit: []
    }));
    const repo = new CompanionRepository(file);
    expect(await repo.listWorktrees(undefined, 'default', 'default')).toEqual([]);
    expect(await repo.getWorktree('legacy', 'default', 'default')).toBeNull();
    expect(await repo.listWorktrees()).toEqual([expect.objectContaining({ connectionId: 'legacy-unscoped', profileId: 'legacy-unscoped' })]);
  });

  it('persists presentation preferences per Hermes profile with legacy connection fallback', async () => {
    const repo = await repository();
    await repo.upsertConnection({ id: 'railway', name: 'Railway', description: '', kind: 'remote', url: 'https://example.test', controlUrl: null, serveUrl: 'https://example.test', serveWsUrl: null, bridgeUrl: null, hermesProfileId: null });
    await repo.setProfileUi('railway', { presetId: 'default', sessionPresentation: 'sessions', sessionTreeLabel: null, sessionFilter: null, contextualControls: { approval: 'status', context: 'status' }, header: { customActions: [], primaryActionId: null, gitEnabled: false, primaryGitAction: 'commit' } });
    expect(await repo.getProfileUi('railway:code')).toMatchObject({ sessionPresentation: 'sessions' });
    await repo.setProfileUi('railway:code', { ...(await repo.getProfileUi('railway:code')), sessionPresentation: 'projects' });
    expect(await repo.getProfileUi('railway:code')).toMatchObject({ sessionPresentation: 'projects' });
    expect(await repo.getProfileUi('railway:default')).toMatchObject({ sessionPresentation: 'sessions' });
  });

  it('binds at most one worktree to a Hermes session in each project', async () => {
    const repo = await repository(); const createdAt = new Date().toISOString();
    await repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'wt-1', path: '/repo-wt-1', branch: 'companion/session-1', threadId: 'session-1', createdAt });
    expect((await repo.getWorktreeForThread('session-1', 'p-1', owner.connectionId, owner.profileId))?.worktreeId).toBe('wt-1');
    await expect(repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'wt-2', path: '/repo-wt-2', branch: 'companion/session-1-copy', threadId: 'session-1', createdAt })).rejects.toThrow('already has a worktree');
  });

  it('isolates session worktrees by connection and profile ownership', async () => {
    const repo = await repository(); const createdAt = new Date().toISOString();
    const first = { ...owner, projectId: 'shared-project', worktreeId: 'wt-a', path: '/host-a/repo', branch: 'feature/a', threadId: 'shared-session', createdAt };
    const second = { ...first, connectionId: 'railway-b', profileId: 'code', worktreeId: 'wt-b', path: '/host-b/repo', branch: 'feature/b' };
    await repo.addWorktree(first);
    await repo.addWorktree(second);
    expect((await repo.getWorktreeForThread('shared-session', 'shared-project', 'default', 'default'))?.worktreeId).toBe('wt-a');
    expect((await repo.getWorktreeForThread('shared-session', 'shared-project', 'railway-b', 'code'))?.worktreeId).toBe('wt-b');
    expect(await repo.listWorktrees(undefined, 'railway-b', 'code')).toEqual([expect.objectContaining({ worktreeId: 'wt-b' })]);
  });

  it('rejects duplicate physical worktree paths within one execution host', async () => {
    const repo = await repository(); const createdAt = new Date().toISOString();
    await repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'wt-1', path: '/same/path', branch: 'one', threadId: 'session-1', createdAt });
    await expect(repo.addWorktree({ ...owner, profileId: 'code', projectId: 'p-2', worktreeId: 'wt-2', path: '/same/path', branch: 'two', threadId: 'session-2', createdAt })).rejects.toThrow('path is already bound');
  });

  it('repairs a session worktree binding only through the explicit upsert path', async () => {
    const repo = await repository(); const createdAt = new Date().toISOString();
    await repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'stale', path: '/old', branch: 'old', threadId: 'session-1', createdAt });
    const repaired = await repo.upsertWorktreeBinding({ ...owner, projectId: 'p-1', worktreeId: 'verified', path: '/repo-wt', branch: 'feature/verified', threadId: 'session-1', createdAt });
    expect(repaired).toMatchObject({ worktreeId: 'verified', path: '/repo-wt', branch: 'feature/verified' });
    expect(await repo.listWorktrees('p-1')).toEqual([expect.objectContaining({ worktreeId: 'verified', threadId: 'session-1' })]);
    await expect(repo.upsertWorktreeBinding({ ...owner, projectId: 'p-2', worktreeId: 'verified', path: '/other', branch: 'other', threadId: 'session-2', createdAt })).rejects.toThrow('another Hermes session');
  });

  it('fails truthfully when removing a worktree from the wrong owner', async () => {
    const repo = await repository();
    await repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'wt-1', path: '/owned', branch: 'owned', threadId: 'session-1', createdAt: new Date().toISOString() });
    await expect(repo.removeWorktree('wt-1', 'railway')).rejects.toThrow('requested owner');
    expect(await repo.getWorktree('wt-1', owner.connectionId, owner.profileId)).not.toBeNull();
  });

  it('links child worktrees only to top-level parents in the same project', async () => {
    const repo = await repository(); const createdAt = new Date().toISOString();
    await repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'parent', path: '/parent', branch: 'companion/parent', threadId: 'parent-thread', parentWorktreeId: null, createdAt });
    await repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'child', path: '/child', branch: 'companion/child', threadId: 'child-thread', parentWorktreeId: 'parent', createdAt });
    expect((await repo.listWorktrees()).find((item) => item.worktreeId === 'child')?.parentWorktreeId).toBe('parent');
    await expect(repo.addWorktree({ ...owner, projectId: 'p-1', worktreeId: 'nested', path: '/nested', branch: 'companion/nested', threadId: 'nested-thread', parentWorktreeId: 'child', createdAt })).rejects.toThrow('top-level parent');
  });
});
