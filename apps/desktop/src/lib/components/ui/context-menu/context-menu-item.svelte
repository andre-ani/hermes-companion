<script lang="ts">
	import { ContextMenu as Primitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	let { ref = $bindable(null), class: className, variant = 'default', ...restProps }: Primitive.ItemProps & { variant?: 'default' | 'destructive' } = $props();
</script>
<Primitive.Item bind:ref data-slot="context-menu-item" data-variant={variant} class={cn("focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 gap-1.5 rounded-md px-1.5 py-1 text-[length:var(--type-menu)] [&_svg:not([class*='size-'])]:size-3.5 relative flex cursor-default items-center outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} {...restProps} />
