# Current checkpoint

## Stable daily driver complete

The bounded goal in `active-goal.md` completed on 2026-07-14. The qualified
application commit is `47fc50a829e20bd913b80a3f94bbd43f678f2bc9`.
Feature development stops here; the next phase is owner dogfooding and
maintenance.

## Conversation recovery evidence

The accepted packaged live-Railway workflow remains valid because the shared
Hermes session controller did not change in the finishing slice. It passed
renderer reload, network loss and reconnect, response completion, quit, and
process relaunch without prompt replay or session identity drift.

The owner also reported a successful manual pass on 2026-07-14 that sent a
request which slept, reloaded the app during the request, disabled Wi-Fi for
three seconds, restored it, and confirmed the conversation remained usable.
This was not repeated after unrelated shell and coding-surface changes.

## Packaged coding workflow evidence

The final arm64 macOS `.app` executable passed the Electron acceptance with
every check true. The visible workflow covered:

- project add, rename, archive, archived visibility, and delete;
- an ordinary non-main worktree with session/repository/branch/cwd binding;
- visible revert confirmation, stage, unstage, commit, push, and draft pull
  request creation;
- Terminal, Files, Changes, and isolated Browser surfaces;
- per-session right-dock state, renderer reload restoration, browser lease
  rotation, and native worktree create/remove safety; and
- normal layout plus 960 x 680 constrained layout with reduced motion.

The ignored report and screenshots are under
`apps/desktop/uat-artifacts/darwin`. The acceptance uses a real temporary Git
repository and bare remote plus a deterministic fake `gh` endpoint so it does
not mutate an external repository.

## Finishing corrections

- Removed the unrequested Run/background-coding control plane and its primary
  surface.
- Removed permanently disabled Back/Forward chrome and the out-of-scope
  automation starter.
- Made queued bounds from released browser leases and stale async workspace
  hydration converge without renderer-visible server errors.
- Made sidebar and inspector tracks adapt at the minimum supported window size
  without clipping the conversation or composer.

## Qualification

- `npm run check`: passed.
- `npm run architecture:check`: passed.
- `npm test`: 39 files and 224 tests passed.
- Desktop and bridge production builds: passed.
- Final packaged executable Electron UAT: every check true.
- Release checksum verification: four artifacts verified.

Build provenance records commit
`47fc50a829e20bd913b80a3f94bbd43f678f2bc9`, `dirty: false`, and build time
`2026-07-14T15:06:48.177Z`. The final `app.asar` SHA-256 is
`645df7221b42b44b8052542c948eaea0e34f8c078bf45c8df1526c711a4cbe30`.
The DMG SHA-256 is
`716e9f6a4033a7af9c643963bd8e018fe59805c052eaffce61731613b756c8ac`;
the ZIP SHA-256 is
`8eb040e1562f96163c4bd7ee77047a2e52ce4788b27456831db9bb731778b0af`.

The package is intentionally unsigned and unnotarized because public
distribution, signing, and notarization are explicit non-goals.

## Ownership boundary

- Hermes at the pinned runtime source commit is the sole owner of session,
  transport recovery, message, context, model, approval, subagent, and project
  behavior.
- Companion owns Railway authentication, the execution bridge, native Electron
  surfaces, worktree authorization, and desktop presentation.
- React remains outside the product. Framework-independent upstream code is
  reused; UI-owned behavior is ported semantically into framework-neutral
  TypeScript and bound through a thin Svelte adapter.

## Worktree safety

The accepted architecture correction is now fast-forwarded onto local `main` at
`937635f`. The pre-correction dirty work is preserved without modification on
`codex/pre-upstream-correction-dirty-snapshot` at `a3c4123`; it is not part of
`main`. Its workspace-metadata reconstruction must be reclassified against the
ownership matrix before any individual change is reconsidered.

The migration worktree and `codex/upstream-thin-adapter` remain as accepted
checkpoint references. They are not the active implementation checkout.

## Next step

Dogfood the packaged app. Fix reproducible daily-driver regressions through a
separate bounded goal. Do not revive the deleted chat path, Run/harness
prototype, Design/annotation handoff, or quarantined dirty snapshot. New
parity, automation, browser-control, platform, signing, and distribution work
requires a separate explicit goal.
