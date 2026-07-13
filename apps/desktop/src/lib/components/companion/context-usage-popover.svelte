<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import type { ContextUsage, ContextUsageCategory } from '@hermes-companion/contracts';

  type CategoryView = ContextUsageCategory & { resolvedColor: string };

  const pinnedContextHues: Array<{ terms: string[]; hue: number | null }> = [
    { terms: ['system prompt', 'system'], hue: null },
    { terms: ['summarized conversation', 'summary'], hue: 350 },
    { terms: ['mcp', 'dynamic tools'], hue: 325 },
    { terms: ['tool definition', 'tool output', 'tools'], hue: 295 },
    { terms: ['rules', 'rule'], hue: 145 },
    { terms: ['skills', 'skill'], hue: 82 },
    { terms: ['subagent', 'agent definition'], hue: 255 },
    { terms: ['memory'], hue: 35 },
    { terms: ['conversation'], hue: 195 }
  ];

  let { id, usage = null, reason = null, compact = false, trigger = 'radial' }: { id: string; usage?: ContextUsage | null; reason?: string | null; compact?: boolean; trigger?: 'radial' | 'status' } = $props();
  const hasUsage = $derived(Boolean(usage && usage.contextMax > 0 && usage.contextUsed <= usage.contextMax));
  const percent = $derived(usage ? Math.round(usage.contextPercent) : 0);
  const usageLabel = $derived(usage ? `${formatTokens(usage.contextUsed)} / ${formatTokens(usage.contextMax)}` : 'Context unavailable');
  const categoryViews = $derived(colorizeCategories(usage?.categories ?? []));
  const representedTokens = $derived(categoryViews.reduce((total, category) => total + category.tokens, 0));
  const unallocatedTokens = $derived(Math.max(0, (usage?.contextUsed ?? 0) - representedTokens));
  const reportCategories = $derived.by((): CategoryView[] => unallocatedTokens > 0
    ? [...categoryViews, { id: 'other-context', label: 'Other context', tokens: unallocatedTokens, resolvedColor: 'var(--context-neutral)' }]
    : categoryViews);
  const radialTone = $derived(percent >= 90 ? 'var(--status-negative)' : percent >= 75 ? 'var(--status-warning)' : 'var(--primary)');

  function formatTokens(value: number) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  function normalizedCategory(category: ContextUsageCategory) {
    return `${category.id} ${category.label}`.toLocaleLowerCase().replace(/[_-]+/g, ' ');
  }

  function pinnedHue(category: ContextUsageCategory) {
    const normalized = normalizedCategory(category);
    return pinnedContextHues.find((entry) => entry.terms.some((term) => normalized.includes(term)))?.hue;
  }

  function stableHash(value: string) {
    let hash = 2166136261;
    for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return hash >>> 0;
  }

  function hueDistance(left: number, right: number) {
    const distance = Math.abs(left - right) % 360;
    return Math.min(distance, 360 - distance);
  }

  function colorForHue(hue: number) {
    return `oklch(var(--context-color-lightness) var(--context-color-chroma) ${Math.round(hue)})`;
  }

  function colorizeCategories(categories: ContextUsageCategory[]): CategoryView[] {
    const occupiedHues = pinnedContextHues.map((entry) => entry.hue).filter((hue): hue is number => typeof hue === 'number');
    const generated = new Map<string, number>();
    const unknown = categories.filter((category) => category.color === undefined && pinnedHue(category) === undefined).toSorted((a, b) => a.id.localeCompare(b.id));
    for (const category of unknown) {
      let hue = stableHash(category.id) % 360;
      for (let attempt = 0; attempt < 24 && occupiedHues.some((occupied) => hueDistance(hue, occupied) < 26); attempt += 1) hue = (hue + 137.508) % 360;
      occupiedHues.push(hue); generated.set(category.id, hue);
    }
    return categories.map((category) => {
      const pinned = pinnedHue(category);
      const resolvedColor = category.color?.trim() || (pinned === null ? 'var(--context-neutral)' : colorForHue(pinned ?? generated.get(category.id) ?? 210));
      return { ...category, resolvedColor };
    });
  }
</script>

