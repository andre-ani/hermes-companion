<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import * as Alert from '$lib/components/ui/alert';
  import * as InputGroup from '$lib/components/ui/input-group';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { chooseLocalProjectDirectory, inspectAndBindProject, removeProjectWorktree } from '$lib/client/remote/projects.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { CircleAlert, FolderOpen, Plus, Trash2 } from '@lucide/svelte';
  import type { ProfileKind, ProjectBinding, WorktreeRecord } from '@hermes-companion/contracts';

  let { open = $bindable(false), mode = 'add', projects: _projects, worktrees, connectionKind, onchanged, oncreated }: { open?: boolean; mode?: 'add' | 'worktrees'; projects: ProjectBinding[]; worktrees: WorktreeRecord[]; connectionKind: ProfileKind; onchanged?: () => void; oncreated?: (project: ProjectBinding) => void | Promise<void> } = $props();
  let repositoryPath = $state('');
  let projectName = $state('');
  let initializeRepository = $state(true);
  let pending = $state('');
  let error = $state('');
  let worktreeRemovalTarget = $state<WorktreeRecord | null>(null);

  async function chooseDirectory() {
    error = '';
    try { const result = await resolveRemoteResult(chooseLocalProjectDirectory({})); if (result.path) repositoryPath = result.path; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Directory selection failed.'; }
  }

  async function bindRepository() {
    if (!repositoryPath.trim() || pending) return;
    pending = 'bind'; error = '';
    try { const project = await resolveRemoteResult(inspectAndBindProject({ repositoryPath, name: projectName || undefined, initialize: initializeRepository })); repositoryPath = ''; projectName = ''; initializeRepository = true; await onchanged?.(); await oncreated?.(project); open = false; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Repository could not be added.'; }
    finally { pending = ''; }
  }

  async function removeWorktree(id: string) {
    pending = id; error = '';
    try { await resolveRemoteResult(removeProjectWorktree({ worktreeId: id, force: false })); worktreeRemovalTarget = null; onchanged?.(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Worktree could not be removed.'; }
    finally { pending = ''; }
  }
</script>

{#snippet WorktreeManager()}
  {#if worktrees.length}
    <ul class="worktree-list" aria-label="Active coding-thread worktrees">
      {#each worktrees as worktree (worktree.worktreeId)}
        <li>
          <span><strong>{worktree.branch}</strong><code title={worktree.path}>{worktree.path}</code></span>
          <Button size="icon-xs" variant="ghost" disabled={pending === worktree.worktreeId} onclick={() => (worktreeRemovalTarget = worktree)} aria-label={`Remove worktree ${worktree.branch}`} title="Remove worktree"><Trash2 /></Button>
        </li>
      {/each}
    </ul>
    {#if worktreeRemovalTarget}<div class="worktree-confirm" role="group" aria-label={`Confirm removal of ${worktreeRemovalTarget.branch}`}><p>Remove <strong>{worktreeRemovalTarget.branch}</strong>? The branch and Hermes sessions are preserved.</p><div><Button size="sm" variant="ghost" disabled={Boolean(pending)} onclick={() => (worktreeRemovalTarget = null)}>Cancel</Button><Button size="sm" variant="destructive" disabled={Boolean(pending)} onclick={() => removeWorktree(worktreeRemovalTarget!.worktreeId)}>{pending ? 'Removing…' : 'Remove worktree'}</Button></div></div>{/if}
  {:else}
    <p class="worktree-empty">No active coding-thread worktrees.</p>
  {/if}
{/snippet}

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-md">
    <Dialog.Header><Dialog.Title>{mode === 'worktrees' ? 'Worktrees' : 'Add project'}</Dialog.Title><Dialog.Description>{mode === 'worktrees' ? 'Manage the isolated worktrees owned by coding threads.' : connectionKind === 'remote' ? 'Register a folder on the Hermes host.' : 'Choose a local project folder.'}</Dialog.Description></Dialog.Header>
    {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Project operation failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    {#if mode === 'add'}
    <form class="project-form" onsubmit={(event) => { event.preventDefault(); void bindRepository(); }}>
      <Field.FieldGroup><Field.Field><Field.FieldLabel for="repository-path">{connectionKind === 'remote' ? 'Host folder' : 'Project folder'}</Field.FieldLabel><InputGroup.Root><InputGroup.Input id="repository-path" name="repository-path" bind:value={repositoryPath} placeholder={connectionKind === 'remote' ? '/workspace/my-project' : 'Choose an existing or new folder'} required />{#if connectionKind === 'local'}<InputGroup.Addon align="inline-end"><Button type="button" size="icon-sm" variant="ghost" onclick={chooseDirectory} aria-label="Choose or create project folder"><FolderOpen /></Button></InputGroup.Addon>{/if}</InputGroup.Root></Field.Field><Field.Field><Field.FieldLabel for="project-name">Name <span>Optional</span></Field.FieldLabel><Input id="project-name" name="project-name" bind:value={projectName} placeholder="Uses the folder name" /></Field.Field>{#if connectionKind === 'local'}<Field.Field orientation="horizontal"><div><Field.FieldLabel for="initialize-project">Initialize Git if needed</Field.FieldLabel><Field.FieldDescription>Existing repositories are left unchanged.</Field.FieldDescription></div><Switch id="initialize-project" bind:checked={initializeRepository} /></Field.Field>{/if}</Field.FieldGroup>
      <Button type="submit" disabled={pending === 'bind' || !repositoryPath.trim()}><Plus data-icon="inline-start" /> {pending === 'bind' ? 'Adding…' : 'Add project'}</Button>
    </form>
    {#if worktrees.length}<details class="worktree-details"><summary>Manage existing worktrees ({worktrees.length})</summary>{@render WorktreeManager()}</details>{/if}
    {:else}
      <div class="worktree-manager">{@render WorktreeManager()}</div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  .project-form { display: grid; align-content: start; gap: .7rem; }
  .project-form > :global(button) { inline-size: 100%; }
  :global([data-slot='field-label'] span) { margin-inline-start: .25rem; color: var(--muted-foreground); font-size: .65rem; font-weight: 450; }
  .worktree-details { display: grid; gap: .45rem; } .worktree-details summary { color: var(--muted-foreground); cursor: pointer; font-size: .72rem; }
  .worktree-manager { display: grid; align-content: start; }
  .worktree-list { display: grid; gap: .2rem; margin: 0; padding: 0; list-style: none; }
  .worktree-list li { min-inline-size: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .5rem; border-radius: var(--radius); padding: .45rem .35rem .45rem .55rem; }
  .worktree-list li:hover { background: var(--surface-subtle); }
  .worktree-list li > span { min-inline-size: 0; display: grid; gap: .12rem; }
  .worktree-list strong { overflow: hidden; font-size: var(--type-small); font-weight: 590; text-overflow: ellipsis; white-space: nowrap; }
  .worktree-empty { margin: 0; padding: 2rem 1rem; color: var(--muted-foreground); font-size: var(--type-small); text-align: center; }
  .worktree-confirm { display: flex; align-items: center; justify-content: space-between; gap: .75rem; border-radius: var(--radius); background: var(--surface-subtle); padding: .55rem; }
  .worktree-confirm p { min-inline-size: 0; margin: 0; color: var(--muted-foreground); font-size: var(--type-caption); line-height: 1.4; }
  .worktree-confirm > div { display: flex; flex: none; gap: .35rem; }
  @media (max-width: 32rem) { .worktree-confirm { align-items: stretch; flex-direction: column; } .worktree-confirm > div { justify-content: flex-end; } }
  code { display: block; max-inline-size: 24rem; overflow: hidden; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .66rem; text-overflow: ellipsis; white-space: nowrap; }
</style>
