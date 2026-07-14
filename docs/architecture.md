# Architecture and ownership

Hermes Companion is a SvelteKit and Electron desktop client for one upstream
Hermes runtime. It is not a second Hermes frontend SDK or control plane.

## Authoritative ownership

| Capability or state | Authority and mutation owner | Reconnect/reload source | Allowed Companion projection |
| --- | --- | --- | --- |
| Sessions, durable IDs, transcript, running/interrupt state | Hermes Serve and Hermes session storage | `session.resume`, history APIs, `session.info`, and subsequent events | Current durable session ID, selection, loading/error presentation |
| Transport IDs and JSON-RPC request correlation | The live upstream shared client | Discarded with the socket; a new socket receives a new transport ID | None outside the live controller |
| Models, provider resolution, context usage, approvals, subagents | Hermes | Hermes queries/events after reconnect | Transient view model only |
| Hermes projects and session grouping | Hermes project/session APIs | Fresh project/session queries | Expanded rows and selection only |
| Railway credential and Serve-ticket authentication | Companion Electron/server boundary | Encrypted credential store, then a newly minted single-use ticket | Connection status; never the credential or ticket |
| Execution bridge and path confinement | Companion bridge/native capability layer | Bridge state and execution-host inspection | Opaque authorized worktree binding |
| Git worktree filesystem, branch, terminal, files, Git, preview | The execution host and Git | Fresh native/bridge queries | Selected tab, layout, editor and preview presentation |
| Browser windows and native surfaces | Electron | Electron surface registry keyed by logical owner | Tab, URL, bounds, visibility, focus |
| Desktop presentation | Companion | Companion preferences where persistence is useful | Drafts, selection, scroll, layout, pane state |

Hermes-owned state may be cached for rendering while connected, but it is never
accepted as authoritative after reload or transport loss. A cache is replaced
by the next Hermes resume/query/event result.

## Process boundary

1. The sandboxed renderer composes Svelte UI and runs the framework-independent
   upstream Hermes shared client through a thin Svelte adapter for interactive
   sessions.
2. SvelteKit remote functions expose bounded Companion capabilities such as
   credential-backed ticket minting, audit, and path-confined native/bridge
   operations. They do not implement a parallel Hermes session state machine.
3. Electron owns encrypted secrets, native browser surfaces, local Git/PTYs,
   notifications, and application lifecycle.
4. The Companion bridge exposes the same path-confined execution capabilities
   beside the Railway Hermes runtime.

Long-lived Railway credentials never cross into the renderer. The renderer may
receive one short-lived, single-use Hermes WebSocket URL immediately before it
opens a physical socket. On reconnect it requests a new URL and resumes by the
durable Hermes session ID; it never replays a submitted prompt.

## Source-reuse boundary

- Reuse framework-independent upstream modules directly.
- Port behavior from upstream UI code only as an explicit transition model in
  framework-neutral TypeScript.
- Let Svelte own lifecycle subscription and presentation. Do not reproduce
  React component, hook, effect, context, or store topology.
- Keep pinned-runtime differences in named compatibility shims. Compatibility
  code is not a new source of truth and has a deletion trigger.

## Security boundary

- SvelteKit and Electron native services bind to loopback.
- Native calls require the random mode-0600 runtime bearer token.
- Renderer processes use context isolation, sandboxing, and no Node access.
- Remote WebSocket URLs must be `wss:`; local development may use loopback
  `ws:`. Ticket-bearing URLs must never be logged or persisted.
- General and preview browsing use isolated Electron sessions.
- Provider credentials and agent subprocesses remain Hermes-owned.

## Completion rejection rules

A capability is not complete when it reconstructs durable Hermes facts from
Companion storage, persists transport session IDs, substitutes renderer/server
polling for the upstream client, tests for custom scaffolding rather than
behavior, or structurally translates a React implementation into Svelte.
