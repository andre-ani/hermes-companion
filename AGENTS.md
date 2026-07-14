# Hermes Companion project rules

These rules are project-specific and supplement the global agent constitution.

- Hermes at the source revision pinned in `infra/hermes-runtime/upstream.lock.json`
  is authoritative for sessions, messages, running state, context, models,
  approvals, subagents, and Hermes project identity. Inspect that source before
  adding Hermes-facing state or behavior.
- Classify every Hermes integration as direct reuse, behavioral port, thin
  Svelte adapter, pinned-contract shim, or Companion-owned behavior. Never use
  "adapted" to mean an unreviewed reimplementation.
- Persist only opaque Hermes IDs and Companion-owned connection, presentation,
  native-surface, execution-bridge, and worktree-authorization state. Rehydrate
  Hermes facts from Hermes after reload or reconnect.
- React, React DOM, React component libraries, React hooks, and React-derived
  application architecture are prohibited in product code. A behavioral port
  starts from commands, events, transitions, and invariants, then implements an
  idiomatic framework-neutral controller with a thin Svelte adapter. Do not
  translate component trees, hooks, effects, contexts, or nanostores.
- A pinned-contract shim must name the upstream gap, have focused contract
  coverage, and state the upstream change that deletes it.
- Update the runtime image digest, source revision, submodule revision,
  compatibility audit, and live acceptance evidence together.
- Migration slices must remove an old path. Do not keep parallel Hermes clients
  behind a permanent flag, and do not add tests that preserve implementation
  scaffolding instead of behavior.

