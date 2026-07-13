<script lang="ts">
	import { ContextMenu as Primitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	let { ref = $bindable(null), sideOffset = 6, class: className, ...restProps }: Primitive.ContentProps = $props();
</script>
<Primitive.Portal>
	<Primitive.Content bind:ref data-slot="context-menu-content" {sideOffset} class={cn("data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 bg-popover text-popover-foreground z-50 min-w-44 overflow-hidden rounded-lg p-1 shadow-md ring-1 duration-100 outline-none", className)} {...restProps} />
</Primitive.Portal>
