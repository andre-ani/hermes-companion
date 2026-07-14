# Active goal: ship the stable daily driver

This is the only active completion target for Hermes Companion. The earlier
goal of broad Hermes Desktop parity is closed; completed work and historical
evidence belong in [`requirements-status.md`](./requirements-status.md) and
[`current-checkpoint.md`](./current-checkpoint.md), not in this file.

The finish line is a coherent macOS Electron app that the owner can use every
day for real Hermes conversations and ordinary coding work. After the release
gate passes, do one deliberate shared UI-polish pass, qualify the packaged app,
and stop feature development.

## Next release gate

Prove the smallest real workflow in the packaged macOS app against the live
Railway Hermes service, then complete one ordinary coding loop. The app must
survive a restart, a lost gateway, and a reconnect without losing the active
profile, session, pane state, or credentials.

Evidence must come from the visible packaged workflow, not only unit tests,
fixture UAT, or direct Serve probes.

## Remaining work

### 1. Packaged live-runtime recovery (P0)

- Run the packaged macOS app against the live Railway Hermes service.
- Prove restart and sleep/wake recovery, including automatic reconnect with a
  fresh single-use Serve ticket.
- Force gateway loss and restore it; prove the active session, profile, model,
  approval mode, context usage, status bar, and agents/subagents state converge
  again without a stale or stranded UI.
- Prove credential reauthentication and encrypted credential persistence after
  reload.
- Prove a live approval request and response. If the real runtime does not
  emit an approval for a safe, reproducible action, record that limitation and
  keep the control truthful rather than fabricating one.
- Prove unavailable-history recovery and that archive/delete remain available
  even when transcript loading fails.

### 2. Ordinary coding loop (P1)

Using a real project and ordinary Git worktree, prove one complete loop:

- bind a session to the correct project, branch, cwd, terminal, files, and Git
  state;
- inspect changes, stage/unstage, revert with confirmation, commit, push, and
  create a draft PR;
- keep Terminal, Files, Changes/Diff, and Browser/Preview session-scoped;
- reload and switch sessions, then restore each session's tabs, selected
  surface, widths, focus, fullscreen state, and bottom-terminal state;
- recover from preview failure without detaching a browser surface or leaving
  an uncloseable native view behind.

Unsupported branches must be hidden or explicitly disabled. Do not expand this
into IDE parity, advanced browser tooling, unusual worktree topologies, or
complex conflict management.

### 3. Shared polish and final qualification

After P0 and P1 are green, run one normal-size, constrained-size, and
reduced-motion pass over the real Electron app. Fix only failures found in
that pass. The pass must leave no:

- overlap, clipping, unintended document overflow, or unstable pane size;
- unanchored overlay, inaccessible toggle, stale skeleton, top-left flash, or
  layout shift during loading, reconnect, route, session, or pane changes;
- dead or misleading control, fake data path, unexplained density difference,
  or inconsistent shared typography, radius, spacing, and status treatment;
- unstyled framework error or recovery state.

Then run the release checks that matter at this boundary: type checks, the
focused test suite, production build, security scan, packaged build, and final
macOS Electron UAT against the live service.

## Release boundary

The release is limited to real Hermes profiles, sessions, messages, reasoning,
tools, approvals, model state, durable chat with supported text/image
attachments, projects and ordinary Git worktrees, session-scoped terminal/
files/changes/diff/browser surfaces, necessary settings, and the adaptive shell
with status bar and agents/subagents tree.

Hermes Agent remains the sole runtime and source of truth. Railway hosts the
lean pinned Hermes service and persistent Hermes state. Do not deploy Hermes
Workspace, add a second agent backend, launch peer coding harnesses, or mirror
Hermes private state into a parallel implementation.

## Explicitly deferred

Pets, Petdex, achievements, journeys, gamification, Kanban parity, voice and
TTS, exhaustive plugin/webhook/analytics/maintenance/update parity, advanced
browser annotation/DevTools/history/favorites/screenshot automation, session
forking, Design Mode, stacked or parent-linked worktrees, unusual conflict
flows, cross-platform qualification, public distribution, signing, and
notarization are not part of this goal.

Real-backed messaging sessions, cron/jobs, skills, tools, MCP, and other
surfaces may remain only when they are stable, truthful, and do not add
startup work. They do not block release; hide them when they expose dead
actions or destabilize the daily workflow.

## Stop condition

Complete this goal when the three remaining work items above have packaged,
visible evidence; the release checks are green; every primary control is real
or precisely disabled; and the owner can use the app daily without an
unfinished parity project on the critical path.

Then stop feature development. Fix bugs found during dogfooding as new,
bounded goals. New parity ideas, platforms, experiments, and distribution work
must not reopen this goal.
