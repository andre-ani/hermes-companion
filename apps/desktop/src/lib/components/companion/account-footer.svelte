<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import { Settings } from '@lucide/svelte';

  let { name = 'Hermes User', email = '', settingsActive = false, ontogglesettings }: {
    name?: string;
    email?: string;
    settingsActive?: boolean;
    ontogglesettings: () => void;
  } = $props();

  const initials = $derived(name.trim().slice(0, 1).toLocaleUpperCase() || 'H');
</script>

<footer class="account-footer">
  <Avatar.Root class="account-avatar"><Avatar.Fallback>{initials}</Avatar.Fallback></Avatar.Root>
  <span class="account-copy"><strong>{name}</strong><small>{email || 'Email not configured'}</small></span>
  <Button size="icon-sm" variant={settingsActive ? 'secondary' : 'ghost'} onclick={ontogglesettings} aria-label={settingsActive ? 'Close settings' : 'Open settings'} title={settingsActive ? 'Close settings' : 'Open settings'}><Settings /></Button>
</footer>

<style>
  .account-footer { min-inline-size: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .55rem; margin-block-start: auto; padding: .55rem .55rem .65rem; }
  :global(.account-avatar) { inline-size: 2rem; block-size: 2rem; font-family: var(--font-ui); font-size: var(--type-small); }
  .account-copy { min-inline-size: 0; display: grid; gap: .06rem; }
  .account-copy strong, .account-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .account-copy strong { font-family: var(--font-ui); font-size: var(--type-small); font-weight: 590; }
  .account-copy small { color: var(--muted-foreground); font-size: var(--type-caption); }
</style>
