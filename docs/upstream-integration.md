# Upstream Hermes integration policy

## Dependency policy

`vendor/hermes-agent` is a read-only Git submodule pinned to the source commit
mapped to the runtime image. Only `vendor/hermes-agent/apps/shared` participates
in the Companion workspace/build. Upstream Desktop React code may be inspected
for behavior but is not a product dependency and is never imported or bundled.

## Semantic porting workflow

For behavior that exists only in upstream React code:

1. Record the source commit and paths in the adapter provenance manifest.
2. Write the observable commands, upstream events, state transitions,
   invariants, recovery source, and failure states.
3. Implement those transitions in framework-independent TypeScript with
   injected I/O.
4. Bind the controller snapshot to Svelte using Svelte 5 lifecycle and runes or
   stores. Svelte owns presentation only.
5. Test behavioral parity at the controller boundary and the visible workflow.

Do not translate JSX, component hierarchy, hooks, refs, effect dependency
graphs, contexts, or nanostores. Similar React and Svelte file shapes are a
warning that the port started from implementation structure rather than the
contract.

## State rule

The durable Hermes session ID is the only session identity Companion may retain
for routing or presentation. The runtime/transport session ID exists only in a
live controller. Messages, running state, context, model, approvals, subagents,
and project facts are refreshed from Hermes after reload/reconnect.

## Compatibility shims

Each shim must be registered with its upstream gap, local behavior, focused
test, and deletion condition. A shim may provide a truthful degraded state; it
may not invent a second durable authority.

## Upgrade procedure

1. Resolve the new image digest to an immutable source commit.
2. Update the runtime lock and submodule in the same change.
3. Diff `apps/shared` and every registered behavioral source path.
4. Re-evaluate and delete satisfied shims.
5. Run adapter contract tests, packaged Electron recovery, and the live Railway
   acceptance workflow before calling the pin compatible.

