# Visual grounding: Hermes Desktop, T3 Code, and Companion
This document records the visible reference patterns used by the Companion UI
pass. It is behavioral and visual research only; reference code is not copied.

## Shared reference language

| Pattern | Hermes Desktop | T3 Code | Companion rule |
| --- | --- | --- | --- |
| Window chrome | Traffic lights occupy a protected titlebar region; app controls start after them | Traffic lights and product identity share a calm titlebar | Reserve the macOS safe area at the root shell and keep it independent of the current surface |
| Navigation | Narrow session rail; top-level actions are few; operational families live behind Messaging/Capabilities | Projects are the hierarchy and threads are nested directly beneath them | Chat shows global sessions; Code shows project → thread; never duplicate project identity in a second sidebar section |
| Workspace | One readable conversation column with generous surrounding canvas | One dominant review/conversation surface | One primary middle task at a time; contextual tools do not compete with it |
| Secondary tools | File rail is visually separate and contextual | Review/actions appear only where relevant | Browser/Terminal/Files live in one collapsible right dock, collapsed by default |
| Composer | Compact bottom-anchored control | Large code-task composer when the coding context needs it | Chat composer stays compact and centered; richer Code controls appear only in the relevant Run view |
| Status | Dense bottom bar separates gateway/agent/cron from runtime/version state | Operational actions stay in the header, not in content cards | Keep the status bar 24px, dim, and strictly functional |
| Surfaces | Dark layers differ subtly; separators establish structure | Very few framed cards; the diff is the meaningful bounded surface | Use surface tone before borders; reserve borders for inputs, selected rows, dock boundaries, popovers, and diff/review |
| Type and state | Small uppercase metadata; content remains readable | Project/thread hierarchy uses restrained weight and semantic status color | Metadata 10–12px, controls 12–13px, content 14px; color is reserved for real state |

## Problems observed in the pre-pass Companion screenshot

- The empty state and composer stretched across an undifferentiated canvas.
- Chat/Code mode, profiles, header context, and status actions competed without a
  clear hierarchy.
- Code repeated project identity and displayed worktree stats, Git review,
  parallel worktrees, an unavailable runtime warning, task input, and empty run
  activity simultaneously.
- The right dock consumed more than a third of Code by default and exposed
  preview configuration before a preview was relevant.
- Nearly every region used a border or rounded card, so no surface appeared
  primary.
- Several controls looked actionable without a working outcome: the composer
  Context button, unsupported Agents/updates/status routes, unauthenticated
  Push/PR actions, and terminal access without a selected worktree.
- The project dialog mixed creation and worktree administration, making a
  common action feel like configuration.

## Enforced interaction rules

1. Every visible control must have exactly one of three states: working action,
   disabled with a specific explanation, or absent. Placeholder buttons are
   prohibited.
2. Unavailable capabilities do not open generic empty pages from persistent
   chrome. They are disabled and explain the missing host capability.
3. A destructive or remote action is not shown as ready merely because its CLI
   binary exists; required authentication and context must also be verified.
4. Search filters the sidebar inline. The command palette handles global search
   and actions. Session search does not use a large modal.
5. Code renders one activity surface at a time. Review and Run are sibling
   views, not stacked cards.
6. Preview setup stays behind an explicit disclosure until automatic preview
   process management exists.
7. Adjacent inputs, selects, and buttons use the same shared control-height
   token. Component-local height overrides are prohibited.

## Screenshot acceptance set

Each visual milestone must be reviewed at the same Electron window size with:

1. Chat containing a real transcript and the compact composer.
2. Code with a dirty worktree in Review.
3. Code with Run selected and both available/unavailable runtime states.
4. Code with the Browser/Terminal/Files dock open.
5. Settings/Models using the reused sidebar.
6. Full-screen preview with the floating composer.

Screenshots are evidence of layout only. The corresponding interaction must
also pass the Electron UAT before the feature is called complete.
