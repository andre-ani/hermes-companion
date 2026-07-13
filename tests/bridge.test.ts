import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeStore } from '../apps/bridge/src/bridge-store';
import { DefaultCompanionBridge } from '../apps/bridge/src/bridge';

const exec = promisify(execFile);
const paths: string[] = [];
const originalPath = process.env.PATH;
afterEach(async () => { process.env.PATH = originalPath; await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hermes-bridge-')); paths.push(root); process.env.BRIDGE_ALLOWED_ROOTS = root;
  const repo = join(root, 'repo'); await mkdir(repo); await exec('git', ['init', '-b', 'main'], { cwd: repo });
  await exec('git', ['config', 'user.email', 'bridge@test.invalid'], { cwd: repo }); await exec('git', ['config', 'user.name', 'Bridge Test'], { cwd: repo });
  await writeFile(join(repo, 'README.md'), '# Test\n'); await exec('git', ['add', 'README.md'], { cwd: repo }); await exec('git', ['commit', '-m', 'initial'], { cwd: repo });
  process.env.BRIDGE_WORKTREE_ROOT = join(root, 'worktrees');
  return { root, repo, bridge: new DefaultCompanionBridge(new BridgeStore(join(root, 'state.json'))) };
}

describe('companion bridge', () => {
  it('creates and lists isolated Git worktrees through a typed envelope', async () => {
    const { repo, bridge } = await fixture();
    const requestId = crypto.randomUUID();
    const worktree = await bridge.handle({ version: 'v1', requestId, capability: 'worktrees', payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: 'thread-1', branch: 'companion/thread-1', base: 'HEAD' } }) as { worktreeId: string; path: string };
    expect(worktree.path).toContain('worktrees');
    const listed = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.list', projectId: 'p-1' } }) as Array<{ worktreeId: string }>;
    expect(listed.map((item) => item.worktreeId)).toContain(worktree.worktreeId);
  });

  it('attaches an existing Git worktree to one Hermes session idempotently', async () => {
    const { root, repo, bridge } = await fixture();
    const existing = join(root, 'existing-worktree');
    await exec('git', ['worktree', 'add', '-b', 'feature/existing', existing, 'HEAD'], { cwd: repo });
    const payload = { action: 'worktree.attach', connectionId: 'railway', profileId: 'code', projectId: 'p-1', repositoryPath: repo, worktreePath: existing, threadId: 'session-existing', branch: 'feature/existing' } as const;
    const first = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload }) as { worktreeId: string; path: string };
    const second = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload }) as { worktreeId: string; path: string };
    expect(second).toEqual(first);
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { ...payload, threadId: 'another-session' } })).rejects.toThrow('another Hermes session');
    await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.detach', worktreeId: first.worktreeId } });
    const listed = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.list', connectionId: 'railway', profileId: 'code', projectId: 'p-1' } }) as Array<{ worktreeId: string }>;
    expect(listed).toEqual([]);
  });

  it('rejects attaching an arbitrary directory that Git has not registered as a worktree', async () => {
    const { root, repo, bridge } = await fixture();
    const arbitrary = join(root, 'arbitrary'); await mkdir(arbitrary);
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.attach', projectId: 'p-1', repositoryPath: repo, worktreePath: arbitrary, threadId: 'session-arbitrary', branch: 'feature/arbitrary' } })).rejects.toThrow('not a registered worktree');
  });

  it('coordinates child writers and merges a clean child through its parent review flow', async () => {
    const { repo, bridge } = await fixture();
    const parent = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: 'parent-thread', branch: 'companion/parent', base: 'HEAD', parentWorktreeId: null } }) as { worktreeId: string; path: string; branch: string };
    const child = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: 'child-thread', branch: 'companion/child', base: parent.branch, parentWorktreeId: parent.worktreeId } }) as { worktreeId: string; path: string };
    const runId = crypto.randomUUID();
    await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.writer.acquire', worktreeId: child.worktreeId, runId } });
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.merge', parentWorktreeId: parent.worktreeId, childWorktreeId: child.worktreeId, message: 'Merge child' } })).rejects.toThrow('active writer');
    await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.writer.release', worktreeId: child.worktreeId, runId } });
    await writeFile(join(child.path, 'child.txt'), 'child work\n'); await exec('git', ['add', 'child.txt'], { cwd: child.path }); await exec('git', ['commit', '-m', 'child work'], { cwd: child.path });
    const merged = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.merge', parentWorktreeId: parent.worktreeId, childWorktreeId: child.worktreeId, message: 'Merge child' } }) as { alreadyMerged: boolean };
    expect(merged.alreadyMerged).toBe(false); expect(await readFile(join(parent.path, 'child.txt'), 'utf8')).toBe('child work\n');
  });

  it('inspects a repository through the project capability before binding it', async () => {
    const { repo, bridge } = await fixture();
    const inspected = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'projects', payload: { action: 'project.inspect', repositoryPath: repo } }) as { name: string; repositoryPath: string; defaultBranch: string };
    expect(inspected.repositoryPath).toBe(await realpath(repo));
    expect(inspected.name).toBe('repo');
    expect(inspected.defaultBranch).toBe('main');
  });

  it('can initialize a newly selected project folder through the same project capability', async () => {
    const { root, bridge } = await fixture();
    const project = join(root, 'new-project'); await mkdir(project);
    const inspected = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'projects', payload: { action: 'project.inspect', repositoryPath: project, initialize: true } }) as { repositoryPath: string; defaultBranch: string };
    expect(inspected.repositoryPath).toBe(await realpath(project));
    expect(inspected.defaultBranch).toBe('main');
    await expect(exec('git', ['rev-parse', '--is-inside-work-tree'], { cwd: project })).resolves.toMatchObject({ stdout: 'true\n' });
  });

  it('returns the active worktree commit metadata through the Git capability', async () => {
    const { repo, bridge } = await fixture();
    const worktree = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: 'thread-metadata', branch: 'companion/metadata', base: 'HEAD' } }) as { worktreeId: string };
    const metadata = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.commit.metadata', worktreeId: worktree.worktreeId } }) as { subject: string; body: string };
    expect(metadata).toEqual({ subject: 'initial', body: '' });
  });

  it('discovers authenticated GitHub PR metadata through the bridge Git capability', async () => {
    const { root, repo, bridge } = await fixture();
    const bin = join(root, 'bin'); await mkdir(bin);
    await writeFile(join(bin, 'gh'), '#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then exit 0; fi\nif [ "$1" = "pr" ] && [ "$2" = "view" ]; then echo "{\\"number\\":42,\\"title\\":\\"Bridge PR\\",\\"url\\":\\"https://github.example.test/bridge/pr/42\\",\\"state\\":\\"OPEN\\",\\"isDraft\\":true,\\"reviewDecision\\":null}"; exit 0; fi\nexit 1\n');
    await chmod(join(bin, 'gh'), 0o755); process.env.PATH = `${bin}:${originalPath}`;
    const worktree = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: 'thread-pr', branch: 'companion/pr', base: 'HEAD' } }) as { worktreeId: string };
    const status = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.github.status', worktreeId: worktree.worktreeId } }) as { authenticated: boolean };
    const pullRequest = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.pr.view', worktreeId: worktree.worktreeId } }) as { number: number; title: string; isDraft: boolean };
    expect(status.authenticated).toBe(true); expect(pullRequest).toMatchObject({ number: 42, title: 'Bridge PR', isDraft: true });
    await writeFile(join(bin, 'gh'), '#!/bin/sh\nif [ "$1" = "--version" ] || { [ "$1" = "auth" ] && [ "$2" = "status" ]; }; then exit 0; fi\necho "no pull requests found for branch" >&2\nexit 1\n');
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'git', payload: { action: 'git.pr.view', worktreeId: worktree.worktreeId } })).resolves.toBeNull();
  });

  it('authorizes only host-local preview origins by default', async () => {
    const { repo, bridge } = await fixture();
    const worktree = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: 'thread-1', branch: 'companion/preview', base: 'HEAD' } }) as { worktreeId: string };
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'preview', payload: { action: 'preview.start', worktreeId: worktree.worktreeId, origin: 'https://example.com', designModeAllowed: true, ttlSeconds: 300 } })).rejects.toThrow('host-local');
    const lease = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'preview', payload: { action: 'preview.start', worktreeId: worktree.worktreeId, origin: 'http://127.0.0.1:5173', designModeAllowed: true, ttlSeconds: 300 } }) as { id: string };
    expect(lease.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('lists, edits, and searches files only inside the registered worktree', async () => {
    const { root, repo, bridge } = await fixture();
    const worktree = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: 'thread-files', branch: 'companion/files', base: 'HEAD' } }) as { worktreeId: string; path: string };
    const files = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.list', worktreeId: worktree.worktreeId, path: '' } }) as Array<{ name: string }>;
    expect(files.map((item) => item.name)).toContain('README.md');
    const file = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.read', worktreeId: worktree.worktreeId, path: 'README.md' } }) as { content: string };
    expect(file.content).toBe('# Test\n');
    await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.write', worktreeId: worktree.worktreeId, path: 'README.md', content: '# Test\nSearchable companion text.\n' } });
    const edited = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.read', worktreeId: worktree.worktreeId, path: 'README.md' } }) as { content: string };
    expect(edited.content).toContain('Searchable companion text.');
    const matches = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.search', worktreeId: worktree.worktreeId, query: 'Searchable companion', limit: 20 } }) as Array<{ path: string; line: number }>;
    expect(matches).toContainEqual(expect.objectContaining({ path: 'README.md', line: 2 }));
    await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.create', worktreeId: worktree.worktreeId, path: 'notes', kind: 'directory' } });
    await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.create', worktreeId: worktree.worktreeId, path: 'notes/todo.txt', kind: 'file' } });
    await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.move', worktreeId: worktree.worktreeId, from: 'notes/todo.txt', to: 'notes/done.txt' } });
    expect(await readFile(join(worktree.path, 'notes/done.txt'), 'utf8')).toBe('');
    await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.delete', worktreeId: worktree.worktreeId, path: 'notes', recursive: true } });
    await expect(readFile(join(worktree.path, 'notes/done.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(join(worktree.path, 'pixel.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const preview = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.preview', worktreeId: worktree.worktreeId, path: 'pixel.png' } }) as { mime: string; dataUrl: string };
    expect(preview.mime).toBe('image/png'); expect(preview.dataUrl).toMatch(/^data:image\/png;base64,/);
    await writeFile(join(worktree.path, 'fake.png'), 'not an image');
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.preview', worktreeId: worktree.worktreeId, path: 'fake.png' } })).rejects.toThrow('does not match');
    await writeFile(join(root, 'outside.txt'), 'private');
    await symlink(join(root, 'outside.txt'), join(worktree.path, 'escape.txt'));
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.read', worktreeId: worktree.worktreeId, path: 'escape.txt' } })).rejects.toThrow('escaped');
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.write', worktreeId: worktree.worktreeId, path: 'escape.txt', content: 'leak' } })).rejects.toThrow('escaped');
    const outsideDirectory = join(root, 'outside'); await mkdir(outsideDirectory); await symlink(outsideDirectory, join(worktree.path, 'escape-dir'));
    await expect(bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'files', payload: { action: 'file.create', worktreeId: worktree.worktreeId, path: 'escape-dir/leak.txt', kind: 'file' } })).rejects.toThrow('escaped');
  });

  it('persists validated annotations against the bridge worktree id', async () => {
    const { repo, bridge } = await fixture();
    const worktree = await bridge.handle({ version: 'v1', requestId: crypto.randomUUID(), capability: 'worktrees', payload: { action: 'worktree.create', projectId: 'p-1', repositoryPath: repo, threadId: 'thread-design', branch: 'companion/design', base: 'HEAD' } }) as { worktreeId: string };
    const annotation = await bridge.handle({
      version: 'v1', requestId: crypto.randomUUID(), capability: 'annotations', payload: { action: 'annotation.create', payload: {
        route: '/', selectedElement: { selector: '#hero', attributes: {} }, note: 'Reduce the top spacing.',
        sourceWorktreeId: worktree.worktreeId, targetThreadId: 'thread-design'
      } }
    }) as { id: string };
    expect(annotation.id).toMatch(/[0-9a-f-]{36}/);
  });
});
