<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  let {
    id,
    label,
    count,
    expanded = true,
    controls,
    children,
    ontoggle
  }: {
    id: string;
    label: string;
    count: number;
    expanded?: boolean;
    controls?: Snippet;
    children: Snippet;
    ontoggle?: () => void;
  } = $props();

  const contentId = $derived(`${id}-category-content`);
</script>

<section class="sidebar-category" data-expanded={expanded}>
  <header class="category-row">
    <button type="button" class="category-disclosure" aria-expanded={expanded} aria-controls={contentId} onclick={ontoggle}>
      <span class="category-title">{label}</span>
      <span class="category-count">{count}</span>
      <ChevronDown class="category-chevron" aria-hidden="true" />
    </button>
    {#if controls}<div class="category-controls">{@render controls()}</div>{/if}
  </header>
  <div id={contentId} class="category-content" data-expanded={expanded} aria-hidden={!expanded} inert={!expanded || undefined}>
    <div>{@render children()}</div>
  </div>
</section>

<style>
  .sidebar-category { min-inline-size: 0; }
  .category-row { min-block-size: 2rem; display: flex; align-items: center; gap: .25rem; padding-inline: .4rem .1rem; color: var(--muted-foreground); }
  .category-disclosure { min-inline-size: 0; align-self: stretch; display: flex; flex: 1; align-items: center; gap: .34rem; border: 0; border-radius: calc(var(--radius) * .55); background: transparent; padding: 0 .15rem 0 0; color: inherit; text-align: start; }
  .category-disclosure:hover, .category-disclosure:focus-visible { color: var(--foreground); }
  .category-title { overflow: hidden; font-family: var(--font-ui); font-size: var(--type-caption); font-weight: 560; letter-spacing: .075em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .category-count { flex: none; color: var(--muted-foreground); font-family: var(--font-ui); font-size: var(--type-caption); font-variant-numeric: tabular-nums; }
  :global(.category-chevron) { inline-size: .72rem; block-size: .72rem; flex: none; opacity: 0; transform: rotate(0deg); transition: opacity var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard); }
  .category-row:hover :global(.category-chevron), .category-row:focus-within :global(.category-chevron) { opacity: 1; }
  .sidebar-category[data-expanded='false'] :global(.category-chevron) { transform: rotate(-90deg); }
  .category-controls { flex: none; display: flex; align-items: center; gap: .05rem; }
  .category-content { min-block-size: 0; display: grid; grid-template-rows: minmax(0, 1fr); opacity: 1; transition: grid-template-rows var(--motion-layout) var(--ease-standard), opacity var(--motion-enter) var(--ease-standard); }
  .category-content[data-expanded='false'] { grid-template-rows: minmax(0, 0fr); opacity: 0; }
  .category-content > div { min-block-size: 0; overflow: hidden; }
</style>
