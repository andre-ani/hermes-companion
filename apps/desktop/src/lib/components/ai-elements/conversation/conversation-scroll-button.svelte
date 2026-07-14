<script lang="ts" module>
	import { cn } from "$lib/utils";
	import type { ButtonProps } from "$lib/components/ui/button/index.js";

	export interface ConversationScrollButtonProps extends ButtonProps {}
</script>

<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import ArrowDown from "@lucide/svelte/icons/arrow-down";
	import { getStickToBottomContext } from "./stick-to-bottom-context.svelte.js";
	import { fly } from "svelte/transition";
	import { backOut } from "svelte/easing";
	import { onMount } from "svelte";

	let { class: className, onclick, ...restProps }: ConversationScrollButtonProps = $props();

	const context = getStickToBottomContext();
	let reducedMotion = $state(false);
	onMount(() => {
		reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
	});

	const handleScrollToBottom = (event: MouseEvent) => {
		context.scrollToBottom();
		if (onclick) {
			onclick(
				event as MouseEvent & {
					currentTarget: EventTarget & HTMLButtonElement;
				}
			);
		}
	};
</script>

{#if !context.isAtBottom}
	<div
		in:fly={{
			duration: reducedMotion ? 0 : 180,
			y: 10,
			easing: backOut,
		}}
		out:fly={{
			duration: reducedMotion ? 0 : 120,
			y: 10,
			easing: backOut,
		}}
		class="absolute bottom-4 left-[50%] translate-x-[-50%]"
	>
		<Button
			aria-label="Jump to latest message"
			class={cn(
				"bg-background/80 border-border/50 hover:bg-background/90 rounded-full shadow-lg backdrop-blur-sm hover:shadow-xl",
				className
			)}
			onclick={handleScrollToBottom}
			size="icon"
			type="button"
			variant="outline"
			{...restProps}
		>
			<ArrowDown class="size-4" />
		</Button>
	</div>
{/if}
