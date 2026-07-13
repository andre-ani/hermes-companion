<script lang="ts">
	import { cn } from "$lib/utils";
	import { CollapsibleContent } from "$lib/components/ui/collapsible/index.js";
	import Response from "$lib/components/ai-elements/response/response.svelte";

	interface Props {
		class?: string;
		content: string;
	}

	let { class: className = "", content, ...props }: Props = $props();
</script>

<CollapsibleContent
	class={cn(
		"reasoning-detail mt-3 outline-none",
		className
	)}
	{...props}
>
	<Response class="grid gap-2" {content} />
</CollapsibleContent>

<style>
	:global(.reasoning-detail) { block-size: var(--bits-collapsible-content-height); overflow: clip; color: var(--muted-foreground); font-family: var(--font-ui); font-size: var(--type-status); font-size-adjust: from-font; line-height: 1.55; opacity: 1; translate: 0; transition: block-size var(--motion-layout) var(--ease-emphasized), margin-block-start var(--motion-layout) var(--ease-emphasized), opacity var(--motion-enter) var(--ease-standard), translate var(--motion-enter) var(--ease-standard); }
	:global(.reasoning-detail[data-state='closed']) { block-size: 0; margin-block-start: 0; opacity: 0; translate: 0 -0.15rem; }
	:global(.reasoning-detail .prose-copy), :global(.reasoning-detail p), :global(.reasoning-detail li), :global(.reasoning-detail blockquote), :global(.reasoning-detail h1), :global(.reasoning-detail h2), :global(.reasoning-detail h3), :global(.reasoning-detail h4) { color: inherit; font-family: inherit; font-size: inherit; line-height: inherit; }
	@media (prefers-reduced-motion: reduce) { :global(.reasoning-detail) { translate: 0; transition-duration: var(--motion-fast); } }
</style>
