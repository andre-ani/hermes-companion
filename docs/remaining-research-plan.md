# Remaining research plan and no-repeat boundary

This is the handoff plan for research that remains before or during the next
implementation slices. Roughly 80–85% of the important research is complete by
decision impact. The remaining work is targeted contract verification, not a
new product or visual discovery phase.

## Research already complete

Do not repeat these audits unless the inspected upstream revision changes:

- canonical repositories and inspected SHAs are recorded in
  [`upstream-audit.md`](upstream-audit.md);
- Hermes Desktop is the visual and interaction gold standard; T3 Code and
  Cursor are secondary Code/project references only; Hermes Workspace is
  architecture-only and never a visual reference;
- Hermes is the sole agent runtime. Codex and other provider connections give
  Hermes model access; Companion never launches peer coding harnesses;
- provider OAuth/API-key ownership, Hermes session ownership, Serve versus
  control API boundaries, approval ownership, and the no-private-file rule are
  settled;
- Agent `/v1/runs` has no worktree/cwd contract and cannot be treated as a
  coding-run transport;
- separate Railway Hermes and Companion Bridge services using authenticated
  private Streamable HTTP MCP are the no-fork topology; bridge owns remote
  worktrees, PTYs, Git, files, previews, and annotations;
- T3/Cursor worktree, project grouping, review, terminal, and preview behavior
  has been sufficiently studied for Companion-owned Code mode;
- Hermes Desktop shell density, titlebar intent, sidebar reuse, profiles,
  Messaging, Capabilities, settings, command center, status bar, update modal,
  composer, model picker, attachments, voice surfaces, and context popover have
  been visually and structurally inspected;
- Svelte AI Elements component inventory and MIT license are verified; selected
  source components are installed without React;
- Companion's current visual anti-patterns are documented in
  [`hermes-desktop-ui-spec.md`](hermes-desktop-ui-spec.md).

## Source pin used by this handoff

| Item | Value |
| --- | --- |
| Repository | `https://github.com/NousResearch/hermes-agent.git` |
| Inspected checkout | local `NousResearch/hermes-agent` checkout |
| SHA | `586aae4bf13c20c3f2966cad590b27946b227bbb` |

A different local checkout is not evidence for this pin. If a successor uses a
newer checkout, it must record the new SHA separately and describe changed
contracts rather than silently replacing this evidence.

## Remaining work

### P0 — Freeze immutable Hermes contract evidence

Purpose: make the two architecture-critical findings reproducible.

Status: **COMPLETE (2026-07-11)**. Exact line-anchored evidence is now recorded in
[`upstream-audit.md`](upstream-audit.md) under the *Pinned P0 contract evidence* section.

Evidence targets:

- `tui_gateway/server.py`: `session.context_breakdown` dispatch and response;
- `agent/context_breakdown.py`: category computation and null/limit behavior;
- `tools/mcp_tool.py`, `tui_gateway/entry.py`, and
  `website/docs/user-guide/features/mcp.md`: authenticated remote
  HTTP/Streamable HTTP MCP discovery and configuration.

Deliverable: add exact pinned path/line references and request/response keys to
`upstream-audit.md`, including which category labels are data-led and which MCP
auth/config values Hermes requires.

Stop when: another developer can reproduce both findings from the pinned SHA
without inference. Do not broaden into another repository-wide audit.

### P1 — Hermes Serve event and status-line contract

Purpose: render every real Hermes event and status item without guessed UI.

Evidence targets:

- `tui_gateway/server.py`, `tui_gateway/transport.py`, `tui_gateway/ws.py`;
- `apps/desktop/src/types/hermes.ts` and the session/event stores;
- `apps/desktop/src/app/shell/hooks/use-status-snapshot.ts`;
- `apps/desktop/src/app/shell/hooks/use-statusbar-items.tsx`;
- `apps/desktop/src/app/shell/statusbar-controls.tsx`;
- `apps/desktop/src/app/shell/context-usage-panel.tsx`;
- `apps/desktop/src/lib/statusbar.ts`.

Record exact payload shapes for message/reasoning deltas, tool start/result/
error, approval request/response, usage/context updates, run state,
subagents, checkpoints, queue/steer, interrupt, and session/turn timing. Map
the Hermes-backed status bar as:

- left: Command Center, gateway, agents/subagents, cron;
- right: elapsed time, context usage, YOLO/approval mode, terminal, client
  update state, backend version/health/update state.

Deliverable: typed event/status matrix with fields, source, capability gate,
and `verified`, `unsupported`, or `pending live fixture` labels.

Stop when: every rendered status item has a Hermes field or an explicit
Companion-owned source. Unsupported items remain absent. No local context
token estimate is allowed.

### P1 — Live context breakdown fixture

Purpose: validate source reading against a populated real session.

Procedure: call `session.context_breakdown { session_id }` through an
authorized Hermes Serve connection and save a redacted deterministic fixture.
Cover valid, partial, no-limit, malformed, and unavailable responses.

Deliverable: schema fixture tests for `context_max`, `context_used`,
`context_percent`, `estimated_total`, `model`, and returned categories.

Stop when: the status-bar popover renders real values and hides or explains
unavailable/no-limit states. Do not build a local tokenizer or billing model.

### P1 — Shared composer capability contract

Purpose: finish one durable Chat/Code composer with only supported controls.

Evidence targets:

