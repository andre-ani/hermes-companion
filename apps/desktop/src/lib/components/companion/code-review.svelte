<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import * as Select from '$lib/components/ui/select';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import {
    commitWorktree,
    createWorktreePullRequest,
    getHermesGitReview,
    getHermesGitReviewDiff,
    getWorktreeCommitMetadata,
    getWorktreeGitHubStatus,
    getWorktreePullRequest,
    getWorktreeRemoteStatus,
    pushWorktree,
    revertWorktree,
    stageWorktree,
    unstageWorktree
  } from '$lib/client/remote/projects.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { parseUnifiedDiff } from '$lib/diff-parser';
  import { CircleAlert, GitCommitHorizontal, GitPullRequest, RefreshCw, RotateCcw, Upload } from '@lucide/svelte';
  import type { GitCommitMetadata, GitHubForgeStatus, GitHubPullRequest, GitRemoteStatus, HermesGitWorkspace, HermesRepoStatus, HermesReviewFile, HermesReviewScope, WorktreeRecord } from '@hermes-companion/contracts';

  let { workspace, worktree }: { workspace: HermesGitWorkspace | null; worktree: WorktreeRecord | null } = $props();
  let status = $state<HermesRepoStatus | null>(null);
  let files = $state<HermesReviewFile[]>([]);
  let remoteStatus = $state<GitRemoteStatus>({ remote: 'origin', configured: false, upstream: null, canPush: false, reason: 'Remote status is unavailable.' });
  let forgeStatus = $state<GitHubForgeStatus>({ installed: false, authenticated: false, message: 'GitHub CLI status is unavailable.' });
  let pullRequest = $state<GitHubPullRequest | null>(null);
  let commitMetadata = $state<GitCommitMetadata>({ subject: '', body: '' });
  let reviewTab = $state<'unstaged' | 'staged' | 'commit'>('unstaged');
  let reviewScope = $state<HermesReviewScope>('uncommitted');
  let selectedPath = $state<string | null>(null);
  let diff = $state('');
  let loading = $state(false);
  let diffLoading = $state(false);
  let pendingAction = $state('');
  let error = $state('');
  let notice = $state('');
  let commitMessage = $state('');
  let revertOpen = $state(false);
  let revertTarget = $state<{ worktreeId: string; path: string; ownerKey: string } | null>(null);
  let pullRequestOpen = $state(false);
  let pullRequestTitle = $state('');
  let pullRequestBody = $state('');
  let pullRequestBase = $state('');
  let loadedReviewKey = $state('');
  let reviewRequestGeneration = 0;
  let diffRequestGeneration = 0;

  const workspaceKey = $derived(workspace && worktree ? `${workspace.projectId}:${workspace.path}:${worktree.worktreeId}` : '');
  const reviewKey = $derived(`${workspaceKey}:${reviewScope}`);
  const statusByPath = $derived(new Map((status?.files ?? []).map((file) => [file.path, file])));
  const visibleFiles = $derived(reviewScope === 'branch' ? files : files.filter((file) => reviewTab === 'staged'
    ? Boolean(statusByPath.get(file.path)?.staged)
    : Boolean(statusByPath.get(file.path)?.unstaged)));
  const selectedFile = $derived(visibleFiles.find((file) => file.path === selectedPath) ?? visibleFiles[0] ?? null);
  const parsedDiff = $derived(parseUnifiedDiff(diff));
  const selectedDiff = $derived(parsedDiff.find((file) => file.path === selectedFile?.path) ?? parsedDiff[0] ?? null);
  const commitDisabledReason = $derived(!worktree
    ? 'Select a worktree before committing.'
    : status?.conflicted
      ? 'Resolve conflicts before committing.'
      : !status?.staged
        ? 'Stage at least one change before committing.'
        : null);
  const pushDisabledReason = $derived(!worktree
    ? 'Select a worktree before pushing.'
    : status?.conflicted
      ? 'Resolve conflicts before pushing.'
      : !remoteStatus.canPush
        ? remoteStatus.reason ?? 'This branch has no usable Git remote.'
        : remoteStatus.upstream && !(status?.ahead ?? 0)
          ? 'This branch is already up to date.'
          : null);
  const pullRequestDisabledReason = $derived(!worktree
    ? 'Select a worktree before creating a pull request.'
    : pullRequest
      ? 'A pull request already exists for this branch.'
      : !remoteStatus.configured
        ? remoteStatus.reason ?? 'Configure a Git remote first.'
        : !remoteStatus.upstream
          ? 'Push this branch before creating a pull request.'
          : (status?.ahead ?? 0) > 0
            ? 'Push the latest commits before creating a pull request.'
            : !forgeStatus.authenticated
              ? forgeStatus.message
              : null);

  $effect(() => {
    if (reviewKey === loadedReviewKey) return;
    loadedReviewKey = reviewKey;
    reviewRequestGeneration += 1;
    diffRequestGeneration += 1;
    loading = false; diffLoading = false;
    status = null; files = []; selectedPath = null; diff = ''; error = ''; notice = ''; commitMessage = '';
    remoteStatus = { remote: 'origin', configured: false, upstream: null, canPush: false, reason: 'Remote status is unavailable.' };
    forgeStatus = { installed: false, authenticated: false, message: 'GitHub CLI status is unavailable.' };
    pullRequest = null; commitMetadata = { subject: '', body: '' }; pendingAction = ''; revertOpen = false; revertTarget = null; pullRequestOpen = false;
    if (workspace && worktree) void refresh();
  });

  $effect(() => {
    reviewTab;
    if (!workspace || reviewScope === 'branch' || reviewTab === 'commit') return;
    selectedPath = visibleFiles[0]?.path ?? null;
    void loadDiff();
  });

  async function refresh() {
    const requestWorkspace = workspace;
    const requestScope = reviewScope;
    const requestKey = reviewKey;
    const requestWorktree = worktree;
    if (!requestWorkspace || !requestWorktree) return;
    const requestGeneration = ++reviewRequestGeneration;
    loading = true; error = '';
    try {
      const reviewQuery = getHermesGitReview({ ...requestWorkspace, scope: requestScope });
      const remoteQuery = getWorktreeRemoteStatus({ worktreeId: requestWorktree.worktreeId, remote: 'origin' });
      const forgeQuery = getWorktreeGitHubStatus({ worktreeId: requestWorktree.worktreeId });
      const pullRequestQuery = getWorktreePullRequest({ worktreeId: requestWorktree.worktreeId });
      const metadataQuery = getWorktreeCommitMetadata({ worktreeId: requestWorktree.worktreeId });
      const remotePromise = (async () => {
        try { await remoteQuery.refresh(); return await resolveRemoteResult(remoteQuery); }
        catch (cause) { return { remote: 'origin', configured: false, upstream: null, canPush: false, reason: cause instanceof Error ? cause.message : 'Remote status is unavailable.' } satisfies GitRemoteStatus; }
      })();
      const forgePromise = (async () => {
        try { await forgeQuery.refresh(); return await resolveRemoteResult(forgeQuery); }
        catch (cause) { return { installed: false, authenticated: false, message: cause instanceof Error ? cause.message : 'GitHub CLI status is unavailable.' } satisfies GitHubForgeStatus; }
      })();
      const pullRequestPromise = (async () => {
        try { await pullRequestQuery.refresh(); return await resolveRemoteResult(pullRequestQuery); }
        catch { return null; }
      })();
      const metadataPromise = (async () => {
        try { await metadataQuery.refresh(); return await resolveRemoteResult(metadataQuery); }
        catch { return { subject: '', body: '' } satisfies GitCommitMetadata; }
      })();
      await reviewQuery.refresh();
      const [result, nextRemoteStatus, nextForgeStatus, nextPullRequest, nextCommitMetadata] = await Promise.all([
        resolveRemoteResult(reviewQuery), remotePromise, forgePromise, pullRequestPromise, metadataPromise
      ]);
      if (requestGeneration !== reviewRequestGeneration || requestKey !== reviewKey) return;
      status = result.status;
      files = result.review.files;
      remoteStatus = nextRemoteStatus;
      forgeStatus = nextForgeStatus;
      pullRequest = nextPullRequest;
      commitMetadata = nextCommitMetadata;
      if (!visibleFiles.some((file) => file.path === selectedPath)) selectedPath = visibleFiles[0]?.path ?? null;
      await loadDiff();
    } catch (cause) {
      if (requestGeneration !== reviewRequestGeneration || requestKey !== reviewKey) return;
      status = null; files = []; diff = '';
      error = cause instanceof Error ? cause.message : 'Hermes Git review is unavailable for this checkout.';
    } finally {
      if (requestGeneration === reviewRequestGeneration) loading = false;
    }
  }

  async function loadDiff(path = selectedPath) {
    const requestWorkspace = workspace;
    const requestScope = reviewScope;
    const requestTab = reviewTab;
    if (!requestWorkspace || !path || (requestScope === 'uncommitted' && requestTab === 'commit')) {
      diffRequestGeneration += 1; diffLoading = false; diff = ''; return;
    }
    const requestKey = `${requestWorkspace.projectId}:${requestWorkspace.path}:${requestScope}:${requestTab}:${path}`;
    const requestGeneration = ++diffRequestGeneration;
    diffLoading = true; error = '';
    try {
      const diffQuery = getHermesGitReviewDiff({ ...requestWorkspace, scope: requestScope, file: path, staged: requestScope === 'uncommitted' && requestTab === 'staged' });
      await diffQuery.refresh();
      const result = await resolveRemoteResult(diffQuery);
      const currentKey = workspace ? `${workspace.projectId}:${workspace.path}:${reviewScope}:${reviewTab}:${path}` : '';
      if (requestGeneration === diffRequestGeneration && requestKey === currentKey && path === selectedPath) diff = result.diff;
    } catch (cause) {
      const currentKey = workspace ? `${workspace.projectId}:${workspace.path}:${reviewScope}:${reviewTab}:${path}` : '';
      if (requestGeneration === diffRequestGeneration && requestKey === currentKey && path === selectedPath) {
        diff = '';
        error = cause instanceof Error ? cause.message : 'The selected diff could not be loaded.';
      }
    } finally {
      if (requestGeneration === diffRequestGeneration) diffLoading = false;
    }
  }

  async function selectFile(file: HermesReviewFile) {
    selectedPath = file.path;
    await loadDiff(file.path);
  }

  async function mutate(action: 'stage' | 'unstage', file: string | null) {
    if (!workspace || !worktree || pendingAction) return;
    const ownerKey = workspaceKey;
    const worktreeId = worktree.worktreeId;
    const paths = [file ?? '.'];
    pendingAction = action; error = ''; notice = '';
    try {
      if (action === 'stage') await resolveRemoteResult(stageWorktree({ worktreeId, paths }));
      else await resolveRemoteResult(unstageWorktree({ worktreeId, paths }));
      if (ownerKey !== workspaceKey) return;
      notice = file ? `${file} ${action === 'stage' ? 'staged' : 'unstaged'}.` : `All changes ${action === 'stage' ? 'staged' : 'unstaged'}.`;
      await refresh();
    } catch (cause) { if (ownerKey === workspaceKey) error = cause instanceof Error ? cause.message : `Changes could not be ${action}d.`; }
    finally { if (ownerKey === workspaceKey) pendingAction = ''; }
  }

  function openRevert(file: HermesReviewFile) {
    if (!worktree) return;
    revertTarget = { worktreeId: worktree.worktreeId, path: file.path, ownerKey: workspaceKey };
    revertOpen = true;
  }

  async function revertSelected() {
    const target = revertTarget;
    if (!workspace || !target || target.ownerKey !== workspaceKey || pendingAction) return;
    pendingAction = 'revert'; error = ''; notice = '';
    try {
      await resolveRemoteResult(revertWorktree({ worktreeId: target.worktreeId, paths: [target.path] }));
      if (target.ownerKey !== workspaceKey) return;
      notice = `${target.path} reverted.`; revertOpen = false; revertTarget = null; await refresh();
    } catch (cause) { if (target.ownerKey === workspaceKey) error = cause instanceof Error ? cause.message : 'The selected change could not be reverted.'; }
    finally { if (target.ownerKey === workspaceKey) pendingAction = ''; }
  }

  async function commit() {
    if (!workspace || !worktree || commitDisabledReason || !commitMessage.trim() || pendingAction) return;
    const ownerKey = workspaceKey;
    const worktreeId = worktree.worktreeId;
    pendingAction = 'commit'; error = ''; notice = '';
    try {
      const result = await resolveRemoteResult(commitWorktree({ worktreeId, message: commitMessage, amend: false }));
      if (ownerKey !== workspaceKey) return;
      commitMessage = ''; notice = `Committed ${result.sha.slice(0, 8)}.`; await refresh();
    } catch (cause) { if (ownerKey === workspaceKey) error = cause instanceof Error ? cause.message : 'The commit could not be created.'; }
    finally { if (ownerKey === workspaceKey) pendingAction = ''; }
  }

  async function push() {
    if (!workspace || !worktree || pushDisabledReason || pendingAction) return;
    const ownerKey = workspaceKey;
    const worktreeId = worktree.worktreeId;
    pendingAction = 'push'; error = ''; notice = '';
    try { await resolveRemoteResult(pushWorktree({ worktreeId, remote: remoteStatus.remote, forceWithLease: false })); if (ownerKey !== workspaceKey) return; notice = 'Branch pushed.'; await refresh(); }
    catch (cause) { if (ownerKey === workspaceKey) error = cause instanceof Error ? cause.message : 'The branch could not be pushed.'; }
    finally { if (ownerKey === workspaceKey) pendingAction = ''; }
  }

  function openPullRequestDialog() {
    if (pullRequestDisabledReason) return;
    pullRequestTitle = commitMetadata.subject || `Update ${workspace?.branch ?? 'branch'}`;
    pullRequestBody = commitMetadata.body;
    pullRequestBase = status?.defaultBranch || 'main';
    pullRequestOpen = true;
  }

  async function createPullRequest() {
    if (!workspace || !worktree || pullRequestDisabledReason || !pullRequestTitle.trim() || !pullRequestBase.trim() || pendingAction) return;
    const ownerKey = workspaceKey;
    const worktreeId = worktree.worktreeId;
    pendingAction = 'pr'; error = ''; notice = '';
    try {
      await resolveRemoteResult(createWorktreePullRequest({ worktreeId, title: pullRequestTitle, body: pullRequestBody, base: pullRequestBase, draft: true }));
      if (ownerKey !== workspaceKey) return;
      pullRequestOpen = false; notice = 'Draft pull request created.'; await refresh();
    } catch (cause) { if (ownerKey === workspaceKey) error = cause instanceof Error ? cause.message : 'The draft pull request could not be created.'; }
    finally { if (ownerKey === workspaceKey) pendingAction = ''; }
  }
