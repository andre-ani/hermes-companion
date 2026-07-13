<script lang="ts">
  import { tick } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { CircleAlert, Info, X } from '@lucide/svelte';

  let { message = '', tone = 'negative', ondismiss }: {
    message?: string;
    tone?: 'negative' | 'info';
    ondismiss: () => void;
  } = $props();

  let notice: HTMLElement;

  $effect(() => {
    const visible = Boolean(message);
    void (async () => {
      await tick();
      if (!notice) return;
      if (visible && !notice.matches(':popover-open')) notice.showPopover();
      if (!visible && notice.matches(':popover-open')) notice.hidePopover();
    })();
  });
</script>

<aside bind:this={notice} class="app-notification" data-tone={tone} popover="manual" role="alert" aria-live="assertive">
  {#if tone === 'negative'}<CircleAlert aria-hidden="true" />{:else}<Info aria-hidden="true" />{/if}
  <p>{message}</p>
  <Button size="icon-xs" variant="ghost" onclick={ondismiss} aria-label="Dismiss notification" title="Dismiss"><X /></Button>
</aside>

<style>
  .app-notification {
    position: fixed;
    inset: auto;
    inset-block-start: calc(var(--shell-titlebar-height) + .65rem);
    inset-inline-start: 50%;
    z-index: 200;
    inline-size: min(28rem, calc(100dvi - 2rem));
    display: none;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: .55rem;
    margin: 0;
    border: 1px solid color-mix(in oklab, var(--status-negative), transparent 52%);
    border-radius: calc(var(--radius) * .9);
    background: color-mix(in oklab, var(--surface-overlay) 94%, var(--status-negative) 6%);
    box-shadow: 0 .9rem 2.6rem oklch(0 0 0 / 26%);
    padding: .48rem .5rem .48rem .65rem;
    color: var(--foreground);
    opacity: 0;
    translate: -50% -.4rem;
    backdrop-filter: blur(18px);
    transition: opacity var(--motion-enter) var(--ease-standard), translate var(--motion-enter) var(--ease-standard), display var(--motion-enter) allow-discrete, overlay var(--motion-enter) allow-discrete;
  }
  .app-notification:popover-open { display: grid; opacity: 1; translate: -50% 0; }
  .app-notification[data-tone='info'] { border-color: color-mix(in oklab, var(--status-info), transparent 52%); background: color-mix(in oklab, var(--surface-overlay) 94%, var(--status-info) 6%); }
  .app-notification > :global(svg) { inline-size: .85rem; color: var(--status-negative); }
  .app-notification[data-tone='info'] > :global(svg) { color: var(--status-info); }
  p { min-inline-size: 0; margin: 0; overflow-wrap: anywhere; font-family: var(--font-body); font-size: .69rem; line-height: 1.4; }
  @starting-style { .app-notification:popover-open { opacity: 0; translate: -50% -.4rem; } }
  @media (prefers-reduced-motion: reduce) { .app-notification { translate: -50% 0; transition-duration: 0ms; } }
</style>
