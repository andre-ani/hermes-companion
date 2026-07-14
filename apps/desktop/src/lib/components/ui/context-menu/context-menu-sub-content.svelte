<script lang="ts">
  import { ContextMenu as Primitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';
  let { ref = $bindable(null), class: className, ...restProps }: Primitive.SubContentProps = $props();
</script>
<Primitive.SubContent bind:ref data-slot="context-menu-sub-content" class={cn('data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 bg-popover text-popover-foreground min-w-[96px] rounded-lg p-1 shadow-lg ring-1 ring-foreground/10 [animation-duration:var(--motion-fast)]', className)} {...restProps} />
