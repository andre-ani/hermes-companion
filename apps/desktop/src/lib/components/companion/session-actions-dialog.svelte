<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import * as Alert from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { deleteSession, renameSession, setSessionArchived } from '$lib/client/remote/sessions.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { CircleAlert } from '@lucide/svelte';
  import type { HermesSession } from '@hermes-companion/contracts';

  let { open = $bindable(false), session, onchanged, ondeleted }: { open?: boolean; session: HermesSession | null; onchanged?: () => void; ondeleted?: (sessionId: string) => void } = $props();
  let title = $state('');
  let pending = $state('');
  let error = $state('');
  $effect(() => { if (open && session) title = session.title; });

  async function rename() {
    if (!session || !title.trim()) return; pending = 'rename'; error = '';
    try { await resolveRemoteResult(renameSession({ sessionId: session.id, profileId: session.profileId ?? undefined, title })); onchanged?.(); open = false; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Session rename failed.'; }
    finally { pending = ''; }
  }
  async function archive() {
    if (!session) return; pending = 'archive'; error = '';
    try { await resolveRemoteResult(setSessionArchived({ sessionId: session.id, profileId: session.profileId ?? undefined, archived: !session.archived })); onchanged?.(); open = false; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Session archive action failed.'; }
    finally { pending = ''; }
  }
  async function remove() {
    if (!session) return; pending = 'delete'; error = '';
    try { await resolveRemoteResult(deleteSession({ sessionId: session.id, profileId: session.profileId ?? undefined })); ondeleted?.(session.id); open = false; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Session deletion failed.'; }
    finally { pending = ''; }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md"><Dialog.Header><Dialog.Title>Session actions</Dialog.Title><Dialog.Description>Rename, archive, or permanently delete the active Hermes session.</Dialog.Description></Dialog.Header>
    {#if error}<Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Session action failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    <form class="rename-form" onsubmit={(event) => { event.preventDefault(); void rename(); }}><Field.FieldGroup><Field.Field><Field.FieldLabel for="session-title">Title</Field.FieldLabel><Input id="session-title" name="session-title" bind:value={title} required /></Field.Field></Field.FieldGroup><Button type="submit" disabled={Boolean(pending)}>Save title</Button></form>
    <Dialog.Footer><Button type="button" variant="outline" disabled={Boolean(pending)} onclick={archive}>{session?.archived ? 'Restore session' : 'Archive session'}</Button><Button type="button" variant="destructive" disabled={Boolean(pending)} onclick={remove}>Delete permanently</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>.rename-form { display: grid; gap: .8rem; }.rename-form :global(button) { justify-self: end; }</style>
