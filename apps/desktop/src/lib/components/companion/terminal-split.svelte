<script lang="ts">
  import { onDestroy } from 'svelte';
  import * as Empty from '$lib/components/ui/empty';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { closeTerminal as closeRemoteTerminal, openWorktreeTerminal, readTerminal, writeTerminal } from '$lib/client/remote/terminal.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import type { WorktreeRecord } from '@hermes-companion/contracts';
  import { CircleAlert, Plus, SquareTerminal, X } from '@lucide/svelte';

  type TerminalSession = { id: string; label: string; output: string; closed: boolean };

  let { worktree, oncollapse, layout = 'bottom' }: { worktree: WorktreeRecord | null; oncollapse?: () => void; layout?: 'bottom' | 'sidebar' } = $props();
  let sessions = $state<TerminalSession[]>([]);
  let activeTerminalId = $state<string | null>(null);
  let opening = $state(false);
  let error = $state('');
  let terminalView = $state<HTMLTextAreaElement | null>(null);
  let timers = new Map<string, ReturnType<typeof setTimeout>>();
  let loadedWorktreeId = $state<string | null>(null);
  const activeTerminal = $derived(sessions.find((session) => session.id === activeTerminalId) ?? null);

  function updateTerminal(id: string, update: (session: TerminalSession) => TerminalSession) {
    sessions = sessions.map((session) => session.id === id ? update(session) : session);
  }

  function schedulePoll(id: string, delay = 250) {
    const session = sessions.find((item) => item.id === id);
    if (!session || session.closed) return;
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.set(id, setTimeout(() => void readOutput(id), delay));
  }

  async function readOutput(id: string) {
    try {
      const result = await resolveRemoteResult(readTerminal({ id }));
      if (result.output.length) {
        updateTerminal(id, (session) => ({ ...session, output: `${session.output}${result.output.join('')}` }));
        requestAnimationFrame(() => terminalView?.scrollTo({ top: terminalView.scrollHeight }));
      }
      if (result.closed) updateTerminal(id, (session) => ({ ...session, closed: true }));
    } catch (cause) {
      updateTerminal(id, (session) => ({ ...session, closed: true }));
      error = cause instanceof Error ? cause.message : 'Terminal disconnected.';
    }
    schedulePoll(id);
  }

  async function createTerminal(): Promise<TerminalSession | null> {
    if (!worktree || opening) return null;
    opening = true; error = '';
    try {
      const result = await resolveRemoteResult(openWorktreeTerminal({ worktreeId: worktree.worktreeId, cols: 120, rows: 24 }));
      const session = { id: result.id, label: `Terminal ${sessions.length + 1}`, output: '', closed: false };
      sessions = [...sessions, session]; activeTerminalId = session.id; schedulePoll(session.id, 0);
      return session;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Terminal could not start.'; }
    finally { opening = false; }
    return null;
  }

  async function addTerminal() { await createTerminal(); }

  export async function runCommand(command: string) {
    const terminal = activeTerminal && !activeTerminal.closed ? activeTerminal : await createTerminal();
    if (!terminal) return false;
    try {
      await resolveRemoteResult(writeTerminal({ id: terminal.id, data: `${command}\r` }));
      requestAnimationFrame(() => terminalView?.focus());
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Action could not run in the terminal.';
      return false;
    }
  }

  async function sendKey(event: KeyboardEvent) {
    const terminal = activeTerminal;
    if (!terminal || terminal.closed || event.metaKey || event.altKey) return;
    const key = event.key === 'Enter' ? '\r' : event.key === 'Backspace' ? '\x7f' : event.key === 'Tab' ? '\t' : event.key.length === 1 && !event.ctrlKey ? event.key : null;
    if (!key) return;
    event.preventDefault();
    try { await resolveRemoteResult(writeTerminal({ id: terminal.id, data: key })); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Terminal input failed.'; }
  }

  async function removeTerminal(id: string) {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    await resolveRemoteResult(closeRemoteTerminal({ id })).catch(() => undefined);
    const remaining = sessions.filter((session) => session.id !== id);
    sessions = remaining;
    if (activeTerminalId === id) activeTerminalId = remaining.at(-1)?.id ?? null;
  }

  async function closeAllTerminals() {
    const openIds = sessions.map((session) => session.id);
    for (const id of openIds) await removeTerminal(id);
  }

  $effect(() => {
    const nextWorktreeId = worktree?.worktreeId ?? null;
    if (nextWorktreeId === loadedWorktreeId) return;
    if (loadedWorktreeId) void closeAllTerminals();
    loadedWorktreeId = nextWorktreeId;
    sessions = []; activeTerminalId = null; error = '';
  });

  onDestroy(() => { void closeAllTerminals(); });
</script>

<section class="terminal-split" data-layout={layout} aria-label="Worktree terminals">
  <header class="terminal-header">
    <div><SquareTerminal /><span>{worktree ? `${worktree.branch} terminals` : 'Worktree terminals'}</span></div>
    <div class="terminal-actions">
      {#if activeTerminal}<Badge variant={activeTerminal.closed ? 'outline' : 'secondary'}>{activeTerminal.closed ? 'Closed' : 'Connected'}</Badge>{/if}
      <Button type="button" size="icon-xs" variant="ghost" onclick={oncollapse} aria-label="Close terminal split" title="Close terminal split"><X /></Button>
    </div>
  </header>

  {#if error}<div class="terminal-error" role="alert"><CircleAlert /><span>{error}</span><Button size="xs" variant="ghost" onclick={() => (error = '')}>Dismiss</Button></div>{/if}

  {#if activeTerminal}
    <textarea class="terminal-output" bind:this={terminalView} readonly aria-label={`${activeTerminal.label} output; type to send input`} value={activeTerminal.output || 'Terminal connected.\n'} onkeydown={sendKey}></textarea>
  {:else}
    <Empty.Root class="terminal-empty"><Empty.Header><Empty.Media variant="icon"><SquareTerminal /></Empty.Media><Empty.Title>No terminal open</Empty.Title><Empty.Description>{worktree ? 'Open a shell scoped to this coding-thread worktree.' : 'Select a coding thread worktree to open a shell.'}</Empty.Description></Empty.Header><Empty.Content><Button size="sm" disabled={!worktree || opening} onclick={addTerminal}><Plus data-icon="inline-start" /> {opening ? 'Opening…' : 'Open terminal'}</Button></Empty.Content></Empty.Root>
  {/if}

  <footer class="terminal-tabs" aria-label="Terminal sessions">
    <div class="terminal-tab-list" role="tablist" aria-label="Open terminals">
      {#each sessions as terminal (terminal.id)}
        <div class="terminal-tab" class:active={terminal.id === activeTerminalId}>
          <button type="button" role="tab" aria-selected={terminal.id === activeTerminalId} onclick={() => (activeTerminalId = terminal.id)}>{terminal.label}{#if terminal.closed}<span>closed</span>{/if}</button>
          <Button type="button" size="icon-xs" variant="ghost" class="tab-close" onclick={() => void removeTerminal(terminal.id)} aria-label={`Close ${terminal.label}`}><X /></Button>
        </div>
      {/each}
    </div>
    <Button type="button" size="icon-xs" variant="ghost" class="terminal-add" disabled={!worktree || opening} onclick={addTerminal} aria-label="Add terminal" title="Add terminal"><Plus /></Button>
  </footer>
</section>

<style>
  .terminal-split { min-block-size: 0; block-size: 100%; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; border-block-start: 1px solid var(--border); background: var(--background); color: var(--foreground); }
  .terminal-split[data-layout='sidebar'] { grid-template-columns: minmax(0, 1fr) minmax(9rem, 32%); grid-template-rows: auto auto minmax(0, 1fr); }
  .terminal-split[data-layout='sidebar'] .terminal-header, .terminal-split[data-layout='sidebar'] .terminal-error { grid-column: 1 / -1; }
  .terminal-split[data-layout='sidebar'] .terminal-output, .terminal-split[data-layout='sidebar'] :global(.terminal-empty) { grid-column: 1; grid-row: 3; }
  .terminal-split[data-layout='sidebar'] .terminal-tabs { grid-column: 2; grid-row: 3; min-block-size: 0; align-items: stretch; flex-direction: column; justify-content: flex-start; border-block-start: 0; border-inline-start: 1px solid var(--border); padding: .55rem; }
  .terminal-split[data-layout='sidebar'] .terminal-tab-list { inline-size: 100%; flex-direction: column; overflow: auto; }
  .terminal-split[data-layout='sidebar'] .terminal-tab { inline-size: 100%; max-inline-size: none; }
  .terminal-split[data-layout='sidebar'] .terminal-tab > button:first-child { flex: 1; text-align: start; }
  .terminal-split[data-layout='sidebar'] :global(.terminal-add) { align-self: flex-start; }
  .terminal-header, .terminal-tabs, .terminal-actions, .terminal-header > div:first-child { display: flex; align-items: center; }
  .terminal-header { justify-content: space-between; gap: var(--density-gap); min-block-size: 2rem; padding: .3rem .55rem; border-block-end: 1px solid var(--border); color: var(--muted-foreground); font-size: .72rem; }
  .terminal-header > div:first-child { min-inline-size: 0; gap: .35rem; } .terminal-header :global(svg) { inline-size: .82rem; flex: none; } .terminal-header span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .terminal-actions { gap: .3rem; }
  .terminal-error { display: flex; align-items: center; gap: .4rem; border-block-end: 1px solid color-mix(in oklab, var(--destructive), transparent 50%); padding: .3rem .55rem; color: var(--destructive); font-size: .68rem; } .terminal-error span { min-inline-size: 0; flex: 1; } .terminal-error :global(svg) { inline-size: .8rem; flex: none; }
  .terminal-output { inline-size: 100%; min-block-size: 0; resize: none; overflow: auto; border: 0; border-radius: 0; background: transparent; padding: .65rem .75rem; color: inherit; font-family: var(--font-mono); font-size: .72rem; line-height: 1.5; white-space: pre; scrollbar-gutter: stable; }
  .terminal-output:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
  .terminal-tabs { min-inline-size: 0; justify-content: space-between; gap: .35rem; border-block-start: 1px solid var(--border); background: var(--background); padding: .18rem .35rem .18rem .45rem; }
  .terminal-tab-list { min-inline-size: 0; display: flex; gap: .2rem; overflow-x: auto; scrollbar-width: none; } .terminal-tab-list::-webkit-scrollbar { display: none; }
  .terminal-tab { display: flex; align-items: center; gap: .05rem; max-inline-size: 12rem; border-radius: calc(var(--radius) * .7); color: var(--muted-foreground); white-space: nowrap; } .terminal-tab:hover, .terminal-tab.active { background: var(--sidebar-accent); color: var(--foreground); }
  .terminal-tab > button:first-child { overflow: hidden; border: 0; background: transparent; padding: .28rem .2rem .28rem .4rem; color: inherit; font-size: .66rem; text-overflow: ellipsis; white-space: nowrap; } .terminal-tab > button:first-child > span { margin-inline-start: .3rem; color: var(--muted-foreground); font-size: .55rem; }
  :global(.tab-close) { display: grid; place-items: center; inline-size: 1rem; min-inline-size: 1rem; block-size: 1rem; min-block-size: 1rem; margin-inline-end: .15rem; padding: 0; color: inherit; } :global(.tab-close:hover) { background: color-mix(in oklab, var(--foreground), transparent 88%); } :global(.tab-close svg) { inline-size: .62rem; }
  :global(.terminal-add) { flex: none; }
  :global(.terminal-empty) { align-self: center; }
</style>
