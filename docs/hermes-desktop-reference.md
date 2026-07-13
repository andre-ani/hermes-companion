# Hermes Desktop reference workflow

Hermes Companion treats the installed upstream Hermes Desktop application as a functional reference, not a style source. Companion keeps its T3 Code/Cursor/Codex visual language while preserving the meaning, state, and control coverage of upstream Hermes surfaces.

## Reference application

- Application: an upstream Hermes Agent checkout at
  `apps/desktop/release/mac-arm64/Hermes.app`
- Capture command: activate `Hermes`, then use `screencapture -x` and inspect the resulting image at original resolution.
- Captures are temporary UAT evidence and should not be committed unless a focused comparison needs a durable artifact.

## Inspected shell surface

The 2026-07-12 inspection confirmed these live upstream concepts:

- primary navigation for New session, Capabilities, Messaging, and Artifacts;
- global Pinned and Sessions navigation plus platform-specific messaging groups;
- status-line entries for gateway readiness, Agents, Cron, context/session telemetry, client, and backend versions;
- a contextual right workspace containing files and terminal content;
- a session-scoped composer and model control.

## Inspected capability and plugin surfaces

The installed Hermes Desktop v0.18.2 build was relaunched with a temporary
local DevTools port so its rendered accessibility tree and routes could be
inspected directly. The Capabilities route confirmed the primary center tabs
and ownership for Skills, Tools, MCP, and Browse Hub, including installed-skill
state, source metadata, featured results, and per-skill enablement.

Kanban and Achievements were present in the pinned upstream source as mounted
dashboard plugins but were not enabled as navigation tabs in the inspected
local Desktop profile. Their supported contracts were therefore grounded by
the plugin manifests, mounted `/api/plugins/kanban/*` and
`/api/plugins/hermes-achievements/*` routes, the upstream Achievements reference
capture, and live authenticated Railway responses. Railway returned one Kanban
board with the eight canonical workflow columns and a 60-item achievement
catalog. Companion screenshots then verified those real responses in its
Capabilities workspace. Companion also captured a real disposable task and
completed its create, move, archive, archived-reveal, and delete lifecycle
through visible Electron controls. This proves the integration and Companion
layout, but a populated Kanban comparison against an enabled upstream Desktop
profile remains required before upstream populated-board visual parity can be
declared complete.

These are capability and information-architecture requirements. Companion must not copy the upstream application’s wallpaper, dense divider treatment, or arbitrary pane replacement behavior.

## External coding-workspace references

T3 Code is the primary implementation reference for review behavior because its
public source can be inspected without copying it. The pinned audit revision is
`f61fa9499d96fee825492aba204593c37b27e0cb`. The focused review pass inspected
`ChangedFilesTree.tsx`, `DiffPanelShell.tsx`, `DiffPanel.tsx`,
`MessagesTimeline.tsx`, and `turnDiffTree.ts`.

The resulting Companion rules are behavioral rather than code-derived:

- conversation turns may expose a compact, real changed-files tree when Hermes
  supplies a trustworthy turn boundary and Git base;
- the right dock owns the full review surface, with top tabs, a scope selector,
  view controls, and vertically stacked expandable file diffs;
- working-tree, branch-range, latest-turn, and explicit-turn scopes must remain
  distinct rather than being represented by cosmetic filters;
- split/unified and word-wrap controls appear only after the corresponding
  renderer behavior exists;
- Git additions/deletions use restrained semantic color and the diff itself is
  the meaningful bounded surface, not a stack of decorative cards.

The current native Hermes slice truthfully supports working-tree and
merge-base-resolved branch scopes, unstaged/staged file lists, lazy unified file
diffs, stage/unstage, revert, commit, push, and PR discovery/creation. Hermes'
`lastTurn` Git operation requires a caller-supplied base SHA, but the audited
Desktop store currently loads only uncommitted review and does not persist a
turn-to-SHA boundary. Companion therefore does not expose Latest turn yet.
Latest-turn summaries, split view, and word wrap remain pending until their
real data and rendering paths are implemented.

