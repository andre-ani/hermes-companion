import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompanionRepository } from '../apps/desktop/src/lib/server/companion-repository';

const paths: string[] = [];
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

  it('persists only companion-owned project and worktree metadata', async () => {
    const repo = await repository();
    await repo.upsertProject({ id: 'p-1', name: 'Companion', repositoryPath: '/repo', remoteUrl: null, defaultBranch: 'main', connectionId: 'default' });
    await repo.addWorktree({ projectId: 'p-1', worktreeId: 'wt-1', path: '/repo-wt', branch: 'thread/one', threadId: 't-1', writerRunId: null, createdAt: new Date().toISOString() });
    expect(await repo.listProjects()).toEqual([expect.objectContaining({ id: 'p-1' })]);
    expect(await repo.listWorktrees('p-1')).toEqual([expect.objectContaining({ worktreeId: 'wt-1' })]);
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

  it('enforces one active writer per worktree', async () => {
    const repo = await repository();
    await repo.addWorktree({ projectId: 'p-1', worktreeId: 'wt-1', path: '/repo-wt', branch: 'thread/one', threadId: 't-1', writerRunId: null, createdAt: new Date().toISOString() });
    const run = { id: crypto.randomUUID(), worktreeId: 'wt-1', harness: 'hermes', status: 'starting' as const, startedAt: new Date().toISOString(), finishedAt: null };
    await repo.acquireWriter('wt-1', run);
    await expect(repo.acquireWriter('wt-1', { ...run, id: crypto.randomUUID() })).rejects.toThrow('active writer');
    await repo.releaseWriter('wt-1', run.id, 'completed');
    expect((await repo.listWorktrees())[0].writerRunId).toBeNull();
  });

  it('binds at most one worktree to a Hermes session in each project', async () => {
    const repo = await repository(); const createdAt = new Date().toISOString();
    await repo.addWorktree({ projectId: 'p-1', worktreeId: 'wt-1', path: '/repo-wt-1', branch: 'companion/session-1', threadId: 'session-1', writerRunId: null, createdAt });
    expect((await repo.getWorktreeForThread('session-1', 'p-1'))?.worktreeId).toBe('wt-1');
    await expect(repo.addWorktree({ projectId: 'p-1', worktreeId: 'wt-2', path: '/repo-wt-2', branch: 'companion/session-1-copy', threadId: 'session-1', writerRunId: null, createdAt })).rejects.toThrow('already has a worktree');
  });

  it('links child worktrees only to top-level parents in the same project', async () => {
    const repo = await repository(); const createdAt = new Date().toISOString();
    await repo.addWorktree({ projectId: 'p-1', worktreeId: 'parent', path: '/parent', branch: 'companion/parent', threadId: 'parent-thread', parentWorktreeId: null, writerRunId: null, createdAt });
    await repo.addWorktree({ projectId: 'p-1', worktreeId: 'child', path: '/child', branch: 'companion/child', threadId: 'child-thread', parentWorktreeId: 'parent', writerRunId: null, createdAt });
    expect((await repo.listWorktrees()).find((item) => item.worktreeId === 'child')?.parentWorktreeId).toBe('parent');
    await expect(repo.addWorktree({ projectId: 'p-1', worktreeId: 'nested', path: '/nested', branch: 'companion/nested', threadId: 'nested-thread', parentWorktreeId: 'child', writerRunId: null, createdAt })).rejects.toThrow('top-level parent');
  });

  it('stores structured design annotations with their worktree and target thread', async () => {
    const repo = await repository();
    await repo.addWorktree({ projectId: 'p-1', worktreeId: 'wt-1', path: '/repo-wt', branch: 'thread/one', threadId: 't-1', writerRunId: null, createdAt: new Date().toISOString() });
    const annotation = await repo.addAnnotation({
      route: '/settings', selectedElement: { selector: 'button[data-save]', label: 'Save', attributes: { 'data-save': '' } },
      note: 'Align this control with the header.', sourceWorktreeId: 'wt-1', targetThreadId: 't-1'
    });
    expect(annotation.id).toMatch(/[0-9a-f-]{36}/);
    expect(await repo.listAnnotations('wt-1')).toEqual([expect.objectContaining({ route: '/settings', targetThreadId: 't-1', taskStatus: 'queued', runId: null })]);
    const runId = crypto.randomUUID();
    await repo.updateAnnotationTask(annotation.id, { taskStatus: 'running', runId, lastEventSequence: 3 });
    expect(await repo.getAnnotationForRun(runId)).toEqual(expect.objectContaining({ id: annotation.id, taskStatus: 'running', lastEventSequence: 3 }));
    await repo.updateAnnotationTask(annotation.id, { taskStatus: 'completed', lastEventSequence: 5 });
    expect(await repo.getAnnotation(annotation.id)).toEqual(expect.objectContaining({ taskStatus: 'completed', finishedAt: expect.any(String), lastEventSequence: 5 }));
  });

  it('migrates legacy annotation records without resetting companion state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-companion-')); paths.push(directory); const file = join(directory, 'state.json');
    const annotationId = crypto.randomUUID();
    await writeFile(file, JSON.stringify({ version: 1, activeConnectionId: null, connections: [], projects: [], worktrees: [], runs: [], previews: [], audit: [], annotations: [{ id: annotationId, worktreeId: 'wt-old', threadId: 'thread-old', route: '/', selector: '#hero', note: 'Legacy', screenshot: null, createdAt: new Date().toISOString() }] }));
    const repo = new CompanionRepository(file);
    expect(await repo.listAnnotations('wt-old')).toEqual([expect.objectContaining({ id: annotationId, sourceWorktreeId: 'wt-old', selectedElement: { selector: '#hero', attributes: {} }, taskStatus: 'queued', runId: null })]);
  });
});
