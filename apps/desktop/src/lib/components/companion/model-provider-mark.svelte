<script lang="ts">
  import { modelProviderFromId } from '$lib/model-identity';
  import { providerIcon } from '$lib/provider-icon-catalog';
  import { Bot } from '@lucide/svelte';

  let {
    modelId = null,
    provider = null,
    label = 'Model provider'
  }: {
    modelId?: string | null;
    provider?: string | null;
    label?: string;
  } = $props();

  let failed = $state(false);
  const resolvedProvider = $derived(modelProviderFromId(modelId, provider));
  const icon = $derived(providerIcon(resolvedProvider));

  $effect(() => {
    resolvedProvider;
    failed = false;
  });
</script>

<span class="provider-mark" title={label} aria-label={label}>
  {#if failed || resolvedProvider === 'hermes' || !icon}
    <Bot aria-hidden="true" />
  {:else}
    <img src={icon} alt="" aria-hidden="true" onerror={() => (failed = true)} />
  {/if}
</span>

<style>
  .provider-mark { inline-size: .9rem; block-size: .9rem; flex: none; display: inline-grid; place-items: center; color: var(--icon-muted); }
  .provider-mark :global(img), .provider-mark :global(svg) { inline-size: .78rem; block-size: .78rem; object-fit: contain; }
  .provider-mark :global(img) { filter: var(--icon-image-muted-filter); }
</style>