{#if hasUsage && usage}
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button {...props} class={trigger === 'status' ? 'context-trigger status-context-trigger' : 'context-trigger'} style={trigger === 'status' ? `--radial-tone: ${radialTone};` : undefined} type="button" size={compact ? 'xs' : 'sm'} variant="ghost" aria-label={`Session context: ${usageLabel}, ${percent}% used`} title="Show Hermes context usage">
          {#if trigger === 'status'}
            <span class="status-context-value">{formatTokens(usage.contextUsed)}/{formatTokens(usage.contextMax)}</span>
            <span class="status-context-meter" aria-hidden="true"><span style={`inline-size: ${Math.min(percent, 100)}%;`}></span></span>
            <span class="status-context-percent">{percent}%</span>
          {:else}
            <svg class="context-radial" viewBox="0 0 20 20" aria-hidden="true" style={`--radial-tone: ${radialTone}; --radial-offset: ${100 - Math.min(percent, 100)};`}>
              <circle class="radial-track" cx="10" cy="10" r="7.5" pathLength="100"></circle>
              <circle class="radial-value" cx="10" cy="10" r="7.5" pathLength="100"></circle>
            </svg>
          {/if}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content {id} class="context-popover" side="top" align="end" sideOffset={8} collisionPadding={8} aria-label="Hermes context usage">
      <section class="context-popover-body">
      <header>
        <strong>Context usage</strong>
        <span>~{formatTokens(usage.estimatedTotal || usage.contextUsed)} / {formatTokens(usage.contextMax)} tokens</span>
      </header>
      <div class="context-summary"><strong>{percent}% full</strong><div class="context-allocation" role="img" aria-label={`${percent}% of context used across ${reportCategories.length} categories`}>{#each reportCategories as category (category.id)}<span title={`${category.label}: ${formatTokens(category.tokens)} tokens`} style={`--context-color: ${category.resolvedColor}; inline-size: max(2px, ${(category.tokens / usage.contextMax) * 100}%);`}></span>{/each}<span class="context-remaining" aria-hidden="true"></span></div></div>
      {#if reportCategories.length}
        <ol aria-label="Hermes-provided context allocation categories">
          {#each reportCategories as category (category.id)}
            <li style={`--context-color: ${category.resolvedColor};`}><span class="context-swatch" aria-hidden="true"></span><span>{category.label}</span><strong>{formatTokens(category.tokens)}</strong></li>
          {/each}
        </ol>
      {/if}
      <footer><span>{usage.model || 'Current model'}</span><span>{formatTokens(usage.contextUsed)} tokens currently loaded</span></footer>
      </section>
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  .context-radial { inline-size: .85rem !important; block-size: .85rem !important; overflow: visible; transform: rotate(-90deg); }
  :global(.context-trigger) { border-radius: 50%; background: transparent; transition: opacity var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard); }
  :global(.context-trigger:hover:not(:disabled)) { background: color-mix(in oklab, var(--foreground), transparent 94%); opacity: .88; }
  :global(.context-trigger:focus-visible) { background: color-mix(in oklab, var(--foreground), transparent 94%); }
  :global(.status-context-trigger) { min-inline-size: 0; display: inline-flex; gap: .28rem; padding-inline: .42rem; font-family: var(--font-mono); font-size: .6rem; font-variant-numeric: tabular-nums; }
  .status-context-value, .status-context-percent { flex: none; white-space: nowrap; }
  .status-context-meter { inline-size: clamp(2rem, 5cqi, 3.25rem); block-size: .23rem; overflow: hidden; border-radius: 999px; background: var(--muted); }
  .status-context-meter > span { display: block; block-size: 100%; border-radius: inherit; background: var(--radial-tone); }
  .context-radial circle { fill: none; stroke-width: 3; }
  .radial-track { stroke: var(--muted); }
  .radial-value { stroke: var(--radial-tone); stroke-dasharray: 100; stroke-dashoffset: var(--radial-offset); stroke-linecap: round; transition: stroke-dashoffset var(--motion-layout) var(--ease-standard), stroke var(--motion-fast) var(--ease-standard); }
  :global(.context-popover) { inline-size: min(22rem, calc(100dvi - 1.5rem)); gap: 0; border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.1); background: var(--surface-overlay); color: var(--foreground); padding: 0; box-shadow: 0 1.25rem 3rem oklch(0 0 0 / 35%); }
  .context-popover-body { inline-size: 100%; }
  .context-popover-body > header { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; padding: .8rem .85rem .45rem; } .context-popover-body header strong { font-family: var(--font-ui); font-size: .84rem; font-weight: 620; } .context-popover-body > header > span { color: var(--muted-foreground); font-family: var(--font-mono); font-size: .67rem; white-space: nowrap; }
  .context-summary { display: grid; gap: .55rem; padding: .45rem .85rem .7rem; } .context-summary > strong { font-family: var(--font-ui); font-size: .72rem; font-weight: 520; }
  .context-allocation { block-size: .42rem; display: flex; gap: 2px; overflow: hidden; border-radius: 99px; background: var(--muted); }
  .context-allocation > span:not(.context-remaining) { min-inline-size: 2px; flex: none; background: var(--context-color); }
  .context-remaining { min-inline-size: 0; flex: 1; background: var(--muted); }
  ol { display: grid; gap: .08rem; max-block-size: 14rem; overflow: auto; margin: 0; border-block-start: 1px solid var(--border); padding: .55rem .85rem; list-style: none; scrollbar-gutter: stable; } li { min-inline-size: 0; min-block-size: 1.75rem; display: grid; grid-template-columns: .72rem minmax(0, 1fr) auto; align-items: center; gap: .55rem; color: var(--muted-foreground); font-family: var(--font-ui); font-size: .72rem; } li > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } li strong { color: var(--foreground); font-family: var(--font-mono); font-size: .69rem; font-weight: 500; }
  .context-swatch { inline-size: .68rem; block-size: .68rem; border-radius: .18rem; background: var(--context-color); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--context-color), var(--foreground) 18%); }
  footer { display: flex; justify-content: space-between; gap: .75rem; border-block-start: 1px solid var(--border); padding: .5rem .85rem; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .62rem; } footer span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
