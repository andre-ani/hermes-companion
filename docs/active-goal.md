# Active goal: subtract the remaining Hermes coding-run control plane

The upstream-aligned interactive chat path is accepted. The next and only
implementation goal is to move background Hermes coding/harness runs onto the
same pinned upstream client contracts, then delete the remaining custom server
transport and recovery state machine.

This is a subtraction slice, not a general Code-mode, project, or workspace
rewrite.

## Ownership chain

| Concern | Authority and forward-progress owner | Companion responsibility |
| --- | --- | --- |
| Coding session, prompt, transcript, tools, approvals, running/completed state | Hermes Serve and durable Hermes session storage | Start or resume through `packages/hermes-adapter`; project a transient run view |
| Physical socket and transport session ID | Pinned upstream `JsonRpcGatewayClient`; transport ID dies with the socket | Mint a fresh Railway ticket for each physical socket; never persist the transport ID |
| Recovery after renderer, network, or app-process loss | Durable Hermes session ID plus `session.resume`, history, `session.info`, and live events | Persist only the opaque durable-session-to-authorized-worktree/run binding needed to find and resume the run |
| Worktree authorization and one-writer lease | Companion repository plus execution bridge/Git truth | Acquire, reconcile, and release the writer lease exactly once |
| Native files, Git, terminal, preview, notification, audit | Companion Electron/bridge capabilities | Keep these capabilities path-confined and independent of Hermes session reconstruction |

No renderer poll, in-memory event buffer, or Companion run record may become a
second authority for Hermes progress.

## Observable release gate

In the packaged macOS app against the pinned live Railway service and a
disposable authorized worktree:

1. start one unique background Hermes coding run and acquire one writer lease;
2. prove one durable Hermes session is created and the prompt is submitted once;
3. reload the renderer, interrupt and restore network connectivity, then quit
   and relaunch the app while the run is active;
4. rehydrate the same run from Hermes without replaying the prompt, duplicating
   a tool invocation, or acquiring a second writer;
5. route cancellation or an emitted approval through the current transport
   session ID only;
6. complete or truthfully recover the run, release the writer lease exactly
   once, and show the resulting files/Git state from the authorized execution
   host; and
7. verify no Railway credential, ticket URL, transport ID, transcript, approval
   payload, or running state was persisted or logged by Companion.

## Smallest change boundary

- Reuse the existing framework-independent Hermes session controller with an
  injected Node WebSocket implementation for server-owned background runs.
- Keep a small Companion run coordinator only for worktree authorization,
  writer leases, notifications, audit, and mapping an opaque run ID to an
  opaque durable Hermes session ID.
- Rehydrate run progress from Hermes snapshots after process loss; do not
  restore an in-memory event log as authority.
- Move the non-session one-shot project, subagent, pet, and related RPC callers
  from the custom socket onto a minimal upstream-shared gateway request adapter
  without changing those product capabilities.
- Delete `hermes-serve-runs.ts`, `hermes-session-recovery.ts`, their duplicate
  transport/recovery tests, and obsolete polling contracts once no callers
  remain.
- Keep Svelte remote functions as thin governed adapters. Keep React entirely
  outside the product and do not structurally translate upstream React code.
- Do not begin repository metadata subtraction, project/worktree redesign, or
  general coding-loop polish in this slice.

## Rejection rules

Reject the slice if it persists a transport ID or Hermes-owned fact, replays a
prompt during recovery, leaves both run implementations behind a feature flag,
weakens worktree authorization or writer isolation, adds React, or merely moves
the custom state machine into a differently named file.

## Stop condition

Stop when the duplicate server socket/recovery files are deleted, focused and
architecture checks pass, and the packaged live Railway coding-run workflow
passes the disruption/relaunch gate. Review that checkpoint before reducing
`session-workspace-identity.ts` or `companion-repository.ts`.

The accepted interactive-chat evidence remains recorded in
`current-checkpoint.md`; it does not need to be re-proved unless this slice
changes the shared controller behavior.

## Current implementation evidence

The duplicate server transport/recovery files and their scaffold-preserving
tests are deleted. Background runs now use the shared controller with a Node
WebSocket injection; one-shot project, subagent, and pet RPCs use the pinned
shared gateway client. Focused recovery/repository tests, type checks, and
architecture ownership checks pass.

This goal is not accepted yet. The remaining critical path is the packaged
`npm run acceptance:live-railway-coding-run` workflow against the pinned live
service and a disposable authorized worktree. Do not begin the deferred
repository/workspace subtraction before that report passes.
