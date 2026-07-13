import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const desktop = new URL('../apps/desktop/src/', import.meta.url);
const source = (path: string) => readFile(new URL(path, desktop), 'utf8');

describe('Hermes chat streaming architecture', () => {
  it('uses one Hermes-owned turn controller with cumulative progress and explicit cancellation', async () => {
    const [remote, runs, page] = await Promise.all([
      source('lib/client/remote/sessions.remote.ts'),
      source('lib/server/hermes-chat-runs.ts'),
      source('routes/+page.svelte')
    ]);
    expect(remote).toContain('command(ChatTurnControl');
    expect(remote).toContain("input.operation === 'next'");
    expect(remote).toContain("input.operation === 'cancel'");
    expect(remote).toContain("input.operation === 'approve'");
    expect(remote).not.toContain('generateText');
    expect(runs).toContain('HermesRpcSocket');
    expect(runs).toContain("socket.request('prompt.submit'");
    expect(runs).toContain("socket.request('session.interrupt'");
    expect(runs).toContain('cancellationRequested');
    expect(runs).toContain("event.type === 'tool.start'");
    expect(runs).toContain("event.type === 'tool.complete'");
    expect(runs).not.toContain('streamText');
    expect(page).toContain("while (snapshot.status === 'streaming')");
    expect(page).toContain("operation: 'cancel'");
    expect(page).toContain("operation: 'approve'");
    expect(page).toContain('Hermes approval required');
    expect(page).toContain('data-generation-status');
  });

  it('restores prompt checkpoints through the same streamed Hermes turn path', async () => {
    const [contracts, runs, remote, page] = await Promise.all([
      readFile(new URL('../packages/contracts/src/index.ts', import.meta.url), 'utf8'),
      source('lib/server/hermes-chat-runs.ts'),
      source('lib/client/remote/sessions.remote.ts'),
      source('routes/+page.svelte')
    ]);
    expect(contracts).toContain('truncateBeforeUserOrdinal');
    expect(runs).toContain('truncate_before_user_ordinal');
    expect(remote).toContain("'hermes.session.checkpoint.restored'");
    expect(page).toContain('RestoreCheckpointDialog');
    expect(page).toContain('requestCheckpointRestore(messageIndex)');
    expect(page).toContain('await submit(target.text, target)');
  });

  it('keeps New chat as a local draft until the first streamed Hermes turn', async () => {
    const page = await source('routes/+page.svelte');
    const draftStart = page.indexOf('function newSession(');
    const draftEnd = page.indexOf('async function startProjectThread', draftStart);
    const draft = page.slice(draftStart, draftEnd);
    expect(draft).toContain('beginVisibleView(null');
    expect(draft).toContain('crypto.randomUUID()');
    expect(draft).toContain('messages = []');
    expect(draft).not.toContain('createSession(');
    expect(page).not.toContain("import { createSession,");
    expect(page).toContain("activeComposerModel?.id === 'default' || activeComposerModel?.policyStatus === 'restricted' ? null");
    expect(page).toContain('model: activeComposerModelOverride?.id');
    expect(page).toContain('modelProvider: activeComposerModelOverride?.runtimeProvider');
    expect(await source('lib/server/hermes-chat-runs.ts')).toContain('transportSessionId');
    expect(await source('lib/server/hermes-chat-runs.ts')).toContain('stored_session_id');
  });

  it('stages composer attachments through the live Hermes session before prompt submission', async () => {
    const [contracts, page, remote, runs] = await Promise.all([
      readFile(new URL('../packages/contracts/src/index.ts', import.meta.url), 'utf8'),
      source('routes/+page.svelte'),
      source('lib/client/remote/sessions.remote.ts'),
      source('lib/server/hermes-chat-runs.ts')
    ]);
    expect(contracts).toContain('export const ChatAttachmentInput');
    expect(contracts).toContain('attachments: z.array(ChatAttachmentInput).max(8).default([])');
    expect(page).toContain('const attachments: ChatAttachmentInput[] = (detail.files ?? []).map');
    expect(page).toContain('message: text, attachments');
    expect(remote).toContain('attachments: input.attachments');
    expect(runs).toContain("socket.request('image.attach_bytes'");
    expect(runs).toContain("socket.request('pdf.attach'");
    expect(runs).toContain("socket.request<{ ref_text?: string }>('file.attach'");
    expect(runs.indexOf("socket.request<{ ref_text?: string }>('file.attach'")).toBeLessThan(runs.indexOf("socket.request('prompt.submit'"));
    expect(runs).toContain("contextRefs.join('\\n')");
    expect(page).not.toContain('voiceAvailable voiceActive');
    expect(page).not.toContain('toggleComposerVoice');
  });

  it('removes deleted sessions immediately and refreshes the Hermes overview', async () => {
    const [page, dialog] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/components/companion/session-actions-dialog.svelte')
    ]);
    expect(dialog).toContain('ondeleted?.(session.id)');
    expect(page).toContain('sessions: overview.sessions.filter((session) => session.id !== sessionId)');
    expect(page).toContain('pinnedSessionIds: overview.pinnedSessionIds.filter((id) => id !== sessionId)');
    expect(page).toContain('await loadWorkspace(true)');
    expect(page).toContain('ondeleted={(sessionId) => void handleSessionDeleted(sessionId)}');
  });

  it('creates project-scoped Hermes sessions in the selected Hermes workspace', async () => {
    const [contracts, page, remote, runs] = await Promise.all([
      readFile(new URL('../packages/contracts/src/index.ts', import.meta.url), 'utf8'),
      source('routes/+page.svelte'),
      source('lib/client/remote/sessions.remote.ts'),
      source('lib/server/hermes-chat-runs.ts')
    ]);
    expect(contracts).toContain('cwd: z.string().trim().min(1).max(4_096).optional()');
    expect(page).toContain('cwd: originalSessionId ? undefined : draftWorktree?.path ?? activeWorktree?.path ?? activeProject?.repositoryPath');
    expect(remote).toContain('cwd: input.cwd');
    expect(runs).toContain('...(input.cwd ? { cwd: input.cwd } : {})');
    expect(runs).not.toContain('pendingWorktree');
  });

  it('uses Hermes as the source of truth for connected project lists and creation', async () => {
    const [overview, projects, registry] = await Promise.all([
      source('lib/client/remote/gateway.remote.ts'),
      source('lib/client/remote/projects.remote.ts'),
      source('lib/server/capability-registry.ts')
    ]);
    expect(overview).toContain('listHermesProjects(effectiveConnection)');
    expect(overview).toContain('getHermesProjectTree(effectiveConnection)');
    expect(projects).toContain('createHermesProject(connection');
    expect(projects).toContain('getHermesProjectSessions(connection, projectId)');
    expect(projects).toContain('deleteHermesProject(connection, projectId)');
    expect(projects).toContain('renameHermesProject(connection, projectId, name)');
    expect(projects).toContain('setHermesProjectArchived(connection, projectId, archived)');
    expect(projects).toContain("recordAudit('hermes.project.created'");
    expect(registry).not.toContain("new Set(['projects'");
    expect(registry).toContain('projects: status.enhanced.sessions && Boolean(status.connection.serveUrl || status.connection.serveWsUrl)');
  });

  it('exposes real project row actions without inventing local-only state', async () => {
    const [navigation, dialog, page] = await Promise.all([
      source('lib/components/companion/session-navigation.svelte'),
      source('lib/components/companion/project-actions-dialog.svelte'),
      source('routes/+page.svelte')
    ]);
    expect(navigation).toContain('class="project-context-menu"');
    expect(navigation).toContain("group.project.archived ? 'Restore' : 'Archive'");
    expect(dialog).toContain('Its sessions are preserved.');
    expect(dialog).toContain('Delete project');
    expect(page).toContain('handleProjectDeleted(projectId)');
    expect(page).toContain('onprojectexpand={(id) => void hydrateProject(id)}');
    expect(navigation).toContain('hydratedProjects[group.project.id].repos');
  });

  it('uses the authenticated Hermes Git contract for linked worktree lifecycle', async () => {
    const [remote, navigation, createDialog, removeDialog, page] = await Promise.all([
      source('lib/client/remote/projects.remote.ts'),
      source('lib/components/companion/session-navigation.svelte'),
      source('lib/components/companion/worktree-dialog.svelte'),
      source('lib/components/companion/worktree-remove-dialog.svelte'),
      source('routes/+page.svelte')
    ]);
    expect(remote).toContain('async function resolveHermesRepository');
    expect(remote).toContain('The selected repository does not belong to this Hermes project.');
    expect(remote).toContain("'/api/git/worktree/add'");
    expect(remote).toContain("'/api/git/worktree/remove'");
    expect(remote).toContain('Only a linked worktree in this Hermes project can be removed.');
    expect(remote).toContain("recordAudit('hermes.worktree.created'");
    expect(remote).toContain('export const bindHermesProjectWorktree');
    expect(remote).toContain("action: 'worktree.attach'");
    expect(remote).toContain("recordAudit('hermes.worktree.removed'");
    expect(navigation).toContain('New worktree…');
    expect(navigation).toContain('Remove worktree…');
    expect(createDialog).toContain('createHermesProjectWorktree');
    expect(removeDialog).toContain('removeHermesProjectWorktree');
    expect(page).toContain('draftWorktree?.path ?? activeWorktree?.path ?? activeProject?.repositoryPath');
    expect(page).toContain('bindHermesProjectWorktree');
    expect(page).toContain('project={activeComposerProjectContext}');
  });

  it('keeps dock worktree identity root-owned', async () => {
    const [page, dock] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/components/companion/workspace-dock.svelte')
    ]);

    expect(page.includes('<WorkspaceDock worktree={activeWorktree}')).toBe(true);
    expect(page.includes('<WorkspaceDock worktrees=')).toBe(false);
    expect(dock.includes('activeThreadId')).toBe(false);
    expect(dock.includes('worktrees.find((item) => item.threadId')).toBe(false);
  });

  it('merges a successful worktree bind before background overview refresh', async () => {
    const page = await source('routes/+page.svelte');

    const binding = /const\s+(\w+)\s*=\s*await bindCreatedWorktree\(/.exec(page);
    expect(binding).not.toBeNull();
    const boundWorktree = binding?.[1] ?? 'boundWorktree';
    const bindingStart = binding?.index ?? -1;
    const refreshStart = page.indexOf('await refreshWorkspaceOverview()', bindingStart);
    const overviewMergeStart = page.indexOf('overview =', bindingStart);

    expect(refreshStart).toBeGreaterThan(bindingStart);
    expect(overviewMergeStart).toBeGreaterThan(bindingStart);
    expect(overviewMergeStart).toBeLessThan(refreshStart);
    const immediateMerge = page.slice(overviewMergeStart, refreshStart);
    expect(immediateMerge).toContain('worktrees:');
    expect(immediateMerge).toContain(boundWorktree);
    expect(page).toContain('for (let attempt = 0; attempt < 3; attempt += 1)');
    expect(page).toContain("errorMessage(lastFailure, 'The Hermes session could not be bound to its worktree.')");
  });
});