</script>

<section class="review" aria-labelledby="review-heading">
  <header class="review-header">
    <div><span class="data-label">Changes</span><h2 id="review-heading">{workspace?.branch ?? 'Working tree'}</h2></div>
    <div class="review-summary">
      {#if status && reviewScope === 'uncommitted'}<span><b>+{status.added}</b> <i>−{status.removed}</i></span>{/if}
      {#if pullRequest}<a href={pullRequest.url} target="_blank" rel="noreferrer">{pullRequest.isDraft ? 'Draft ' : ''}PR #{pullRequest.number}</a>{/if}
      <Button size="icon-sm" variant="ghost" disabled={!workspace || loading} onclick={refresh} aria-label="Refresh Git review" title="Refresh Git review"><RefreshCw /></Button>
    </div>
  </header>

  {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Git action failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
  {#if notice}<p class="review-notice" role="status">{notice}</p>{/if}

  {#if workspace}
    <div class="review-scope">
      <Select.Root type="single" bind:value={reviewScope} onValueChange={() => { reviewTab = 'unstaged'; selectedPath = null; diff = ''; }}>
        <Select.Trigger aria-label="Review scope">{reviewScope === 'branch' ? 'Branch changes' : 'Working tree'}</Select.Trigger>
        <Select.Content><Select.Group><Select.Label>Review scope</Select.Label><Select.Item value="uncommitted" label="Working tree">Working tree</Select.Item><Select.Item value="branch" label="Branch changes">Branch changes</Select.Item></Select.Group></Select.Content>
      </Select.Root>
      {#if reviewScope === 'branch' && files.length}<span>{files.length} {files.length === 1 ? 'file' : 'files'} since merge base</span>{/if}
    </div>
    {#if reviewScope === 'branch'}
      <div class="branch-review">{@render reviewFiles()}</div>
    {:else}<Tabs.Root bind:value={reviewTab} class="review-tabs-root">
      <div class="review-tabs">
        <Tabs.List variant="line"><Tabs.Trigger value="unstaged">Changes <Badge variant="outline">{status?.unstaged ?? 0}</Badge></Tabs.Trigger><Tabs.Trigger value="staged">Staged <Badge variant="outline">{status?.staged ?? 0}</Badge></Tabs.Trigger><Tabs.Trigger value="commit">Commit</Tabs.Trigger></Tabs.List>
        {#if reviewTab !== 'commit'}<div><Button size="xs" variant="ghost" disabled={!selectedFile || !worktree || Boolean(pendingAction)} onclick={() => selectedFile && openRevert(selectedFile)}><RotateCcw data-icon="inline-start" /> Revert</Button>{#if reviewTab === 'unstaged'}<Button size="xs" variant="outline" disabled={!selectedFile || !worktree || Boolean(pendingAction)} onclick={() => mutate('stage', selectedFile?.path ?? null)}>Stage file</Button><Button size="xs" variant="outline" disabled={!visibleFiles.length || !worktree || Boolean(pendingAction)} onclick={() => mutate('stage', null)}>Stage all</Button>{:else}<Button size="xs" variant="outline" disabled={!selectedFile || !worktree || Boolean(pendingAction)} onclick={() => mutate('unstage', selectedFile?.path ?? null)}>Unstage file</Button><Button size="xs" variant="outline" disabled={!visibleFiles.length || !worktree || Boolean(pendingAction)} onclick={() => mutate('unstage', null)}>Unstage all</Button>{/if}</div>{/if}
      </div>

      <Tabs.Content value="unstaged" class="review-content">{@render reviewFiles()}</Tabs.Content>
      <Tabs.Content value="staged" class="review-content">{@render reviewFiles()}</Tabs.Content>
      <Tabs.Content value="commit" class="commit-panel">
        <form onsubmit={(event) => { event.preventDefault(); void commit(); }}>
          <Field.FieldGroup><Field.Field><Field.FieldLabel for="commit-message">Commit message</Field.FieldLabel><Textarea id="commit-message" bind:value={commitMessage} rows={4} required /><Field.FieldDescription>{commitDisabledReason ?? 'Only staged changes are included.'}</Field.FieldDescription></Field.Field></Field.FieldGroup>
          <div class="ship-actions"><Button type="submit" size="sm" title={commitDisabledReason ?? 'Commit staged changes'} disabled={!commitMessage.trim() || Boolean(commitDisabledReason) || Boolean(pendingAction)}><GitCommitHorizontal data-icon="inline-start" /> {pendingAction === 'commit' ? 'Committing…' : 'Commit'}</Button><Button type="button" size="sm" variant="outline" title={pushDisabledReason ?? 'Push this branch'} disabled={Boolean(pushDisabledReason) || Boolean(pendingAction)} onclick={push}><Upload data-icon="inline-start" /> Push</Button>{#if pullRequest}<Button type="button" size="sm" variant="outline" href={pullRequest.url} target="_blank"><GitPullRequest data-icon="inline-start" /> Open PR</Button>{:else}<Button type="button" size="sm" variant="outline" title={pullRequestDisabledReason ?? 'Create a draft pull request'} disabled={Boolean(pullRequestDisabledReason) || Boolean(pendingAction)} onclick={openPullRequestDialog}><GitPullRequest data-icon="inline-start" /> Create draft PR</Button>{/if}</div>
        </form>
      </Tabs.Content>
    </Tabs.Root>{/if}
  {:else}<div class="review-empty"><GitCommitHorizontal /><strong>No project checkout</strong><p>Select a project session to inspect its real Hermes Git state.</p></div>{/if}
</section>

{#snippet reviewFiles()}
  {#if loading}<div class="review-empty"><span>Loading changes…</span></div>
  {:else if visibleFiles.length}<div class="review-stack"><nav aria-label={reviewScope === 'branch' ? 'Branch changes' : reviewTab === 'staged' ? 'Staged files' : 'Changed files'}><ul>{#each visibleFiles as file (file.path)}<li class:expanded={selectedFile?.path === file.path}><button type="button" class:active={selectedFile?.path === file.path} aria-expanded={selectedFile?.path === file.path} onclick={() => selectFile(file)}><span class="file-state">{file.status}</span><span class="file-path">{file.path}</span><small><b>+{file.added}</b><i>−{file.removed}</i></small></button>{#if selectedFile?.path === file.path}<div class="diff-view">{#if diffLoading}<p>Loading diff…</p>{:else if selectedDiff}<ol class="diff-lines" aria-label={`Unified diff for ${selectedDiff.path}`}>{#each selectedDiff.lines as line, index (`${selectedDiff.path}-${index}`)}<li data-kind={line.kind}><span aria-hidden="true">{line.kind === 'addition' || line.kind === 'deletion' || line.kind === 'context' ? line.text.slice(0, 1) || ' ' : ' '}</span><code>{line.kind === 'addition' || line.kind === 'deletion' || line.kind === 'context' ? line.text.slice(1) || ' ' : line.text || ' '}</code></li>{/each}</ol>{:else}<p>No diff for this file.</p>{/if}</div>{/if}</li>{/each}</ul></nav></div>
  {:else}<div class="review-empty"><GitCommitHorizontal /><strong>{reviewScope === 'branch' ? 'No branch changes' : reviewTab === 'staged' ? 'Nothing staged' : 'Working tree clean'}</strong><p>{reviewScope === 'branch' ? 'Hermes reports no committed changes since this branch diverged from its merge base.' : reviewTab === 'staged' ? 'Stage a change to prepare the next commit.' : 'Hermes reports no uncommitted changes in this checkout.'}</p></div>{/if}
{/snippet}

<Dialog.Root bind:open={revertOpen}>
  <Dialog.Content class="sm:max-w-md"><Dialog.Header><Dialog.Title>Revert this file?</Dialog.Title><Dialog.Description>Discard uncommitted changes in <strong>{revertTarget?.path}</strong>. This cannot be undone.</Dialog.Description></Dialog.Header><Dialog.Footer><Button type="button" variant="ghost" onclick={() => { revertOpen = false; revertTarget = null; }}>Cancel</Button><Button type="button" variant="destructive" disabled={!revertTarget || Boolean(pendingAction)} onclick={revertSelected}>{pendingAction === 'revert' ? 'Reverting…' : 'Revert file'}</Button></Dialog.Footer></Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={pullRequestOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header><Dialog.Title>Create draft pull request</Dialog.Title><Dialog.Description>Publish a reviewable draft from {workspace?.branch ?? 'this branch'}.</Dialog.Description></Dialog.Header>
    <Field.FieldGroup>
      <Field.Field><Field.FieldLabel for="pull-request-title">Title</Field.FieldLabel><Input id="pull-request-title" bind:value={pullRequestTitle} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="pull-request-base">Base branch</Field.FieldLabel><Input id="pull-request-base" bind:value={pullRequestBase} required /></Field.Field>
      <Field.Field><Field.FieldLabel for="pull-request-body">Description</Field.FieldLabel><Textarea id="pull-request-body" bind:value={pullRequestBody} rows={6} /></Field.Field>
    </Field.FieldGroup>
    <Dialog.Footer><Button type="button" variant="ghost" onclick={() => (pullRequestOpen = false)}>Cancel</Button><Button type="button" disabled={!pullRequestTitle.trim() || !pullRequestBase.trim() || Boolean(pendingAction)} onclick={createPullRequest}>{pendingAction === 'pr' ? 'Creating…' : 'Create draft PR'}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .review { min-block-size: 0; block-size: 100%; display: flex; flex-direction: column; overflow: hidden; }
  .review-header, .review-tabs { min-inline-size: 0; display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .45rem .55rem; }
  .review-header > div:first-child { min-inline-size: 0; display: grid; gap: .08rem; }
  h2 { min-inline-size: 0; margin: 0; overflow: hidden; font-size: .78rem; font-weight: 590; text-overflow: ellipsis; white-space: nowrap; }
  .review-summary, .review-tabs > div { display: flex; align-items: center; gap: .25rem; }
  .review-summary span, .review-summary a { color: var(--muted-foreground); font-family: var(--font-mono); font-size: .61rem; text-decoration: none; white-space: nowrap; }
  b { color: var(--status-positive); font-style: normal; font-weight: 500; } i { color: var(--status-negative); font-style: normal; }
  :global(.review > [data-slot='alert']) { margin: .35rem .5rem; }
  .review-notice { margin: .1rem .55rem .35rem; color: var(--muted-foreground); font-size: .66rem; }
  .review-scope { min-inline-size: 0; display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .3rem .55rem .4rem; }
  .review-scope :global(button[role='combobox']) { inline-size: auto; min-inline-size: 8.5rem; block-size: 1.75rem; border-color: transparent; background: var(--surface-subtle); font-size: .67rem; }
  .review-scope > span { overflow: hidden; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .58rem; text-overflow: ellipsis; white-space: nowrap; }
  .branch-review { min-block-size: 0; flex: 1; overflow: hidden; }
  :global(.review-tabs-root) { min-block-size: 0; flex: 1; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
  .review-tabs { overflow-x: auto; }
  .review-tabs :global([data-slot='tabs-trigger']) { gap: .28rem; font-size: .67rem; }
  .review-tabs :global([data-slot='badge']) { min-inline-size: 1rem; block-size: 1rem; justify-content: center; padding-inline: .2rem; font-family: var(--font-mono); font-size: .54rem; }
  :global(.review-content) { min-block-size: 0; overflow: hidden; }
  .review-stack { min-block-size: 0; block-size: 100%; overflow: auto; padding: .25rem .35rem .5rem; }
  .review-stack ul { display: grid; gap: .25rem; margin: 0; padding: 0; list-style: none; }
  .review-stack li { min-inline-size: 0; overflow: hidden; border-radius: calc(var(--radius) * .72); background: var(--surface-subtle); }
  .review-stack li.expanded { background: color-mix(in oklab, var(--surface-subtle), var(--surface-raised) 38%); }
  .review-stack button { inline-size: 100%; min-inline-size: 0; display: grid; grid-template-columns: .8rem minmax(0, 1fr) auto; align-items: center; gap: .35rem; border: 0; border-radius: inherit; background: transparent; padding: .42rem .5rem; color: var(--muted-foreground); text-align: start; }
  .review-stack button:is(:hover, :focus-visible), .review-stack button.active { background: var(--sidebar-accent); color: var(--foreground); }
  .file-state { font-family: var(--font-mono); font-size: .58rem; } .file-path { overflow: hidden; font-family: var(--font-mono); font-size: .61rem; text-overflow: ellipsis; white-space: nowrap; }
  .review-stack small { display: flex; gap: .18rem; font-family: var(--font-mono); font-size: .54rem; }
  .diff-view { min-inline-size: 0; max-block-size: min(34rem, 64dvh); overflow: auto; background: color-mix(in oklab, var(--background), transparent 22%); }
  .diff-view > p { margin: 0; padding: .7rem; color: var(--muted-foreground); font-size: .66rem; }
  .diff-lines { min-inline-size: max-content; margin: 0; padding: .35rem 0; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .62rem; line-height: 1.5; list-style: none; }
  .diff-lines li { display: grid; grid-template-columns: 1.4ch minmax(max-content, 1fr); min-inline-size: 100%; padding-inline: .55rem; white-space: pre; }
  .diff-lines code { font: inherit; color: inherit; } .diff-lines li[data-kind='addition'] { background: color-mix(in oklab, var(--status-positive), transparent 88%); color: var(--foreground); } .diff-lines li[data-kind='deletion'] { background: color-mix(in oklab, var(--status-negative), transparent 88%); color: var(--foreground); } .diff-lines li[data-kind='hunk'] { color: var(--primary); }
  :global(.commit-panel) { min-block-size: 0; overflow: auto; padding: .55rem; }
  :global(.commit-panel form) { display: grid; gap: .55rem; }
  .ship-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: .25rem; }
  .review-empty { min-block-size: 12rem; display: grid; place-content: center; justify-items: center; gap: .3rem; padding: 1rem; color: var(--muted-foreground); text-align: center; }
  .review-empty :global(svg) { inline-size: 1rem; } .review-empty strong { color: var(--foreground); font-size: .72rem; } .review-empty p { max-inline-size: 34ch; margin: 0; font-size: .65rem; line-height: 1.45; }
  @container git-review (max-width: 34rem) {
    .review-tabs { align-items: stretch; flex-direction: column; }
    .review-tabs > div { justify-content: flex-end; flex-wrap: wrap; }
    .review-stack { padding-inline: .25rem; }
  }
</style>
