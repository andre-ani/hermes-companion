<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { removeHermesProjectWorktree } from '$lib/client/remote/projects.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { CircleAlert } from '@lucide/svelte';

  let { open = $bindable(false), target, onremoved }: {
    open?: boolean;
    target: { projectId: string; repositoryPath: string; worktreePath: string; branch: string } | null;
    onremoved?: (worktreePath: string) => void;
  } = $props();
  let pending = $state(false);
  let error = $state('');
  $effect(() => { if (open) error = ''; });

  async function remove() {
    if (!target || pending) return;
    pending = true;
    error = '';
    try {
      const result = await resolveRemoteResult(removeHermesProjectWorktree({ projectId: target.projectId, repositoryPath: target.repositoryPath, worktreePath: target.worktreePath, force: false }));
      onremoved?.(result.removed);
      open = false;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Hermes could not remove the worktree.';
    } finally {
      pending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header><Dialog.Title>Remove worktree?</Dialog.Title><Dialog.Description>Remove the linked checkout for <strong>{target?.branch ?? 'this branch'}</strong>. The branch and Hermes sessions are preserved.</Dialog.Description></Dialog.Header>
    {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Worktree removal failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    <Dialog.Footer><Dialog.Close type="button" class={buttonVariants({ variant: 'ghost' })}>Cancel</Dialog.Close><Button type="button" variant="destructive" disabled={pending} onclick={remove}>{pending ? 'Removing…' : 'Remove worktree'}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
