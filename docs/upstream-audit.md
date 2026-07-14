# Corrected upstream Hermes audit

Audit correction date: 2026-07-14.

## Correction

The earlier audit found the official Hermes client behavior but imposed the
wrong reuse boundary. It treated upstream source as behavioral reference only
and defined adapted behavior as reimplementation in Svelte/Electron. That
conflated "no React in the product" with "do not reuse framework-independent
upstream code" and led Companion to build a second transport/session/recovery
layer.

This document supersedes that classification. Git history retains the earlier
audit as evidence; its reuse conclusion is not an active requirement.

## Runtime pin

| Artifact | Exact pin |
| --- | --- |
| Official image | `nousresearch/hermes-agent@sha256:8986f497b2dd9a89bd455bdd233070c32ae9d6e7176087904d5d0a78294a5bf8` |
| Source commit | `7acaff5ef2bcbaa22bd23b72efe60906123a4f55` |
| Hermes Desktop package version | `0.17.0` |
| Shared client package | `apps/shared`, package name `@hermes/shared` |

The source commit, not upstream `main`, is the compatibility authority for the
currently deployed image. Pin changes require a new diff audit.

## Classification

- **Direct reuse**: framework-independent upstream code consumed at the pinned
  revision.
- **Behavioral port**: upstream commands/events/transitions expressed in a
  framework-independent controller, without copying React structure.
- **Thin Svelte adapter**: lifecycle and presentation binding with no duplicate
  business state machine.
- **Pinned-contract shim**: defensive behavior needed only because the pinned
  runtime cannot authoritatively replay or query a required fact.
- **Companion-owned**: Railway auth, execution bridge, Electron/native surfaces,
  worktree authorization, or desktop presentation.
- **Unsupported**: absent upstream capability that is outside the bounded goal;
  it remains absent rather than being fabricated.

## Source-backed findings

| Concern | Pinned upstream owner | Companion classification |
| --- | --- | --- |
| JSON-RPC request/event transport | `apps/shared/src/json-rpc-gateway.ts` | Direct reuse |
| WebSocket URL resolution and fresh OAuth ticket semantics | `apps/shared/src/websocket-url.ts`; Desktop gateway boot | Direct reuse plus Companion ticket provider |
| Sleep/wake and network reconnect | `apps/desktop/src/app/gateway/hooks/use-gateway-boot.ts` | Behavioral port into framework-neutral controller |
| New session and durable/runtime identity split | `use-session-actions/index.ts`; Serve `session.create`/`session.resume` | Behavioral port; branded IDs prevent interchange |
| Submit, attachment synchronization, resume-before-submit | `use-prompt-actions/submit.ts` | Behavioral port |
| Stream reconciliation and `session.info` projection | `use-message-stream/gateway-event.ts` | Behavioral port |
| Routed reload and interrupted resume | `use-route-resume.ts`, `use-session-state-cache.ts` | Behavioral port plus thin Svelte lifecycle |
| Session-scoped approvals and other blocking prompts | `apps/desktop/src/store/prompts.ts` | Behavioral port; transient projection only |
| Models, context, approvals, subagents | Hermes Serve RPC and events | Hermes-owned, rehydrated authoritatively |
| Projects and Git worktrees | Hermes project APIs and Desktop Git worktree operations | Thin adapter; Companion adds path authorization/lease only |
| Railway password auth and public Serve-ticket minting | No generic upstream Railway owner | Companion-owned |
| Co-located execution bridge | No upstream equivalent | Companion-owned |
| WebContentsView browser ownership | Electron Companion design | Companion-owned |
| Pending prompt payload after a process disappears | Not authoritatively replayed by this pinned public Serve contract | Truthful pinned-contract limitation; no fabricated durable prompt |

## Subtraction status

- `hermes-chat-runs.ts`, its polling remote operations, renderer turn maps, and
  the corresponding custom contracts/tests have been removed in the first
  chat slice.
- `hermes-serve-runs.ts` combines a custom JSON-RPC socket with coding-run and
  recovery state. It also supplies one-shot project, subagent, pet, and related
  RPC calls. The active slice moves all of those transports to the pinned
  upstream shared client without redesigning the capabilities.
- `hermes-session-recovery.ts` interprets resume payloads for both custom paths;
  only the remaining custom server path still needs it, so it becomes obsolete
  with that path.
- Interactive chat no longer has page-owned turn maps, long-poll loops, or a
  custom recovery state machine. Background harness and annotation surfaces
  still consume Companion-buffered run events until the active slice replaces
  them with transient projections of the shared controller.
- `companion-repository.ts` and session/workspace helpers must retain only
  Companion-owned bindings and presentation, never repair missing Hermes facts.
- The former dirty workspace reconstruction is preserved only on
  `codex/pre-upstream-correction-dirty-snapshot`; it is not an active source of
  requirements or code for `main`.

## Unique Companion behavior that remains

Railway authentication and fresh ticket minting; encrypted credential custody;
execution-bridge authentication and path confinement; one-writer worktree
leases; Electron browser/PTY/Git/files/notifications; preview authorization;
Svelte desktop composition and presentation preferences.
