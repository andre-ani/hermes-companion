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

The accepted architecture correction is now fast-forwarded onto local `main` at
`937635f`. The pre-correction dirty work is preserved without modification on
`codex/pre-upstream-correction-dirty-snapshot` at `a3c4123`; it is not part of
`main`. Its workspace-metadata reconstruction must be reclassified against the
ownership matrix before any individual change is reconsidered.

The migration worktree and `codex/upstream-thin-adapter` remain as accepted
checkpoint references. They are not the active implementation checkout.

## Next step

Continue on `main` with the bounded goal in `active-goal.md`: move background
Hermes coding/harness runs to the upstream-aligned controller and delete the
remaining custom server transport/recovery layer. Do not revive the deleted
chat path, merge the quarantined dirty snapshot, or begin repository/workspace
subtraction in that slice.
