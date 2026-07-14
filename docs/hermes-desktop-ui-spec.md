# Hermes Desktop UI specification and implementation handoff

This document supersedes the narrower visual-pass notes in
[`visual-grounding.md`](visual-grounding.md). Hermes Desktop is the source of
truth for Hermes-owned operations, identities, sessions, approvals, models,
provider controls, skills, MCP, and other agent semantics. T3 Code is the
primary reference for coding-workspace layout, panel management, browser start
state, editor/terminal/diff mechanics, visual density, spacing, colors, and
icon language. Hermes Workspace is architecture
research only and must never be used as a visual reference. This is a
behavioral specification: no React dependency, copied upstream component, or
proprietary asset is permitted.

## Source record

| Item | Record |
| --- | --- |
| Canonical Hermes Agent repository | `https://github.com/NousResearch/hermes-agent.git` |
| Canonical local inspection path | local `NousResearch/hermes-agent` checkout |
| Pinned remote-MCP/UI evidence revision | `586aae4bf13c20c3f2966cad590b27946b227bbb` |
| Current local-checkout rule | A checkout at another SHA is not evidence for the pin; re-audit before changing compatibility claims. |
| Hermes benchmark | Supplied Hermes Desktop reference images plus audited Desktop shell behavior for Hermes-owned surfaces. |
| Coding-workspace benchmark | Supplied T3 Code references plus audited project/thread, panel, browser, review, editor, and terminal behavior. |

The detailed source audit remains in [`upstream-audit.md`](upstream-audit.md)
and [`railway-deployment.md`](railway-deployment.md). The following exact
Hermes files were inspected for this handoff:

| File | Observed behavior used by Companion |
| --- | --- |
| `apps/desktop/src/app/shell/app-shell.tsx`, `app/master-detail.tsx` | Compact stable master/detail shell; chat/task canvas stays primary. |
| `apps/desktop/src/app/chat/index.tsx`, `app/right-sidebar/index.tsx` | Files, preview, terminal, and review are contextual secondary rails. |
| `apps/desktop/src/app/chat/sidebar/projects/*`, `electron/git-worktree-ops.ts` | Projects/worktrees group code sessions and use real Git worktree operations. |
| `apps/desktop/src/app/right-sidebar/review/file-tree.tsx`, `electron/git-review-ops.ts` | Review is changed-files/diff-first and owns stage, commit, push, and PR context. |
| `apps/desktop/src/components/assistant-ui/tool/approval.tsx`, `store/prompts.ts`, `store/native-notifications.ts` | Approvals are session-scoped; off-screen blocking work can notify natively but remains actionable in the shared inbox. |
| `apps/desktop/src/app/settings/*`, `app/profiles/*`, `app/skills/*`, `app/cron/*` | Operational settings are contextual, not a permanent dashboard leaf list. |
| `tui_gateway/server.py`, `tui_gateway/transport.py`, `tui_gateway/ws.py` | Serve JSON-RPC supports sessions, streamed events, and approval response. |
| `tools/mcp_tool.py`, `tui_gateway/entry.py`, `website/docs/user-guide/features/mcp.md` | Hermes discovers authenticated remote HTTP/Streamable HTTP MCP tools, enabling a separate Bridge without a fork. |
| `tui_gateway/server.py` dispatch for `session.context_breakdown` | Context usage is Hermes-owned session data, never a Companion estimate. |

Companion's typed implementation is the upstream-aligned controller in
`packages/hermes-adapter/src/session-controller.ts`, with schema validation in
`apps/desktop/src/lib/client/hermes-chat.svelte.ts`. It sends
`session.context_breakdown { session_id }` on the active session transport.

## Locked product model

- The active Hermes profile is the sole top-level Companion context. The
  previous Chat/Code mode switch is superseded by
  [`profile-led-shell-contract.md`](profile-led-shell-contract.md).
- Hermes is the only runtime. Provider OAuth/API keys, including Codex account
  access, unlock Hermes models. Companion never launches Codex, Claude Code,
  Cursor, or OpenCode as a peer harness.
- Chat is global Hermes conversation, not project-bound.
- Code is project → worktree → thread. A project is a directory and every code
  thread maps to an isolated worktree/branch.
- Hermes owns profiles, sessions, models, provider credentials, memory, skills,
  MCP, approvals, and execution. Companion/Bridge own workspace presentation,
  worktrees, PTYs, previews, Git review, and annotations.
- Every visible action is working, disabled with a precise explanation, or
  absent. Placeholder/decorative controls are prohibited.

## Shell geometry

Geometry belongs to the root shell, never page-specific padding.

