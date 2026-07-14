<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { deleteProject, renameProject, setProjectArchived } from '$lib/client/remote/projects.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { CircleAlert } from '@lucide/svelte';
  import type { ProjectBinding } from '@hermes-companion/contracts';

  let { open = $bindable(false), project, onchanged, ondeleted }: { open?: boolean; project: ProjectBinding | null; onchanged?: () => void; ondeleted?: (projectId: string) => void } = $props();
  let name = $state('');
  let pending = $state('');
  let error = $state('');
  let confirmingDelete = $state(false);
  $effect(() => { if (open && project) { name = project.name; error = ''; confirmingDelete = false; } });

  async function rename() {
    if (!project || !name.trim() || pending) return; pending = 'rename'; error = '';
    try { await resolveRemoteResult(renameProject({ projectId: project.id, name })); onchanged?.(); open = false; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Project rename failed.'; }
    finally { pending = ''; }
  }

  async function archive() {
    if (!project || pending) return; pending = 'archive'; error = '';
    try { await resolveRemoteResult(setProjectArchived({ projectId: project.id, archived: !project.archived })); onchanged?.(); open = false; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Project archive action failed.'; }
    finally { pending = ''; }
  }

  async function remove() {
    if (!project || pending) return; pending = 'delete'; error = '';
    try { await resolveRemoteResult(deleteProject({ projectId: project.id })); ondeleted?.(project.id); open = false; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Project deletion failed.'; }
    finally { pending = ''; }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header><Dialog.Title>{confirmingDelete ? 'Delete project?' : 'Project actions'}</Dialog.Title><Dialog.Description>{confirmingDelete ? `Remove “${project?.name ?? 'this project'}” from Companion. Its Hermes sessions and files are preserved.` : 'Rename, archive, or remove this Hermes project. Its sessions are preserved.'}</Dialog.Description></Dialog.Header>
    {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Project action failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    {#if confirmingDelete}
      <Dialog.Footer><Button type="button" variant="outline" disabled={Boolean(pending)} onclick={() => (confirmingDelete = false)}>Cancel</Button><Button type="button" variant="destructive" disabled={Boolean(pending)} onclick={remove}>{pending === 'delete' ? 'Deleting…' : 'Delete project'}</Button></Dialog.Footer>
    {:else}
      <form class="rename-form" onsubmit={(event) => { event.preventDefault(); void rename(); }}>
        <Field.FieldGroup><Field.Field><Field.FieldLabel for="project-action-name">Name</Field.FieldLabel><Input id="project-action-name" name="name" bind:value={name} required maxlength={240} /></Field.Field></Field.FieldGroup>
        <Button type="submit" disabled={Boolean(pending)}>Save name</Button>
      </form>
      <Dialog.Footer><Button type="button" variant="outline" disabled={Boolean(pending)} onclick={archive}>{project?.archived ? 'Restore project' : 'Archive project'}</Button><Button type="button" variant="destructive" disabled={Boolean(pending)} onclick={() => (confirmingDelete = true)}>Delete project</Button></Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>.rename-form { display: grid; gap: .8rem; }.rename-form :global(button) { justify-self: end; }</style>
