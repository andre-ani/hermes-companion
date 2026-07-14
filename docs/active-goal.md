# Active goal: prove the thin upstream-aligned chat path

This is the only active completion target. Ordinary coding-loop completion and
shared polish resume only after this architecture gate passes.

## Observable release gate

In the packaged macOS app against the pinned live Railway Hermes service:

1. create one conversation and start one unique long-running terminal-backed
   response;
2. reload the renderer while the turn is active;
3. interrupt and restore network connectivity;
4. reconnect using a fresh single-use ticket and resume the same durable Hermes
   session without replaying the prompt;
5. show exactly one user message, tool execution/result, and final assistant
   response; and
6. quit/relaunch and restore transcript, context, model, status, and session
   identity from Hermes.

The proof is incomplete unless the custom chat run map, server polling API, and
renderer recovery state machine have been removed. Fixture tests against the
old path do not satisfy this gate.

## Smallest change boundary

- consume the pinned framework-independent upstream shared client;
- keep Railway credentials behind Companion and expose only fresh ephemeral
  socket URLs;
- implement a framework-neutral session controller plus thin Svelte adapter;
- remove chat-specific custom socket/polling/recovery code;
- leave Code mode, project/worktree binding, native browser, terminal, files,
  Git, preview, and bridge behavior unchanged until this gate passes.

## Requirements

- no React dependency or React-derived application architecture;
- durable and transport session IDs cannot be interchanged;
- no submitted prompt is replayed during recovery;
- no ticket or credential is logged or persisted;
- missed events reconcile from Hermes history/resume/session information;
- pinned-contract gaps degrade truthfully and are registered as shims;
- architecture violation baselines only shrink.

## Stop condition

Stop this slice when focused/full checks and the packaged live workflow pass,
the old chat path is deleted, and a clean rollback commit exists. Then review
the result before migrating Code mode or workspace ownership.