Cursor remains a visual-polish reference where T3 is less explicit. Its browser
reference establishes a compact navigation bar, annotation control, browser
console/DevTools, an overflow menu for reload/screenshot and related actions,
and recents/favorites. Those controls are pending and must not be shown as inert
chrome before their Electron browser capabilities exist.

### Pets audit

Upstream Desktop treats Pets as profile-scoped Hermes gateway state, not a
Companion theme. Appearance settings use `pet.info` and a two-phase
`pet.gallery` load, with `pet.select`, `pet.disable`, and `pet.scale` mutations;
generation adds separate status/progress/cancel/hatch/adopt flows. Companion
now exposes the real gallery, enable state, active selection, and scale in the
Appearance page through the authenticated Serve capability path and records
mutations in the audit log. Live Railway/Electron UAT loaded the real catalog
and captured `/tmp/hermes-companion-pets-settings.png`. The floating overlay now
polls the same `pet.info` state, renders Hermes-provided sprite metadata on a
device-pixel-aware canvas, maps live failure/approval/tool/reasoning/busy state
using upstream priority, supports pointer and keyboard repositioning with a
Companion-owned saved position, and freezes to a static frame under reduced
motion. The live profile has no installed pet, so the overlay correctly remained
absent and populated animation UAT is pending rather than forcing an install.
Generated-pet creation, rename/export/removal, and thumbnail cropping remain
separate pending slices; none are represented by inert controls.

### Learning / Star map audit

The 2026-07-12 reference pass opened **Memory Graph** from the real upstream
command palette and captured the rendered `#/starmap` route through Electron
DevTools (`/tmp/hermes-desktop-starmap-cdp.png`). Upstream presents the profile's
learned skills and memory as a full overlay with a radial time axis, node-kind
legend, import/export affordance, and node actions. Its supported data path is
the profile-scoped `GET /api/learning/graph`; node inspection and mutation use
`GET/PUT/DELETE /api/learning/node`. Companion now capability-gates a Learning
tab backed by those shared graph and node contracts. It preserves the
skill-versus-memory distinction, renders accessible DOM node controls over a
decorative SVG relationship/time-ring layer, and keeps node detail/edit/archive
in a contextual adjacent panel rather than copying the upstream full-window
overlay. Live Railway Electron UAT verified the real empty state and captured
`/tmp/hermes-companion-learning.png`; that profile currently has no learned
nodes, so populated node selection and mutation UAT remain explicitly pending.

The pinned Desktop command registry maps `/journey`, `/learning`, and
`/memory-graph` to the same Journey action and Memory Graph overlay. Companion
therefore treats Journey as the human-facing timeline mode of Learning rather
than creating a second plugin screen with duplicate state or invented actions.

### Insights audit

Hermes Desktop places its usage panel in Command Center and reads the
profile-scoped `GET /api/analytics/usage?days=N` endpoint. The reference panel
shows session, API-call, and token totals; a daily input/output chart; and
bounded top-model and top-skill lists. Companion now parses that public
response through a shared schema and exposes Insights as a contextual
Capabilities tab. It adds 7/30/90-day controls, cost/cache totals, the
documented tool ranking, and a semantic table alternative for the visual chart
without copying Desktop's overlay shell or divider treatment. Live
Railway/Electron UAT loaded real 30-day data, switched to seven days, verified
the chart's accessible caption, and captured
`/tmp/hermes-companion-insights.png`.

### Checkpoint semantics audit

Upstream uses three distinct meanings that Companion must never collapse into
one decorative chat record. Filesystem checkpoints are per-working-directory
shadow-repository snapshots created before destructive file tools; the
operational API exposes aggregate storage at `GET /api/ops/checkpoints` and
pruning at `POST /api/ops/checkpoints/prune`, while fine-grained restore remains
the `/rollback` session command. The **Restore checkpoint** control attached to
a user prompt is conversation rewind: Desktop resubmits `prompt.submit` with
`truncate_before_user_ordinal`, discarding later turns and rerunning that
prompt. Context-compression checkpoint summaries are continuity data and are
not rollback controls.

