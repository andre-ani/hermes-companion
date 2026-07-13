<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils";
	import type { HTMLAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";

	export interface ConversationContentProps extends WithElementRef<
		HTMLAttributes<HTMLDivElement>
	> {
		children?: Snippet;
	}
</script>

<script lang="ts">
	import { getStickToBottomContext } from "./stick-to-bottom-context.svelte.js";
	import { watch } from "runed";

	let {
		class: className,
		children,
		ref = $bindable(null),
		...restProps
	}: ConversationContentProps = $props();

	const context = getStickToBottomContext();
	let element: HTMLDivElement;

	watch(
		() => element,
		() => {
			if (element) {
				context.setElement(element);
				// Initial scroll to bottom
				context.scrollToBottom("smooth");
			}
		}
	);
</script>

<div
	bind:this={element}
	bind:this={ref}
	class={cn("min-h-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain flex flex-col gap-8 p-4", className)}
	{...restProps}
>
	{@render children?.()}
</div>
