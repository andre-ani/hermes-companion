<script lang="ts">
  import { onMount } from 'svelte';
  import { CircleAlert, PawPrint, RefreshCw, Search } from '@lucide/svelte';
  import type { HermesPetGallery } from '@hermes-companion/contracts';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { disableHermesPet, getHermesPetGallery, selectHermesPet, setHermesPetScale } from '$lib/client/remote/pets.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';

  let gallery = $state<HermesPetGallery | null>(null);
  let loading = $state(true); let pending = $state(''); let error = $state(''); let notice = $state(''); let search = $state('');
  let scale = $state(0.33);
  const pets = $derived((gallery?.pets ?? []).filter((pet) => !search.trim() || `${pet.displayName} ${pet.slug}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).slice(0, 60));

  async function load() { loading = true; error = ''; try { gallery = await resolveRemoteResult(getHermesPetGallery({})); scale = gallery.info.scale; } catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes Pets could not be loaded.'; } finally { loading = false; } }
  async function select(slug: string) { if (pending) return; pending = slug; error = ''; try { await resolveRemoteResult(selectHermesPet({ slug })); notice = 'Pet selected.'; await load(); } catch (cause) { error = cause instanceof Error ? cause.message : 'Pet selection failed.'; } finally { pending = ''; } }
  async function toggle(enabled: boolean) { if (enabled && gallery?.active) return select(gallery.active); if (enabled && pets[0]) return select(pets[0].slug); pending = 'toggle'; error = ''; try { await resolveRemoteResult(disableHermesPet({})); notice = 'Pet hidden.'; await load(); } catch (cause) { error = cause instanceof Error ? cause.message : 'Pet toggle failed.'; } finally { pending = ''; } }
  async function saveScale() { pending = 'scale'; error = ''; try { await resolveRemoteResult(setHermesPetScale({ scale })); notice = 'Pet size saved.'; } catch (cause) { error = cause instanceof Error ? cause.message : 'Pet size could not be saved.'; } finally { pending = ''; } }
  onMount(load);
</script>

<section class="pet-settings" aria-labelledby="pet-settings-heading"><header><div><h2 id="pet-settings-heading">Pet</h2><p>Choose the profile mascot that reacts to Hermes activity.</p></div><Button size="sm" variant="ghost" disabled={loading} onclick={load}><RefreshCw data-icon="inline-start" />Refresh</Button></header>
  {#if error}<div class="pet-message error" role="alert"><CircleAlert />{error}</div>{/if}{#if notice}<div class="pet-message" role="status">{notice}</div>{/if}
  {#if loading}<div class="pet-loading"><Skeleton class="h-12 w-full" /><Skeleton class="h-56 w-full" /></div>
  {:else if !gallery?.available}<div class="pet-empty"><PawPrint /><span>Pets are unavailable on this Hermes gateway.</span></div>
  {:else}<div class="pet-controls"><label><span><strong>Show pet</strong><small>Display the selected mascot in Companion.</small></span><Switch checked={gallery.enabled} disabled={Boolean(pending)} onCheckedChange={toggle} aria-label="Show pet" /></label><label><span><strong>Size</strong><small>{Math.round(scale * 100)}%</small></span><input type="range" min="0.1" max="3" step="0.01" bind:value={scale} onchange={saveScale} aria-label="Pet size" /></label></div>
    <label class="pet-search"><Search /><span class="visually-hidden">Search pets</span><Input type="search" placeholder="Search pets…" bind:value={search} /></label>
    <div class="pet-grid">{#each pets as pet (pet.slug)}<button type="button" class:active={gallery.enabled && gallery.active === pet.slug} disabled={Boolean(pending)} onclick={() => void select(pet.slug)}><span class="pet-mark"><PawPrint /></span><span><strong>{pet.displayName}</strong><small>{pet.slug}{pet.installed ? ' · installed' : ''}</small></span>{#if pet.generated}<em>Generated</em>{/if}</button>{/each}</div>
    {#if !pets.length}<p class="pet-empty">No pets match “{search}”.</p>{/if}
  {/if}
</section>

<style>
  .pet-settings { display: grid; gap: .7rem; } .pet-settings > header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; } h2, p { margin: 0; } h2 { font-size: var(--type-body); font-weight: 620; } header p { margin-block-start: .15rem; color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); }
  .pet-message { display: flex; align-items: center; gap: .35rem; color: var(--status-positive); font-size: var(--type-status); } .pet-message.error { color: var(--status-negative); } .pet-message :global(svg) { inline-size: .8rem; } .pet-loading { display: grid; gap: .5rem; }
  .pet-controls { display: grid; gap: 1px; border-radius: var(--radius); overflow: hidden; } .pet-controls label { display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: var(--surface-subtle); padding: .7rem .8rem; } .pet-controls span { display: grid; } .pet-controls strong { font-size: var(--type-caption); font-weight: 590; } .pet-controls small { color: var(--muted-foreground); font-size: var(--type-status); } .pet-controls input[type='range'] { inline-size: min(14rem, 45%); accent-color: var(--primary); }
  .pet-search { position: relative; display: flex; align-items: center; } .pet-search > :global(svg) { position: absolute; inset-inline-start: .6rem; z-index: 1; inline-size: .8rem; color: var(--muted-foreground); pointer-events: none; } .pet-search :global(input) { padding-inline-start: 1.8rem; }
  .pet-grid { max-block-size: 18rem; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; overflow: auto; } .pet-grid button { min-inline-size: 0; display: flex; align-items: center; gap: .55rem; border: 0; border-radius: calc(var(--radius) * .8); background: transparent; color: var(--foreground); padding: .55rem; text-align: start; } .pet-grid button:is(:hover, :focus-visible, .active) { background: var(--surface-selected); } .pet-grid button:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; } .pet-grid button > span:nth-child(2) { min-inline-size: 0; display: grid; flex: 1; } .pet-grid strong, .pet-grid small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .pet-grid strong { font-size: var(--type-caption); font-weight: 580; } .pet-grid small { color: var(--muted-foreground); font-size: var(--type-status); } .pet-grid em { color: var(--primary); font-size: var(--type-status); font-style: normal; } .pet-mark { display: grid; place-items: center; inline-size: 1.65rem; block-size: 1.65rem; flex: none; border-radius: .5rem; background: var(--surface-raised); color: var(--muted-foreground); } .pet-mark :global(svg) { inline-size: .8rem; }
  .pet-empty { display: flex; align-items: center; justify-content: center; gap: .35rem; min-block-size: 5rem; color: var(--muted-foreground); font-size: var(--type-caption); } .pet-empty :global(svg) { inline-size: .9rem; }
  @container settings-page (max-width: 42rem) { .pet-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } } @container settings-page (max-width: 28rem) { .pet-grid { grid-template-columns: 1fr; } }
</style>
