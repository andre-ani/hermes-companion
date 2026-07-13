<script lang="ts">
  import { ContextMenu as Primitive } from 'bits-ui';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { cn } from '$lib/utils.js';
  let { ref = $bindable(null), class: className, inset, children, ...restProps }: Primitive.SubTriggerProps & { inset?: boolean } = $props();
</script>
<Primitive.SubTrigger bind:ref data-slot="context-menu-sub-trigger" data-inset={inset} class={cn('focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground gap-1.5 rounded-md px-1.5 py-1 text-[length:var(--type-menu)] data-inset:pl-7 [&_svg:not([class*=size-])]:size-3.5 flex cursor-default items-center outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0', className)} {...restProps}>
  {@render children?.()}<ChevronRight class="ml-auto" />
</Primitive.SubTrigger>
