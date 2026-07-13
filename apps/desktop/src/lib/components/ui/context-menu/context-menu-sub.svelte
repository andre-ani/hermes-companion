<script lang="ts">
  import { ContextMenu as Primitive } from 'bits-ui';
  let { open = $bindable(false), ...restProps }: Primitive.SubProps = $props();
</script>
<Primitive.Sub bind:open {...restProps} />
