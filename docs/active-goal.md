# Active goal: ship the stable daily driver

This document is the authoritative completion target for Hermes Companion. It
supersedes the earlier goal of broad Hermes Desktop parity.

Hermes parity is not a finish line. The finish line is a coherent macOS app the
owner can use every day for real conversations and ordinary coding work. We
will finish that product, give it one deliberate UI-polish pass, qualify it
against the real Hermes runtime, and then stop feature development.

## Release definition

Hermes Companion is a profile-led Electron client for Hermes Agent. For this
release it must reliably provide:

- real Hermes profiles, sessions, messages, reasoning, tools, approvals, and
  model state;
- a durable chat workflow with supported attachments;
- projects and ordinary Git worktrees;
- session-scoped terminal, files, changes/diff, and browser preview surfaces;
- the settings necessary to operate and present those workflows;
- a stable adaptive shell with a useful status bar and agents/subagents tree.

Nothing else is required to declare the product complete.

## Status snapshot

This section is the working status board for the release definition above. It
is intentionally separate from the requirements: **done** means that the
implementation exists and the named evidence has been observed; **remaining**
means that the behavior is unproven, incomplete, or currently failing. A
family is not release-complete merely because part of it is done.

### Done or substantially verified

- **Runtime boundary:** Hermes Agent is the sole runtime. The lean Railway
  deployment, co-located Companion bridge, persistent Hermes volume, fresh
  single-use Serve tickets, authenticated capability probes, and encrypted
  renderer credentials are in place. The Railway authentication blocker is
  resolved.
- **Renderer and session ownership:** profile/session/workspace ownership,
  reload recovery, active-turn reconciliation, stop/resume recovery, history
  recovery, profile-switch isolation, and native browser ownership have
  focused evidence in Electron and the source tests.
- **Real chat baseline:** create/resume/search/rename/pin/unread/archive/
  restore/delete, streamed text/reasoning/tools/approvals, text and image
  attachments, and independent active/archived history fetching are backed by
  Hermes contracts.
- **Profiles, models, approval, and status:** Hermes Agent and Hermes Code
  switching, model catalog/provenance, read-only OpenRouter inventory/policy,
  approval persistence, gateway state, and the Agents/subagents status-bar
  entry have evidence. Unsupported routed-model resolution remains explicitly
  unimplemented rather than fabricated.
- **Ordinary workspace surfaces:** project lifecycle, ordinary linked
  worktrees, worktree-bound terminal/files, working-tree status, lazy diffs,
  stage/unstage, commit, browser ownership, anchored overlays, and reachable
  pane controls have implementation and focused evidence.
- **Build baseline:** the Svelte/TypeScript checks and desktop/bridge
  production builds passed at the last coherent checkpoint. The current full
  test result is tracked below and is a release gate, not hidden by this
  summary.
- **Packaged fixture gate:** the macOS Electron UAT is green for the current
  release-candidate fixture, including chat mutation/streaming, context usage,
  right-dock review and staged diff, bottom terminal, browser reactivation and
  isolation, settings, reload/layout recovery, unavailable-history lifecycle,
  and native project/worktree/files/PTY/Git/PR flows. This fixture evidence
  does not replace the remaining real-Runtime proof below.

See [`current-checkpoint.md`](./current-checkpoint.md) and the
[`requirements-status.md`](./requirements-status.md) evidence ledger for the
scope and limits of each claim.

### Remaining before release

1. **P0 packaged/runtime proof:** repeat the core chat and recovery workflow
   in the packaged macOS app: restart and sleep/wake, forced gateway loss and
   reconnect, unavailable-history recovery, credential reauthentication, and
   a live approval request/response. The real Railway Serve probes already
   cover streamed thinking/message deltas, valid context bounds, and a
   populated subagent lifecycle (including interrupt); those still need their
   packaged-app presentation/recovery proof where applicable.
2. **P1 release-candidate proof:** complete one ordinary project/worktree
   loop, including terminal/files isolation, revert confirmation, push, draft
   PR, preview reload/failure recovery, and restoration of each session's dock
   tabs, surface, widths, focus, and bottom-terminal state.
3. **Shared polish and release checks:** run the single normal/constrained/
   reduced-motion UI pass, remove any remaining dead or misleading controls,
   run security/release checks, build the packaged app, and perform final macOS
   Electron UAT. Fix only failures found on those gates.

The automated gate is currently green: **238 tests passed across 41 files**;
desktop and bridge checks and production builds also pass. Those checks do not
replace the packaged/runtime proof above.

Until all three items pass, the goal remains open. Deferred parity work below is
not allowed to displace these items.