| Region | Required rule |
| --- | --- |
| macOS titlebar | 38px visual titlebar; reserve x `0–84px` for traffic lights on every surface/window size. No control sits under it. |
| Header | 42px. One location/context identity and at most 2–3 contextual actions; do not duplicate project/session/branch in body and header. |
| Profiles | Horizontal compact 28px profile buttons after the traffic-light safe region; labels only in menu/tooltip. |
| Left sidebar | 272–296px, one quiet divider, no card framing. |
| Middle | One primary task canvas. Chat transcript measure is 760–840px. |
| Right dock | Code default only, 320–380px, resizable/collapsible. Chat starts closed and opens only on explicit context. |
| Status bar | Fixed 24px, operational state only. |

## Coding workspace and panel contract

For Code, use the supplied T3 Code workspace references as the behavioral and
visual target.

- The workspace has independently controllable left, right, and bottom panes.
  Header controls expose all three states with clear open/close icons.
- Code starts with the right panel open to a quiet **Open a surface** chooser:
  Browser, Terminal, Files, and Diff are large, sparse, icon-led choices with
  short descriptions. It is not a permanent tab bar or dashboard.
- Browser starts with compact browser chrome and a discovered local-server
  list, so a user can select a running preview without first configuring a
  lease form.
- Terminal is a center-bottom split with a compact session strip and no
  separate command input or Send button.
- Preserve T3's high-density graphite palette, quiet separators, icon-forward
  actions, and generous canvas whitespace; color communicates real state only.

## Navigation and recontextualization

### Chat

Sidebar: compact `New session`, inline history search, then global sessions
grouped as `Pinned`, `Today`, `Previous 7 days`, and `Older`.
Messaging sessions may be a clear bottom group. Search filters this sidebar;
global search/actions belong in the command palette. Chat never persistently
shows project folders, branch chips, worktrees, diff controls, or an empty
inspector.

### Code

Sidebar: projects once. A disclosure reveals nested threads; there is no
repeated project heading. The `+` entry is a compact menu:

1. `Choose existing folder…`
2. `Create new folder…`
3. recent projects

Create asks only Name and parent location. `Initialize Git` is secondary.
Successful creation binds the project and selects/creates the first code
thread immediately. A pre-project Code composer has a folder target chip that
opens this menu; it does not force a large setup dialog.

### Capabilities, Settings, Messaging, Command Center

Persistent bottom launchers are `Messaging`, `Capabilities`, and
`Settings`; Command Center is status-bar-owned. Selecting one reuses the
sidebar as a master list and the middle as detail. Never retain normal
project/session navigation behind a permanent capability inventory.

- Capabilities: `Agent`, `Models`, `Knowledge`, `Automation`, `System`.
- Settings: concise connection/app categories, not a dashboard dump.
- Messaging: account/channel master, conversation detail.
- Command Center: compact popover for gateway, agents, cron, and active
  operational items; not another navigation page.

## Code center and container-removal rules

Code starts with a single unboxed context header: worktree name, branch,
dirty-file count, active Hermes-run state, and one primary action. Under it is
a 28px subnav: `Review`, `Changes`, `Commits`, `PR`, `Run`.

When dirty, default to Review and render changed-file tree plus selected diff
directly. Parallel worktrees live behind an icon/count popover. Preview setup
stays behind `Start preview` until process management is real. Missing run
transport is a disabled Run action with an inline reason/tooltip, never a
large alert.

Remove a container unless it communicates a real boundary:

- no page-header card, no card inside a card;
- no rounded box just for metadata, a heading, or blank space;
- no chip for every datum; use quiet text/icon metadata;
- no persistent transcript canvas border;
- no preview setup before preview is requested;
- no simultaneous stack of Git, parallel-worktree, review, run, and task cards.

Bounded surfaces are reserved for inputs, selected/focused rows, menus/popovers,
dock boundaries, code/diff, pending approvals, and separate destructive forms.

## Shared composer and context usage

One Composer primitive serves Chat and Code. Idle height is 52–60px: field,
`+` attachments/context, model selector, context trigger, voice only when
supported, and Send. It expands only on focus, multiline, attachments, or
relevant Code execution controls. Code may reveal a compact second row for
worktree target and an actually-supported approval/plan policy. Chat never
inherits branch, Git, or run controls.

- Model selector reflects real Hermes provider/model state; disable with a host
  reason or hide it where unavailable.
- Attachments/context show actual selected files/images/skills/memory only.
- Voice is absent without permission and a functional native feature.
- Context usage is always available from the status bar when Hermes returns a
  validated breakdown. An optional quiet mirror may sit beside the model in
  the composer, but it must open the same 260–300px keyboard-accessible
  popover with used/usable context, model limit, returned category allocation,
  and supplied summarization state.
