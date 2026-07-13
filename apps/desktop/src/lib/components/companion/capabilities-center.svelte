<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs';
  import OperationsCenter from './operations-center.svelte';
  import SkillHub from './skill-hub.svelte';

  let tab = $state<'skills' | 'toolsets' | 'mcp' | 'hub'>('skills');
</script>

<section class="capabilities-center" aria-label="Hermes capabilities">
  <div class="capability-tabs"><Tabs.Root bind:value={tab}>
    <div class="capability-tabbar"><Tabs.List><Tabs.Trigger value="skills">Skills</Tabs.Trigger><Tabs.Trigger value="toolsets">Tools</Tabs.Trigger><Tabs.Trigger value="mcp">MCP</Tabs.Trigger><Tabs.Trigger value="hub">Browse Hub</Tabs.Trigger></Tabs.List></div>
    <Tabs.Content value="skills"><OperationsCenter family="skills" embedded /></Tabs.Content>
    <Tabs.Content value="toolsets"><OperationsCenter family="toolsets" embedded /></Tabs.Content>
    <Tabs.Content value="mcp"><OperationsCenter family="mcp" embedded /></Tabs.Content>
    <Tabs.Content value="hub"><SkillHub /></Tabs.Content>
  </Tabs.Root></div>
</section>

<style>
  .capabilities-center, .capability-tabs { min-inline-size: 0; min-block-size: 0; block-size: 100%; }
  .capability-tabs { display: grid; grid-template-rows: auto minmax(0, 1fr); }
  .capability-tabbar { position: absolute; inset-block-start: .36rem; inset-inline-start: 50%; z-index: 3; max-inline-size: calc(100% - 22rem); translate: -50% 0; }
  .capability-tabbar :global([data-slot='tabs-list']) { max-inline-size: 100%; overflow-x: auto; background: transparent; }
  .capability-tabbar :global([data-slot='tabs-trigger']) { flex: none; font-size: var(--type-menu); }
  .capability-tabs :global([data-slot='tabs-content']) { min-inline-size: 0; min-block-size: 0; overflow: hidden; }
  .capability-tabs :global([data-slot='tabs-content'] > .operations) { block-size: 100%; }
</style>