Hermes Agent is the sole agent runtime and source of truth. Railway hosts a
lean pinned Hermes service and persistent Hermes state. Do not deploy Hermes
Workspace, add a second agent backend, launch peer coding harnesses, or mirror
Hermes private state into a parallel implementation.

This release is macOS-only and owner-only. Public distribution,
cross-platform qualification, signing, and notarization require separate
future goals.

## Decision rule

For every unfinished feature, ask:

1. Is it required for a real daily conversation or the ordinary coding loop?
2. Is it backed by a supported Hermes contract and real state?
3. Can it be made reliable without expanding the release boundary?

If any answer is no, hide or remove it from the primary product and defer it.
Do not preserve prominent scaffolding for a hypothetical future.

Work in this order:

1. Prevent stranded, lost, corrupt, or irreversible state.
2. Complete the daily chat workflow.
3. Complete the ordinary coding workflow.
4. Remove fake, dead, redundant, and deferred UI.
5. Perform one shared-system UI polish pass.
6. Qualify the packaged app, fix only qualification failures, and stop.

## P0: release-blocking reliability

### Sessions and conversation

- Create a session, stream a response, stop it, resume it, and recover after
  navigation, reload, sleep/wake, gateway loss, and reconnect.
- Search, rename, archive/restore, delete, pin, and mark unread through
  real Hermes-backed actions.
- Archive and delete must remain available even when history is missing,
  damaged, stale, or unavailable.
- Render real messages, Markdown, reasoning, tools, approvals, model identity,
  and supported checkpoints without horizontal document overflow, clipped
  content, duplicate transient state, or stuck progress UI.
- Support only attachment types proven end to end. Text and images are in
  scope. PDF stays hidden unless the execution host advertises the dependency
  and packaged-app UAT passes.
- Loading, empty, offline, reconnecting, unavailable-history, and error states
  must keep stable geometry and offer an appropriate recovery action.

### Runtime, profiles, models, and approval

- Connect and automatically reconnect to the Railway Hermes service with a
  fresh single-use Serve ticket for each WebSocket.
- Store long-lived credentials in Electron's encrypted credential store.
- Switch real Hermes profiles without leaking sessions, runtime state, or
  presentation state between profiles.
- Use the Hermes-owned model catalog. Show truthful requested, routed, and
  resolved model provenance without redundant `provider via provider` labels.
- Treat OpenRouter eligibility, provider preferences, privacy policy,
  presets/routers, and exposed guardrail information as read-only constraints.
  Never imply that unavailable policy data is enforced locally.
- Keep approval mode, context usage, gateway state, model state, terminal
  state, and agents/subagents status synchronized with the active profile and
  session.

### Shell and interaction durability

- The left pane, center pane, right dock, bottom terminal, titlebar controls,
  status bar, and overlays retain stable ownership in every visibility state.
- Pane toggles always remain reachable. Show/hide and resize never scrunch
  pane contents, flash an intermediate alignment, collide with macOS traffic
  lights, or permit unusable sizes.
- Popovers, menus, dialogs, tooltips, and context menus anchor to their trigger,
  remain in the viewport, close predictably, and support keyboard use.
- Initial load, route changes, session changes, and reconnects produce no
  top-left icon flash, stale skeleton, unstyled framework error, or major
  layout shift.
- Every visible filter, menu item, hover action, command, and status control
  operates on real backed state. Remove anything that does not.

## P1: ordinary coding workflow

This is intentionally narrower than IDE parity.

- Create, open, rename, archive, and delete an ordinary project.
- Create, select, and remove an ordinary Git worktree while protecting the main
  checkout.
- Bind the active session to the correct project, repository, branch, cwd,
  terminal, files, and Git state.
- Provide reliable session-scoped right-dock tabs for Terminal, Files,
  Changes/Diff, and Browser/Preview, plus the bottom terminal split.
- Complete the normal local loop: inspect status and diffs, stage/unstage,
  revert with confirmation, commit, push, and create a draft PR.
- Persist each session's dock tabs, selected surface, widths, and focused/full
  state without leaking them to another session.

Advanced browser tooling, IDE parity, unusual worktree topologies, and complex
Git conflict management are outside this release.

## Essential settings only

Keep only settings needed to operate or present P0 and P1:

- profiles;
- models, providers, credentials, and exposed provider policy;
- appearance, typography, theme, layout, and status-bar visibility;
- workspace defaults;
- safety and approval mode;
- memory/context essentials;
- gateway connection;
- tools, keys, skills, and MCP essentials;
- notifications.

Settings must be schema-indexed and discoverable from settings search and the
command palette. Clearly distinguish Companion presentation preferences from
Hermes runtime settings. Hide any control whose effect cannot be proven.

