<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import * as HoverCard from '$lib/components/ui/hover-card';
  import { Button } from '$lib/components/ui/button';
  import SidebarCategory from '$lib/components/companion/sidebar-category.svelte';
  import ModelProviderMark from '$lib/components/companion/model-provider-mark.svelte';
  import { humanizeModelId } from '$lib/model-identity';
  import type { GatewayConnection, HermesProjectTreeNode, HermesSession, ProjectBinding, SessionPresentation, SessionTreeFilter, WorktreeRecord } from '@hermes-companion/contracts';
  import { Activity, Archive, Bell, Check, CircleAlert, CircleCheck, Clock3, Code2, Copy, FileText, Folder, FolderOpen, GitBranch, GitPullRequest, Hash, ListFilter, LoaderCircle, MessageCircle, MessageCircleQuestion, Pencil, Pin, Plus, ShieldAlert, Timer, Trash2 } from '@lucide/svelte';

  let {
    sessions = [], projects = [], projectTree = [], hydratedProjects = {}, projectLoadingIds = [], worktrees = [], connections = [], pinnedSessionIds = [], activeSessionId = null,
    selectedProjectId = null, activeProfileId = 'default', presentation = 'chats', filter = null, loading = false,
    onselectsession, onselectproject, onnewproject, onnewsession, onnewworktree, onremoveworktree, onprojectexpand, onprojectactions, onprojectarchive, onactions, onarchive, ontogglepinned, oncopytranscript, onmarkunread,
    onpresentationchange, onfilterchange, oncollapseall
  }: {
    sessions?: HermesSession[]; projects?: ProjectBinding[]; projectTree?: HermesProjectTreeNode[]; hydratedProjects?: Record<string, HermesProjectTreeNode>; projectLoadingIds?: string[]; worktrees?: WorktreeRecord[]; connections?: GatewayConnection[];
    pinnedSessionIds?: string[]; activeSessionId?: string | null; selectedProjectId?: string | null; activeProfileId?: string; presentation?: SessionPresentation;
    filter?: SessionTreeFilter | null; loading?: boolean; onselectsession?: (id: string, projectId?: string) => void;
    onselectproject?: (id: string) => void; onnewproject?: () => void; onnewsession?: (project?: ProjectBinding) => void; onnewworktree?: (id: string, repositoryPaths: string[]) => void; onremoveworktree?: (target: { projectId: string; repositoryPath: string; worktreePath: string; branch: string }) => void; onprojectexpand?: (id: string) => void;
    onprojectactions?: (id: string) => void; onprojectarchive?: (id: string) => void;
    onactions?: (id: string) => void; onarchive?: (id: string) => void; ontogglepinned?: (id: string) => void; oncopytranscript?: (id: string) => void; onmarkunread?: (id: string, unread: boolean) => void; onpresentationchange?: (value: SessionPresentation) => void;
    onfilterchange?: (value: SessionTreeFilter | null) => void; oncollapseall?: () => void;
  } = $props();

  const emptyFilter: SessionTreeFilter = { sources: [], profileIds: [], projectIds: [], statuses: [], prStates: [], environments: [], archived: 'exclude', groupBy: [], sort: 'updated-desc' };
  const uniqueSessions = $derived([...new Map(sessions.map((session) => [session.id, session])).values()]);
  const effectiveFilter = $derived(filter ?? emptyFilter);
  const pinned = $derived(uniqueSessions.filter((session) => pinnedSessionIds.includes(session.id)));
  const messaging = $derived(filteredSessions().filter((session) => session.source === 'slack' || session.source === 'discord'));
  const jobs = $derived(filteredSessions().filter((session) => session.source === 'cron'));
  const messagingGroups = $derived(['slack', 'discord'].map((source) => ({ id: `messaging:${source}`, label: source[0].toUpperCase() + source.slice(1), sessions: messaging.filter((session) => session.source === source) })).filter((group) => group.sessions.length));
  const bottomGroups = $derived([...messagingGroups, { id: 'jobs', label: 'Jobs', sessions: jobs }]);
  const chats = $derived(filteredSessions().filter((session) => session.source === 'chat' && !pinnedSessionIds.includes(session.id)));
  const treeProjectIds = $derived(new Set(projectTree.map((project) => project.id)));
  const visibleProjects = $derived([
    ...projectTree.map((node) => projects.find((project) => project.id === node.id) ?? ({ id: node.id, name: node.label, repositoryPath: node.path ?? '', remoteUrl: null, defaultBranch: 'main', connectionId: connections[0]?.id ?? '', archived: node.archived } satisfies ProjectBinding)),
    ...projects.filter((project) => !treeProjectIds.has(project.id))
  ].filter((project) => effectiveFilter.archived === 'include' || (effectiveFilter.archived === 'only' ? project.archived : !project.archived)));
  const projectGroups = $derived(visibleProjects.map((project) => {
    const node = hydratedProjects[project.id] ?? projectTree.find((item) => item.id === project.id) ?? null;
    const nativeSessions = node?.repos.flatMap((repo) => repo.groups.flatMap((group) => group.sessions)) ?? [];
    const previewSessions = node?.previewSessions ?? [];
    const fallbackSessions = chats.filter((session) => session.projectId === project.id || worktrees.some((worktree) => worktree.projectId === project.id && worktree.threadId === session.id));
    const sessions = nativeSessions.length ? nativeSessions : previewSessions.length ? previewSessions : fallbackSessions;
    return { project, node, sessions: [...new Map(sessions.map((session) => [session.id, session])).values()] };
  }).filter((group) => presentation === 'projects' || group.sessions.length));
  const primaryLabel = $derived(presentation === 'projects' ? 'Projects' : presentation === 'jobs' ? 'Jobs' : presentation === 'chats' ? 'Chats' : 'Sessions');
  const primaryCount = $derived(presentation === 'projects' ? projectGroups.length : presentation === 'jobs' ? jobs.length : chats.length);
  const primaryCategoryId = $derived(presentation === 'jobs' ? 'jobs' : `primary:${presentation}`);
  let collapsedCategories = $state(new Set<string>(['jobs', 'messaging:slack', 'messaging:discord']));
  let expandedProjects = $state(new Set<string>());
  let autoExpandedProjectId = $state<string | null>(null);

  $effect(() => {
    if (selectedProjectId && selectedProjectId !== autoExpandedProjectId) {
      autoExpandedProjectId = selectedProjectId;
      if (!expandedProjects.has(selectedProjectId)) expandedProjects = new Set([...expandedProjects, selectedProjectId]);
    }
  });

  function categoryExpanded(id: string) { return !collapsedCategories.has(id); }
  function toggleCategory(id: string) {
    const next = new Set(collapsedCategories);
    if (next.has(id)) next.delete(id); else next.add(id);
    collapsedCategories = next;
  }
  function projectExpanded(id: string) { return expandedProjects.has(id); }
  function toggleProject(id: string) {
    const next = new Set(expandedProjects);
    if (next.has(id)) next.delete(id); else { next.add(id); onselectproject?.(id); onprojectexpand?.(id); }
    expandedProjects = next;
  }

  function filteredSessions() {
    const values = uniqueSessions.filter((session) => {
      if (presentation === 'chats' && (session.profileId ?? 'default') !== activeProfileId) return false;
      if (presentation === 'jobs' && session.source !== 'cron') return false;
      if (effectiveFilter.sources.length && !effectiveFilter.sources.includes(session.source)) return false;
      if (effectiveFilter.profileIds.length && !effectiveFilter.profileIds.includes(session.profileId ?? 'default')) return false;
      if (effectiveFilter.projectIds.length && (!session.projectId || !effectiveFilter.projectIds.includes(session.projectId))) return false;
      if (effectiveFilter.statuses.length && !effectiveFilter.statuses.includes(session.status)) return false;
      if (effectiveFilter.prStates.length && !effectiveFilter.prStates.includes(session.prState)) return false;
      if (effectiveFilter.environments.length && !effectiveFilter.environments.includes(session.environment)) return false;
      if (effectiveFilter.archived === 'exclude' && session.archived) return false;
      if (effectiveFilter.archived === 'only' && !session.archived) return false;
      return true;
    });
    return values.toSorted((a, b) => effectiveFilter.sort === 'title-asc'
      ? a.title.localeCompare(b.title)
      : (Date.parse(a.updatedAt ?? a.createdAt ?? '') - Date.parse(b.updatedAt ?? b.createdAt ?? '')) * (effectiveFilter.sort === 'updated-asc' ? 1 : -1));
  }

  function toggleArray(key: 'sources', value: SessionTreeFilter['sources'][number]) {
    const values = effectiveFilter[key] as string[];
    onfilterchange?.({ ...effectiveFilter, [key]: values.includes(value as string) ? values.filter((item) => item !== value) : [...values, value] } as SessionTreeFilter);
  }

  function projectName(session: HermesSession) { return projects.find((project) => project.id === session.projectId)?.name ?? null; }
  function sessionContext(session: HermesSession) {
    return projectName(session) ?? connections.find((connection) => connection.id === (session.profileId ?? 'default'))?.name ?? session.provider ?? 'Hermes';
  }
  function sessionProject(session: HermesSession) { return projects.find((project) => project.id === session.projectId) ?? null; }
  function repositoryLabel(session: HermesSession) {
    const project = sessionProject(session);
    const remote = project?.remoteUrl?.trim();
    if (remote) {
      const match = remote.match(/(?:github\.com[/:]|^[^@]+@[^:]+:)([^/]+)\/([^/]+?)(?:\.git)?$/i);
      if (match) return `${match[1]}/${match[2]}`;
      try {
        const url = new URL(remote);
        const parts = url.pathname.replace(/\.git$/i, '').split('/').filter(Boolean);
        if (parts.length >= 2) return parts.slice(-2).join('/');
      } catch { /* A filesystem remote falls through to its basename. */ }
    }
    const path = project?.repositoryPath ?? session.cwd;
    return path?.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Repository';
  }
  function displayPath(value: string | null) {
    if (!value) return 'No directory';
    return value.replace(/^\/Users\/[^/]+(?=\/|$)/, '~').replace(/^\/home\/[^/]+(?=\/|$)/, '~');
  }
  function sessionStatusLabel(session: HermesSession) {
    return sessionSignal(session)?.label ?? ({ active: 'Active', ready: 'Ready', working: 'Hermes is working', completed: 'Completed', failed: 'Failed' } as const)[session.status];
  }
  function dateTime(value: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  function sessionDuration(session: HermesSession) {
    if (!session.createdAt) return null;
    const start = Date.parse(session.createdAt);
    const endValue = session.status === 'working' || session.status === 'active' ? Date.now() : Date.parse(session.updatedAt ?? session.createdAt);
    if (!Number.isFinite(start) || !Number.isFinite(endValue)) return null;
    const seconds = Math.max(0, Math.round((endValue - start) / 1_000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  async function copySession(session: HermesSession) {
    await navigator.clipboard.writeText(session.id);
  }
  function relativeTime(value: string | null) {
    if (!value) return '';
    const days = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 86_400_000));
    if (days === 0) return 'now';
    return `${days}d`;
  }
  function sessionSignal(session: HermesSession): { kind: 'working' | 'approval' | 'input' | 'review' | 'blocked' | 'complete' | 'unread'; label: string } | null {
    if (session.attention === 'approval') return { kind: 'approval', label: 'Needs approval' };
    if (session.attention === 'input') return { kind: 'input', label: 'Waiting for input' };
    if (session.attention === 'blocked' || session.status === 'failed') return { kind: 'blocked', label: 'Blocked' };
    if (session.status === 'working') return { kind: 'working', label: 'Hermes is working' };
    if (session.attention === 'review' || session.prState === 'review-required') return { kind: 'review', label: 'Needs review' };
    if (session.unread) return { kind: 'unread', label: 'Unread activity' };
    if (session.status === 'completed') return { kind: 'complete', label: 'Completed' };
    return null;
  }
</script>

{#snippet ProviderIcon(session: HermesSession)}
  <ModelProviderMark modelId={session.model} provider={session.provider} label={`${session.provider ?? 'Hermes'} model provider`} />
{/snippet}

{#snippet KindIcon(session: HermesSession)}
  {#if session.kind === 'code'}<Code2 aria-label="Code session" />{:else if session.kind === 'review'}<GitPullRequest aria-label="Review session" />{:else if session.kind === 'job'}<Clock3 aria-label="Scheduled job" />{:else if session.kind === 'message'}<MessageCircle aria-label="Messaging session" />{:else}<MessageCircle aria-label="Chat session" />{/if}
{/snippet}

{#snippet StatusIcon(session: HermesSession)}
  {@const signal = sessionSignal(session)}
  {#if signal?.kind === 'working'}<LoaderCircle class="status-working" />
  {:else if signal?.kind === 'approval'}<ShieldAlert />
  {:else if signal?.kind === 'input'}<MessageCircleQuestion />
  {:else if signal?.kind === 'review'}<GitPullRequest />
  {:else if signal?.kind === 'blocked'}<CircleAlert />
  {:else if signal?.kind === 'complete'}<CircleCheck />
  {:else}<Activity />{/if}
{/snippet}

{#snippet SessionRow(session: HermesSession, projectId?: string)}
  {@const signal = sessionSignal(session)}
  <ContextMenu.Root>
    <ContextMenu.Trigger>
      {#snippet child({ props })}
        <li {...props} class="session-entry" data-unread={session.unread}>
          <HoverCard.Root openDelay={500} closeDelay={100}>
            <HoverCard.Trigger>
              {#snippet child({ props: hoverProps })}
          <button {...hoverProps} class:active={session.id === activeSessionId} type="button" onclick={() => onselectsession?.(session.id, projectId)}>
            <span class="session-signal" data-signal={signal?.kind ?? 'none'} role={signal ? 'img' : undefined} aria-label={signal?.label} title={signal?.label}>
              {#if signal?.kind === 'working'}<LoaderCircle />
              {:else if signal?.kind === 'approval'}<ShieldAlert />
              {:else if signal?.kind === 'input'}<MessageCircleQuestion />
              {:else if signal?.kind === 'review'}<GitPullRequest />
              {:else if signal?.kind === 'blocked'}<CircleAlert />
              {:else if signal?.kind === 'complete'}<CircleCheck />
              {:else if signal?.kind === 'unread'}<span class="unread-dot"></span>{/if}
            </span>
            <span class="session-copy"><span class="session-title">{session.title}</span><span class="session-meta"><span class="session-icons">{@render ProviderIcon(session)}{@render KindIcon(session)}</span><span>{sessionContext(session)}</span>{#if session.branch}<span>· {session.branch}</span>{/if}{#if session.channel}<span>· {session.channel}</span>{/if}</span></span>
            <span class="session-age">{relativeTime(session.updatedAt ?? session.createdAt)}</span>
          </button>
              {/snippet}
            </HoverCard.Trigger>
            <HoverCard.Content class="session-detail-card" side="right" align="start" collisionPadding={8}>
              {@const directory = session.cwd ?? sessionProject(session)?.repositoryPath ?? null}
              {@const lastMessageAt = dateTime(session.updatedAt)}
              {@const duration = sessionDuration(session)}
              <span class="session-detail-title">{session.title}</span>
              <ul class="session-detail-list">
                {#if session.branch}<li class="session-detail-line"><GitBranch /><span>{repositoryLabel(session)}/{session.branch}</span></li>{/if}
                {#if directory}<li class="session-detail-line"><Folder /><span>{displayPath(directory)}</span></li>{/if}
                {#if session.model}<li class="session-detail-line">{@render ProviderIcon(session)}<span>{humanizeModelId(session.model)}</span></li>{/if}
                <li class="session-detail-line">{@render StatusIcon(session)}<span>{sessionStatusLabel(session)}</span></li>
                {#if lastMessageAt}<li class="session-detail-line"><Clock3 /><span><small>Last message</small> {lastMessageAt}</span></li>{/if}
                {#if duration}<li class="session-detail-line"><Timer /><span><small>Session time</small> {duration}</span></li>{/if}
              </ul>
            </HoverCard.Content>
          </HoverCard.Root>
          <span class="session-row-actions" aria-label={`Quick actions for ${session.title}`}>
            <Button size="icon-xs" variant="ghost" onclick={() => ontogglepinned?.(session.id)} aria-label={pinnedSessionIds.includes(session.id) ? `Unpin ${session.title}` : `Pin ${session.title}`} title={pinnedSessionIds.includes(session.id) ? 'Unpin' : 'Pin'}><Pin /></Button>
            <Button size="icon-xs" variant="ghost" onclick={() => onarchive?.(session.id)} aria-label={session.archived ? `Restore ${session.title}` : `Archive ${session.title}`} title={session.archived ? 'Restore' : 'Archive'}><Archive /></Button>
          </span>
        </li>
      {/snippet}
    </ContextMenu.Trigger>
    <ContextMenu.Content class="session-context-menu" sideOffset={6} collisionPadding={8}>
      <ContextMenu.Item onSelect={() => ontogglepinned?.(session.id)}><Pin />{pinnedSessionIds.includes(session.id) ? 'Unpin' : 'Pin'}</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => onactions?.(session.id)}><Pencil />Rename</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => onmarkunread?.(session.id, !session.unread)}><Bell />{session.unread ? 'Mark as Read' : 'Mark as Unread'}</ContextMenu.Item>
      <ContextMenu.Sub><ContextMenu.SubTrigger><Copy />Copy</ContextMenu.SubTrigger><ContextMenu.SubContent collisionPadding={8}>
        <ContextMenu.Item onSelect={() => void navigator.clipboard.writeText(session.id)}><Hash />Copy ID</ContextMenu.Item>
        {#if session.branch}<ContextMenu.Item onSelect={() => void navigator.clipboard.writeText(session.branch!)}><GitBranch />Copy Branch</ContextMenu.Item>{/if}
        <ContextMenu.Item onSelect={() => oncopytranscript?.(session.id)}><FileText />Copy Transcript</ContextMenu.Item>
      </ContextMenu.SubContent></ContextMenu.Sub>
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={() => onarchive?.(session.id)}><Archive />{session.archived ? 'Restore' : 'Archive'}</ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>
{/snippet}

{#snippet ProjectRow(group: { project: ProjectBinding; node: HermesProjectTreeNode | null; sessions: HermesSession[] })}
  <li class="project-group">
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        {#snippet child({ props })}
          <div {...props} class="project-heading">
            <button type="button" class:active={selectedProjectId === group.project.id} aria-expanded={projectExpanded(group.project.id)} onclick={() => toggleProject(group.project.id)}>{#if projectExpanded(group.project.id)}<FolderOpen />{:else}<Folder />{/if}<span class="project-name">{group.project.name}</span></button>
            <Button size="icon-xs" variant="ghost" onclick={() => onnewsession?.(group.project)} aria-label={`New session in ${group.project.name}`}><Plus /></Button>
          </div>
        {/snippet}
      </ContextMenu.Trigger>
      {#if !group.node?.isAuto && !group.node?.isNoProject}<ContextMenu.Content class="project-context-menu" sideOffset={6} collisionPadding={8}>
        <ContextMenu.Item onSelect={() => onnewworktree?.(group.project.id, group.node?.repos.map((repo) => repo.path).filter((path): path is string => Boolean(path)) ?? [group.project.repositoryPath])}><GitBranch />New worktree…</ContextMenu.Item>
        <ContextMenu.Item onSelect={() => onprojectactions?.(group.project.id)}><Pencil />Rename</ContextMenu.Item>
        <ContextMenu.Item onSelect={() => onprojectarchive?.(group.project.id)}><Archive />{group.project.archived ? 'Restore' : 'Archive'}</ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item variant="destructive" onSelect={() => onprojectactions?.(group.project.id)}><Trash2 />Delete…</ContextMenu.Item>
      </ContextMenu.Content>{/if}
    </ContextMenu.Root>
    {#if projectExpanded(group.project.id)}
      {#if projectLoadingIds.includes(group.project.id)}<p class="tree-empty">Loading project…</p>
      {:else if hydratedProjects[group.project.id]?.repos.length}
        <ul class="project-repositories">{#each hydratedProjects[group.project.id].repos as repo (repo.id)}<li><div class="repository-heading"><FolderOpen /><span>{repo.label}</span><small>{repo.sessionCount}</small></div>{#if repo.groups.length === 1 && repo.groups[0]?.label === repo.label}<ul class="project-sessions">{#each repo.groups[0].sessions as session (session.id)}{@render SessionRow(session, group.project.id)}{/each}</ul>{:else}<ul class="project-lanes">{#each repo.groups as lane (lane.id)}<li><ContextMenu.Root><ContextMenu.Trigger>{#snippet child({ props })}<div {...props} class="lane-heading"><GitBranch /><span>{lane.label}</span></div>{/snippet}</ContextMenu.Trigger>{#if !lane.isMain && !lane.isKanban && repo.path && lane.path}<ContextMenu.Content sideOffset={6} collisionPadding={8}><ContextMenu.Item variant="destructive" onSelect={() => onremoveworktree?.({ projectId: group.project.id, repositoryPath: repo.path!, worktreePath: lane.path!, branch: lane.label })}><Trash2 />Remove worktree…</ContextMenu.Item></ContextMenu.Content>{/if}</ContextMenu.Root><ul class="project-sessions">{#each lane.sessions as session (session.id)}{@render SessionRow(session, group.project.id)}{/each}</ul></li>{/each}</ul>{/if}</li>{/each}</ul>
      {:else}<ul class="project-sessions">{#each group.sessions as session (session.id)}{@render SessionRow(session, group.project.id)}{/each}{#if !group.sessions.length}<li class="tree-empty">No sessions</li>{/if}</ul>{/if}
    {/if}
  </li>
{/snippet}

{#snippet TreeControls()}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} size="icon-xs" variant="ghost" aria-label="Group and filter sessions" title="Group and filter sessions"><ListFilter /></Button>{/snippet}</DropdownMenu.Trigger>
      <DropdownMenu.Content class="tree-filter-menu" side="right" align="start" sideOffset={6} collisionPadding={8}>
        <DropdownMenu.Group>
          <DropdownMenu.Sub><DropdownMenu.SubTrigger>Grouping</DropdownMenu.SubTrigger><DropdownMenu.SubContent><DropdownMenu.Group>{#each [['sessions', 'Sessions'], ['chats', 'Chats'], ['projects', 'Projects'], ['jobs', 'Jobs']] as option}<DropdownMenu.Item onclick={() => onpresentationchange?.(option[0] as SessionPresentation)}>{option[1]}{#if presentation === option[0]}<Check />{/if}</DropdownMenu.Item>{/each}</DropdownMenu.Group></DropdownMenu.SubContent></DropdownMenu.Sub>
          <DropdownMenu.Sub><DropdownMenu.SubTrigger>Ordering</DropdownMenu.SubTrigger><DropdownMenu.SubContent><DropdownMenu.Group>{#each [['updated-desc', 'Updated'], ['updated-asc', 'Oldest'], ['title-asc', 'Title']] as option}<DropdownMenu.Item onclick={() => onfilterchange?.({ ...effectiveFilter, sort: option[0] as SessionTreeFilter['sort'] })}>{option[1]}{#if effectiveFilter.sort === option[0]}<Check />{/if}</DropdownMenu.Item>{/each}</DropdownMenu.Group></DropdownMenu.SubContent></DropdownMenu.Sub>
          <DropdownMenu.Sub><DropdownMenu.SubTrigger>Show</DropdownMenu.SubTrigger><DropdownMenu.SubContent><DropdownMenu.Group><DropdownMenu.Item onclick={() => onfilterchange?.({ ...effectiveFilter, archived: 'exclude' })}>Active sessions{#if effectiveFilter.archived === 'exclude'}<Check />{/if}</DropdownMenu.Item><DropdownMenu.Item onclick={() => onfilterchange?.({ ...effectiveFilter, archived: 'include' })}>Active and archived{#if effectiveFilter.archived === 'include'}<Check />{/if}</DropdownMenu.Item></DropdownMenu.Group></DropdownMenu.SubContent></DropdownMenu.Sub>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Label>Filters</DropdownMenu.Label>
          <DropdownMenu.Sub><DropdownMenu.SubTrigger>Source</DropdownMenu.SubTrigger><DropdownMenu.SubContent><DropdownMenu.Group>{#each ['chat', 'slack', 'discord', 'cron'] as value}<DropdownMenu.CheckboxItem checked={effectiveFilter.sources.includes(value as SessionTreeFilter['sources'][number])} onclick={() => toggleArray('sources', value as SessionTreeFilter['sources'][number])}>{value}</DropdownMenu.CheckboxItem>{/each}</DropdownMenu.Group></DropdownMenu.SubContent></DropdownMenu.Sub>
          <DropdownMenu.Item onclick={() => onfilterchange?.({ ...effectiveFilter, archived: effectiveFilter.archived === 'only' ? 'exclude' : 'only' })}>Archived{#if effectiveFilter.archived === 'only'}<Check />{/if}</DropdownMenu.Item>
          <DropdownMenu.Item disabled={!filter} onclick={() => onfilterchange?.(null)}>Reset filters</DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Group><DropdownMenu.Item onclick={oncollapseall}>Collapse all</DropdownMenu.Item></DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    {#if presentation === 'projects'}<Button size="icon-xs" variant="ghost" onclick={onnewproject} aria-label="Add project"><Plus /></Button>{/if}
{/snippet}

<nav class="session-tree" aria-label="Session navigation">
  <div class="tree-scroll">
    {#if pinned.length}
      <SidebarCategory id="pinned" label="Pinned" count={pinned.length} expanded={categoryExpanded('pinned')} ontoggle={() => toggleCategory('pinned')}>
        <ul>{#each pinned as session (session.id)}{@render SessionRow(session)}{/each}</ul>
      </SidebarCategory>
    {/if}
    <SidebarCategory id={primaryCategoryId} label={primaryLabel} count={primaryCount} expanded={categoryExpanded(primaryCategoryId)} ontoggle={() => toggleCategory(primaryCategoryId)}>
      {#snippet controls()}{@render TreeControls()}{/snippet}
      {#if loading}<p class="tree-empty">Loading sessions…</p>
      {:else if presentation === 'projects'}
        <ul class="project-list">{#each projectGroups as group (group.project.id)}{@render ProjectRow(group)}{/each}</ul>
      {:else if presentation === 'jobs'}
        <ul>{#each jobs as session (session.id)}{@render SessionRow(session)}{/each}</ul>
      {:else}
        <ul>{#each chats as session (session.id)}{@render SessionRow(session)}{/each}{#if !chats.length}<li class="tree-empty">No matching sessions</li>{/if}</ul>
      {/if}
    </SidebarCategory>
  </div>
  {#if presentation === 'sessions' && (messaging.length || jobs.length)}
    <div class="tree-bottom-groups">
      {#each bottomGroups as group (group.id)}{#if group.sessions.length}<SidebarCategory id={group.id} label={group.label} count={group.sessions.length} expanded={categoryExpanded(group.id)} ontoggle={() => toggleCategory(group.id)}><ul>{#each group.sessions as session (session.id)}{@render SessionRow(session)}{/each}</ul></SidebarCategory>{/if}{/each}
    </div>
  {/if}
</nav>

<style>
  :global(.tree-filter-menu) { inline-size: 13.5rem; }
  .session-tree { min-block-size: 0; flex: 1; display: flex; flex-direction: column; overflow: clip; }
  .tree-scroll { min-block-size: 0; flex: 1; overflow-y: auto; padding: 0 .35rem .4rem; scrollbar-gutter: stable; overscroll-behavior: contain; }
  .tree-scroll :global(.sidebar-category + .sidebar-category), .tree-bottom-groups :global(.sidebar-category + .sidebar-category) { margin-block-start: .55rem; }
  .tree-bottom-groups { flex: none; max-block-size: 36%; overflow-y: auto; border-block-start: 1px solid var(--border); padding: .25rem .35rem .35rem; scrollbar-gutter: stable; }
  .session-tree ul { display: grid; gap: var(--list-row-gap); margin: 0; padding: 0; list-style: none; }
  .project-repositories, .project-lanes, .project-sessions { min-inline-size: 0; }
  .repository-heading, .lane-heading { display: grid; grid-template-columns: .9rem minmax(0, 1fr) auto; align-items: center; gap: .4rem; min-inline-size: 0; padding: .3rem .48rem .24rem 1.05rem; color: var(--muted-foreground); }
  .repository-heading span, .lane-heading span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .repository-heading small { font: inherit; color: var(--muted-foreground); }
  .repository-heading :global(svg), .lane-heading :global(svg) { inline-size: .78rem; block-size: .78rem; }
  .lane-heading { padding-inline-start: 1.42rem; font-size: var(--text-xs); }
  .project-lanes > li + li { margin-block-start: .18rem; }
  .session-entry { --session-trailing-safe-area: 3.2rem; position: relative; }
  .session-entry > button:first-child { inline-size: 100%; min-inline-size: 0; display: grid; grid-template-columns: 1.15rem minmax(0, 1fr) var(--session-trailing-safe-area); align-items: start; gap: .42rem; border: 0; border-radius: calc(var(--radius) * .8); background: transparent; padding: .46rem .48rem .46rem .35rem; color: var(--muted-foreground); text-align: start; }
  .session-entry > button:first-child:hover, .session-entry > button:first-child.active { background: var(--sidebar-accent); color: var(--foreground); }
  .session-signal { display: grid; place-items: center; inline-size: 1.15rem; block-size: 1.15rem; margin-block-start: .02rem; color: transparent; }
  .session-signal :global(svg) { inline-size: .72rem; block-size: .72rem; }
  .session-signal[data-signal='working'] { color: var(--muted-foreground); }
  .session-signal[data-signal='working'] :global(svg) { animation: session-working var(--motion-status-cycle) linear infinite; }
  .session-signal[data-signal='approval'] { color: var(--signal-approval); }
  .session-signal[data-signal='input'] { color: var(--signal-input); }
  .session-signal[data-signal='review'] { color: var(--signal-review); }
  .session-signal[data-signal='blocked'] { color: var(--signal-blocked); }
  .session-signal[data-signal='complete'] { color: var(--signal-complete); }
  .session-signal[data-signal='unread'] { color: var(--signal-unread); }
  .unread-dot { inline-size: .38rem; block-size: .38rem; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 2px color-mix(in oklab, currentColor, transparent 82%); }
  .session-copy { min-inline-size: 0; display: grid; gap: .16rem; }
  .session-title { overflow: hidden; font-size: .8rem; font-weight: 520; text-overflow: ellipsis; white-space: nowrap; }
  .session-meta { min-inline-size: 0; display: flex; align-items: center; gap: .25rem; overflow: hidden; color: var(--muted-foreground); font-size: .65rem; text-overflow: ellipsis; white-space: nowrap; }
  .session-icons { display: inline-flex; align-items: center; gap: .18rem; flex: none; }
  .session-icons :global(svg) { inline-size: .7rem; block-size: .7rem; }
  .session-icons :global(.provider-mark), .session-icons :global(.provider-mark img) { inline-size: .7rem; block-size: .7rem; }
  .session-age { align-self: start; justify-self: end; color: var(--muted-foreground); font-size: .65rem; }
  .session-row-actions { position: absolute; inset-inline-end: .2rem; inset-block-start: .28rem; inline-size: var(--session-trailing-safe-area); display: flex; align-items: center; justify-content: flex-end; gap: .04rem; opacity: 0; pointer-events: none; transition: opacity var(--motion-fast) var(--ease-standard); }
  .session-row-actions :global(button) { color: var(--muted-foreground); }
  .session-entry:hover .session-row-actions, .session-entry:focus-within .session-row-actions { opacity: 1; pointer-events: auto; }
  .session-entry:hover .session-age, .session-entry:focus-within .session-age { opacity: 0; }
  :global(.session-context-menu) { inline-size: 12.5rem; }
  :global(.project-context-menu) { inline-size: 11rem; }
  :global(.session-detail-card) { --detail-primary: color-mix(in oklab, var(--foreground), var(--muted-foreground) 72%); --detail-secondary: var(--muted-foreground); inline-size: min(14.5rem, calc(100vw - 1rem)); display: grid; gap: .5rem; }
  :global(.session-detail-title) { min-inline-size: 0; color: var(--foreground); overflow-wrap: anywhere; font-size: .7rem; font-weight: 400; line-height: 1.35; }
  :global(.session-detail-list) { display: grid; gap: .42rem; margin: 0; padding: 0; list-style: none; }
  :global(.session-detail-line) { min-inline-size: 0; display: grid; grid-template-columns: .9rem minmax(0, 1fr); align-items: start; gap: .45rem; color: var(--detail-secondary); font-size: var(--type-caption); font-weight: 400; line-height: 1.4; }
  :global(.session-detail-line svg), :global(.session-detail-line .provider-mark), :global(.session-detail-line .provider-mark img) { inline-size: .8rem; block-size: .8rem; margin-block-start: .08rem; }
  :global(.session-detail-line span) { min-inline-size: 0; overflow-wrap: anywhere; }
  :global(.session-detail-line small) { color: var(--detail-primary); font: 400 var(--type-caption) var(--font-ui); }
  :global(.session-detail-line .status-working) { animation: session-working var(--motion-status-cycle) linear infinite; }
  .project-list { display: grid; gap: .12rem; }
  .project-group + .project-group { margin-block-start: .18rem; }
  .project-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
  .project-heading > button:first-child { inline-size: 100%; min-inline-size: 0; display: grid; grid-template-columns: 1.15rem minmax(0, 1fr); align-items: center; gap: .42rem; border: 0; border-radius: calc(var(--radius) * .75); background: transparent; padding: .46rem .48rem .46rem .35rem; color: var(--muted-foreground); text-align: start; }
  .project-heading > button:first-child:hover, .project-heading > button:first-child.active { color: var(--foreground); }
  .project-heading > button:first-child :global(svg) { inline-size: .72rem; block-size: .72rem; flex: none; }
  .project-heading span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-name { font-size: .8rem; font-weight: 520; }
  .project-sessions { padding-inline-start: 0 !important; }
  .tree-empty { margin: 0; padding: .6rem .5rem; color: var(--muted-foreground); font-size: .68rem; }
  @keyframes session-working { to { transform: rotate(1turn); } }
  @media (prefers-reduced-motion: reduce) { .session-signal[data-signal='working'] :global(svg), :global(.session-detail-line .status-working) { animation: none; } }
</style>
