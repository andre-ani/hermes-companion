<script lang="ts">
  import { onMount } from 'svelte';
  import { Archive, Award, CircleAlert, Columns3, GitBranch, MessageCircle, MoreHorizontal, Plus, RefreshCw, Sparkles, Trash2, UserRound } from '@lucide/svelte';
  import type { HermesAchievementsOverview, HermesKanbanOverview } from '@hermes-companion/contracts';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Progress } from '$lib/components/ui/progress';
  import * as Select from '$lib/components/ui/select';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { createHermesKanbanTask, deleteHermesKanbanTask, getHermesAchievementsOverview, getHermesKanbanOverview, rescanHermesAchievements, updateHermesKanbanTask } from '$lib/client/remote/product-plugins.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';

  let { family }: { family: 'kanban' | 'achievements' } = $props();
  let kanban = $state<HermesKanbanOverview | null>(null);
  let achievements = $state<HermesAchievementsOverview | null>(null);
  let board = $state('');
  let loading = $state(true);
  let pending = $state(false);
  let error = $state('');
  let achievementCategory = $state('All');
  let achievementState = $state<'all' | 'unlocked' | 'discovered' | 'secret'>('all');
  let createOpen = $state(false);
  let taskTitle = $state('');
  let taskBody = $state('');
  let taskAssignee = $state('');
  let taskPriority = $state(0);
  let taskTriage = $state(true);
  let taskPending = $state('');
  let deleteCandidate = $state('');
  let notice = $state('');
  let includeArchived = $state(false);

  const movableStatuses = ['triage', 'todo', 'scheduled', 'ready', 'blocked', 'done'] as const;

  const categories = $derived(['All', ...new Set((achievements?.achievements ?? []).map((item) => item.category))]);
  const visibleAchievements = $derived((achievements?.achievements ?? []).filter((item) =>
    (achievementCategory === 'All' || item.category === achievementCategory)
    && (achievementState === 'all' || item.state === achievementState)
  ));

  async function load() {
    loading = true; error = '';
    try {
      if (family === 'kanban') {
        kanban = await resolveRemoteResult(getHermesKanbanOverview({ board: board || undefined, includeArchived }));
        if (!board) board = kanban.currentBoard ?? kanban.boards[0]?.slug ?? '';
      } else achievements = await resolveRemoteResult(getHermesAchievementsOverview({}));
    } catch (cause) { error = cause instanceof Error ? cause.message : `Hermes ${family} could not be loaded.`; }
    finally { loading = false; }
  }

  async function changeBoard(value: string) { board = value; await load(); }
  async function rescan() {
    if (pending) return; pending = true; error = '';
    try { await resolveRemoteResult(rescanHermesAchievements({})); await load(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Achievement scan failed.'; }
    finally { pending = false; }
  }

  async function createTask() {
    if (!board || !taskTitle.trim() || taskPending) return;
    taskPending = 'create'; error = ''; notice = '';
    try {
      const result = await resolveRemoteResult(createHermesKanbanTask({ board, title: taskTitle, body: taskBody, assignee: taskAssignee, priority: taskPriority, triage: taskTriage }));
      taskTitle = ''; taskBody = ''; taskAssignee = ''; taskPriority = 0; taskTriage = true; createOpen = false;
      notice = result.warning ?? 'Task created.'; await load();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Task creation failed.'; }
    finally { taskPending = ''; }
  }

  async function moveTask(id: string, status: typeof movableStatuses[number] | 'archived') {
    if (!board || taskPending) return;
    taskPending = id; error = ''; notice = '';
    try { await resolveRemoteResult(updateHermesKanbanTask({ board, taskId: id, status })); notice = status === 'archived' ? 'Task archived.' : `Task moved to ${status}.`; await load(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Task update failed.'; }
    finally { taskPending = ''; }
  }

  async function removeTask(id: string) {
    if (!board || taskPending) return;
    taskPending = id; error = ''; notice = '';
    try { await resolveRemoteResult(deleteHermesKanbanTask({ board, taskId: id })); deleteCandidate = ''; notice = 'Task deleted.'; await load(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Task deletion failed.'; }
    finally { taskPending = ''; }
  }

  onMount(load);
</script>

<section class="product-plugin" aria-labelledby="product-plugin-heading">
  <header class="product-header">
    <div>
      <span class="data-label">Hermes plugin</span>
      <h1 id="product-plugin-heading">{family === 'kanban' ? 'Kanban' : 'Achievements'}</h1>
      <p>{family === 'kanban' ? 'Agent work organized by real Hermes board state.' : 'Progress earned from real Hermes session history.'}</p>
    </div>
    <div class="header-actions">
      {#if family === 'kanban' && kanban?.boards.length}
        <Select.Root type="single" value={board} onValueChange={(value) => void changeBoard(value)}>
          <Select.Trigger aria-label="Kanban board">{kanban.boards.find((item) => item.slug === board)?.name ?? board}</Select.Trigger>
          <Select.Content><Select.Group><Select.Label>Boards</Select.Label>{#each kanban.boards as item (item.slug)}<Select.Item value={item.slug} label={item.name}>{item.name} · {item.total}</Select.Item>{/each}</Select.Group></Select.Content>
        </Select.Root>
      {/if}
      {#if family === 'kanban' && kanban?.available}<Button size="sm" variant={includeArchived ? 'secondary' : 'ghost'} aria-pressed={includeArchived} onclick={() => { includeArchived = !includeArchived; void load(); }}><Archive data-icon="inline-start" /> Archived</Button>{/if}
      {#if family === 'kanban' && kanban?.available}<Button size="sm" variant="outline" onclick={() => createOpen = !createOpen} aria-expanded={createOpen} aria-controls="kanban-create-task"><Plus data-icon="inline-start" /> New task</Button>{/if}
      <Button size="sm" variant="ghost" disabled={loading || pending} onclick={family === 'achievements' ? rescan : load}><RefreshCw data-icon="inline-start" class={pending ? 'spin' : undefined} /> {family === 'achievements' ? 'Rescan' : 'Refresh'}</Button>
    </div>
  </header>

  {#if error}<div class="plugin-error" role="alert"><CircleAlert /><span>{error}</span><Button size="xs" variant="ghost" onclick={load}>Retry</Button></div>{/if}
  {#if notice}<div class="plugin-notice" role="status">{notice}</div>{/if}

  {#if family === 'kanban' && createOpen}
    <form id="kanban-create-task" class="task-create" onsubmit={(event) => { event.preventDefault(); void createTask(); }}>
      <div class="task-create-copy"><strong>New task</strong><small>Creates a real card on {kanban?.boards.find((item) => item.slug === board)?.name ?? board}.</small></div>
      <Input aria-label="Task title" placeholder="Task title" bind:value={taskTitle} required />
      <Textarea aria-label="Task details" placeholder="Details for the Hermes worker…" rows={2} bind:value={taskBody} />
      <div class="task-create-options"><Input aria-label="Assignee profile" placeholder="Assignee profile (optional)" bind:value={taskAssignee} /><Input aria-label="Task priority" type="number" min="-100" max="100" bind:value={taskPriority} /><label class="triage-option"><Switch checked={taskTriage} onCheckedChange={(value) => taskTriage = value} aria-label="Start task in triage" /><span><strong>Triage first</strong><small>Prevent automatic dispatch.</small></span></label></div>
      <div class="task-create-actions"><Button type="button" size="sm" variant="ghost" onclick={() => createOpen = false}>Cancel</Button><Button type="submit" size="sm" disabled={!taskTitle.trim() || Boolean(taskPending)}>Create task</Button></div>
    </form>
  {/if}

  {#if loading}
    <div class="plugin-loading" aria-label={`Loading ${family}`}><Skeleton class="h-16 w-full" /><Skeleton class="h-48 w-full" /></div>
  {:else if family === 'kanban' && kanban}
    {#if !kanban.available}
      <div class="plugin-empty"><Columns3 /><h2>Kanban unavailable</h2><p>{kanban.error ?? 'The connected Hermes profile does not expose the Kanban plugin.'}</p></div>
    {:else if kanban.columns.every((column) => !column.tasks.length)}
      <div class="plugin-empty"><Columns3 /><h2>No tasks on {kanban.boards.find((item) => item.slug === board)?.name ?? 'this board'}</h2><p>Tasks created through Hermes will appear here in their live workflow column.</p></div>
    {:else}
      {#key `${board}:${includeArchived}`}
        <div class="kanban-board" aria-label="Hermes Kanban board">{#each kanban.columns as column (column.id)}<section class="kanban-column" aria-labelledby={`kanban-${column.id}`}><header><h2 id={`kanban-${column.id}`}>{column.id}</h2><span>{column.tasks.length}</span></header><div class="task-list">{#each column.tasks as task (task.id)}<article class="task-card" data-pending={taskPending === task.id}><div class="task-title"><strong>{task.title}</strong>{#if task.priority > 0}<Badge variant="outline">P{task.priority}</Badge>{/if}<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} size="icon-xs" variant="ghost" aria-label={`Actions for ${task.title}`}><MoreHorizontal /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end"><DropdownMenu.Item onclick={() => void moveTask(task.id, 'archived')}><Archive />Archive</DropdownMenu.Item><DropdownMenu.Item variant="destructive" onclick={() => deleteCandidate = task.id}><Trash2 />Delete</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Root></div>{#if task.summary || task.body}<p>{task.summary ?? task.body}</p>{/if}<footer><div>{#if task.assignee}<span><UserRound />{task.assignee}</span>{/if}{#if task.childCount || task.parentCount}<span><GitBranch />{task.childCount}/{task.parentCount}</span>{/if}{#if task.commentCount}<span><MessageCircle />{task.commentCount}</span>{/if}</div>{#if task.status === 'running'}<Badge variant="secondary">running</Badge>{:else}<Select.Root type="single" value={task.status} disabled={Boolean(taskPending)} onValueChange={(value) => void moveTask(task.id, value as typeof movableStatuses[number])}><Select.Trigger aria-label={`Status for ${task.title}`}>{task.status}</Select.Trigger><Select.Content><Select.Group><Select.Label>Move task</Select.Label>{#each movableStatuses as status}<Select.Item value={status} label={status}>{status}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root>{/if}</footer>{#if deleteCandidate === task.id}<div class="delete-confirm" role="alert"><span>Delete this task?</span><Button size="xs" variant="ghost" onclick={() => deleteCandidate = ''}>Cancel</Button><Button size="xs" variant="destructive" disabled={Boolean(taskPending)} onclick={() => void removeTask(task.id)}>Delete</Button></div>{/if}</article>{/each}</div></section>{/each}</div>
      {/key}
    {/if}
  {:else if family === 'achievements' && achievements}
    {#if !achievements.available}
      <div class="plugin-empty"><Award /><h2>Achievements unavailable</h2><p>{achievements.error ?? 'The connected Hermes profile does not expose the Achievements plugin.'}</p></div>
    {:else}
      <div class="achievement-summary" aria-label="Achievement summary">
        <div><span>Unlocked</span><strong>{achievements.unlockedCount}<small>/{achievements.totalCount}</small></strong></div>
        <div><span>Discovered</span><strong>{achievements.discoveredCount}</strong></div>
        <div><span>Secrets</span><strong>{achievements.secretCount}</strong></div>
        <div><span>Catalog</span><strong>{achievements.totalCount}</strong></div>
      </div>
      {#if achievements.scanning || achievements.stale}<p class="scan-state"><Sparkles />{achievements.scanning ? 'Hermes is scanning session history…' : 'Showing the last complete scan while Hermes refreshes it.'}</p>{/if}
      <div class="achievement-filters"><div class="filter-scroll">{#each categories as category (category)}<button type="button" class:active={achievementCategory === category} onclick={() => achievementCategory = category}>{category}</button>{/each}</div><Select.Root type="single" bind:value={achievementState}><Select.Trigger aria-label="Achievement state">{achievementState === 'all' ? 'All states' : achievementState}</Select.Trigger><Select.Content>{#each ['all', 'unlocked', 'discovered', 'secret'] as state}<Select.Item value={state} label={state === 'all' ? 'All states' : state}>{state === 'all' ? 'All states' : state}</Select.Item>{/each}</Select.Content></Select.Root></div>
      <div class="achievement-grid">{#each visibleAchievements as item (item.id)}<article class="achievement-card" data-state={item.state}><header><span class="achievement-mark"><Award /></span><div><strong>{item.name}</strong><small>{item.category}</small></div><Badge variant={item.unlocked ? 'secondary' : 'outline'}>{item.tier ?? item.state}</Badge></header><p>{item.description}</p>{#if item.nextThreshold !== null}<div class="achievement-progress"><Progress value={item.progressPercent} /><span>{item.progress.toLocaleString()} / {item.nextThreshold.toLocaleString()}</span></div>{/if}{#if item.criteria}<details><summary>What counts</summary><p>{item.criteria}</p></details>{/if}</article>{/each}</div>
    {/if}
  {/if}
</section>

<style>
  .product-plugin { min-block-size: 0; block-size: 100%; overflow: auto; padding: clamp(3.5rem, 7vh, 5rem) clamp(1rem, 3cqi, 2rem) 3rem; container: product-plugin / inline-size; }
  .product-header { inline-size: min(100%, 72rem); display: flex; align-items: start; justify-content: space-between; gap: 1rem; margin-inline: auto; }
  .product-header h1, .product-header p, h2, p { margin: 0; } .product-header h1 { margin-block-start: .15rem; font-size: 1.1rem; font-weight: 650; letter-spacing: -.02em; } .product-header p { margin-block-start: .18rem; color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); }
  .header-actions { display: flex; align-items: center; gap: .25rem; } .header-actions :global([data-slot='select-trigger']) { min-inline-size: 9rem; }
  .plugin-error, .scan-state { inline-size: min(100%, 72rem); display: flex; align-items: center; gap: .45rem; margin: 1rem auto 0; color: var(--status-negative); font-size: var(--type-status); } .plugin-error :global(svg), .scan-state :global(svg) { inline-size: .85rem; } .plugin-error :global(button) { margin-inline-start: auto; }
  .plugin-notice { inline-size: min(100%, 72rem); margin: .75rem auto 0; color: var(--status-positive); font-size: var(--type-status); }
  .task-create { inline-size: min(100%, 72rem); display: grid; grid-template-columns: minmax(10rem, .65fr) minmax(14rem, 1fr) minmax(16rem, 1.25fr); align-items: end; gap: .55rem; margin: 1rem auto 0; border-radius: var(--radius); background: var(--surface-subtle); padding: .75rem; } .task-create-copy { align-self: center; display: grid; gap: .08rem; } .task-create-copy strong { font-size: var(--type-body); font-weight: 600; } .task-create-copy small { color: var(--muted-foreground); font-size: var(--type-status); } .task-create-options { display: grid; grid-column: 2 / 4; grid-template-columns: minmax(0, 1fr) 7rem minmax(8rem, auto); align-items: center; gap: .55rem; } .triage-option { display: flex; align-items: center; gap: .45rem; } .triage-option span { display: grid; } .triage-option strong { font-size: var(--type-caption); font-weight: 590; } .triage-option small { color: var(--muted-foreground); font-size: var(--type-status); } .task-create-actions { display: flex; grid-column: 1 / -1; justify-content: end; gap: .25rem; }
  .plugin-loading { inline-size: min(100%, 72rem); display: grid; gap: .65rem; margin: 1.25rem auto; }
  .plugin-empty { min-block-size: min(28rem, 58dvh); display: grid; place-content: center; justify-items: center; gap: .45rem; color: var(--muted-foreground); text-align: center; } .plugin-empty > :global(svg) { inline-size: 1.3rem; } .plugin-empty h2 { color: var(--foreground); font-size: .82rem; font-weight: 600; } .plugin-empty p { max-inline-size: 42ch; font-family: var(--font-body); font-size: var(--type-caption); line-height: 1.5; }
  .kanban-board { min-inline-size: 0; display: grid; grid-auto-columns: minmax(15rem, 1fr); grid-auto-flow: column; gap: .65rem; margin-block-start: 1.25rem; overflow-x: auto; overscroll-behavior-inline: contain; padding-block-end: .5rem; }
  .kanban-column { min-inline-size: 0; border-radius: var(--radius); background: var(--surface-subtle); padding: .45rem; content-visibility: auto; contain-intrinsic-size: auto 15rem auto 40rem; } @supports not (content-visibility: auto) { .kanban-column { contain: layout style paint; } } .kanban-column > header { display: flex; align-items: center; justify-content: space-between; padding: .25rem .3rem .55rem; } .kanban-column h2 { font-size: var(--type-category); font-weight: 650; letter-spacing: .08em; text-transform: uppercase; } .kanban-column > header span { color: var(--muted-foreground); font-size: var(--type-status); }
  .task-list { display: grid; gap: 1px; } .task-card { min-inline-size: 0; display: grid; gap: .4rem; border-radius: calc(var(--radius) * .8); background: var(--surface-raised); padding: .65rem; transition: opacity var(--motion-fast) var(--ease-standard); } .task-card[data-pending='true'] { opacity: .55; } .task-title { min-inline-size: 0; display: flex; align-items: start; gap: .25rem; } .task-title strong { min-inline-size: 0; flex: 1; overflow: hidden; font-size: var(--type-body); font-weight: 590; text-overflow: ellipsis; white-space: nowrap; } .task-title > :global(button) { flex: none; opacity: 0; } .task-card:is(:hover, :focus-within) .task-title > :global(button) { opacity: 1; } .task-card > p { display: -webkit-box; overflow: hidden; color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); line-height: 1.45; line-clamp: 3; -webkit-box-orient: vertical; -webkit-line-clamp: 3; } .task-card footer { min-inline-size: 0; display: flex; align-items: center; justify-content: space-between; gap: .55rem; color: var(--muted-foreground); font-size: var(--type-status); } .task-card footer > div { min-inline-size: 0; display: flex; gap: .55rem; } .task-card footer span { display: inline-flex; align-items: center; gap: .2rem; } .task-card footer :global(svg) { inline-size: .7rem; } .task-card footer :global([data-slot='select-trigger']) { min-inline-size: 5.5rem; block-size: 1.55rem; border: 0; background: transparent; padding-inline: .4rem; font-size: var(--type-status); }
  .delete-confirm { display: flex; align-items: center; gap: .2rem; color: var(--status-negative); font-size: var(--type-status); } .delete-confirm span { flex: 1; }
  .achievement-summary { inline-size: min(100%, 72rem); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; margin: 1.25rem auto 0; } .achievement-summary > div { display: grid; gap: .25rem; border-radius: var(--radius); background: var(--surface-subtle); padding: .8rem; } .achievement-summary span { color: var(--muted-foreground); font-size: var(--type-category); } .achievement-summary strong { font-size: 1.2rem; font-weight: 620; } .achievement-summary small { color: var(--muted-foreground); font-size: .65em; font-weight: 450; }
  .scan-state { color: var(--muted-foreground); }
  .achievement-filters { inline-size: min(100%, 72rem); display: flex; align-items: center; gap: .5rem; margin: 1rem auto 0; } .filter-scroll { min-inline-size: 0; display: flex; flex: 1; gap: .2rem; overflow-x: auto; } .filter-scroll button { flex: none; border: 0; border-radius: calc(var(--radius) * .7); background: transparent; color: var(--muted-foreground); padding: .35rem .55rem; font: 500 var(--type-caption) var(--font-ui); } .filter-scroll button:is(:hover, :focus-visible, .active) { background: var(--surface-subtle); color: var(--foreground); }
  .achievement-grid { inline-size: min(100%, 72rem); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; margin: .75rem auto 0; } .achievement-card { min-inline-size: 0; display: grid; align-content: start; gap: .65rem; border-radius: var(--radius); background: var(--surface-subtle); padding: .8rem; } .achievement-card[data-state='secret'] { opacity: .62; } .achievement-card header { min-inline-size: 0; display: flex; align-items: center; gap: .5rem; } .achievement-mark { display: grid; place-items: center; inline-size: 1.65rem; block-size: 1.65rem; flex: none; border-radius: .5rem; background: color-mix(in oklab, var(--primary), transparent 86%); color: var(--primary); } .achievement-mark :global(svg) { inline-size: .85rem; } .achievement-card header > div { min-inline-size: 0; display: grid; flex: 1; } .achievement-card strong, .achievement-card small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .achievement-card strong { font-size: var(--type-body); font-weight: 600; } .achievement-card small { color: var(--muted-foreground); font-size: var(--type-status); } .achievement-card > p, .achievement-card details p { color: var(--muted-foreground); font-family: var(--font-body); font-size: var(--type-caption); line-height: 1.5; }
  .achievement-progress { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .5rem; } .achievement-progress span { color: var(--muted-foreground); font-family: var(--font-mono); font-size: var(--type-status); } .achievement-card details summary { color: var(--muted-foreground); cursor: pointer; font-size: var(--type-status); } .achievement-card details p { margin-block-start: .35rem; }
  :global(.spin) { animation: spin var(--motion-ambient) linear infinite; } @keyframes spin { to { rotate: 1turn; } }
  @container product-plugin (max-width: 52rem) { .achievement-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @container product-plugin (max-width: 48rem) { .task-create { grid-template-columns: 1fr 1fr; } .task-create-copy, .task-create :global(textarea), .task-create-options { grid-column: 1 / -1; } .task-create-options { grid-template-columns: minmax(0, 1fr) 7rem; } .triage-option { grid-column: 1 / -1; } }
  @container product-plugin (max-width: 34rem) { .product-header { flex-direction: column; } .header-actions { flex-wrap: wrap; } .task-create { grid-template-columns: 1fr; } .task-create > :global(input), .task-create > :global(textarea), .task-create-options { grid-column: 1; } .achievement-summary, .achievement-grid { grid-template-columns: 1fr; } .achievement-filters { align-items: stretch; flex-direction: column; } }
  @media (prefers-reduced-motion: reduce) { :global(.spin) { animation: none; } }
</style>
