# Current checkpoint

## Authoritative direction

- Hermes at the pinned runtime source commit is the sole owner of session,
  transport recovery, message, context, model, approval, subagent, and project
  behavior.
- Companion owns Railway authentication, the execution bridge, native Electron
  surfaces, worktree authorization, and desktop presentation.
- React remains outside the product. Framework-independent upstream code is
  reused; UI-owned behavior is ported semantically into framework-neutral
  TypeScript and bound through a thin Svelte adapter.

## Current gate

The custom chat run/poll/recovery path is deleted. Focused architecture,
recovery, type, build, and packaged fixture chat checks pass. The remaining
gate is one packaged live-Railway conversation through renderer reload,
network loss, reconnect, completion, and process relaunch without prompt replay
or session identity drift. Run `npm run acceptance:live-railway-chat` and see
`docs/active-goal.md`.

## Worktree safety

The pre-audit dirty work remains untouched in
`/Users/andreani/dev/hermes-companion`. Architecture correction work is isolated
on `codex/upstream-thin-adapter` in
`/Users/andreani/dev/hermes-companion-upstream-thin`. Do not copy the pending
workspace-metadata reconstruction into the migration without reclassification.

## Next step

Build the packaged app, run the guided live-Railway recovery workflow, and
record the sanitized passing report. Do not begin Code-mode or repository
subtraction before that gate passes.
