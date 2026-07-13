<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import * as Table from '$lib/components/ui/table';
  import * as Alert from '$lib/components/ui/alert';
  import * as InputGroup from '$lib/components/ui/input-group';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { chooseLocalProjectDirectory, inspectAndBindProject, removeProjectWorktree } from '$lib/client/remote/projects.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { CircleAlert, FolderOpen, Plus, Trash2 } from '@lucide/svelte';
  import type { ProfileKind, ProjectBinding, WorktreeRecord } from '@hermes-companion/contracts';

  let { open = $bindable(false), projects: _projects, worktrees, connectionKind, onchanged, oncreated }: { open?: boolean; projects: ProjectBinding[]; worktrees: WorktreeRecord[]; connectionKind: ProfileKind; onchanged?: () => void; oncreated?: (project: ProjectBinding) => void | Promise<void> } = $props();
  let repositoryPath = $state('');
  let projectName = $state('');
  let initializeRepository = $state(true);
  let pending = $state('');
  let error = $state('');

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
    try { await resolveRemoteResult(removeProjectWorktree({ worktreeId: id, force: false })); onchanged?.(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Worktree could not be removed.'; }
    finally { pending = ''; }
  }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-md">
    <Dialog.Header><Dialog.Title>Add project</Dialog.Title><Dialog.Description>{connectionKind === 'remote' ? 'Register a folder on the Hermes host.' : 'Choose a local project folder.'}</Dialog.Description></Dialog.Header>
    {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Project operation failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    <form class="project-form" onsubmit={(event) => { event.preventDefault(); void bindRepository(); }}>
      <Field.FieldGroup><Field.Field><Field.FieldLabel for="repository-path">{connectionKind === 'remote' ? 'Host folder' : 'Project folder'}</Field.FieldLabel><InputGroup.Root><InputGroup.Input id="repository-path" name="repository-path" bind:value={repositoryPath} placeholder={connectionKind === 'remote' ? '/workspace/my-project' : 'Choose an existing or new folder'} required />{#if connectionKind === 'local'}<InputGroup.Addon align="inline-end"><Button type="button" size="icon-sm" variant="ghost" onclick={chooseDirectory} aria-label="Choose or create project folder"><FolderOpen /></Button></InputGroup.Addon>{/if}</InputGroup.Root></Field.Field><Field.Field><Field.FieldLabel for="project-name">Name <span>Optional</span></Field.FieldLabel><Input id="project-name" name="project-name" bind:value={projectName} placeholder="Uses the folder name" /></Field.Field>{#if connectionKind === 'local'}<Field.Field orientation="horizontal"><div><Field.FieldLabel for="initialize-project">Initialize Git if needed</Field.FieldLabel><Field.FieldDescription>Existing repositories are left unchanged.</Field.FieldDescription></div><Switch id="initialize-project" bind:checked={initializeRepository} /></Field.Field>{/if}</Field.FieldGroup>
      <Button type="submit" disabled={pending === 'bind' || !repositoryPath.trim()}><Plus data-icon="inline-start" /> {pending === 'bind' ? 'Adding…' : 'Add project'}</Button>
    </form>
    {#if worktrees.length}<details class="worktree-details"><summary>Manage existing worktrees ({worktrees.length})</summary><Table.Root><Table.Caption>Active coding-thread worktrees.</Table.Caption><Table.Header><Table.Row><Table.Head>Branch</Table.Head><Table.Head>Path</Table.Head><Table.Head>Writer</Table.Head><Table.Head>Actions</Table.Head></Table.Row></Table.Header><Table.Body>{#each worktrees as worktree (worktree.worktreeId)}<Table.Row><Table.Cell>{worktree.branch}</Table.Cell><Table.Cell><code>{worktree.path}</code></Table.Cell><Table.Cell>{#if worktree.writerRunId}<Badge variant="secondary">Active</Badge>{:else}<Badge variant="outline">Available</Badge>{/if}</Table.Cell><Table.Cell><Button size="icon-xs" variant="ghost" disabled={Boolean(worktree.writerRunId) || pending === worktree.worktreeId} onclick={() => removeWorktree(worktree.worktreeId)} aria-label={`Remove worktree ${worktree.branch}`}><Trash2 /></Button></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root></details>{/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  .project-form { display: grid; align-content: start; gap: .7rem; }
  .project-form > :global(button) { inline-size: 100%; }
  :global([data-slot='field-label'] span) { margin-inline-start: .25rem; color: var(--muted-foreground); font-size: .65rem; font-weight: 450; }
  .worktree-details { display: grid; gap: .45rem; } .worktree-details summary { color: var(--muted-foreground); cursor: pointer; font-size: .72rem; }
  code { display: block; max-inline-size: 24rem; overflow: hidden; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .66rem; text-overflow: ellipsis; white-space: nowrap; }
</style>
