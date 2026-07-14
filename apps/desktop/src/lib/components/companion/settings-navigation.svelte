<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { settingsSections, searchSettings } from '$lib/settings/settings-registry';
  import type { SettingsIcon } from '$lib/settings/settings-registry';
  import { Archive, ArrowLeft, Bell, Bot, Box, Brain, CircleHelp, Cpu, KeyRound, LockKeyhole, MessageCircle, Monitor, Palette, RadioTower, Search, Settings2 } from '@lucide/svelte';

  let { activeSection, onselect, onback }: { activeSection: string; onselect: (sectionId: string, itemId?: string) => void; onback: () => void } = $props();
  let query = $state('');
  const results = $derived(searchSettings(query));
  const groups = [{ id: 'primary', label: 'App' }, { id: 'runtime', label: 'Hermes' }, { id: 'system', label: 'System' }] as const;
  const iconMap = { model: Box, chat: MessageCircle, appearance: Palette, workspace: Monitor, safety: LockKeyhole, memory: Brain, notifications: Bell, providers: Cpu, gateway: RadioTower, keys: KeyRound, archive: Archive, about: CircleHelp } satisfies Record<SettingsIcon, typeof Bot>;
</script>

<div class="settings-nav-shell">
  <Button class="settings-back" variant="ghost" onclick={onback}><ArrowLeft data-icon="inline-start" /> Back</Button>
  <search class="settings-search">
    <label class="visually-hidden" for="settings-search">Search settings</label>
    <Search aria-hidden="true" />
    <Input id="settings-search" type="search" bind:value={query} placeholder="Search Settings" autocomplete="off" />
  </search>
  <nav class="settings-nav" aria-label="Settings">
    {#if query.trim()}
      {#if results.length}
        {#each results as result (`${result.section.id}:${result.item.id}`)}
          {@const Icon = iconMap[result.section.icon] ?? Settings2}
          <button type="button" class="settings-result" onclick={() => onselect(result.section.id, result.item.id)}>
            <Icon aria-hidden="true" /><span><strong>{result.section.label} › {result.item.label}</strong><small>{result.item.description}</small></span>
          </button>
        {/each}
      {:else}<p class="settings-empty">No matching settings.</p>{/if}
    {:else}
      {#each groups as group}
        <section class="settings-group" aria-labelledby={`settings-group-${group.id}`}>
          <h2 id={`settings-group-${group.id}`}>{group.label}</h2>
          {#each settingsSections.filter((section) => (section.group ?? 'primary') === group.id) as section (section.id)}
            {@const Icon = iconMap[section.icon] ?? Settings2}
            <button type="button" class:active={activeSection === section.id} onclick={() => onselect(section.id)} aria-current={activeSection === section.id ? 'page' : undefined}>
              <Icon aria-hidden="true" /><span>{section.label}</span>
            </button>
          {/each}
        </section>
      {/each}
    {/if}
  </nav>
</div>

<style>
  .settings-nav-shell { min-block-size: 0; display: flex; flex: 1; flex-direction: column; gap: .55rem; overflow: hidden; padding: .35rem .5rem 0; }
  :global(.settings-back) { align-self: start; justify-content: flex-start; }
  .settings-search { position: relative; display: flex; align-items: center; }
  .settings-search > :global(svg) { position: absolute; inset-inline-start: .55rem; inline-size: .85rem; color: var(--muted-foreground); pointer-events: none; }
  .settings-search :global(input) { block-size: 2.25rem; padding-inline-start: 1.85rem; background: var(--surface-subtle); font-size: .7rem; }
  .settings-nav { min-block-size: 0; display: flex; flex: 1; flex-direction: column; gap: .55rem; overflow-y: auto; padding-block: .1rem .5rem; }
  .settings-group { display: grid; gap: 1px; }
  .settings-group + .settings-group { padding-block-start: .45rem; }
  .settings-group h2 { margin: 0; padding: .3rem .45rem .2rem; color: var(--muted-foreground); font-size: var(--type-caption); font-weight: 560; }
  .settings-nav button { min-inline-size: 0; inline-size: 100%; min-block-size: 2rem; display: grid; grid-template-columns: 1.15rem minmax(0, 1fr); align-items: center; gap: .45rem; border: 0; border-radius: calc(var(--radius) * .65); background: transparent; padding: .32rem .45rem; color: var(--muted-foreground); text-align: start; cursor: pointer; }
  .settings-nav button:hover, .settings-nav button:focus-visible, .settings-nav button.active { background: var(--sidebar-accent); color: var(--foreground); }
  .settings-nav button :global(svg) { inline-size: .9rem; }
  .settings-nav button span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-ui); font-size: var(--type-small); }
  .settings-result { align-items: start !important; }
  .settings-result span { display: grid; gap: .08rem; white-space: normal !important; }
  .settings-result strong, .settings-result small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .settings-result strong { font-size: .68rem; font-weight: 590; }
  .settings-result small { color: var(--muted-foreground); font-family: var(--font-body); font-size: .6rem; }
  .settings-empty { margin: .75rem .45rem; color: var(--muted-foreground); font-size: .68rem; }
</style>
