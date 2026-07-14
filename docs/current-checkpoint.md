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

## Accepted gate

The custom chat run/poll/recovery path is deleted. Focused architecture,
recovery, type, build, and packaged fixture checks pass. The packaged
live-Railway workflow also passed through renderer reload, network loss,
reconnect, completion, and process relaunch without prompt replay or session
identity drift.

The sanitized mode-0600 report was recorded on 2026-07-14 under the ignored
`acceptance-artifacts/live-railway-chat-recovery` directory with every check
true. The accepted package contained the single-instance fix committed as
`e0a9603`; its `app.asar` SHA-256 is
`44645863ccd616e4ca3f1d513406d68eb077f69a0853d1cc0c4a20b652f9094e`.
The report's `commit` field remains `93af49b` because the fix was uncommitted
when the operator run began. This provenance discrepancy is recorded rather
than rewriting the evidence after the fact.

## Worktree safety

The pre-audit dirty work remains untouched in
`/Users/andreani/dev/hermes-companion`. Architecture correction work is isolated
on `codex/upstream-thin-adapter` in
`/Users/andreani/dev/hermes-companion-upstream-thin`. Do not copy the pending
workspace-metadata reconstruction into the migration without reclassification.

## Next step

Review this accepted subtraction slice before beginning Code-mode or repository
subtraction. Do not revive the deleted chat path or carry the original dirty
workspace-metadata reconstruction into this branch without reclassification.
