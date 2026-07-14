<script lang="ts">
  import { onMount } from 'svelte';
  import * as Field from '$lib/components/ui/field';
  import * as Empty from '$lib/components/ui/empty';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { cancelHarnessRun, discoverHarnesses, getActiveHarnessRun, getHarnessRunEvents, respondHarnessApproval, startHarnessRun } from '$lib/client/remote/harnesses.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import type { HarnessCapabilities, HarnessEvent, WorktreeRecord } from '@hermes-companion/contracts';
  import { Bot, CircleAlert, CircleCheck, CircleStop, Play, ShieldAlert, TerminalSquare, Wrench } from '@lucide/svelte';

  let { worktree }: { worktree: WorktreeRecord | null } = $props();
  let hermes = $state<HarnessCapabilities | null>(null);
  let prompt = $state('');
  let loading = $state(true);
  let starting = $state(false);
  let error = $state('');
  let run = $state<{ id: string; status: string } | null>(null);
  let events = $state<Array<{ sequence: number; event: HarnessEvent }>>([]);
  let respondingApproval = $state<number | null>(null);
  let resolvedApprovals = $state(new Set<number>());
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let restoredWorktreeId = $state('');
  let restoreGeneration = 0;
  const latestSequence = $derived(events.at(-1)?.sequence ?? 0);

  async function loadRuntime() {
    loading = true; error = '';
    try { hermes = (await resolveRemoteResult(discoverHarnesses({})) as HarnessCapabilities[])[0] ?? null; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes execution status could not be loaded.'; }
    finally { loading = false; }
  }

  async function restoreActiveRun(worktreeId: string, generation: number) {
    try {
      const active = await resolveRemoteResult(getActiveHarnessRun({ worktreeId }));
      if (generation !== restoreGeneration || worktree?.worktreeId !== worktreeId) return;
      if (!active) return;
      run = active;
      events = [];
      resolvedApprovals = new Set();
      void poll();
    } catch (cause) {
      if (generation !== restoreGeneration || worktree?.worktreeId !== worktreeId) return;
      error = cause instanceof Error ? cause.message : 'The active Hermes run could not be recovered.';
    }
  }

  async function start() {
    const task = prompt.trim(); if (!task || !worktree || starting) return;
    starting = true; error = ''; events = []; resolvedApprovals = new Set();
    try {
      run = await resolveRemoteResult(startHarnessRun({ harness: 'hermes', prompt: task, worktree: { projectId: worktree.projectId, worktreeId: worktree.worktreeId, path: worktree.path, branch: worktree.branch } }));
      prompt = ''; void poll();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes run could not start.'; }
    finally { starting = false; }
  }

  function schedulePoll(delay = 700) {
    if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) return;
    if (pollTimer) clearTimeout(pollTimer); pollTimer = setTimeout(poll, delay);
  }

  async function poll() {
    if (!run) return;
    try {
      const result = await resolveRemoteResult(getHarnessRunEvents({ runId: run.id, after: latestSequence }));
      if (result.events.length) events = [...events, ...result.events];
      const statusEvent = [...result.events].reverse().find((item) => item.event.type === 'status');
      if (result.status) run.status = result.status;
      else if (statusEvent?.event.type === 'status') run.status = statusEvent.event.status;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Hermes run events disconnected.'; }
    schedulePoll();
  }

  async function cancel() {
    if (!run) return;
    try { const result = await resolveRemoteResult(cancelHarnessRun({ runId: run.id })); run.status = result.status; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Run cancellation failed.'; }
  }

  async function respond(sequence: number, choice: 'once' | 'session' | 'always' | 'deny') {
    if (!run || respondingApproval !== null || resolvedApprovals.has(sequence)) return;
    respondingApproval = sequence; error = '';
    try { await resolveRemoteResult(respondHarnessApproval({ runId: run.id, choice })); resolvedApprovals = new Set([...resolvedApprovals, sequence]); schedulePoll(0); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Approval response failed.'; }
    finally { respondingApproval = null; }
  }

  onMount(() => { void loadRuntime(); return () => { if (pollTimer) clearTimeout(pollTimer); }; });

  $effect(() => {
    const worktreeId = worktree?.worktreeId ?? '';
    if (!worktreeId) {
      restoredWorktreeId = '';
      restoreGeneration += 1;
      run = null;
      events = [];
      return;
    }
    if (restoredWorktreeId === worktreeId) return;
    restoredWorktreeId = worktreeId;
    const generation = ++restoreGeneration;
    run = null;
    events = [];
    void restoreActiveRun(worktreeId, generation);
  });
</script>

<section class="run-panel" aria-labelledby="run-heading">
  <header><div><span class="data-label">Hermes execution</span><h2 id="run-heading">Background run</h2></div>{#if run}<Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'completed' ? 'secondary' : 'outline'}>{run.status}</Badge>{:else}<Badge variant="secondary">Idle</Badge>{/if}</header>
  {#if loading}
    <div class="loading"><Skeleton class="h-8 w-48" /><Skeleton class="h-20 w-full" /></div>
  {:else if hermes && !hermes.supportsWorktrees}
    <div class="runtime-unavailable"><CircleAlert /><div><strong>Remote worktree execution is not connected</strong><p>Chat remains available. Code runs will appear here after this profile exposes the supported Companion MCP workspace path.</p></div></div>
  {:else}
    <form onsubmit={(event) => { event.preventDefault(); void start(); }}>
      <p class="runtime-note">Hermes runs this task with the selected Hermes model and execution settings. Connected Codex, Claude, and other accounts only provide credentials and models; Companion never launches their CLIs.</p>
      <Field.Field><Field.FieldLabel for="hermes-task">Task</Field.FieldLabel><Textarea id="hermes-task" name="task" bind:value={prompt} rows={3} placeholder="Describe the implementation or review task…" disabled={!worktree || !hermes?.supportsWorktrees || Boolean(run && !['completed', 'failed', 'cancelled'].includes(run.status))} /></Field.Field>
      <div class="actions">{#if run && !['completed', 'failed', 'cancelled'].includes(run.status)}<Button type="button" variant="destructive" size="sm" onclick={cancel}><CircleStop data-icon="inline-start" /> Cancel</Button>{:else}<Button type="submit" size="sm" disabled={!worktree || !prompt.trim() || !hermes?.installed || !hermes?.authenticated || !hermes?.supportsWorktrees || starting}><Play data-icon="inline-start" /> {starting ? 'Starting…' : 'Run with Hermes'}</Button>{/if}</div>
    </form>
  {/if}
  {#if error}<div class="run-notice" role="status"><CircleAlert /><span>{error}</span></div>{/if}
  {#if events.length}
    <ol class="timeline" aria-label="Hermes run events">{#each events as item (item.sequence)}<li data-kind={item.event.type}><div class="event-icon">{#if item.event.type === 'tool'}<Wrench />{:else if item.event.type === 'approval'}<ShieldAlert />{:else if item.event.type === 'status' && item.event.status === 'completed'}<CircleCheck />{:else if item.event.type === 'text'}<TerminalSquare />{:else}<Bot />{/if}</div><div class="event-body">{#if item.event.type === 'text'}<pre>{item.event.text}</pre>{:else if item.event.type === 'tool'}<strong>{item.event.tool.name}</strong><span>{item.event.tool.status}</span>{:else if item.event.type === 'approval'}<strong>{resolvedApprovals.has(item.sequence) ? 'Approval answered' : 'Hermes approval required'}</strong><span>{item.event.summary}</span>{#if !resolvedApprovals.has(item.sequence)}<div class="approval-actions" aria-label={`Respond to approval: ${item.event.summary}`}><Button type="button" variant="outline" size="xs" disabled={respondingApproval !== null} onclick={() => respond(item.sequence, 'once')}>Allow once</Button><Button type="button" variant="outline" size="xs" disabled={respondingApproval !== null} onclick={() => respond(item.sequence, 'session')}>Allow for session</Button>{#if item.event.allowPermanent}<Button type="button" variant="outline" size="xs" disabled={respondingApproval !== null} onclick={() => respond(item.sequence, 'always')}>Always allow</Button>{/if}<Button type="button" variant="destructive" size="xs" disabled={respondingApproval !== null} onclick={() => respond(item.sequence, 'deny')}>Deny</Button></div>{/if}{:else if item.event.type === 'git'}<strong>Git updated</strong><span>{item.event.filesChanged} files changed</span>{:else}<strong>{item.event.status}</strong>{#if item.event.message}<span>{item.event.message}</span>{/if}{/if}</div></li>{/each}</ol>
  {:else if !loading && hermes?.supportsWorktrees}<Empty.Root><Empty.Header><Empty.Media variant="icon"><Bot /></Empty.Media><Empty.Title>No run activity</Empty.Title><Empty.Description>{worktree ? 'Start a worktree-scoped Hermes task.' : 'Create or select a coding thread worktree first.'}</Empty.Description></Empty.Header></Empty.Root>{/if}
</section>

<style>
  .run-panel { overflow: hidden; border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.1); background: color-mix(in oklab, var(--surface-raised), transparent 18%); }
  .run-panel > header { display: flex; align-items: center; justify-content: space-between; gap: .55rem; padding: .5rem .6rem; border-block-end: 1px solid var(--border); }
  .run-panel > header > div { display: grid; gap: .15rem; }
  h2 { margin: 0; font-size: .82rem; }
  form, .loading { display: grid; gap: .55rem; padding: .6rem; border-block-end: 1px solid var(--border); }
  .runtime-note { margin: 0; color: var(--muted-foreground); font-size: .7rem; line-height: 1.5; }
  .runtime-unavailable { display: flex; align-items: flex-start; gap: .5rem; padding: .65rem; color: var(--muted-foreground); } .runtime-unavailable > :global(svg) { inline-size: .85rem; flex: none; margin-block-start: .08rem; color: var(--status-warning); } .runtime-unavailable strong { display: block; color: var(--foreground); font-size: .72rem; } .runtime-unavailable p { max-inline-size: 62ch; margin: .2rem 0 0; font-size: .67rem; line-height: 1.5; }
  .actions { display: flex; justify-content: flex-end; gap: .45rem; }
  .run-notice { display: flex; align-items: flex-start; gap: .4rem; margin: .5rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--muted); padding: .45rem .55rem; color: var(--muted-foreground); font-size: .7rem; line-height: 1.45; }
  .run-notice :global(svg) { inline-size: .9rem; flex: none; }
  .timeline { max-block-size: 22rem; overflow: auto; margin: 0; padding: .5rem; list-style: none; }
  .timeline li { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr); gap: .4rem; position: relative; padding-block-end: .5rem; }
  .timeline li:not(:last-child)::after { content: ''; position: absolute; inset-inline-start: .82rem; inset-block-start: 1.55rem; inset-block-end: 0; border-inline-start: 1px solid var(--border); }
  .event-icon { display: grid; place-items: center; inline-size: 1.5rem; block-size: 1.5rem; border: 1px solid var(--border); border-radius: 50%; background: var(--surface-raised); color: var(--muted-foreground); }
  .event-icon :global(svg) { inline-size: .78rem; }
  [data-kind='approval'] .event-icon { color: var(--status-warning); }
  .event-body { min-inline-size: 0; display: grid; gap: .15rem; padding-block-start: .2rem; }
  .event-body strong { font-size: .72rem; text-transform: capitalize; }
  .event-body span { color: var(--muted-foreground); font-size: .66rem; line-height: 1.45; }
  .approval-actions { display: flex; flex-wrap: wrap; gap: .35rem; padding-block-start: .35rem; }
  pre { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .68rem; line-height: 1.5; }
</style>