- `apps/desktop/src/app/chat/composer/index.tsx`, `controls.tsx`,
  `context-menu.tsx`, `attachments.tsx`, `model-pill.tsx`, and
  `voice-activity.tsx`;
- `apps/desktop/src/app/chat/composer/hooks/use-composer-submit.ts`,
  `use-composer-attachments` or equivalent attachment hooks,
  `use-composer-voice.ts`, `use-voice-conversation.ts`,
  `use-mic-recorder.ts`, and `use-auto-speak-replies.ts`;
- `apps/desktop/src/components/model-picker.tsx` and Hermes provider/model
  settings;
- corresponding Serve/control methods in `tui_gateway/server.py` and
  `hermes_cli/web_server.py`.

Research three bounded subcontracts:

1. attachments/context: files, folders, images, pasted images, URLs, `@`
   references, remote-host path ownership, size/MIME limits, and temp-file
   lifecycle;
2. model selection: catalog grouping, connected/unavailable state, per-session
   hot swap, reasoning/effort values, and provider OAuth/API-key status;
3. voice: dictation, transcription, TTS, voice conversation, permissions,
   cancellation, and local-versus-remote dependencies.

Deliverable: a capability matrix for each composer control with exact method,
payload, execution host, failure state, and UI gate.

Stop when: each visible control works end to end, is disabled with a precise
reason, or is absent. No decorative mic, attachment row, model, or context
meter remains.

### P1 — Transcript-to-AI-Elements mapping

Purpose: use installed Svelte AI Elements only where Hermes supplies real
structured data.

Evidence targets:

- installed `apps/desktop/src/lib/components/ai-elements/` components;
- Hermes Desktop assistant/thread/tool/approval renderers;
- the verified Serve event matrix from the previous task.

Deliverable: mapping for Message, Reasoning, Tool, Confirmation/Approval,
Checkpoint, Plan, and Task components to exact Hermes event fields. Label
unsupported structures `pending API`; do not synthesize them from prose.

Stop when: every component prop is sourced or explicitly unavailable. This is
a mapping task, not another library survey.

### P1 — Operational master/detail action matrix

Purpose: keep Hermes Desktop information architecture while preserving only
supported Hermes actions.

Evidence targets:

- `apps/desktop/src/app/settings/*`, `app/profiles/*`, `app/messaging/*`,
  skills/tools/MCP/hub pages, cron, and command-center/system/usage/maintenance
  surfaces;
- current Companion `operations.remote.ts` and capability registry;
- documented Agent/Dashboard endpoints already listed in
  `upstream-audit.md`.

Deliverable: sidebar category → detail view → read method → mutation method →
capability gate matrix for Settings, Capabilities, Messaging, and Command
Center.

Stop when: every existing button has a typed action or is removed. Do not
recreate Hermes Dashboard's long navigation or use Hermes Workspace layout.

### P2 — Project source picker contract

Purpose: simplify Code project entry without advertising unavailable sources.

Evidence targets:

- Electron native folder dialog and local project capabilities;
- Bridge remote project/bind/create capabilities;
- forge discovery/auth methods for Git URL and GitHub where already supported.

Deliverable: row-level matrix for recent folder, local folder, new folder, Git
URL, remote host, and forge repository sources. Each row is working, precisely
disabled, or absent.

Stop when: common local/remote folder flows require no administration-style
form. T3/Cursor screenshots need no further study.

### P2 — Native titlebar/platform verification

Purpose: turn the already-settled shell geometry into cross-platform evidence.

Evidence targets:

- Hermes Desktop `apps/desktop/src/app/shell/titlebar.ts`,
  `titlebar-controls.tsx`, and
  `hooks/use-window-controls-overlay-width.ts`;
- Companion Electron `BrowserWindow` creation and root shell CSS;
- current Electron documentation for macOS title bar/traffic lights and
  Windows/Linux window-controls overlay behavior.

Deliverable: macOS, Windows, and Linux acceptance matrix plus normal/narrow
window screenshots proving all offsets are root-owned and no control sits
under native window buttons.

Stop when: one shell implementation passes all platform checks. Do not add
page-specific traffic-light padding.

## Deferred, not remaining research

- Signing/notarization/public update publication stays last, when public
  distribution matters.
- Slow Railway/Docker builds wait until the local MCP facade, preview process
  manager, and deterministic Vite/HMR relay tests pass.
- s6/co-location is a deferred decision. Test the separate-service MCP
  candidate first. If it fails with concrete evidence, stop and ask the user
  before choosing, implementing, or rejecting s6/co-location.
- Artifacts and agents/crews/conductor/task/checkpoint APIs remain unsupported
  at the inspected SHA. Re-audit only when Hermes advertises a newer API
  version; never parse private state or reuse reference-app code.

## Successor execution order

1. Read `active-goal.md`, `hermes-desktop-ui-spec.md`,
   `economic-model-handoff.md`, and this file.
2. Complete P0 once.
3. Before each implementation slice, complete only its matching P1/P2 contract
   gate and write the result into `upstream-audit.md` or a deterministic
   fixture test.
4. Implement through the existing typed SvelteKit remote-function + Zod path.
5. Run type/test/build and Electron UAT; take a screenshot after each working
   feature.
6. Stop research when the stated condition is met. Do not spend another pass
   comparing screenshots without a specific unresolved decision.