Companion now implements prompt restore through its existing streamed
`sendChatMessage` capability, with confirmation, optimistic truncation rollback
on failure, and a `hermes.session.checkpoint.restored` audit record. Electron
UAT first opened and cancelled the confirmation; the refined capture is
`/tmp/hermes-companion-restore-checkpoint-refined.png`. A later live destructive
pass rewound a test marker, removed the later turn, reduced the visible restore
point count, and observed Hermes regenerate the preceding response.

### Thinking and reasoning channel audit

Hermes Serve exposes two intentionally different event channels. Upstream
`conversation_loop.py` sends replaceable spinner/personality copy such as a
face plus “musing” through `thinking_callback`; the Serve adapter emits that as
`thinking.delta`, including an empty string when it clears. Provider reasoning
is emitted separately as append-only `reasoning.delta`.

Companion previously concatenated both channels into persisted reasoning, which
left Hermes' transient personality text inside completed thought disclosures.
The streamed message contract now carries nullable `thinkingStatus` separately,
replaces it on each `thinking.delta`, clears it on response text and every
terminal outcome, and appends only `reasoning.delta` to durable reasoning.
Chat settings persist a profile-scoped Plain, Hermes personality, or Hidden
transient presentation choice. Live Electron UAT observed `Thinking…` followed
by `(⌐■_■) musing...`, then verified that neither remained in the completed
`STATUS-CLEAR-OK` transcript. Screenshots:
`/tmp/hermes-companion-thinking-status-cleared.png` and
`/tmp/hermes-companion-thinking-status-setting.png`.

### Routed-model provenance audit

The pinned Hermes runtime retains two different levels of model identity
internally. `conversation_loop.py` can observe the provider completion object's
`response.model`, and exposes it to the private `post_api_request` plugin hook.
The public turn result assembled by `turn_finalizer.py`, however, contains
`agent.model` and `agent.provider` (the requested runtime target), not that
provider-reported response model. `tui_gateway/server.py` then emits
`message.complete` with text, usage, status, and optional reasoning/warning;
neither the resolved response model nor its upstream provider is included. The
persisted session message shape also lacks those fields.

Companion therefore has a shared authoritative provenance presentation but
does not claim an OpenRouter-resolved model for Hermes Serve turns today. When
a supported transport supplies both identities it renders `routing provider →
resolved model`; same-provider aliases collapse to the effective model. Until
Serve exposes response attribution, a router/preset turn shows only its
requested identity. No private plugin log or model self-description is parsed
to fill this gap.

### Model picker authority audit

Upstream Hermes Desktop builds its picker from the profile/session-aware
`model.options` contract (or `/api/model/options?explicit_only=1`), not the
generic OpenAI-style `/v1/models` route. Hermes inventory owns provider
authentication, curated agent-capable lists, overlap rules, pricing,
fast/reasoning capability flags, and the active provider/model pair.
`session.create` accepts both `model` and `provider` as per-session overrides.

Companion now consumes that same profile-scoped inventory, keeps identical
model IDs distinct when their runtime providers differ, and sends both values
when starting a new Hermes session. `/v1/models` is only a legacy fallback for
older compatible hosts. Live Railway/Electron UAT loaded 36 connected Hermes
inventory entries (39 rendered rows including the three-item Recent
projection), showed human model names and prices, kept the 496 px popover
inside an 1800 px viewport, and produced no document overflow. OpenRouter
presets that Hermes does not advertise in `model.options` are not synthesized
by Companion.

### OpenRouter effective-policy audit

