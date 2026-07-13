<script lang="ts">
	import { cn } from "$lib/utils";
	import { CollapsibleTrigger } from "$lib/components/ui/collapsible/index.js";
	import { getReasoningContext } from "./reasoning-context.svelte.js";
	import BrainIcon from "@lucide/svelte/icons/brain";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

	interface Props {
		class?: string;
		children?: import("svelte").Snippet;
		status?: string | null;
	}

	let { class: className = "", children, status = null, ...props }: Props = $props();

	let reasoningContext = getReasoningContext();

	let getThinkingMessage = $derived.by(() => {
		let { isStreaming, duration } = reasoningContext;

		if (isStreaming || duration === 0) {
			return status?.trim() || "Thinking...";
		}
		if (duration === undefined) {
			return "Thought for a few seconds";
		}
		return `Thought for ${duration} seconds`;
	});
</script>

<CollapsibleTrigger
	class={cn(
		"reasoning-trigger text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 font-medium transition-colors",
		className
	)}
	{...props}
>
	{#if children}
		{@render children()}
	{:else}
		<BrainIcon class="size-3.5" />
		<p>{getThinkingMessage}</p>
		<ChevronDownIcon
			class={cn(
				"size-3.5 transition-transform",
				reasoningContext.isOpen ? "rotate-180" : "rotate-0"
			)}
		/>
	{/if}
</CollapsibleTrigger>

<style>
	:global(.reasoning-trigger) { font-family: var(--font-ui); font-size: var(--type-status); font-size-adjust: from-font; }
</style>
