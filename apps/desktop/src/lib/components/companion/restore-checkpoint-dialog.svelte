<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  let { open = $bindable(false), prompt = '', pending = false, onrestore }: { open?: boolean; prompt?: string; pending?: boolean; onrestore: () => void } = $props();
</script>
<Dialog.Root bind:open><Dialog.Content class="sm:max-w-md"><Dialog.Header><Dialog.Title>Restore to this prompt?</Dialog.Title><Dialog.Description>Hermes will discard the conversation after this point and run the prompt again. Files are restored only when a matching filesystem checkpoint exists.</Dialog.Description></Dialog.Header><blockquote>{prompt}</blockquote><Dialog.Footer><Button variant="ghost" disabled={pending} onclick={() => open = false}>Cancel</Button><Button disabled={pending} onclick={onrestore}>Restore and rerun</Button></Dialog.Footer></Dialog.Content></Dialog.Root>
<style>blockquote { max-block-size: 8rem; margin: 0; overflow: auto; border-radius: var(--radius); background: var(--surface-subtle); padding: .7rem; color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); line-height: 1.5; }</style>