OpenRouter's authenticated `GET /api/v1/models/user` contract is the supported
read path for the models available to an inference key after provider
preferences, privacy settings, and guardrails. Companion joins that inventory
onto Hermes' profile-scoped catalog instead of replacing Hermes discovery.
Concrete missing entries are visibly restricted and cannot be selected;
routers/presets retain an unknown-until-resolved policy state. Live Electron UAT
with the stored account credential found 36 allowed rendered entries and three
restricted projections (two unique models, with one duplicated in Recents),
kept selection unchanged when a restricted row was clicked, and produced no
document overflow.

OpenRouter's named `/guardrails` and assignment APIs require a management key,
which cannot be used for inference. Companion therefore offers a separate,
encrypted, optional inspection credential and labels returned definitions as
workspace-visible—not as proven assignments to the stored inference key. No
management key was configured during this UAT, so named-definition rendering
remains implementation/test evidence rather than live-account evidence.

The shared dialog footer primitive was also corrected to remove its legacy
bright divider. Aggregate filesystem storage is now a separately probed
Capabilities tab using the documented read and prune endpoints, a typed public
contract, explicit destructive confirmation, audit recording, and Hermes
background-action polling. Live Railway/Electron UAT loaded the real empty
store and captured `/tmp/hermes-companion-checkpoints.png`; prune was correctly
disabled because there were no snapshots. Populated checkpoint storage, prune
mutation, and fine-grained `/rollback` UAT remain pending.

### Agents and delegation audit

Upstream Desktop exposes **Agents** in the status line and treats delegated
work as live session/profile state rather than a static capabilities page.
Companion follows that ownership: its status-bar control opens a contextual
right-dock tree backed by `delegation.status`, with lifecycle events and
supported pause, resume, inspect, and interrupt actions supplied by Hermes.
The tree uses semantic `tree`/`treeitem` roles, exposes level and selection,
and shows parent identity explicitly when a selected child has one.

Live Railway/Electron UAT dispatched a real child, observed its start,
thinking, and completion lifecycle, and separately confirmed interruption.
The dock was also verified at 351 px with no horizontal overflow. The active
Hermes profile advertises `max_spawn_depth = 1` and three concurrent children,
so a nested child cannot truthfully be produced in this environment. Nested
parent-link visual evidence remains configuration-gated; Companion does not
change that runtime policy or fabricate descendants merely to satisfy a
screenshot.

The same pass exposed two session transport defects and verified their fixes:
new chat must remain a local draft until the first Serve prompt, and Hermes's
transient `session_id` must not be stored as the resumable conversation ID when
`stored_session_id` is available. A fresh delegated session subsequently
completed a second turn with `RESUME-OK-2`. Permanent deletion initially left
the sidebar's cached overview stale, so the action now removes the real session
and any global pin locally before requesting a fresh Hermes overview. A second
disposable live session disappeared immediately through the visible dialog
without reloading Electron.

### Projects and session workspace audit

Upstream Desktop treats projects as profile-scoped Hermes state through the
`projects.*` Serve RPC family. An ordinary new session inside a project starts
in that project's primary checkout: Desktop sends the selected path as `cwd`
on `session.create`. Creating or choosing a linked Git worktree is a separate,
explicit workspace action; it is not an automatic side effect of every first
prompt.

Companion now follows that contract. Connected overviews and project mutations
consume `projects.list`, `projects.create`, `projects.update`,
`projects.archive`, and `projects.delete`; the project capability is
Hermes-owned and authenticated-Serve-gated rather than disabled on Railway for
lack of the removed Companion bridge. New project sessions send the selected
project or existing worktree path as `session.create.cwd`, and session
normalization preserves Hermes's `cwd`, branch, and project fields. The remote
dialog correspondingly asks only for a host folder and optional name;
local-only Git initialization is not presented as a remote Hermes action. The
simplified remote dialog is captured at
`/tmp/hermes-companion-native-project-dialog.png`.

