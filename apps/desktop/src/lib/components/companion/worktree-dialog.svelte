<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import * as Select from '$lib/components/ui/select';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { createHermesProjectWorktree, listHermesProjectBranches } from '$lib/client/remote/projects.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { CircleAlert } from '@lucide/svelte';
  import type { HermesGitBranch, HermesGitWorktree, ProjectBinding } from '@hermes-companion/contracts';

  let { open = $bindable(false), project, repositoryPaths = [], oncreated }: {
    open?: boolean;
    project: ProjectBinding | null;
    repositoryPaths?: string[];
    oncreated?: (worktree: HermesGitWorktree) => void;
  } = $props();

  let mode = $state<'new' | 'existing'>('new');
  let repositoryPath = $state('');
  let name = $state('');
  let branch = $state('');
  let base = $state('HEAD');
  let existingBranch = $state('');
  let branches = $state<HermesGitBranch[]>([]);
  let loadingBranches = $state(false);
  let pending = $state(false);
  let error = $state('');

  const availableRepositories = $derived([...new Set([project?.repositoryPath, ...repositoryPaths].filter((path): path is string => Boolean(path)))]);
  const availableBranches = $derived(branches.filter((candidate) => !candidate.checkedOut));

  $effect(() => {
    if (!open || !project) return;
    mode = 'new';
    repositoryPath = availableRepositories[0] ?? project.repositoryPath;
    name = '';
    branch = '';
    base = 'HEAD';
    existingBranch = '';
    error = '';
    void loadBranches();
  });

  async function loadBranches() {
    if (!project || !repositoryPath) return;
    loadingBranches = true;
    try { branches = await resolveRemoteResult(listHermesProjectBranches({ projectId: project.id, repositoryPath })); }
    catch { branches = []; }
    finally { loadingBranches = false; }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!project || pending || (mode === 'existing' && !existingBranch)) return;
    pending = true;
    error = '';
    try {
      const worktree = await resolveRemoteResult(createHermesProjectWorktree(mode === 'existing'
        ? { projectId: project.id, repositoryPath, existingBranch }
        : { projectId: project.id, repositoryPath, name: name.trim() || undefined, branch: branch.trim() || undefined, base: base.trim() || undefined }));
      oncreated?.(worktree);
      open = false;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Hermes could not create the worktree.';
    } finally {
      pending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Start work</Dialog.Title>
      <Dialog.Description>Create a linked checkout, then start the next Hermes session there.</Dialog.Description>
    </Dialog.Header>
    {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Worktree creation failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    <form onsubmit={submit}>
      <Field.FieldGroup>
        {#if availableRepositories.length > 1}<Field.Field><Field.FieldLabel for="worktree-repository">Repository</Field.FieldLabel><Select.Root type="single" bind:value={repositoryPath} onValueChange={() => void loadBranches()}><Select.Trigger id="worktree-repository">{availableRepositories.find((path) => path === repositoryPath)?.split('/').filter(Boolean).at(-1) ?? 'Select repository'}</Select.Trigger><Select.Content><Select.Group><Select.Label>Project repositories</Select.Label>{#each availableRepositories as path (path)}<Select.Item value={path} label={path}>{path}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field>{/if}
        <Field.Field><Field.FieldLabel for="worktree-mode">Source</Field.FieldLabel><Select.Root type="single" bind:value={mode}><Select.Trigger id="worktree-mode">{mode === 'new' ? 'New branch' : 'Existing branch'}</Select.Trigger><Select.Content><Select.Group><Select.Label>Worktree source</Select.Label><Select.Item value="new" label="New branch">New branch</Select.Item><Select.Item value="existing" label="Existing branch">Existing branch</Select.Item></Select.Group></Select.Content></Select.Root></Field.Field>
        {#if mode === 'existing'}
          <Field.Field><Field.FieldLabel for="worktree-existing-branch">Branch</Field.FieldLabel><Select.Root type="single" bind:value={existingBranch} disabled={loadingBranches || !availableBranches.length}><Select.Trigger id="worktree-existing-branch">{loadingBranches ? 'Loading branches…' : availableBranches.find((candidate) => candidate.name === existingBranch)?.name ?? 'Select branch'}</Select.Trigger><Select.Content><Select.Group><Select.Label>Available branches</Select.Label>{#each availableBranches as candidate (candidate.name)}<Select.Item value={candidate.name} label={candidate.name}>{candidate.name}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root><Field.FieldDescription>{availableBranches.length ? 'Branches already checked out are omitted.' : 'No unassigned local branches are available.'}</Field.FieldDescription></Field.Field>
        {:else}
          <Field.Field><Field.FieldLabel for="worktree-name">Name</Field.FieldLabel><Input id="worktree-name" name="name" bind:value={name} maxlength={120} placeholder="search-context" /><Field.FieldDescription>Hermes creates a matching branch and folder when left otherwise unspecified.</Field.FieldDescription></Field.Field>
          <Field.Field><Field.FieldLabel for="worktree-branch">Branch <span>optional</span></Field.FieldLabel><Input id="worktree-branch" name="branch" bind:value={branch} maxlength={240} placeholder="feat/search-context" /></Field.Field>
          <Field.Field><Field.FieldLabel for="worktree-base">Start from</Field.FieldLabel><Input id="worktree-base" name="base" bind:value={base} maxlength={240} /></Field.Field>
        {/if}
      </Field.FieldGroup>
      <Dialog.Footer><Dialog.Close type="button" class={buttonVariants({ variant: 'ghost' })}>Cancel</Dialog.Close><Button type="submit" disabled={pending || (mode === 'existing' && !existingBranch)}>{pending ? 'Creating…' : 'Create worktree'}</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<style>
  form { display: grid; gap: 1rem; }
  :global([data-slot='field-label'] span) { color: var(--muted-foreground); font-weight: 400; }
</style>
