<script lang="ts">
  import type { MessageInference } from '@hermes-companion/contracts';
  import { ArrowRight } from '@lucide/svelte';
  import { modelProvenancePresentation } from '$lib/model-provenance';
  import ModelProviderMark from './model-provider-mark.svelte';

  let { inference }: { inference: MessageInference } = $props();
  const presentation = $derived(modelProvenancePresentation(inference));
</script>

<span class="model-provenance" title={presentation.detail} aria-label={presentation.detail}>
  {#if presentation.route}
    <span class="route-provider">
      <ModelProviderMark modelId={presentation.route.id} provider={presentation.route.provider} label={`${presentation.route.name} routing provider`} />
      <span>{presentation.route.name}</span>
    </span>
    <ArrowRight class="route-arrow" aria-hidden="true" />
  {/if}
  <span class="effective-model">
    <ModelProviderMark modelId={presentation.effective.id} provider={presentation.effective.provider} label={`${presentation.effective.name} model provider`} />
    <span>{presentation.effective.name}</span>
  </span>
</span>

<style>
  .model-provenance,
  .route-provider,
  .effective-model {
    min-inline-size: 0;
    display: inline-flex;
    align-items: center;
  }
  .model-provenance { gap: .26rem; font-weight: 500; }
  .route-provider,
  .effective-model { gap: .25rem; }
  .route-provider { flex: none; color: color-mix(in oklab, var(--muted-foreground), transparent 12%); }
  .effective-model > span,
  .route-provider > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.route-arrow) { inline-size: .68rem; block-size: .68rem; flex: none; color: var(--icon-muted); }
</style>