## Hard cut line

The following are explicitly not on the completion path:

- pets, Petdex, pet generation, animated pet overlays;
- achievements, journeys, learning graphs, gamification;
- Kanban parity and richer orchestration;
- voice conversation, dictation, auto-speak, and TTS;
- exhaustive plugin, webhook, analytics, maintenance, backup, update, or
  checkpoint-administration parity;
- advanced browser annotation, browser DevTools parity, history/favorites,
  and screenshot automation;
- session forking while the lean public Hermes Serve contract does not expose
  the upstream private gateway route;
- Design Mode and annotation-to-MCP handoff;
- stacked or parent-linked worktrees, writer leases, and unusual conflict
  flows;
- Windows/Linux qualification, public releases, signing, and notarization.

Existing real-backed messaging sessions, cron/jobs, skills, tools, MCP, and
the agents/subagents tree may remain when they are already stable and do not
create startup work. They do not block release. Hide them if they expose dead
actions, destabilize shared state, or require product expansion. Insights,
plugin management, achievements, Kanban, pets, and other parity surfaces must
not occupy primary navigation or startup work for this goal.

## Architecture invariants

1. Use SvelteKit, Svelte 5, shadcn-svelte/Bits UI, and selective compatible
   Svelte AI Elements primitives. Do not add React.
2. Each capability has one typed Zod-backed SvelteKit remote path shared by UI
   and authorized adapters.
3. Do not launch Codex, Claude Code, OpenCode, Cursor, or another agent runtime.
4. Use pinned upstream Hermes contracts. Any temporary compatibility patch
   needs isolation, tests, drift detection, and a removal condition.
5. Do not infer support from visual parity or couple to Hermes private state.
   Supported APIs, events, and advertised capabilities define behavior.
6. Scope browser, preview, filesystem, terminal, credentials, profiles,
   sessions, and worktrees to their owning security and workspace context.
7. Fix repeated UI failures in shared tokens, primitives, layout ownership,
   and state architecture—not with accumulating page-specific exceptions.

## Ordered remaining work

### Phase 1: stabilize P0

1. Finish session lifecycle actions and failure recovery, including
   archive/delete of unhealthy sessions, stop/resume, and reload/reconnect.
2. Prove profile, model, gateway, approval, context, and status synchronization.
3. Remove deferred startup work and visible dead controls.
4. Resolve remaining overflow, clipping, stale-state, overlay, loading, and
   irreversible-state failures.
5. Run focused P0 Electron UAT against the Railway Hermes service.

Do not begin broad visual refinement while a P0 flow can still strand the
owner.

### Phase 2: complete P1

Prove the ordinary project/worktree/terminal/files/changes/preview/Git loop.
Remove or precisely disable unsupported branches instead of scaffolding future
IDE behavior.

### Phase 3: one UI polish pass

Review the real Electron app at normal and constrained macOS sizes, including
reduced motion. Cover the shell, session tree, status bar, transcript,
reasoning, tools, approvals, composer states, right dock, terminal, files,
diff, preview, command palette, settings, overlays, errors, and all loading and
empty states.

Resolve inconsistencies in shared primitives and tokens. This pass is complete
when qualified flows have no overlap, clipping, unintended document overflow,
unanchored overlay, inaccessible control, unexplained density difference,
layout flash, or inconsistent typography/radius/spacing behavior.

### Phase 4: daily-driver qualification

Against the real Railway Hermes service in the packaged macOS Electron app,
prove:

1. restart, credential persistence, and automatic reconnect;
2. profile, model, approval, context, and status synchronization;
3. create, stream, stop, resume, search, rename, pin, unread,
   archive/restore, and delete;
4. supported text and image attachments;
5. project and ordinary worktree lifecycle;
6. terminal and files in the correct worktree;
7. changes, stage, commit, push, and draft PR;
8. pane/dock open, close, resize, focus, reload, and session restoration;
9. recovery from gateway, history, attachment, model, Git, and preview failure;
10. type checks, unit/integration tests, production build, security tests, and
    macOS Electron UAT.

## Stop condition

The goal is complete when P0 and P1 pass, the single polish pass has visual
evidence, the qualification suite is green, every primary control is real or
precisely disabled, deferred features no longer intrude on the primary
experience, and the owner can use the app day to day without an unfinished
parity project on the critical path.

Then stop feature development. Move Hermes Companion into owner dogfooding and
maintenance. Bugs found during normal use may be fixed. New parity ideas,
platforms, experiments, and distribution work require new goals and are not a
reason to keep this goal open.