- Do not render a percentage/ring/category when Serve is unavailable or its
  response has no validated limit.

The verified method is `session.context_breakdown`. The shared schema maps
`context_max`, `context_used`, `context_percent`, `estimated_total`,
`model`, and `categories`. Categories are Hermes-provided—such as messages,
tool output, attachments/files, memory/skills, or system/instructions when
supplied—and must be labelled from returned data rather than hard-coded.

## Transcript primitives

Chat uses an unboxed readable prose column. User prompts are restrained
right-aligned bubbles. Hermes name/avatar/timestamp appears only at the first
item of a run. Reasoning and tool activity are collapsible one-line timeline
rows. Pending approvals are inline decision blocks. Checkpoints, plans, tasks,
and run summaries are progressive disclosures in the same timeline, not a
second dashboard.

Empty state: a single concise invitation roughly one-third down the canvas,
gone after first message. Code can show transcript in Run but never forces it
beside an empty inspector.

## Tokens, status bar, and functional gates

- Graphite canvas; sidebar 2–3% lighter; popover/surface another 3–5% lighter.
  A nearly imperceptible Chat vignette is allowed, ornamental noise is not.
- One restrained indigo/periwinkle accent. Green/amber/red only communicate
  real complete/attention/error states.
- Global sizes: compact 28px, standard 32px, primary composer/action 36px.
  Adjacent input/select/button/icon controls use exactly the same token.
- Metadata 10–12px; controls 12–13px; content 14–15px; section labels 11px
  uppercase/tracked; headings only for real location changes.
- Radius 6–8px. Selection is low-contrast fill plus 2px accent inset. Borders
  only exist for stated bounded surfaces.

Status bar left: `Command center · Gateway · Agents · Cron`. Right:
`elapsed · context usage · YOLO · Terminal · client update · backend health`.
Passive labels are dim. Every interactive item opens a small relevant popover,
never a generic empty route. Context values and categories come from Hermes;
the status bar owns the required trigger and the composer may only mirror it.

| Control | Active only when |
| --- | --- |
| Run with Hermes | worktree-scoped Serve/MCP transport exists |
| Start preview | authorized preview origin/process exists |
| Stage / commit | worktree has applicable changes |
| Push / Draft PR | remote and authenticated forge state is verified |
| Voice | native permission and feature support exist |
| YOLO | Hermes exposes mutable approval-policy capability |
| Context meter | validated `session.context_breakdown` data exists |

## Companion file map and implementation order

| Area | Primary files | Current anti-pattern to remove |
| --- | --- | --- |
| Shell/navigation | `apps/desktop/src/routes/+page.svelte`, `src/app.css` | Flat capability list, duplicated context, local titlebar offsets. |
| Composer/transcript | `src/lib/components/companion/*chat*`, `src/lib/components/ai-elements/*`, `remote/sessions.remote.ts` | Tall idle composer, decorative context UI, boxed transcript. |
| Projects | `project-dialog.svelte`, project/worktree remote capabilities | Common create/open feels like administration. |
| Code/review/dock | `code-review.svelte`, `workspace-dock.svelte`, `file-editor-panel.svelte`, `harness-panel.svelte` | Stacked cards and always-visible preview/dock. |
| Operations | `operations-center.svelte`, capability registry | Dashboard-shaped permanent leaves. |

Implement in this order:

1. `+page.svelte` and `app.css`: root titlebar geometry, Chat/Code sidebar
   swap, master/detail operational destinations, 24px status bar.
2. `project-dialog.svelte`: compact picker/create flow while retaining typed
   project/worktree commands and Git safety.
3. Review/harness/dock: one Code header/subnav, review-first dirty state,
   truthful run gates, contextual collapsible dock.
4. Shared Composer/context popover using the existing typed context capability.
5. Svelte AI Elements adaptation into Hermes timeline primitives.
6. Operations grouping, then centralized token/height/border cleanup.

## Verification and screenshot acceptance

Run type/test/build and native Electron UAT after each slice. At one fixed
desktop size capture:

1. Chat transcript with collapsed reasoning/tool rows, compact composer, and
   real context popover.
2. Chat inline search and Messaging master/detail.
3. Project picker, then one Code project with nested threads exactly once.
4. Dirty Code Review with selected diff and dock collapsed/open.
5. Code Run with both available and safely unavailable transports.
6. Models/Settings via reused sidebar, without a long capability inventory.
7. Full-screen preview with only floating composer.
8. macOS normal/narrow titlebar proving no content under traffic lights.

Screenshots are not sufficient on their own: keyboard/focus/reduced-motion,
functional gates, no React dependency, and no copied source must also pass.
