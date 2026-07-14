<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs';
  import OperationsCenter from './operations-center.svelte';
  import SkillHub from './skill-hub.svelte';

  let tab = $state<'skills' | 'toolsets' | 'mcp' | 'hub'>('skills');
</script>

<section class="capabilities-center" aria-label="Hermes capabilities">
  <div class="capability-tabs"><Tabs.Root bind:value={tab} class="capability-tabs-root">
    <div class="capability-tabbar"><Tabs.List><Tabs.Trigger value="skills">Skills</Tabs.Trigger><Tabs.Trigger value="toolsets">Tools</Tabs.Trigger><Tabs.Trigger value="mcp">MCP</Tabs.Trigger><Tabs.Trigger value="hub">Browse Hub</Tabs.Trigger></Tabs.List></div>
    <Tabs.Content value="skills"><OperationsCenter family="skills" embedded /></Tabs.Content>
    <Tabs.Content value="toolsets"><OperationsCenter family="toolsets" embedded /></Tabs.Content>
    <Tabs.Content value="mcp"><OperationsCenter family="mcp" embedded /></Tabs.Content>
    <Tabs.Content value="hub"><SkillHub /></Tabs.Content>
  </Tabs.Root></div>
</section>

<style>
  .capabilities-center, .capability-tabs, :global(.capability-tabs-root) { min-inline-size: 0; min-block-size: 0; block-size: 100%; }
  :global(.capability-tabs-root) { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 0; }
  .capability-tabbar { min-inline-size: 0; min-block-size: 2.55rem; display: flex; align-items: center; justify-content: center; padding: .28rem clamp(.65rem, 2cqi, 1rem); border-block-end: 1px solid var(--border); background: var(--surface-base); }
  .capability-tabbar :global([data-slot='tabs-list']) { max-inline-size: 100%; overflow-x: auto; background: transparent; }
  .capability-tabbar :global([data-slot='tabs-trigger']) { flex: none; font-size: var(--type-menu); }
  .capability-tabs :global([data-slot='tabs-content']) { min-inline-size: 0; min-block-size: 0; overflow: auto; }
  .capability-tabs :global([data-slot='tabs-content'] > .operations) { block-size: 100%; }
</style>
