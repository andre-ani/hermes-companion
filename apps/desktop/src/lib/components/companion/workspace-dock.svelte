<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Empty from '$lib/components/ui/empty';
  import * as Field from '$lib/components/ui/field';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Popover from '$lib/components/ui/popover';
  import * as Command from '$lib/components/ui/command';
  import { Button } from '$lib/components/ui/button';
  import CodeEditor from './code-editor.svelte';
  import CodeReview from './code-review.svelte';
  import TerminalSplit from './terminal-split.svelte';
  import AgentsDock from './agents-dock.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { createWorktreeFileEntry, deleteWorktreeFileEntry, listWorktreeFiles, moveWorktreeFileEntry, previewWorktreeFile, readWorktreeFile, saveWorktreeFile, searchWorktreeFiles } from '$lib/client/remote/files.remote';
  import { listWorktreePreviews, reopenWorktreePreview, startWorktreePreview, stopWorktreePreview } from '$lib/client/remote/previews.remote';
  import { createWorktreeAnnotation, getAnnotationTaskEvents, listWorktreeAnnotations, startAnnotationTask } from '$lib/client/remote/annotations.remote';
  import { claimBrowser, controlBrowser, getBrowserStatus, openBrowserDevTools, openGeneralBrowser, releaseBrowser, setBrowserBounds, setBrowserFullscreen } from '$lib/client/remote/browser.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import { listLocalServers } from '$lib/client/remote/local-servers.remote';
  import { ArrowLeft, ArrowRight, ArrowUpRight, Bot, ChevronLeft, CircleAlert, CircleCheck, Code2, File, FilePlus2, Folder, FolderPlus, FolderTree, GitCompareArrows, Globe2, Maximize2, Pencil, Play, Plus, RotateCw, Save, Search, Terminal, Trash2, X } from '@lucide/svelte';
  import type { FileEntry, FilePreview, FileSearchResult, HarnessEvent, HermesGitWorkspace, PreviewLease, WorktreeRecord } from '@hermes-companion/contracts';

  type AnnotationTask = { id: string; route: string; note: string; taskStatus: 'queued' | 'starting' | 'running' | 'completed' | 'cancelled' | 'failed'; runId: string | null; lastEventSequence: number };

  let { worktree = null, gitWorkspace = null, unavailableReason = null, browserOwnerKey, browserLeaseId, visible, onchanged, onfullscreenchange, dockTab = $bindable('surfaces'), openTabs = $bindable<string[]>([]) }: { worktree?: WorktreeRecord | null; gitWorkspace?: HermesGitWorkspace | null; unavailableReason?: string | null; browserOwnerKey: string; browserLeaseId: string; visible: boolean; onchanged?: () => void | Promise<void>; onfullscreenchange?: (fullscreen: boolean, identity: { ownerKey: string; browserLeaseId: string }) => void; dockTab?: string; openTabs?: string[] } = $props();
  const surfaceLabel = (surface: string) => surface === 'changes' ? 'Changes' : surface === 'browser' ? 'Browser' : surface === 'terminal' ? 'Terminal' : surface === 'agents' ? 'Agents' : 'Files';
  const surfaceOptions = [{ id: 'files', label: 'File', icon: File }, { id: 'terminal', label: 'Terminal', icon: Terminal }, { id: 'browser', label: 'Browser', icon: Globe2 }, { id: 'changes', label: 'Changes', icon: GitCompareArrows }, { id: 'agents', label: 'Agents', icon: Bot }];
  let tabMenuOpen = $state(false);
  function openSurface(surface: string) { if (!openTabs.includes(surface)) openTabs = [...openTabs, surface]; dockTab = surface; tabMenuOpen = false; if (surface === 'browser') void refreshBrowserSurface(); }
  async function closeSurface(surface: string) { const index = openTabs.indexOf(surface); if (surface === 'browser') await browserAction('close'); const remaining = openTabs.filter((item) => item !== surface); openTabs = remaining; if (dockTab === surface) dockTab = remaining[index - 1] ?? remaining[index] ?? remaining[0] ?? 'surfaces'; }
  let entries = $state<FileEntry[]>([]);
  let currentPath = $state('');
  let selectedFile = $state<{ path: string; content: string; size: number } | null>(null);
  let selectedPreview = $state<FilePreview | null>(null);
  let fileDraft = $state('');
  let fileSearch = $state('');
  let searchResults = $state<FileSearchResult[]>([]);
  let fileNotice = $state('');
  let fileActionOpen = $state(false);
  let fileAction = $state<'create-file' | 'create-directory' | 'move' | 'delete'>('create-file');
  let fileActionEntry = $state<FileEntry | null>(null);
  let fileActionPath = $state('');
  let filesPending = $state(false);
  let fileRequestGeneration = 0;
  let error = $state('');
  let loadedWorktreeId = $state<string | null>(null);
  let previews = $state<PreviewLease[]>([]);
  let previewOrigin = $state('');
  let designMode = $state(false);
  let previewSetupOpen = $state(false);
  let previewPending = $state(false);
  let annotationCount = $state(0);
  let annotations = $state<AnnotationTask[]>([]);
  let annotationEvents = $state<Record<string, Array<{ sequence: number; event: HarnessEvent }>>>({});
  let annotationTaskTimer: ReturnType<typeof setTimeout> | null = null;
  let annotationTaskPending = $state<string | null>(null);
  let removeAnnotationListener: (() => void) | null = null;
  let browserUrl = $state('');
  const closedBrowserState = () => ({ open: false, kind: null, url: null, fullscreen: false, ownerKey: null, browserLeaseId: null } as const);
  let browserState = $state<{ open: boolean; kind: 'general' | 'preview' | null; url: string | null; fullscreen: boolean; ownerKey: string | null; browserLeaseId: string | null }>(closedBrowserState());
  let localServers = $state<Array<{ name: string; port: number; url: string }>>([]);
  let localServersPending = $state(false);
  let browserHost = $state<HTMLElement | null>(null);
  let browserHostObserver: ResizeObserver | null = null;
  let browserGeometryFrame: number | null = null;
  let lastBrowserBounds = '';
  let browserOperationGeneration = 0;

  $effect(() => {
    const id = worktree?.worktreeId ?? null;
    if (id === loadedWorktreeId) return;
    fileRequestGeneration += 1;
    filesPending = false;
    loadedWorktreeId = id; currentPath = ''; selectedFile = null; selectedPreview = null; fileDraft = ''; fileSearch = ''; searchResults = []; fileNotice = ''; entries = []; annotations = []; annotationEvents = {}; error = ''; previewSetupOpen = false;
    if (annotationTaskTimer) clearTimeout(annotationTaskTimer); annotationTaskTimer = null;
    if (id) { void loadFiles(''); void loadPreviews(); void loadAnnotations(); }
    void loadBrowserStatus(); void loadLocalServers();
  });


  async function loadFiles(path: string) {
    if (!worktree) return;
    const worktreeId = worktree.worktreeId;
    const generation = ++fileRequestGeneration;
    filesPending = true; error = '';
    try {
      const nextEntries = await resolveRemoteResult(listWorktreeFiles({ worktreeId, path }));
      if (generation !== fileRequestGeneration || worktree?.worktreeId !== worktreeId) return;
      entries = nextEntries; currentPath = path; selectedFile = null; selectedPreview = null; fileDraft = ''; fileNotice = '';
    }
    catch (cause) { if (generation === fileRequestGeneration && worktree?.worktreeId === worktreeId) error = cause instanceof Error ? cause.message : 'Files could not be listed.'; }
    finally { if (generation === fileRequestGeneration) filesPending = false; }
  }

  async function openEntry(entry: FileEntry) {
    if (!worktree) return;
    if (entry.kind === 'directory') return loadFiles(entry.path);
    const worktreeId = worktree.worktreeId;
    const generation = ++fileRequestGeneration;
    filesPending = true; error = '';
    try {
      if (/\.(png|jpe?g|gif|webp|pdf)$/i.test(entry.path)) {
        const nextPreview = await resolveRemoteResult(previewWorktreeFile({ worktreeId, path: entry.path }));
        if (generation !== fileRequestGeneration || worktree?.worktreeId !== worktreeId) return;
        selectedPreview = nextPreview; selectedFile = null;
      }
      else {
        const nextFile = await resolveRemoteResult(readWorktreeFile({ worktreeId, path: entry.path }));
        if (generation !== fileRequestGeneration || worktree?.worktreeId !== worktreeId) return;
        selectedFile = nextFile; selectedPreview = null; fileDraft = nextFile.content;
      }
      fileNotice = '';
    }
    catch (cause) { if (generation === fileRequestGeneration && worktree?.worktreeId === worktreeId) error = cause instanceof Error ? cause.message : 'File could not be read.'; }
    finally { if (generation === fileRequestGeneration) filesPending = false; }
  }

  async function saveFile() {
    if (!worktree || !selectedFile || filesPending) return;
    filesPending = true; error = ''; fileNotice = '';
    try {
      const result = await resolveRemoteResult(saveWorktreeFile({ worktreeId: worktree.worktreeId, path: selectedFile.path, content: fileDraft }));
      selectedFile = { ...selectedFile, content: fileDraft, size: result.size }; fileNotice = 'Saved';
    } catch (cause) { error = cause instanceof Error ? cause.message : 'File could not be saved.'; }
    finally { filesPending = false; }
  }

  async function searchFiles() {
    if (!worktree || !fileSearch.trim() || filesPending) return;
    const worktreeId = worktree.worktreeId;
    const generation = ++fileRequestGeneration;
    filesPending = true; error = ''; fileNotice = '';
    try {
      const nextResults = await resolveRemoteResult(searchWorktreeFiles({ worktreeId, query: fileSearch, limit: 200 }));
      if (generation === fileRequestGeneration && worktree?.worktreeId === worktreeId) searchResults = nextResults;
    }
    catch (cause) { if (generation === fileRequestGeneration && worktree?.worktreeId === worktreeId) error = cause instanceof Error ? cause.message : 'Files could not be searched.'; }
    finally { if (generation === fileRequestGeneration) filesPending = false; }
  }

  async function openSearchResult(result: FileSearchResult) {
    await openEntry({ name: result.path.split('/').at(-1) ?? result.path, path: result.path, kind: 'file', size: null });
  }

  function openFileAction(action: typeof fileAction, entry: FileEntry | null = null) {
    fileAction = action; fileActionEntry = entry;
    fileActionPath = action === 'move' && entry ? entry.path : currentPath ? `${currentPath}/` : '';
    fileActionOpen = true;
  }

  async function performFileAction() {
    if (!worktree || filesPending) return;
    filesPending = true; error = ''; fileNotice = '';
    try {
      if (fileAction === 'create-file' || fileAction === 'create-directory') await resolveRemoteResult(createWorktreeFileEntry({ worktreeId: worktree.worktreeId, path: fileActionPath, kind: fileAction === 'create-file' ? 'file' : 'directory' }));
      else if (fileAction === 'move' && fileActionEntry) await resolveRemoteResult(moveWorktreeFileEntry({ worktreeId: worktree.worktreeId, from: fileActionEntry.path, to: fileActionPath }));
      else if (fileAction === 'delete' && fileActionEntry) await resolveRemoteResult(deleteWorktreeFileEntry({ worktreeId: worktree.worktreeId, path: fileActionEntry.path, recursive: fileActionEntry.kind === 'directory' }));
      fileActionOpen = false; filesPending = false; await loadFiles(currentPath);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'File action failed.'; }
    finally { filesPending = false; }
  }

  const parentPath = (value: string) => value.split(/[\\/]/).slice(0, -1).join('/');

  async function loadPreviews() {
    if (!worktree) return;
    try { previews = await resolveRemoteResult(listWorktreePreviews({ worktreeId: worktree.worktreeId })); }
    catch { previews = []; }
  }

  async function startPreview() {
    if (!worktree || previewPending) return;
    previewPending = true; error = '';
    try {
      const identity = browserIdentity();
      await resolveRemoteResult(claimBrowser(identity));
      const lease = await resolveRemoteResult(startWorktreePreview({ worktreeId: worktree.worktreeId, origin: previewOrigin, designModeAllowed: designMode, ttlSeconds: 3_600, ...identity }));
      if (!isCurrentBrowserIdentity(identity)) return;
      previews = [lease, ...previews.filter((item) => item.id !== lease.id)];
      browserState = { open: true, kind: 'preview', url: lease.relayUrl ?? lease.origin, fullscreen: false, ...identity };
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Preview could not start.'; }
    finally { previewPending = false; }
  }

  async function reopenPreview(leaseId: string) {
    previewPending = true; error = '';
    try { const identity = browserIdentity(); await resolveRemoteResult(claimBrowser(identity)); const lease = await resolveRemoteResult(reopenWorktreePreview({ leaseId, ...identity })); if (isCurrentBrowserIdentity(identity)) browserState = { open: true, kind: 'preview', url: lease.relayUrl ?? lease.origin, fullscreen: false, ...identity }; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Preview could not open.'; }
    finally { previewPending = false; }
  }

  async function stopPreview(leaseId: string) {
    previewPending = true; error = '';
    try { await resolveRemoteResult(stopWorktreePreview({ leaseId })); previews = previews.filter((item) => item.id !== leaseId); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Preview could not stop.'; }
    finally { previewPending = false; }
  }

  async function loadAnnotations() {
    if (!worktree) return;
    try { annotations = await resolveRemoteResult(listWorktreeAnnotations({ worktreeId: worktree.worktreeId })) as AnnotationTask[]; annotationCount = annotations.length; scheduleAnnotationPoll(0); }
    catch { annotations = []; annotationCount = 0; }
  }

  function scheduleAnnotationPoll(delay = 800) {
    if (!annotations.some((item) => item.runId && ['starting', 'running'].includes(item.taskStatus))) return;
    if (annotationTaskTimer) clearTimeout(annotationTaskTimer);
    annotationTaskTimer = setTimeout(pollAnnotationTasks, delay);
  }

  async function pollAnnotationTasks() {
    const active = annotations.filter((item) => item.runId && ['starting', 'running'].includes(item.taskStatus));
    for (const task of active) {
      try {
        const existing = annotationEvents[task.id] ?? []; const after = existing.at(-1)?.sequence ?? 0;
        const result = await resolveRemoteResult(getAnnotationTaskEvents({ annotationId: task.id, after }));
        if (result.events.length) annotationEvents = { ...annotationEvents, [task.id]: [...existing, ...result.events] };
        annotations = annotations.map((item) => item.id === task.id ? { ...item, taskStatus: result.status } : item);
        if (result.status === 'completed') await loadPreviews();
      } catch (cause) { error = cause instanceof Error ? cause.message : 'Design task events disconnected.'; }
    }
    scheduleAnnotationPoll();
  }

  async function runAnnotationTask(annotationId: string) {
    if (annotationTaskPending) return;
    annotationTaskPending = annotationId; error = '';
    try {
      const updated = await resolveRemoteResult(startAnnotationTask({ annotationId })) as AnnotationTask;
      annotations = annotations.map((item) => item.id === annotationId ? updated : item); scheduleAnnotationPoll(0);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Design task could not start.'; }
    finally { annotationTaskPending = null; }
  }

  function installAnnotationListener() {
    removeAnnotationListener?.();
    removeAnnotationListener = window.companion?.onAnnotation((value) => {
      const annotation = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const selected = annotation.selectedElement && typeof annotation.selectedElement === 'object' ? annotation.selectedElement as Record<string, unknown> : {};
      if (!worktree || typeof annotation.route !== 'string' || typeof annotation.note !== 'string' || typeof selected.selector !== 'string') return;
      void resolveRemoteResult(createWorktreeAnnotation({
        route: annotation.route, note: annotation.note,
        selectedElement: { selector: selected.selector, label: typeof selected.label === 'string' ? selected.label : undefined, attributes: selected.attributes && typeof selected.attributes === 'object' ? selected.attributes as Record<string, string> : {} },
        ...(typeof annotation.screenshot === 'string' ? { screenshot: annotation.screenshot } : {}),
        sourceWorktreeId: worktree.worktreeId, targetThreadId: worktree.threadId
      })).then(() => loadAnnotations()).catch((cause) => { error = cause instanceof Error ? cause.message : 'Annotation delivery failed.'; });
    }) ?? null;
  }

  async function loadBrowserStatus(options: { invalidatePendingOpen?: boolean } = {}) {
    if (typeof window === 'undefined') return;
    if (options.invalidatePendingOpen) ++browserOperationGeneration;
    const identity = browserIdentity();
    try { await resolveRemoteResult(claimBrowser(identity)); const query = getBrowserStatus(identity); await query.refresh(); const next = await resolveRemoteResult(query); if (!isCurrentBrowserIdentity(identity)) return; browserState = next; if (browserState.url) browserUrl = browserState.url; }
    catch { if (isCurrentBrowserIdentity(identity)) browserState = closedBrowserState(); }
  }

  function browserIdentity() { return { ownerKey: browserOwnerKey, browserLeaseId }; }
  function isCurrentBrowserIdentity(identity: { ownerKey: string; browserLeaseId: string }) { return identity.ownerKey === browserOwnerKey && identity.browserLeaseId === browserLeaseId; }

  async function syncBrowserBounds() {
    if (!browserHost || !browserState.open || dockTab !== 'browser') return;
    const rect = browserHost.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const bounds = { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
    const key = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
    if (key === lastBrowserBounds) return;
    lastBrowserBounds = key;
    await resolveRemoteResult(setBrowserBounds({ ...bounds, ...browserIdentity() })).catch(() => { lastBrowserBounds = ''; });
  }

  function stopBrowserGeometrySync() {
    if (browserGeometryFrame !== null) cancelAnimationFrame(browserGeometryFrame);
    browserGeometryFrame = null;
    lastBrowserBounds = '';
  }

  function startBrowserGeometrySync() {
    stopBrowserGeometrySync();
    const track = () => {
      if (!browserHost || !browserState.open || dockTab !== 'browser') { browserGeometryFrame = null; return; }
      void syncBrowserBounds();
      browserGeometryFrame = requestAnimationFrame(track);
    };
    browserGeometryFrame = requestAnimationFrame(track);
  }

  async function refreshBrowserSurface() {
    await Promise.all([loadBrowserStatus(), loadLocalServers()]);
    if (browserState.open && dockTab === 'browser') { await tick(); await syncBrowserBounds(); }
  }

  async function openWeb() {
    previewPending = true; error = '';
    const identity = browserIdentity();
    const operation = ++browserOperationGeneration;
    const current = () => operation === browserOperationGeneration && isCurrentBrowserIdentity(identity);
    try { await resolveRemoteResult(claimBrowser(identity)); const next = await resolveRemoteResult(openGeneralBrowser({ url: browserUrl, ...identity })); if (!current()) return; browserState = next; await tick(); startBrowserGeometrySync(); }
    catch (cause) {
      // Native loading owns the view lifecycle. If it tears a failed view down,
      // converge the dock to that closed state so no stale host or RAF loop can
      // keep sending geometry for a view that no longer exists.
      if (current()) { stopBrowserGeometrySync(); browserState = closedBrowserState(); error = cause instanceof Error ? cause.message : 'Browser page could not open.'; }
    }
    finally { if (current()) previewPending = false; }
  }

  async function loadLocalServers() {
    localServersPending = true;
    try { const query = listLocalServers({}); await query.refresh(); localServers = await resolveRemoteResult(query); }
    catch { localServers = []; }
    finally { localServersPending = false; }
  }

  function openLocalServer(server: { url: string }) {
    browserUrl = server.url;
    void openWeb();
  }

  async function browserAction(action: 'back' | 'forward' | 'reload' | 'close') {
    const identity = browserIdentity();
    try { if (action === 'close') { ++browserOperationGeneration; stopBrowserGeometrySync(); } const result = await resolveRemoteResult(controlBrowser({ action, ...identity })); if (!isCurrentBrowserIdentity(identity)) return; if ('open' in result) browserState = result; else if (action === 'close') browserState = closedBrowserState(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Browser action failed.'; }
  }

  // A browser tab can be inactive while its native view remains owned by this
  // session. Park it at a harmless 1px bounds instead of releasing the lease;
  // releasing here destroys the browsing context and makes tab reactivation
  // lose the user's page (and its session cookies).
  async function parkBrowserView(identity = browserIdentity()) {
    if (!browserState.open) return;
    stopBrowserGeometrySync();
    await resolveRemoteResult(setBrowserBounds({ ...identity, x: 0, y: 0, width: 1, height: 1 })).catch(() => undefined);
  }

  async function releaseBrowserLease(ownerKey = browserOwnerKey, leaseId = browserLeaseId) {
    if (typeof window === 'undefined') return;
    if (ownerKey === browserOwnerKey && leaseId === browserLeaseId) { ++browserOperationGeneration; previewPending = false; }
    stopBrowserGeometrySync();
    await resolveRemoteResult(releaseBrowser({ ownerKey, browserLeaseId: leaseId })).catch(() => undefined);
    if (ownerKey === browserOwnerKey && leaseId === browserLeaseId) browserState = closedBrowserState();
  }

  async function enterFullscreen() {
    const identity = browserIdentity();
    try { await resolveRemoteResult(setBrowserFullscreen({ fullscreen: true, ...identity })); if (!isCurrentBrowserIdentity(identity)) return; browserState.fullscreen = true; onfullscreenchange?.(true, identity); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Full-screen preview failed.'; }
  }
  $effect(() => { worktree?.worktreeId; installAnnotationListener(); });
  $effect(() => {
    if (typeof window === 'undefined') return;
    const ownerKey = browserOwnerKey;
    const leaseId = browserLeaseId;
    return () => { untrack(() => { void releaseBrowserLease(ownerKey, leaseId); }); };
  });
  $effect(() => {
    if (typeof window === 'undefined') return;
    const isBrowserVisible = visible && dockTab === 'browser';
    const identity = browserIdentity();
    untrack(() => {
      if (isBrowserVisible) { void loadBrowserStatus({ invalidatePendingOpen: true }); return; }
      void parkBrowserView(identity);
    });
  });
  $effect(() => {
    browserHostObserver?.disconnect(); browserHostObserver = null;
    if (browserHost) { browserHostObserver = new ResizeObserver(() => void syncBrowserBounds()); browserHostObserver.observe(browserHost); startBrowserGeometrySync(); }
    return () => { browserHostObserver?.disconnect(); browserHostObserver = null; };
  });
  onDestroy(() => { removeAnnotationListener?.(); browserHostObserver?.disconnect(); stopBrowserGeometrySync(); if (annotationTaskTimer) clearTimeout(annotationTaskTimer); void releaseBrowserLease(); });
</script>

{#if dockTab === 'surfaces'}
  <section class="surface-chooser" aria-label="Right panel surfaces">
    <div class="surface-grid">
      <Button class="surface-card" variant="ghost" onclick={() => openSurface('changes')}><GitCompareArrows /><span>Changes</span></Button>
      <Button class="surface-card" variant="ghost" onclick={() => openSurface('browser')}><Globe2 /><span>Browser</span></Button>
      <Button class="surface-card" variant="ghost" onclick={() => openSurface('terminal')}><Terminal /><span>Terminal</span></Button>
      <Button class="surface-card" variant="ghost" onclick={() => openSurface('files')}><File /><span>File</span></Button>
    </div>
  </section>
{:else}
<Tabs.Root bind:value={dockTab} class="dock-root">
  <header class="dock-header">
    <Tabs.List variant="line">
      {#each openTabs as surface (surface)}
        <span class="dock-tab"><Tabs.Trigger value={surface}>{#if surface === 'changes'}<GitCompareArrows />{:else if surface === 'browser'}<Globe2 />{:else if surface === 'terminal'}<Terminal />{:else if surface === 'agents'}<Bot />{:else}<FolderTree />{/if}{surfaceLabel(surface)}</Tabs.Trigger><Button size="icon-xs" variant="ghost" onclick={() => closeSurface(surface)} aria-label={`Close ${surfaceLabel(surface)} tab`} title={`Close ${surfaceLabel(surface)} tab`}><X /></Button></span>
      {/each}
    </Tabs.List>
    <Popover.Root bind:open={tabMenuOpen}>
      <Popover.Trigger>{#snippet child({ props })}<Button {...props} class="dock-add" size="icon-sm" variant="ghost" aria-label="New tab" title="New tab"><Plus /></Button>{/snippet}</Popover.Trigger>
      <Popover.Content class="dock-tab-menu" align="end" side="bottom" sideOffset={6}>
        <Command.Root>
          <Command.Input placeholder="Open a surface…" />
          <Command.List>
            <Command.Empty>No matching surface.</Command.Empty>
            <Command.Group>
              {#each surfaceOptions as option (option.id)}
                <Command.Item value={option.label} onclick={() => openSurface(option.id)}><option.icon />{option.label}</Command.Item>
              {/each}
            </Command.Group>
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
  </header>

  {#if error}<div class="dock-error" role="alert">{error}<Button size="xs" variant="ghost" onclick={() => (error = '')}>Dismiss</Button></div>{/if}

  <Tabs.Content value="changes" class="dock-panel changes-panel">
    {#if worktree && gitWorkspace}<CodeReview workspace={gitWorkspace} {worktree} />{:else}<Empty.Root><Empty.Header><Empty.Media variant="icon"><GitCompareArrows /></Empty.Media><Empty.Title>Changes unavailable</Empty.Title><Empty.Description>{unavailableReason ?? 'Select a verified project worktree to review changes.'}</Empty.Description></Empty.Header></Empty.Root>{/if}
  </Tabs.Content>

  <Tabs.Content value="browser" class="dock-panel browser-panel">
    <form class="browser-address" onsubmit={(event) => { event.preventDefault(); void openWeb(); }}>
      <div class="browser-nav"><Button type="button" size="icon-sm" variant="ghost" disabled={!browserState.open} onclick={() => browserAction('back')} aria-label="Browser back"><ArrowLeft /></Button><Button type="button" size="icon-sm" variant="ghost" disabled={!browserState.open} onclick={() => browserAction('forward')} aria-label="Browser forward"><ArrowRight /></Button><Button type="button" size="icon-sm" variant="ghost" disabled={!browserState.open} onclick={() => browserAction('reload')} aria-label="Reload browser"><RotateCw /></Button></div>
      <label for="browser-url" class="visually-hidden">Browser URL</label><Input id="browser-url" name="browser-url" type="url" bind:value={browserUrl} placeholder="Search or enter URL" required />
      <div class="browser-tools"><Button type="button" size="icon-sm" variant="ghost" disabled={!browserState.open} onclick={() => void resolveRemoteResult(openBrowserDevTools(browserIdentity())).catch(() => undefined)} aria-label="Open browser DevTools" title="Open browser DevTools"><Code2 /></Button><Button type="submit" size="icon-sm" variant="ghost" disabled={previewPending || !browserUrl.trim()} aria-label="Open browser URL" title="Open browser URL"><ArrowUpRight /></Button></div>
    </form>
    {#if !browserState.open}
      <section class="local-server-list" aria-labelledby="local-server-title">
        <header><div><Globe2 /><strong id="local-server-title">Local servers</strong></div><Button size="icon-xs" variant="ghost" disabled={localServersPending} onclick={() => void loadLocalServers()} aria-label="Refresh local servers" title="Refresh local servers"><RotateCw /></Button></header>
        {#if localServers.length}
          <ul>{#each localServers as server (server.port)}<li><button type="button" onclick={() => openLocalServer(server)}><span class="server-mark"><span></span><span></span><span></span></span><span class="server-copy"><strong>{server.name}</strong><small>localhost:{server.port}</small></span><span class="server-online" aria-label="Listening"></span></button></li>{/each}</ul>
        {:else if localServersPending}
          <p>Discovering listening loopback services…</p>
        {:else}
          <p>No local web servers are listening right now.</p>
        {/if}
      </section>
    {/if}
    {#if browserState.open}<div class="browser-native-host" bind:this={browserHost} aria-label="Embedded browser viewport"></div>{/if}
    {#if !browserState.open}
    {#if previews[0]}
      <section class="preview-card" aria-labelledby="preview-title"><div><Globe2 /><div><strong id="preview-title">Worktree preview</strong><span>{previews[0].relayUrl ?? previews[0].origin}</span></div></div><div class="preview-actions"><Badge variant="outline">{annotationCount} annotations</Badge><Badge variant="secondary">{previews[0].designModeAllowed ? 'Design mode' : 'Isolated'}</Badge><Button size="sm" disabled={previewPending} onclick={() => reopenPreview(previews[0].id)}><Play data-icon="inline-start" /> Open preview</Button><Button size="sm" variant="outline" disabled={!browserState.open} onclick={enterFullscreen}><Maximize2 data-icon="inline-start" /> Full screen</Button><Button size="sm" variant="outline" disabled={previewPending} onclick={() => stopPreview(previews[0].id)}>Stop</Button></div></section>
    {:else if worktree}
      <section class="preview-launch" aria-labelledby="preview-launch-title"><div><Globe2 /><div><strong id="preview-launch-title">No worktree preview</strong><p>Open an authenticated preview relay only when you need to inspect this coding thread.</p></div></div><Button size="sm" variant="outline" onclick={() => (previewSetupOpen = !previewSetupOpen)} aria-expanded={previewSetupOpen}><Play data-icon="inline-start" /> {previewSetupOpen ? 'Hide preview setup' : 'Configure preview'}</Button></section>
      {#if previewSetupOpen}<form class="preview-form" onsubmit={(event) => { event.preventDefault(); void startPreview(); }}>
        <Field.FieldGroup>
          <Field.Field><Field.FieldLabel for="preview-origin">Preview origin</Field.FieldLabel><Input id="preview-origin" bind:value={previewOrigin} type="url" required /></Field.Field>
          <Field.Field orientation="horizontal"><div><Field.FieldLabel for="design-mode">Design mode</Field.FieldLabel><Field.FieldDescription>Allow structured annotations on this preview route.</Field.FieldDescription></div><Switch id="design-mode" bind:checked={designMode} /></Field.Field>
        </Field.FieldGroup>
        <Button type="submit" size="sm" disabled={previewPending || !previewOrigin.trim()}><Play data-icon="inline-start" /> {previewPending ? 'Starting…' : 'Start preview'}</Button>
      </form>{/if}
    {:else}
      <Empty.Root><Empty.Header><Empty.Media variant="icon"><Globe2 /></Empty.Media><Empty.Title>No worktree selected</Empty.Title><Empty.Description>{unavailableReason ?? 'Select a coding thread before starting an isolated preview.'}</Empty.Description></Empty.Header></Empty.Root>
    {/if}
    {#if annotations.length}
      <section class="annotation-tasks" aria-labelledby="annotation-tasks-title"><header><div><Bot /><div><strong id="annotation-tasks-title">Design tasks</strong><span>Hermes activity linked to this worktree</span></div></div><Badge variant="outline">{annotations.length}</Badge></header><ol>{#each annotations as task (task.id)}<li><div class="annotation-task-heading">{#if task.taskStatus === 'completed'}<CircleCheck />{:else if task.taskStatus === 'failed' || task.taskStatus === 'cancelled'}<CircleAlert />{:else}<Bot />{/if}<div><strong>{task.route}</strong><span>{task.note}</span></div><Badge variant={task.taskStatus === 'failed' ? 'destructive' : task.taskStatus === 'completed' ? 'secondary' : 'outline'}>{task.taskStatus}</Badge></div>{#if annotationEvents[task.id]?.length}<div class="annotation-stream" aria-live="polite">{#each annotationEvents[task.id].slice(-4) as item (item.sequence)}{#if item.event.type === 'text'}<pre>{item.event.text}</pre>{:else if item.event.type === 'tool'}<span>{item.event.tool.name} · {item.event.tool.status}</span>{:else if item.event.type === 'approval'}<span>Approval required: {item.event.summary}</span>{:else if item.event.type === 'status'}<span>{item.event.status}{item.event.message ? ` · ${item.event.message}` : ''}</span>{/if}{/each}</div>{/if}{#if ['queued', 'failed', 'cancelled'].includes(task.taskStatus)}<Button size="xs" variant="outline" disabled={annotationTaskPending !== null} onclick={() => runAnnotationTask(task.id)}><Play data-icon="inline-start" /> {annotationTaskPending === task.id ? 'Starting…' : 'Run with Hermes'}</Button>{/if}</li>{/each}</ol></section>
    {/if}
    {/if}
  </Tabs.Content>


  <Tabs.Content value="files" class="dock-panel files-panel">
    {#if !worktree}
      <Empty.Root><Empty.Header><Empty.Media variant="icon"><FolderTree /></Empty.Media><Empty.Title>No worktree selected</Empty.Title><Empty.Description>{unavailableReason ?? 'Bind a Git repository and create a coding thread to browse its isolated files.'}</Empty.Description></Empty.Header></Empty.Root>
    {:else if selectedPreview}
      <header class="file-toolbar"><Button size="icon-sm" variant="ghost" onclick={() => (selectedPreview = null)} aria-label="Back to file list"><ChevronLeft /></Button><strong>{selectedPreview.path}</strong><Badge variant="outline">{selectedPreview.size} B</Badge></header>
      <div class="binary-preview">{#if selectedPreview.mime === 'application/pdf'}<object data={selectedPreview.dataUrl} type="application/pdf" aria-label={`PDF preview of ${selectedPreview.path}`}><p>PDF preview is unavailable in this renderer.</p></object>{:else}<img src={selectedPreview.dataUrl} alt={`Preview of ${selectedPreview.path}`} />{/if}</div>
    {:else if selectedFile}
      <section class="file-editor-panel" aria-labelledby="file-editor-title">
        <form class="file-toolbar" onsubmit={(event) => { event.preventDefault(); void saveFile(); }}><Button type="button" size="icon-sm" variant="ghost" onclick={() => (selectedFile = null)} aria-label="Back to file list"><ChevronLeft /></Button><strong id="file-editor-title">{selectedFile.path}</strong>{#if fileNotice}<span class="file-notice" role="status">{fileNotice}</span>{/if}<Badge variant="outline">{selectedFile.size} B</Badge><Button type="submit" size="sm" disabled={filesPending || fileDraft === selectedFile.content}><Save data-icon="inline-start" /> {filesPending ? 'Saving…' : 'Save'} <kbd aria-hidden="true">⌘S</kbd></Button></form>
        <CodeEditor bind:value={fileDraft} path={selectedFile.path} canSave={!filesPending && fileDraft !== selectedFile.content} onSave={() => void saveFile()} />
      </section>
    {:else}
      <div class="file-browser-toolbar"><header class="file-toolbar"><Button size="icon-sm" variant="ghost" disabled={!currentPath} onclick={() => loadFiles(parentPath(currentPath))} aria-label="Parent directory"><ChevronLeft /></Button><strong>/{currentPath}</strong><Button size="icon-sm" variant="ghost" onclick={() => openFileAction('create-file')} aria-label="New file"><FilePlus2 /></Button><Button size="icon-sm" variant="ghost" onclick={() => openFileAction('create-directory')} aria-label="New folder"><FolderPlus /></Button><Badge variant="outline">{entries.length}</Badge></header><form class="file-search" onsubmit={(event) => { event.preventDefault(); void searchFiles(); }}><label class="visually-hidden" for="worktree-file-search">Search worktree files</label><Input id="worktree-file-search" name="worktree-file-search" type="search" bind:value={fileSearch} placeholder="Search files…" /><Button type="submit" size="icon-sm" variant="ghost" disabled={!fileSearch.trim() || filesPending} aria-label="Search files"><Search /></Button></form></div>
      {#if fileSearch.trim() && searchResults.length}
        <ul class="file-list search-list" aria-label={`Search results for ${fileSearch}`}>{#each searchResults as result (`${result.path}:${result.line}`)}<li><button class="file-open" type="button" onclick={() => openSearchResult(result)}><Search /><span><strong>{result.path}:{result.line}</strong><small>{result.text}</small></span></button></li>{/each}</ul>
      {:else if fileSearch.trim() && !filesPending}
        <Empty.Root><Empty.Header><Empty.Media variant="icon"><Search /></Empty.Media><Empty.Title>No matching text</Empty.Title><Empty.Description>Try another search across this worktree.</Empty.Description></Empty.Header></Empty.Root>
      {:else}
        <ul class="file-list" aria-label={`Files in /${currentPath}`}>{#each entries as entry (entry.path)}<li class="file-row"><button class="file-open" type="button" onclick={() => openEntry(entry)}>{#if entry.kind === 'directory'}<Folder />{:else}<File />{/if}<span>{entry.name}</span>{#if entry.size !== null}<small>{entry.size} B</small>{/if}</button><Button size="icon-xs" variant="ghost" onclick={() => openFileAction('move', entry)} aria-label={`Rename or move ${entry.name}`}><Pencil /></Button><Button size="icon-xs" variant="ghost" onclick={() => openFileAction('delete', entry)} aria-label={`Delete ${entry.name}`}><Trash2 /></Button></li>{/each}</ul>
      {/if}
    {/if}
  </Tabs.Content>

  <Tabs.Content value="terminal" class="dock-panel terminal-panel">
    <TerminalSplit {worktree} {unavailableReason} layout="sidebar" />
  </Tabs.Content>

  <Tabs.Content value="agents" class="dock-panel agents-panel">
    <AgentsDock />
  </Tabs.Content>
</Tabs.Root>
{/if}

<Dialog.Root bind:open={fileActionOpen}>
  <Dialog.Content class="sm:max-w-md"><Dialog.Header><Dialog.Title>{fileAction === 'create-file' ? 'Create file' : fileAction === 'create-directory' ? 'Create folder' : fileAction === 'move' ? 'Rename or move entry' : 'Delete entry'}</Dialog.Title><Dialog.Description>{fileAction === 'delete' ? `Delete ${fileActionEntry?.path}? This cannot be undone.` : 'Paths stay confined to the selected worktree. Parent folders must already exist.'}</Dialog.Description></Dialog.Header><form class="file-action-form" onsubmit={(event) => { event.preventDefault(); void performFileAction(); }}>{#if fileAction !== 'delete'}<Field.Field><Field.FieldLabel for="file-action-path">Worktree-relative path</Field.FieldLabel><Input id="file-action-path" name="file-action-path" bind:value={fileActionPath} required /></Field.Field>{/if}<Dialog.Footer><Button type="button" variant="outline" onclick={() => (fileActionOpen = false)}>Cancel</Button><Button type="submit" variant={fileAction === 'delete' ? 'destructive' : 'default'} disabled={filesPending || (fileAction !== 'delete' && !fileActionPath.trim())}>{filesPending ? 'Working…' : fileAction === 'delete' ? 'Delete' : 'Apply'}</Button></Dialog.Footer></form></Dialog.Content>
</Dialog.Root>

<style>
  :global(.dock-root) { block-size: 100%; display: grid; grid-template-rows: auto auto minmax(0, 1fr); overflow: hidden; background: var(--surface-floor); }
  .surface-chooser { block-size: 100%; display: grid; place-content: center; padding: clamp(1rem, 4cqi, 1.75rem); background: var(--surface-floor); container: surface-chooser / inline-size; }
  .surface-grid { inline-size: min(15rem, calc(100cqi - 2rem)); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem; }
  :global(.surface-card) { aspect-ratio: 1.18; min-block-size: 5.5rem; display: grid; place-content: center; justify-items: center; gap: .65rem; border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.2); background: transparent; padding: .8rem; color: var(--muted-foreground); text-align: center; white-space: normal; }
  :global(.surface-card:hover), :global(.surface-card:focus-visible) { background: var(--sidebar-accent); }
  :global(.surface-card svg) { inline-size: 1.1rem; block-size: 1.1rem; color: var(--muted-foreground); }
  :global(.surface-card) span { min-inline-size: 0; font-size: .76rem; }
  .dock-header, .file-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--density-gap); padding: .4rem .55rem; border-block-end: 1px solid var(--border); }
  .dock-header { grid-row: 1; min-block-size: var(--shell-titlebar-height); display: grid; grid-template-columns: minmax(0, 1fr) auto; padding-inline-end: var(--shell-chrome-trailing-width); }
  .dock-header :global([data-slot='tabs-list']) { min-inline-size: 0; max-inline-size: 100%; overflow: auto hidden; overscroll-behavior-inline: contain; scrollbar-width: none; }
  .dock-header :global([data-slot='tabs-list']::-webkit-scrollbar) { display: none; }
  .dock-tab { min-inline-size: 0; display: inline-flex; align-items: center; border-radius: calc(var(--radius) * .75); }
  .dock-tab :global([data-slot='tabs-trigger']) { min-inline-size: 0; max-inline-size: 10rem; padding-inline-end: .15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dock-tab :global(button[aria-label^='Close']) { opacity: 0; }
  .dock-tab:is(:hover, :focus-within) :global(button[aria-label^='Close']) { opacity: 1; }
  .dock-tab:has(:global([data-state='active'])) { background: color-mix(in oklab, var(--sidebar-accent), white 2%); color: var(--foreground); }
  :global(.dock-add) { flex: none; }
  :global(.dock-tab-menu) { inline-size: min(19rem, calc(100vw - 1rem)); padding: .2rem; }
  :global(.dock-tab-menu [data-slot='command']) { max-block-size: min(22rem, 60vh); }
  .dock-error { grid-row: 2; display: flex; align-items: center; gap: .5rem; padding: .4rem .7rem; border-block-end: 1px solid color-mix(in oklab, var(--destructive), transparent 50%); color: var(--destructive); font-size: .7rem; }
  .dock-error :global(button) { margin-inline-start: auto; }
  :global(.dock-panel) { grid-row: 3; min-block-size: 0; margin: 0; padding: var(--panel-padding); overflow: auto; }
  :global(.browser-panel[data-state='active']) { display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
  .browser-native-host { min-inline-size: 0; min-block-size: 0; }
  :global(.files-panel) { padding: 0; }
  :global(.changes-panel), :global(.terminal-panel) { padding: 0; overflow: hidden; }
  :global(.changes-panel) { container: git-review / inline-size; }
  :global(.agents-panel) { padding: 0; overflow: hidden; }
  .browser-address { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .3rem; margin-block-end: .55rem; }
  .browser-nav { display: flex; align-items: center; gap: .1rem; }
  .browser-tools { display: flex; align-items: center; gap: .1rem; }
  .local-server-list { margin-block-end: .7rem; border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.1); overflow: clip; background: color-mix(in oklab, var(--surface-raised), transparent 18%); }
  .local-server-list > header { display: flex; align-items: center; justify-content: space-between; min-block-size: 2.35rem; padding: .35rem .5rem .3rem .65rem; border-block-end: 1px solid var(--border); }
  .local-server-list > header > div { display: flex; align-items: center; gap: .4rem; }
  .local-server-list > header :global(svg) { inline-size: .85rem; color: var(--muted-foreground); }
  .local-server-list > header strong { font-size: .7rem; font-weight: 620; }
  .local-server-list ul { margin: 0; padding: 0; list-style: none; }
  .local-server-list li + li { border-block-start: 1px solid var(--border); }
  .local-server-list li > button { inline-size: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .55rem; border: 0; background: transparent; padding: .6rem .65rem; color: var(--foreground); text-align: start; }
  .local-server-list li > button:hover, .local-server-list li > button:focus-visible { background: var(--sidebar-accent); outline: 0; }
  .server-mark { inline-size: 1.8rem; block-size: 1.8rem; display: grid; grid-template-columns: repeat(3, .2rem); align-content: start; justify-content: center; gap: .16rem; border: 1px solid var(--border); border-radius: calc(var(--radius) * .7); padding-block-start: .35rem; background: color-mix(in oklab, var(--surface-floor), transparent 20%); }
  .server-mark span { inline-size: .2rem; block-size: .2rem; border-radius: 50%; background: var(--muted-foreground); }
  .server-mark span:first-child { background: var(--destructive); } .server-mark span:nth-child(2) { background: oklch(.75 .14 80); } .server-mark span:nth-child(3) { background: var(--status-positive); }
  .server-copy { min-inline-size: 0; display: grid; gap: .12rem; }
  .server-copy strong { overflow: hidden; font-size: .72rem; font-weight: 590; text-overflow: ellipsis; white-space: nowrap; }
  .server-copy small { color: var(--muted-foreground); font-family: var(--font-mono); font-size: .62rem; }
  .server-online { inline-size: .55rem; block-size: .55rem; border-radius: 50%; background: var(--status-positive); }
  .local-server-list > p { margin: 0; padding: .65rem; color: var(--muted-foreground); font-size: .66rem; line-height: 1.4; }
  .preview-form, .preview-card { display: grid; gap: .65rem; border-block-start: 1px solid var(--border); background: color-mix(in oklab, var(--surface-raised), transparent 30%); padding: .7rem; }
  .preview-launch { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .55rem; padding: .3rem .1rem .7rem; }
  .preview-launch > div, .preview-card > div:first-child { display: flex; align-items: flex-start; gap: .5rem; }
  .preview-launch > div > :global(svg), .preview-card > div:first-child > :global(svg) { inline-size: .9rem; flex: none; color: var(--primary); }
  .preview-launch strong, .preview-card strong { display: block; font-size: .76rem; }
  .preview-launch p, .preview-card span { display: block; max-inline-size: 52ch; margin: .16rem 0 0; overflow-wrap: anywhere; color: var(--muted-foreground); font-size: .66rem; line-height: 1.45; }
  .preview-form > :global(button) { justify-self: end; }
  .preview-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: .4rem; }
  .annotation-tasks { display: grid; gap: .45rem; margin-block-start: .55rem; border-block-start: 1px solid var(--border); background: color-mix(in oklab, var(--surface-raised), transparent 30%); }
  .annotation-tasks > header, .annotation-task-heading { display: flex; align-items: flex-start; gap: .55rem; }
  .annotation-tasks > header { align-items: center; justify-content: space-between; padding: .5rem .6rem; border-block-end: 1px solid var(--border); }
  .annotation-tasks > header > div { display: flex; align-items: center; gap: .55rem; }
  .annotation-tasks :global(svg) { inline-size: .85rem; flex: none; color: var(--muted-foreground); }
  .annotation-tasks strong, .annotation-tasks span { display: block; }
  .annotation-tasks strong { font-size: .72rem; }
  .annotation-tasks span { color: var(--muted-foreground); font-size: .65rem; line-height: 1.45; }
  .annotation-tasks ol { display: grid; gap: .35rem; margin: 0; padding: .4rem; list-style: none; }
  .annotation-tasks li { display: grid; gap: .35rem; border-block-start: 1px solid var(--border); padding: .45rem .1rem; }
  .annotation-task-heading > div { min-inline-size: 0; flex: 1; }
  .annotation-task-heading > :global(.badge) { margin-inline-start: auto; }
  .annotation-stream { max-block-size: 8rem; overflow: auto; border-radius: calc(var(--radius) * .65); background: var(--muted); padding: .45rem .55rem; }
  .annotation-stream pre { margin: 0; white-space: pre-wrap; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .63rem; line-height: 1.45; }
  .annotation-tasks li > :global(button) { justify-self: end; }
  :global(.files-panel[data-state='active']) { display: grid; grid-template-rows: auto minmax(0, 1fr); }
  .file-editor-panel { min-block-size: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
  .file-browser-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(10rem, 16rem); border-block-end: 1px solid var(--border); }
  .file-browser-toolbar .file-toolbar { border-block-end: 0; }
  .file-search { display: flex; align-items: center; gap: .2rem; padding: .3rem .4rem; border-inline-start: 1px solid var(--border); }
  .file-toolbar { min-inline-size: 0; }
  .file-toolbar strong { min-inline-size: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: .7rem; }
  .file-list { margin: 0; padding: .25rem; overflow: auto; list-style: none; }
  .file-row { display: flex; align-items: center; }
  .file-list .file-open { min-inline-size: 0; flex: 1; display: flex; align-items: center; gap: .4rem; border: 0; border-radius: calc(var(--radius) * .75); background: transparent; padding: .3rem .4rem; color: var(--foreground); text-align: start; }
  .file-list .file-open:hover, .file-list .file-open:focus-visible { background: var(--sidebar-accent); }
  .file-list .file-open:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .file-list button :global(svg) { inline-size: .9rem; flex: none; color: var(--muted-foreground); }
  .file-list span { min-inline-size: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: .7rem; }
  .file-list small { color: var(--muted-foreground); font-size: .62rem; }
  .search-list span { display: grid; gap: .2rem; }
  .search-list strong, .search-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-list strong { font: inherit; }
  .file-notice { color: var(--muted-foreground); font-size: .65rem; }
  .file-toolbar kbd { margin-inline-start: .12rem; color: var(--muted-foreground); font-family: var(--font-mono); font-size: .6rem; font-weight: 500; }
  .binary-preview { min-block-size: 0; display: grid; place-items: center; overflow: auto; background: repeating-conic-gradient(var(--muted) 0 25%, transparent 0 50%) 50% / 1rem 1rem; }
  .binary-preview img { max-inline-size: 100%; max-block-size: 100%; object-fit: contain; }
  .binary-preview object { inline-size: 100%; block-size: 100%; min-block-size: 28rem; border: 0; background: var(--background); }
  .file-action-form { display: grid; gap: .65rem; }
  @container surface-chooser (inline-size < 18rem) { .surface-grid { grid-template-columns: 1fr; } }
  @media (max-width: 52rem) { .file-browser-toolbar { grid-template-columns: 1fr; } .file-search { border-block-start: 1px solid var(--border); border-inline-start: 0; } }
</style>
