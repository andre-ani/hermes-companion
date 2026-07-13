<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import * as Select from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { createHermesProfile } from '$lib/client/remote/operations.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import type { HermesProfile } from '@hermes-companion/contracts';

  let { open = $bindable(false), profiles = [], oncreated }: { open?: boolean; profiles?: HermesProfile[]; oncreated?: () => void } = $props();
  let name = $state('');
  let displayName = $state('');
  let description = $state('');
  let cloneFrom = $state('default');
  let soul = $state('');
  let pending = $state(false);
  let error = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    pending = true; error = '';
    try {
      await resolveRemoteResult(createHermesProfile({
        name: name.trim(), displayName: displayName.trim() || name.trim(), description: description.trim(),
        cloneFrom: cloneFrom || null, cloneAll: true, noSkills: false, soul
      }));
      open = false; oncreated?.();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Profile could not be created.'; }
    finally { pending = false; }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header><Dialog.Title>New profile</Dialog.Title><Dialog.Description>Create a Hermes profile. Interface preferences can be adjusted after creation.</Dialog.Description></Dialog.Header>
    <form class="profile-form" onsubmit={submit}>
      <Field.FieldGroup>
        <Field.Field data-invalid={Boolean(error)}><Field.FieldLabel for="profile-name">Name</Field.FieldLabel><Input id="profile-name" bind:value={name} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" placeholder="my-profile" aria-invalid={Boolean(error)} required />{#if error}<Field.FieldError>{error}</Field.FieldError>{/if}</Field.Field>
        <Field.Field><Field.FieldLabel for="profile-display-name">Display name <span>optional</span></Field.FieldLabel><Input id="profile-display-name" bind:value={displayName} placeholder="My Profile" /></Field.Field>
        <Field.Field><Field.FieldLabel for="profile-description">Description <span>optional</span></Field.FieldLabel><Input id="profile-description" bind:value={description} maxlength={280} /></Field.Field>
        <Field.Field><Field.FieldLabel for="profile-clone">Clone from</Field.FieldLabel><Select.Root type="single" bind:value={cloneFrom}><Select.Trigger id="profile-clone">{profiles.find((profile) => profile.id === cloneFrom)?.name ?? cloneFrom}</Select.Trigger><Select.Content>{#each profiles as profile (profile.id)}<Select.Item value={profile.id} label={profile.name}>{profile.name}</Select.Item>{/each}</Select.Content></Select.Root></Field.Field>
        <Field.Field><Field.FieldLabel for="profile-soul">SOUL.md <span>optional</span></Field.FieldLabel><Textarea id="profile-soul" bind:value={soul} rows={4} placeholder="Leave blank to keep the cloned profile’s default." /></Field.Field>
      </Field.FieldGroup>
      <Dialog.Footer><Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button><Button type="submit" disabled={pending || !name.trim()}>{pending ? 'Creating…' : 'Create profile'}</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<style>
  .profile-form { display: grid; gap: 1rem; }
  :global([data-slot='field-label'] span) { color: var(--muted-foreground); font-size: var(--type-caption); font-weight: 450; }
</style>