Project rows use the same anchored, collision-aware context-menu primitive as
session rows. Rename, archive/restore, and delete are backed by the native
Hermes mutations, update the visible tree immediately, and request a fresh
Hermes overview instead of leaving cached or decorative state behind. The
rendered menu is captured at
`/tmp/hermes-companion-project-context-menu.png`. Sidebar grouping/filter
preferences are stored under the active connection-and-Hermes-profile key;
legacy connection-only preferences remain a read fallback, but no longer cause
one profile's project grouping to overwrite another profile's view.

The Projects presentation now consumes `projects.tree` as the authoritative
project → repository → branch/worktree-lane structure. Expanding one project
lazy-loads its real session membership through `projects.project_sessions`;
Companion no longer assigns sessions to projects by comparing paths in the
renderer. Distinct branch/worktree lanes remain visible, while a single lane
whose label duplicates its only repository label is visually collapsed to
avoid repeating hierarchy without losing information.

Live Railway UAT registered `/opt/hermes` as temporary native project
`p_33e58c40`, created a real first session in that workspace, and received
`NATIVE-PROJECT-OK.`. The test then permanently deleted the session and project;
a fresh `projects.list` returned an empty catalog. A second disposable project,
`p_716fee1a`, was renamed through the visible project-actions dialog, archived
through the row context menu, restored through `projects.archive`, and deleted
through the visible destructive confirmation. A final `projects.list` returned
an empty catalog and the profile's prior Chats grouping was restored.

A third disposable live pass created project `p_e8ecfca8`, ran a real Hermes
session in `/opt/hermes`, received `TREE-UAT-OK.`, expanded the visible project,
and verified the hydrated repository/lane/session hierarchy and ARIA expansion
state. The resulting Companion capture is
`/tmp/hermes-companion-native-project-tree.png`. The test session and project
were then permanently deleted and the prior Chats presentation restored.

The explicit linked-worktree path is now native as well. Source inspection of
the compatible Desktop build and runtime grounded the flow in authenticated
`GET /api/git/worktrees`, `GET /api/git/branches`,
`POST /api/git/worktree/add`, and `POST /api/git/worktree/remove`; Companion
does not invoke its older bridge-owned thread-worktree service for these
actions. Before each operation it resolves the selected project through
`projects.list` and validates the requested repository against the
authoritative `projects.project_sessions` tree. The main checkout is never a
valid removal target.

A disposable Railway project proved the complete visible path.
The project-row context menu opened **New worktree…**, Hermes created
`hermes/native-tree-uat` at
`/opt/data/workspaces/companion-worktree-uat/.worktrees/native-tree-uat`, and
Companion retained that path as the local new-chat draft rather than refreshing
into an unrelated session. The first real prompt was sent with that exact cwd,
returned `WORKTREE-SESSION-OK.`, and a cold reload placed the persisted session
beneath the native worktree lane. The lane context menu then opened the
destructive confirmation, removed the linked checkout, and preserved both the
branch and Hermes session as promised. A direct authenticated read afterward
reported only the main `master` checkout. Captures are
`/tmp/hermes-companion-worktree-dialog.png`,
`/tmp/hermes-companion-worktree-created.png`,
`/tmp/hermes-companion-worktree-session.png`,
`/tmp/hermes-companion-worktree-tree.png`,
`/tmp/hermes-companion-worktree-remove-dialog.png`, and
`/tmp/hermes-companion-worktree-removed.png`. The disposable session, project,
repository, and authentication cookie were deleted, Hermes again reported an
empty project catalog, and the profile's Chats grouping was restored.

## Comparison rule

For every Hermes screen or plugin surface added to Companion:

1. inspect the corresponding live upstream surface when it exists;
2. identify its real API, RPC, or emitted-state source;
3. map it into the Companion shell using contextual left navigation and right-side tabs where appropriate;
4. verify loading, empty, success, error, and unavailable states without fake fixture-only controls;
5. capture the Companion result and compare hierarchy, functionality, and state coverage—not pixel styling.

If the upstream app cannot be captured or controlled, record the limitation and keep visual UAT pending. Never substitute an uninspected implementation claim.
