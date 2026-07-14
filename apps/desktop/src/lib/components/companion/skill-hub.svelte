<script lang="ts">
  import { onMount } from 'svelte';
  import { CircleAlert, Download, Search, Sparkles } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { getHermesSkillHubSources, installHermesSkill, searchHermesSkillHub } from '$lib/client/remote/operations.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';

  type Row = Record<string, unknown>;
  let sources = $state<Row[]>([]);
  let featured = $state<Row[]>([]);
  let results = $state<Row[]>([]);
  let installed = $state<Record<string, unknown>>({});
  let query = $state('');
  let source = $state('all');
  let loading = $state(true);
  let searching = $state(false);
  let pending = $state('');
  let error = $state('');

  const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
  const rows = (value: unknown) => Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Row[] : [];
  const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

  async function load() {
    loading = true; error = '';
    try { const data = record(await resolveRemoteResult(getHermesSkillHubSources({}))); sources = rows(data.sources); featured = rows(data.featured); installed = record(data.installed); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Skill hubs could not be loaded.'; }
    finally { loading = false; }
  }

  async function search() {
    if (!query.trim() || searching) return; searching = true; error = '';
    try { const data = record(await resolveRemoteResult(searchHermesSkillHub({ query, source, limit: 30 }))); results = rows(data.results); installed = record(data.installed); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Skill search failed.'; }
    finally { searching = false; }
  }

  async function install(item: Row) {
    const identifier = text(item.identifier, text(item.name));
    if (!identifier || pending) return; pending = identifier; error = '';
    try { await resolveRemoteResult(installHermesSkill({ identifier })); installed = { ...installed, [identifier]: { name: text(item.name) } }; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Skill installation failed.'; }
    finally { pending = ''; }
  }

  onMount(load);
</script>

<section class="skill-hub" aria-labelledby="skill-hub-heading">
  <header><div><span class="data-label">Hermes capabilities</span><h1 id="skill-hub-heading">Browse Hub</h1><p>Discover skills from the sources connected to this Hermes profile.</p></div></header>
  <form class="hub-search" onsubmit={(event) => { event.preventDefault(); void search(); }}><Search /><Input aria-label="Search skills" placeholder="Search skills…" bind:value={query} /><Button type="submit" size="sm" disabled={!query.trim() || searching}>{searching ? 'Searching…' : 'Search'}</Button></form>
  {#if error}<div class="hub-error" role="alert"><CircleAlert />{error}</div>{/if}
  {#if loading}<div class="hub-loading"><Skeleton class="h-8 w-full" /><Skeleton class="h-48 w-full" /></div>{:else}
    <div class="source-row" aria-label="Connected skill hubs"><button type="button" class:active={source === 'all'} onclick={() => source = 'all'}>All</button>{#each sources as item (text(item.id))}<button type="button" class:active={source === text(item.id)} disabled={item.searchable === false} onclick={() => source = text(item.id)}>{text(item.label, text(item.id))}{#if item.available === false}<small>offline</small>{/if}</button>{/each}</div>
    {@const visible = results.length || query.trim() ? results : featured}
    {#if visible.length}<div class="skill-results">{#each visible as item, index (`${text(item.identifier, text(item.name))}-${index}`)}<article><span class="skill-mark"><Sparkles /></span><div><strong>{text(item.name, text(item.identifier))}</strong><p>{text(item.description, 'Hermes skill')}</p><small>{text(item.source_label, text(item.source))}{#if text(item.trust_level)} · {text(item.trust_level)}{/if}</small></div>{#if installed[text(item.identifier)]}<Badge variant="secondary">Installed</Badge>{:else}<Button size="sm" variant="ghost" disabled={Boolean(pending)} onclick={() => void install(item)}><Download data-icon="inline-start" />Install</Button>{/if}</article>{/each}</div>
    {:else}<div class="hub-empty"><Sparkles /><h2>{query.trim() ? 'No matching skills' : 'Search the connected hubs'}</h2><p>{query.trim() ? 'Try a broader term or another source.' : 'Results are fetched from Hermes, including its featured index when available.'}</p></div>{/if}
  {/if}
</section>

<style>
  .skill-hub { min-block-size: 0; block-size: 100%; overflow: auto; padding: clamp(1rem, 3cqi, 1.75rem) clamp(1rem, 3cqi, 2rem) 3rem; }
  .skill-hub > header, .hub-search, .hub-error, .hub-loading, .source-row, .skill-results { inline-size: min(100%, 64rem); margin-inline: auto; }
  h1, h2, p { margin: 0; } h1 { margin-block-start: .15rem; font-size: 1.1rem; font-weight: 650; letter-spacing: -.02em; } header p { margin-block-start: .18rem; color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); }
  .hub-search { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .35rem; margin-block-start: 1.2rem; } .hub-search > :global(svg) { position: absolute; inset-inline-start: .65rem; inset-block-start: .58rem; z-index: 1; inline-size: .85rem; color: var(--muted-foreground); pointer-events: none; } .hub-search :global(input) { padding-inline-start: 2rem; }
  .hub-error { display: flex; align-items: center; gap: .4rem; margin-block-start: .75rem; color: var(--status-negative); font-size: var(--type-status); } .hub-error :global(svg) { inline-size: .8rem; }
  .hub-loading { display: grid; gap: .55rem; margin-block-start: .8rem; }
  .source-row { display: flex; gap: .2rem; margin-block-start: .75rem; overflow-x: auto; } .source-row button { flex: none; border: 0; border-radius: calc(var(--radius) * .7); background: transparent; color: var(--muted-foreground); padding: .32rem .5rem; font: 500 var(--type-caption) var(--font-ui); } .source-row button:is(:hover, :focus-visible, .active) { background: var(--surface-subtle); color: var(--foreground); } .source-row button:disabled { opacity: .45; } .source-row small { margin-inline-start: .25rem; font-size: var(--type-status); }
  .skill-results { display: grid; gap: 1px; margin-block-start: .75rem; } .skill-results article { min-inline-size: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .65rem; border-radius: var(--radius); padding: .55rem .65rem; } .skill-results article:is(:hover, :focus-within) { background: var(--surface-subtle); } .skill-mark { display: grid; place-items: center; inline-size: 1.6rem; block-size: 1.6rem; border-radius: .5rem; color: var(--muted-foreground); } .skill-mark :global(svg) { inline-size: .8rem; } .skill-results article > div { min-inline-size: 0; display: grid; gap: .08rem; } .skill-results strong, .skill-results p, .skill-results small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .skill-results strong { font-size: var(--type-body); font-weight: 590; } .skill-results p, .skill-results small { color: var(--muted-foreground); font-size: var(--type-caption); } .skill-results p { font-family: var(--font-body); }
  .hub-empty { min-block-size: min(24rem, 50dvh); display: grid; place-content: center; justify-items: center; gap: .4rem; color: var(--muted-foreground); text-align: center; } .hub-empty > :global(svg) { inline-size: 1.1rem; } .hub-empty h2 { color: var(--foreground); font-size: .8rem; font-weight: 600; } .hub-empty p { max-inline-size: 42ch; font-family: var(--font-body); font-size: var(--type-caption); }
</style>
