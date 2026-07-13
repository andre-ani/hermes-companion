<script lang="ts">
  import { onMount } from 'svelte';
  import { Archive, Brain, CircleAlert, Diamond, Pencil, RefreshCw, Search, Sparkles } from '@lucide/svelte';
  import type { HermesLearningGraph, HermesLearningNode } from '@hermes-companion/contracts';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { archiveHermesLearningNode, getHermesLearningGraph, getHermesLearningNode, updateHermesLearningNode } from '$lib/client/remote/learning.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';

  type NodeDetail = { ok?: boolean; content?: string; kind?: 'memory' | 'skill'; label?: string };
  type PositionedNode = HermesLearningNode & { x: number; y: number };

  let graph = $state<HermesLearningGraph | null>(null);
  let loading = $state(true);
  let pending = $state(false);
  let error = $state('');
  let notice = $state('');
  let search = $state('');
  let selectedId = $state('');
  let detail = $state<NodeDetail | null>(null);
  let draft = $state('');
  let editing = $state(false);

  const filteredNodes = $derived((graph?.nodes ?? []).filter((node) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || `${node.label} ${node.category} ${node.kind}`.toLocaleLowerCase().includes(query);
  }));
  const positions = $derived.by((): PositionedNode[] => {
    const nodes = filteredNodes;
    if (!nodes.length) return [];
    const centerX = 500, centerY = 310;
    return nodes.map((node, index) => {
      const ring = Math.floor(Math.sqrt(index));
      const ringStart = ring * ring;
      const ringCount = Math.max(1, (ring + 1) * (ring + 1) - ringStart);
      const angle = ((index - ringStart) / ringCount) * Math.PI * 2 - Math.PI / 2;
      const radius = ring === 0 ? 0 : Math.min(265, 72 + ring * 48);
      return { ...node, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
    });
  });
  const positionById = $derived(new Map(positions.map((node) => [node.id, node])));
  const visibleEdges = $derived((graph?.edges ?? []).map((edge) => ({ ...edge, sourceNode: positionById.get(edge.source), targetNode: positionById.get(edge.target) })).filter((edge) => edge.sourceNode && edge.targetNode));
  const selected = $derived((graph?.nodes ?? []).find((node) => node.id === selectedId) ?? null);

  async function load() {
    loading = true; error = '';
    try { graph = await resolveRemoteResult(getHermesLearningGraph({})); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes Learning could not be loaded.'; }
    finally { loading = false; }
  }

  async function selectNode(node: HermesLearningNode) {
    selectedId = node.id; detail = null; editing = false; error = '';
    try { detail = await resolveRemoteResult(getHermesLearningNode({ id: node.id })) as NodeDetail; draft = detail.content ?? ''; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Learning detail could not be loaded.'; }
  }

  async function saveNode() {
    if (!selected || pending) return; pending = true; error = '';
    try { await resolveRemoteResult(updateHermesLearningNode({ id: selected.id, content: draft })); notice = 'Learning updated.'; editing = false; await load(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Learning update failed.'; }
    finally { pending = false; }
  }

  async function archiveNode() {
    if (!selected || pending) return; pending = true; error = '';
    try { await resolveRemoteResult(archiveHermesLearningNode({ id: selected.id })); notice = 'Learning archived.'; selectedId = ''; detail = null; await load(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Learning archive failed.'; }
    finally { pending = false; }
  }

  onMount(load);
</script>

<section class="learning" aria-labelledby="learning-heading">
  <header>
    <div><span class="data-label">Hermes knowledge</span><h1 id="learning-heading">Learning</h1><p>Skills and memories learned by this profile over time.</p></div>
    <div class="actions"><label class="search"><Search /><span class="visually-hidden">Search learning</span><Input placeholder="Search learning…" bind:value={search} /></label><Button size="sm" variant="ghost" disabled={loading} onclick={load}><RefreshCw data-icon="inline-start" />Refresh</Button></div>
  </header>

  {#if error}<div class="message error" role="alert"><CircleAlert /><span>{error}</span><Button size="xs" variant="ghost" onclick={load}>Retry</Button></div>{/if}
  {#if notice}<div class="message" role="status">{notice}</div>{/if}

  {#if loading}
    <div class="loading"><Skeleton class="h-14 w-full" /><Skeleton class="h-96 w-full" /></div>
  {:else if !graph?.available}
    <div class="empty"><Brain /><h2>Learning unavailable</h2><p>{graph?.error ?? 'The connected Hermes profile does not expose the Learning graph.'}</p></div>
  {:else if !graph.nodes.length}
    <div class="empty"><Sparkles /><h2>Nothing learned yet</h2><p>Skills and durable memories appear after Hermes learns from real sessions.</p></div>
  {:else}
    <div class="workspace" class:has-detail={selected}>
      <figure class="map" aria-labelledby="map-caption">
        <svg viewBox="0 0 1000 620" aria-hidden="true"><g class="rings"><circle cx="500" cy="310" r="85" /><circle cx="500" cy="310" r="165" /><circle cx="500" cy="310" r="245" /></g><g class="edges">{#each visibleEdges as edge (`${edge.source}:${edge.target}`)}<line x1={edge.sourceNode?.x} y1={edge.sourceNode?.y} x2={edge.targetNode?.x} y2={edge.targetNode?.y} />{/each}</g></svg>
        <div class="nodes">{#each positions as node (node.id)}<button type="button" class="node" class:selected={node.id === selectedId} data-kind={node.kind} style={`--x:${node.x / 10}%;--y:${node.y / 6.2}%`} onclick={() => void selectNode(node)} aria-pressed={node.id === selectedId}><span class="mark">{#if node.kind === 'skill'}<Sparkles />{:else}<Diamond />{/if}</span><span>{node.label}</span>{#if node.useCount}<small>{node.useCount}</small>{/if}</button>{/each}</div>
        <figcaption id="map-caption"><span><Sparkles />Skill</span><span><Diamond />Memory</span><small>Center is older · outer rings are newer</small></figcaption>
      </figure>

      {#if selected}<aside class="detail" aria-labelledby="learning-detail-heading"><header><div><Badge variant="outline">{selected.kind}</Badge><h2 id="learning-detail-heading">{selected.label}</h2><p>{selected.category}{selected.createdBy ? ` · ${selected.createdBy}` : ''}</p></div></header>{#if detail}{#if editing}<label for="learning-content">Content</label><Textarea id="learning-content" rows={14} bind:value={draft} />{:else}<div class="detail-content">{detail.content || 'No additional content.'}</div>{/if}<div class="detail-actions">{#if editing}<Button size="sm" variant="ghost" onclick={() => { editing = false; draft = detail?.content ?? ''; }}>Cancel</Button><Button size="sm" disabled={pending} onclick={saveNode}>Save</Button>{:else}<Button size="sm" variant="ghost" onclick={() => editing = true}><Pencil data-icon="inline-start" />Edit</Button><Button size="sm" variant="ghost" disabled={pending} onclick={archiveNode}><Archive data-icon="inline-start" />Archive</Button>{/if}</div>{:else}<Skeleton class="h-48 w-full" />{/if}</aside>{/if}
    </div>
  {/if}
</section>

<style>
  .learning { min-block-size: 0; block-size: 100%; overflow: auto; padding: clamp(3.5rem, 7vh, 5rem) clamp(1rem, 3cqi, 2rem) 2rem; container: learning / inline-size; }
  .learning > header { inline-size: min(100%, 76rem); display: flex; align-items: start; justify-content: space-between; gap: 1rem; margin-inline: auto; } h1, h2, p { margin: 0; } h1 { margin-block-start: .15rem; font-size: 1.1rem; font-weight: 650; letter-spacing: -.02em; } header p { margin-block-start: .18rem; color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); }
  .actions { display: flex; align-items: center; gap: .3rem; } .search { position: relative; display: flex; align-items: center; } .search > :global(svg) { position: absolute; inset-inline-start: .55rem; z-index: 1; inline-size: .8rem; color: var(--muted-foreground); pointer-events: none; } .search :global(input) { inline-size: 13rem; padding-inline-start: 1.75rem; }
  .message, .loading { inline-size: min(100%, 76rem); margin: .8rem auto 0; } .message { display: flex; align-items: center; gap: .4rem; color: var(--status-positive); font-size: var(--type-status); } .message.error { color: var(--status-negative); } .message :global(svg) { inline-size: .8rem; } .message :global(button) { margin-inline-start: auto; } .loading { display: grid; gap: .6rem; }
  .empty { min-block-size: min(30rem, 62dvh); display: grid; place-content: center; justify-items: center; gap: .45rem; color: var(--muted-foreground); text-align: center; } .empty > :global(svg) { inline-size: 1.3rem; } .empty h2 { color: var(--foreground); font-size: var(--type-body); font-weight: 600; } .empty p { max-inline-size: 44ch; font-family: var(--font-body); font-size: var(--type-caption); line-height: 1.5; }
  .workspace { inline-size: min(100%, 76rem); min-block-size: 34rem; display: grid; grid-template-columns: minmax(0, 1fr); gap: .75rem; margin: 1rem auto 0; } .workspace.has-detail { grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem); }
  .map { position: relative; min-inline-size: 0; min-block-size: 34rem; margin: 0; overflow: hidden; border-radius: var(--radius); background: var(--surface-subtle); } .map > svg, .nodes { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; } .rings circle, .edges line { fill: none; stroke: var(--border-subtle); vector-effect: non-scaling-stroke; } .rings circle { stroke-dasharray: 2 7; } .edges line { opacity: .65; }
  .node { position: absolute; inset-inline-start: var(--x); inset-block-start: var(--y); max-inline-size: 11rem; display: flex; align-items: center; gap: .28rem; translate: -50% -50%; border: 0; border-radius: calc(var(--radius) * .75); background: color-mix(in oklab, var(--surface-raised), transparent 8%); color: var(--foreground); padding: .35rem .48rem; font: 560 var(--type-caption) var(--font-ui); box-shadow: var(--shadow-overlay); } .node > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .node small { color: var(--muted-foreground); font: var(--type-status) var(--font-mono); } .node:is(:hover, :focus-visible, .selected) { background: var(--surface-selected); } .node:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; } .mark { display: grid; place-items: center; flex: none; color: var(--muted-foreground); } .mark :global(svg) { inline-size: .72rem; } .node[data-kind='memory'] .mark { color: var(--status-info); }
  figcaption { position: absolute; inset-inline-start: .75rem; inset-block-end: .7rem; display: flex; align-items: center; gap: .65rem; color: var(--muted-foreground); font-size: var(--type-status); } figcaption span { display: inline-flex; align-items: center; gap: .2rem; } figcaption :global(svg) { inline-size: .65rem; } figcaption small { font-size: inherit; }
  .detail { min-inline-size: 0; align-self: start; display: grid; gap: .8rem; border-radius: var(--radius); background: var(--surface-subtle); padding: .85rem; } .detail header h2 { margin-block-start: .45rem; overflow-wrap: anywhere; font-size: var(--type-body); font-weight: 620; } .detail label { font-size: var(--type-status); color: var(--muted-foreground); } .detail-content { max-block-size: 24rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); line-height: 1.55; } .detail-actions { display: flex; justify-content: end; gap: .25rem; }
  @container learning (max-width: 52rem) { .workspace.has-detail { grid-template-columns: 1fr; } .detail { inline-size: 100%; } }
  @container learning (max-width: 36rem) { .learning > header { flex-direction: column; } .actions { inline-size: 100%; } .search, .search :global(input) { inline-size: 100%; } .map { min-block-size: 28rem; } figcaption small { display: none; } }
  @media (prefers-reduced-motion: no-preference) { .node { transition: background var(--motion-fast) var(--ease-standard), scale var(--motion-fast) var(--ease-standard); } .node:is(:hover, :focus-visible) { scale: 1.025; } }
</style>
