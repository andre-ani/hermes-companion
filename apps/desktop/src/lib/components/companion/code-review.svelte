<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import * as Select from '$lib/components/ui/select';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Textarea } from '$lib/components/ui/textarea';
  import {
    commitHermesGitReview,
    createHermesGitPullRequest,
    getHermesGitReview,
    getHermesGitReviewDiff,
    pushHermesGitReview,
    revertHermesGitReview,
    stageHermesGitReview,
    unstageHermesGitReview
  } from '$lib/client/remote/projects.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { parseUnifiedDiff } from '$lib/diff-parser';
  import { CircleAlert, GitCommitHorizontal, GitPullRequest, RefreshCw, RotateCcw, Upload } from '@lucide/svelte';
  import type { HermesGitWorkspace, HermesRepoStatus, HermesReviewFile, HermesReviewScope, HermesReviewShipInfo } from '@hermes-companion/contracts';

  let { workspace }: { workspace: HermesGitWorkspace | null } = $props();
  let status = $state<HermesRepoStatus | null>(null);
  let files = $state<HermesReviewFile[]>([]);
  let ship = $state<HermesReviewShipInfo>({ ghReady: false, pr: null });
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
  let pushAfterCommit = $state(false);
  let revertOpen = $state(false);
  let loadedReviewKey = $state('');

  const workspaceKey = $derived(workspace ? `${workspace.projectId}:${workspace.path}` : '');
  const reviewKey = $derived(`${workspaceKey}:${reviewScope}`);
  const statusByPath = $derived(new Map((status?.files ?? []).map((file) => [file.path, file])));
  const visibleFiles = $derived(reviewScope === 'branch' ? files : files.filter((file) => reviewTab === 'staged'
    ? Boolean(statusByPath.get(file.path)?.staged)
    : Boolean(statusByPath.get(file.path)?.unstaged)));
  const selectedFile = $derived(visibleFiles.find((file) => file.path === selectedPath) ?? visibleFiles[0] ?? null);
  const parsedDiff = $derived(parseUnifiedDiff(diff));
  const selectedDiff = $derived(parsedDiff.find((file) => file.path === selectedFile?.path) ?? parsedDiff[0] ?? null);

  $effect(() => {
    if (reviewKey === loadedReviewKey) return;
    loadedReviewKey = reviewKey;
    status = null; files = []; ship = { ghReady: false, pr: null }; selectedPath = null; diff = ''; error = ''; notice = ''; commitMessage = '';
    if (workspace) void refresh();
  });

  $effect(() => {
    reviewTab;
    if (!workspace || reviewScope === 'branch' || reviewTab === 'commit') return;
    selectedPath = visibleFiles[0]?.path ?? null;
    void loadDiff();
  });

  async function refresh() {
    if (!workspace || loading) return;
    loading = true; error = '';
    try {
      const reviewQuery = getHermesGitReview({ ...workspace, scope: reviewScope });
      await reviewQuery.refresh();
      const result = await resolveRemoteResult(reviewQuery);
      status = result.status;
      files = result.review.files;
      ship = result.ship;
      if (!visibleFiles.some((file) => file.path === selectedPath)) selectedPath = visibleFiles[0]?.path ?? null;
      await loadDiff();
    } catch (cause) {
      status = null; files = []; diff = '';
      error = cause instanceof Error ? cause.message : 'Hermes Git review is unavailable for this checkout.';
    } finally { loading = false; }
  }

  async function loadDiff(path = selectedPath) {
    if (!workspace || !path || (reviewScope === 'uncommitted' && reviewTab === 'commit')) { diff = ''; return; }
    diffLoading = true; error = '';
    try {
      const diffQuery = getHermesGitReviewDiff({ ...workspace, scope: reviewScope, file: path, staged: reviewScope === 'uncommitted' && reviewTab === 'staged' });
      await diffQuery.refresh();
      const result = await resolveRemoteResult(diffQuery);
      if (path === selectedPath) diff = result.diff;
    } catch (cause) { if (path === selectedPath) diff = ''; error = cause instanceof Error ? cause.message : 'The selected diff could not be loaded.'; }
    finally { diffLoading = false; }
  }

  async function selectFile(file: HermesReviewFile) {
    selectedPath = file.path;
    await loadDiff(file.path);
  }

  async function mutate(action: 'stage' | 'unstage', file: string | null) {
    if (!workspace || pendingAction) return;
    pendingAction = action; error = ''; notice = '';
    try {
      if (action === 'stage') await resolveRemoteResult(stageHermesGitReview({ ...workspace, file }));
      else await resolveRemoteResult(unstageHermesGitReview({ ...workspace, file }));
      notice = file ? `${file} ${action === 'stage' ? 'staged' : 'unstaged'}.` : `All changes ${action === 'stage' ? 'staged' : 'unstaged'}.`;
      await refresh();
    } catch (cause) { error = cause instanceof Error ? cause.message : `Changes could not be ${action}d.`; }
    finally { pendingAction = ''; }
  }

  async function revertSelected() {
    if (!workspace || !selectedFile || pendingAction) return;
    pendingAction = 'revert'; error = ''; notice = '';
    try {
      await resolveRemoteResult(revertHermesGitReview({ ...workspace, file: selectedFile.path }));
      notice = `${selectedFile.path} reverted.`; revertOpen = false; await refresh();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The selected change could not be reverted.'; }
    finally { pendingAction = ''; }
  }

  async function commit() {
    if (!workspace || !commitMessage.trim() || pendingAction) return;
    pendingAction = 'commit'; error = ''; notice = '';
    try {
      await resolveRemoteResult(commitHermesGitReview({ ...workspace, message: commitMessage, push: pushAfterCommit }));
      commitMessage = ''; notice = pushAfterCommit ? 'Changes committed and pushed.' : 'Changes committed.'; await refresh();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes could not create the commit.'; }
    finally { pendingAction = ''; }
  }

  async function push() {
    if (!workspace || pendingAction) return;
    pendingAction = 'push'; error = ''; notice = '';
    try { await resolveRemoteResult(pushHermesGitReview(workspace)); notice = 'Branch pushed.'; await refresh(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes could not push this branch.'; }
    finally { pendingAction = ''; }
  }

  async function createPullRequest() {
    if (!workspace || pendingAction || !ship.ghReady) return;
    pendingAction = 'pr'; error = ''; notice = '';
    try {
      const result = await resolveRemoteResult(createHermesGitPullRequest(workspace));
      notice = 'Pull request created.'; ship = { ghReady: true, pr: { url: result.url, state: 'OPEN', number: ship.pr?.number ?? 1 } }; await refresh();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes could not create the pull request.'; }
    finally { pendingAction = ''; }
  }
</script>

<section class="review" aria-labelledby="review-heading">
  <header class="review-header">
    <div><span class="data-label">Changes</span><h2 id="review-heading">{workspace?.branch ?? 'Working tree'}</h2></div>
    <div class="review-summary">
      {#if status && reviewScope === 'uncommitted'}<span><b>+{status.added}</b> <i>−{status.removed}</i></span>{/if}
      {#if ship.pr}<a href={ship.pr.url} target="_blank" rel="noreferrer">PR #{ship.pr.number}</a>{/if}
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
        {#if reviewTab !== 'commit'}<div><Button size="xs" variant="ghost" disabled={!selectedFile || Boolean(pendingAction)} onclick={() => (revertOpen = true)}><RotateCcw data-icon="inline-start" /> Revert</Button>{#if reviewTab === 'unstaged'}<Button size="xs" variant="outline" disabled={!selectedFile || Boolean(pendingAction)} onclick={() => mutate('stage', selectedFile?.path ?? null)}>Stage file</Button><Button size="xs" variant="outline" disabled={!visibleFiles.length || Boolean(pendingAction)} onclick={() => mutate('stage', null)}>Stage all</Button>{:else}<Button size="xs" variant="outline" disabled={!selectedFile || Boolean(pendingAction)} onclick={() => mutate('unstage', selectedFile?.path ?? null)}>Unstage file</Button><Button size="xs" variant="outline" disabled={!visibleFiles.length || Boolean(pendingAction)} onclick={() => mutate('unstage', null)}>Unstage all</Button>{/if}</div>{/if}
      </div>

      <Tabs.Content value="unstaged" class="review-content">{@render reviewFiles()}</Tabs.Content>
      <Tabs.Content value="staged" class="review-content">{@render reviewFiles()}</Tabs.Content>
      <Tabs.Content value="commit" class="commit-panel">
        <form onsubmit={(event) => { event.preventDefault(); void commit(); }}>
          <Field.FieldGroup><Field.Field><Field.FieldLabel for="commit-message">Commit message</Field.FieldLabel><Textarea id="commit-message" bind:value={commitMessage} rows={4} required /></Field.Field><Field.Field orientation="horizontal"><div><Field.FieldLabel for="push-after-commit">Push after commit</Field.FieldLabel><Field.FieldDescription>Hermes uses the branch’s configured upstream.</Field.FieldDescription></div><Switch id="push-after-commit" bind:checked={pushAfterCommit} /></Field.Field></Field.FieldGroup>
          <div class="ship-actions"><Button type="submit" size="sm" disabled={!commitMessage.trim() || Boolean(pendingAction)}><GitCommitHorizontal data-icon="inline-start" /> {pendingAction === 'commit' ? 'Committing…' : 'Commit'}</Button><Button type="button" size="sm" variant="outline" disabled={Boolean(pendingAction)} onclick={push}><Upload data-icon="inline-start" /> Push</Button>{#if ship.ghReady}{#if ship.pr}<Button type="button" size="sm" variant="outline" href={ship.pr.url} target="_blank"><GitPullRequest data-icon="inline-start" /> Open PR</Button>{:else}<Button type="button" size="sm" variant="outline" disabled={Boolean(pendingAction)} onclick={createPullRequest}><GitPullRequest data-icon="inline-start" /> Create PR</Button>{/if}{/if}</div>
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
  <Dialog.Content class="sm:max-w-md"><Dialog.Header><Dialog.Title>Revert this file?</Dialog.Title><Dialog.Description>Discard uncommitted changes in <strong>{selectedFile?.path}</strong>. This cannot be undone.</Dialog.Description></Dialog.Header><Dialog.Footer><Button type="button" variant="ghost" onclick={() => (revertOpen = false)}>Cancel</Button><Button type="button" variant="destructive" disabled={Boolean(pendingAction)} onclick={revertSelected}>{pendingAction === 'revert' ? 'Reverting…' : 'Revert file'}</Button></Dialog.Footer></Dialog.Content>
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
