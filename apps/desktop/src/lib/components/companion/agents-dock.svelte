<script lang="ts">
  import { onMount } from 'svelte';
  import * as Empty from '$lib/components/ui/empty';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { getHermesDelegationStatus, interruptHermesSubagent, setHermesDelegationPaused } from '$lib/client/remote/agents.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import type { HermesDelegationStatus, HermesSubagent } from '@hermes-companion/contracts';
  import { Bot, CircleAlert, CircleStop, Network, Pause, Play, RefreshCw, Wrench } from '@lucide/svelte';

  type TreeRow = { item: HermesSubagent; depth: number };

  const statusQuery = getHermesDelegationStatus({});
  let status = $state<HermesDelegationStatus | null>(null);
  let selectedId = $state<string | null>(null);
  let loading = $state(true);
  let pending = $state(false);
  let error = $state('');
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let mounted = false;

  const rows = $derived.by((): TreeRow[] => {
    const items = status?.active ?? [];
    const known = new Set(items.map((item) => item.id));
    const children = new Map<string, HermesSubagent[]>();
    for (const item of items) {
      const parent = item.parentId && known.has(item.parentId) ? item.parentId : '__root__';
      children.set(parent, [...(children.get(parent) ?? []), item]);
    }
    for (const group of children.values()) group.sort((left, right) => left.depth - right.depth || (left.startedAt ?? 0) - (right.startedAt ?? 0));
    const result: TreeRow[] = [];
    const visited = new Set<string>();
    const walk = (parent: string, depth: number) => {
      for (const item of children.get(parent) ?? []) {
        if (visited.has(item.id)) continue;
        visited.add(item.id); result.push({ item, depth }); walk(item.id, depth + 1);
      }
    };
    walk('__root__', 0);
    for (const item of items) if (!visited.has(item.id)) result.push({ item, depth: 0 });
    return result;
  });
  const selected = $derived(status?.active.find((item) => item.id === selectedId) ?? null);
  const selectedParent = $derived(selected?.parentId ? status?.active.find((item) => item.id === selected.parentId) ?? null : null);

  const schedulePoll = () => {
    if (!mounted) return;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void refresh(false), 1_500);
  };

  async function refresh(showLoading = true) {
    if (showLoading && !status) loading = true;
    try {
      await statusQuery.refresh();
      status = await resolveRemoteResult(statusQuery);
      if (selectedId && !status.active.some((item) => item.id === selectedId)) selectedId = null;
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Hermes delegation state is unavailable.';
    } finally {
      loading = false;
      schedulePoll();
    }
  }

  async function togglePaused() {
    if (!status || pending) return;
    pending = true; error = '';
    try {
      const result = await resolveRemoteResult(setHermesDelegationPaused({ paused: !status.paused }));
      status = { ...status, paused: result.paused, updatedAt: new Date().toISOString() };
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Delegation state could not be changed.'; }
    finally { pending = false; }
  }

  async function interrupt(item: HermesSubagent) {
    if (pending || !['queued', 'running'].includes(item.status)) return;
    pending = true; error = '';
    try { await resolveRemoteResult(interruptHermesSubagent({ subagentId: item.id })); await refresh(false); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'The subagent could not be interrupted.'; }
    finally { pending = false; }
  }

  function elapsed(startedAt: number | null) {
    if (!startedAt) return 'Not reported';
    const seconds = Math.max(0, Math.floor(Date.now() / 1_000 - startedAt));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  onMount(() => {
    mounted = true; void refresh();
    return () => { mounted = false; if (pollTimer) clearTimeout(pollTimer); };
  });
</script>

<section class="agents-dock" aria-labelledby="agents-heading" aria-busy={loading}>
  <header class="agents-summary">
    <div><Bot /><span><strong id="agents-heading">Subagents</strong><small>{status?.active.length ?? 0} active</small></span></div>
    <div class="summary-actions">
      {#if status}<Button size="xs" variant={status.paused ? 'secondary' : 'ghost'} disabled={pending} onclick={togglePaused} title={status.paused ? 'Resume new delegation' : 'Pause new delegation'}>{#if status.paused}<Play /> Resume{:else}<Pause /> Pause{/if}</Button>{/if}
      <Button size="icon-xs" variant="ghost" disabled={loading} onclick={() => void refresh()} aria-label="Refresh subagents" title="Refresh subagents"><RefreshCw /></Button>
    </div>
  </header>

  {#if error}
    <div class="agents-error" role="alert"><CircleAlert /><span>{error}</span><Button size="xs" variant="ghost" onclick={() => void refresh()}>Retry</Button></div>
  {/if}

  {#if loading && !status}
    <div class="agents-loading" role="status"><span></span><span></span><span></span></div>
  {:else if !rows.length}
    <Empty.Root class="agents-empty"><Empty.Header><Empty.Media variant="icon"><Network /></Empty.Media><Empty.Title>No active subagents</Empty.Title><Empty.Description>Delegated work appears here while Hermes is running it.</Empty.Description></Empty.Header></Empty.Root>
  {:else}
    <div class="agents-layout">
      <ul class="agent-tree" role="tree" aria-label="Live Hermes subagent tree">
        {#each rows as row (row.item.id)}
          <li role="none" style={`--tree-depth: ${row.depth}`}>
            <button type="button" role="treeitem" aria-level={row.depth + 1} class:active={selectedId === row.item.id} onclick={() => (selectedId = row.item.id)} aria-selected={selectedId === row.item.id}>
              <span class="agent-state" data-status={row.item.status} aria-hidden="true"></span><span class="visually-hidden">{row.item.status}</span>
              <span class="agent-copy"><strong>{row.item.goal}</strong><small>{row.item.model ?? 'Inherited model'} · {elapsed(row.item.startedAt)}</small></span>
              {#if row.item.toolCount}<span class="tool-count"><Wrench />{row.item.toolCount}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>

      {#if selected}
        <aside class="agent-detail" aria-label="Selected subagent details">
          <header><div><span class="agent-state" data-status={selected.status} aria-hidden="true"></span><h2>{selected.goal}</h2></div><Badge variant="outline">{selected.status}</Badge></header>
          <dl>
            <div><dt>Parent</dt><dd title={selectedParent?.goal ?? selected.parentId ?? 'Root agent'}>{selectedParent?.goal ?? selected.parentId ?? 'Root agent'}</dd></div>
            <div><dt>Model</dt><dd>{selected.model ?? 'Inherited'}</dd></div>
            <div><dt>Runtime</dt><dd>{elapsed(selected.startedAt)}</dd></div>
            <div><dt>Tools</dt><dd>{selected.toolCount}</dd></div>
            <div><dt>Depth</dt><dd>{selected.depth}</dd></div>
            <div class="agent-id"><dt>ID</dt><dd title={selected.id}>{selected.id}</dd></div>
          </dl>
          {#if ['queued', 'running'].includes(selected.status)}<Button size="sm" variant="destructive" disabled={pending} onclick={() => void interrupt(selected)}><CircleStop /> Interrupt</Button>{/if}
        </aside>
      {/if}
    </div>
  {/if}

  {#if status}
    <footer class="agents-limits"><span>Max depth {status.maxSpawnDepth ?? '—'}</span><span>Max children {status.maxConcurrentChildren ?? '—'}</span><time datetime={status.updatedAt}>Updated {new Date(status.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></footer>
  {/if}
</section>

<style>
  .agents-dock { min-inline-size: 0; block-size: 100%; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; background: var(--surface-floor); container: agents-dock / inline-size; }
  .agents-summary { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .6rem .7rem .45rem; }
  .agents-summary > div, .summary-actions { display: flex; align-items: center; gap: .4rem; }
  .agents-summary > div:first-child > :global(svg) { inline-size: .92rem; color: var(--muted-foreground); }
  .agents-summary span { min-inline-size: 0; display: grid; gap: .02rem; }
  .agents-summary strong { font-size: .74rem; font-weight: 640; }
  .agents-summary small { color: var(--muted-foreground); font-size: .61rem; }
  .agents-error { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .45rem; margin: .15rem .55rem .45rem; border-radius: var(--radius); background: color-mix(in oklab, var(--status-negative), transparent 88%); padding: .45rem .55rem; color: var(--status-negative); font-size: .65rem; }
  .agents-error > :global(svg) { inline-size: .8rem; }
  .agents-loading { display: grid; gap: .35rem; align-content: start; padding: .45rem .55rem; }
  .agents-loading span { block-size: 2.75rem; border-radius: var(--radius); background: color-mix(in oklab, var(--muted), transparent 28%); animation: agents-pulse var(--motion-ambient) var(--ease-standard) alternate infinite; }
  .agents-loading span:nth-child(2) { inline-size: 84%; margin-inline-start: 1rem; animation-delay: var(--motion-fast); }
  .agents-loading span:nth-child(3) { inline-size: 72%; margin-inline-start: 2rem; animation-delay: calc(var(--motion-fast) * 2); }
  :global(.agents-empty) { align-self: center; padding: 1rem; }
  .agents-layout { min-inline-size: 0; min-block-size: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: .45rem; overflow: hidden; padding: .25rem .45rem .45rem; }
  .agent-tree { min-inline-size: 0; min-block-size: 0; display: grid; align-content: start; gap: 1px; margin: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 0; list-style: none; }
  .agent-tree li { min-inline-size: 0; padding-inline-start: min(calc(var(--tree-depth) * .82rem), 3.3rem); }
  .agent-tree button { inline-size: 100%; min-inline-size: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: .45rem; border: 0; border-radius: var(--radius); background: transparent; padding: .42rem .48rem; color: var(--foreground); text-align: start; }
  .agent-tree button:is(:hover, :focus-visible), .agent-tree button.active { background: var(--sidebar-accent); outline: 0; }
  .agent-tree button:focus-visible { box-shadow: inset 0 0 0 1px var(--ring); }
  .agent-state { inline-size: .48rem; block-size: .48rem; flex: none; margin-block-start: .2rem; border-radius: 50%; background: var(--muted-foreground); }
  .agent-state[data-status='running'] { background: var(--status-working); box-shadow: 0 0 0 .16rem color-mix(in oklab, var(--status-working), transparent 80%); }
  .agent-state[data-status='queued'] { background: var(--status-info); }
  .agent-state[data-status='completed'] { background: var(--status-positive); }
  .agent-state[data-status='failed'], .agent-state[data-status='interrupted'] { background: var(--status-negative); }
  .agent-copy { min-inline-size: 0; display: grid; gap: .13rem; }
  .agent-copy strong { overflow: hidden; font-size: .7rem; font-weight: 590; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .agent-copy small { overflow: hidden; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .58rem; text-overflow: ellipsis; white-space: nowrap; }
  .tool-count { display: inline-flex; align-items: center; gap: .2rem; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .57rem; }
  .tool-count > :global(svg) { inline-size: .66rem; }
  .agent-detail { display: grid; gap: .55rem; border-radius: calc(var(--radius) * 1.1); background: color-mix(in oklab, var(--surface-raised), transparent 22%); padding: .65rem; }
  .agent-detail header, .agent-detail header > div { min-inline-size: 0; display: flex; align-items: center; gap: .4rem; }
  .agent-detail header { justify-content: space-between; }
  .agent-detail h2 { min-inline-size: 0; margin: 0; overflow: hidden; font-size: .74rem; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
  .agent-detail dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; margin: 0; }
  .agent-detail dl div { min-inline-size: 0; display: grid; gap: .08rem; }
  .agent-detail dt { color: var(--muted-foreground); font-size: .57rem; text-transform: uppercase; letter-spacing: .06em; }
  .agent-detail dd { min-inline-size: 0; margin: 0; overflow: hidden; font-family: var(--font-mono); font-size: .62rem; text-overflow: ellipsis; white-space: nowrap; }
  .agent-detail > :global(button) { justify-self: end; }
  .agents-limits { display: flex; align-items: center; gap: .65rem; min-inline-size: 0; padding: .35rem .65rem .45rem; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .55rem; }
  .agents-limits time { min-inline-size: 0; margin-inline-start: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .visually-hidden { position: absolute !important; inline-size: 1px !important; block-size: 1px !important; margin: -1px !important; padding: 0 !important; overflow: hidden !important; clip-path: inset(50%) !important; border: 0 !important; white-space: nowrap !important; }
  @container agents-dock (inline-size > 36rem) { .agents-layout { grid-template-columns: minmax(14rem, 1fr) minmax(13rem, .7fr); grid-template-rows: minmax(0, 1fr); } .agent-detail { align-self: start; } }
  @keyframes agents-pulse { from { opacity: .45; } to { opacity: .8; } }
  @media (prefers-reduced-motion: reduce) { .agents-loading span { animation: none; } }
</style>
