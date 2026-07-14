# Active goal: finish the stable daily driver

**Status: complete on 2026-07-14.** The qualified application commit is
`47fc50a`. Hermes Companion is now in dogfooding and maintenance; the stop
condition at the end of this document applies.

This document is the authoritative completion target for Hermes Companion. It
supersedes the deleted background-Run goal, broad Hermes Desktop parity plans,
prototype scaffolding, and historical implementation checklists.

The finish line is a coherent owner-only macOS app for real Hermes
conversations and ordinary coding work. Finish that product, perform one shared
polish pass, qualify the packaged app, and stop feature development.

## Single observable outcome

The owner can use one packaged Hermes Companion app as a daily driver to:

1. connect to the pinned Hermes runtime and complete a real conversation that
   survives reload, brief network loss, sleep/wake, quit, and relaunch;
2. open an ordinary project/worktree and complete the local coding loop through
   Terminal, Files, Changes, and Browser; and
3. stage, commit, push, and create a draft pull request from the correct
   worktree without stale, fake, or unreachable controls.

When this workflow passes and the visible product is coherent, the goal is
complete. Feature count and upstream parity are not completion criteria.

## Scope lock

The release includes only:

- real Hermes profiles, sessions, messages, reasoning, tools, approvals, model
  state, context, and agents/subagents;
- durable chat with proven text and image attachments;
- ordinary projects and Git worktrees;
- session-scoped Terminal, Files, Changes/Diff, and Browser/Preview surfaces;
- the settings required to operate or present those workflows; and
- a stable adaptive Electron shell with truthful loading, empty, offline,
  reconnecting, failure, and constrained-layout states.

Nothing else is required to declare the product complete.

Existing code, tests, documents, screenshots, and upstream features are
evidence, not requirements. A capability enters this goal only when it is
necessary for the observable outcome above. If it is not necessary, remove it
from the primary product or defer it.

The agent-native architecture skill applies only when this goal explicitly
requires an agent, automation, API, webhook, or external adapter to invoke an
already-intended capability. It must never create a feature, parity obligation,
surface, state model, or verification gate.

## Explicit non-goals

Do not add or revive:

- a separate Run panel, background coding harness, writer lease, or peer agent
  backend;
- Design Mode, annotation handoff, browser puppeteering, screenshot automation,
  or advanced browser tooling;
- pets, achievements, journeys, learning graphs, Kanban, voice/TTS, or
  gamification;
- broad plugin, webhook, analytics, maintenance, backup, update, or checkpoint
  administration parity;
- stacked/parent-linked worktree workflows, unusual conflict management, or IDE
  parity;
- Windows/Linux qualification, public distribution, signing, or notarization;
  or
- React, React-derived architecture, or structural translations of upstream
  React UI.

Already-stable Hermes-owned secondary capabilities may remain only when they
create no startup work and expose no dead primary action. They do not block
release.

## Ownership boundary

| Concern | Authority | Companion responsibility |
| --- | --- | --- |
| Sessions, transcript, running state, context, models, approvals, subagents | Pinned Hermes runtime and durable Hermes session storage | Connect, render, and rehydrate through the pinned adapter |
| Railway credentials and Serve tickets | Companion Electron/server boundary | Encrypt the long-lived credential and mint a fresh single-use ticket per socket |
| Projects and Hermes project identity | Hermes supported project/session APIs | Present official facts without reconstructing a second project model |
| Worktree filesystem, Git, terminal, files, preview | Git and the authorized execution host | Path-confined native/bridge operations and session binding |
| Browser views and desktop presentation | Electron and Companion | Ownership, bounds, focus, layout, and useful presentation preferences |

Companion may persist only opaque Hermes IDs plus Companion-owned connection,
presentation, native-surface, execution-bridge, and worktree-authorization
state. It rehydrates Hermes facts from Hermes after reload or reconnect.

## Ordered critical path

### 1. Finish P0 conversation reliability

Exercise the outermost packaged workflow first. Fix only failures that can
strand, lose, corrupt, misroute, or misrepresent a real conversation:

- create, stream, stop, resume, search, rename, pin/unpin, unread, archive,
  restore, and delete;
- recover after navigation, reload, brief network loss, sleep/wake, gateway
  loss, quit, and relaunch;
- preserve profile/model/approval/context/status ownership across those changes;
- render messages, Markdown, reasoning, tools, approvals, and attachments
  without duplicate transient state, stuck progress, clipping, or document
  overflow; and
- keep every destructive or unavailable action truthful.

The accepted live chat recovery evidence in `current-checkpoint.md` remains
valid unless shared session-controller behavior changes. Do not repeat it after
unrelated UI edits.

### 2. Finish the ordinary coding loop

In one real project and ordinary worktree, prove:

- project create/open/rename/archive/delete;
- worktree create/select/remove with main-checkout protection;
- correct session, project, repository, branch, cwd, terminal, files, Git, and
  preview binding;
- inspect status and diffs, stage/unstage, revert with confirmation, commit,
  push, and draft-PR creation; and
- right-dock and terminal state restoration without leaking state to another
  session.

Fix the earliest failing ownership boundary. Do not add advanced workflow
branches while this simple loop is incomplete.

### 3. Remove deferred and dead product surface

Remove or precisely disable any primary control that is fake, unbacked,
unreachable, outside the scope lock, or dependent on historical scaffolding.
Do not create compatibility tests for deleted prototypes.

### 4. Perform one shared UI polish pass

After P0 and P1 work, review the real Electron app at normal and constrained
macOS sizes, including reduced motion. Fix shared token, primitive, and shell
ownership defects that cause overlap, clipping, layout flash, poor focus,
unanchored overlays, inconsistent density, or unreadable copy. Do not turn this
into a redesign or feature pass.

### 5. Qualify and stop

Against the pinned live Railway service in the packaged macOS app, prove the
single observable outcome plus the relevant type, focused test, production
build, security, and Electron UAT gates. Record failures honestly and fix only
release blockers.

## Working rule for every slice

Before implementation, state:

1. the one user-visible failure or missing release outcome;
2. the smallest ownership boundary that can fix it; and
3. the outermost evidence that will prove it.

If a proposed change does not advance that evidence, do not implement it. If a
workflow already passes, record it and move on. If work spreads across
subsystems without moving the gate, preserve the checkpoint, reduce scope, and
revisit the earliest assumption.

## Stop condition

Stop when P0 and P1 pass, the one polish pass has visible evidence, every
primary action is real or precisely unavailable, deferred features no longer
intrude, and the owner can use the packaged app day to day.

Then move Hermes Companion into dogfooding and maintenance. New parity ideas,
automation surfaces, platforms, and experiments require separate explicit
goals; they are not reasons to keep this goal open.
