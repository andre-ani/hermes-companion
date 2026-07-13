# Hermes Companion upstream research audit

Audit date: 2026-07-11. This document is a source-backed design gate, not a
completion claim. Research is used for behavioral and architectural fidelity
only. No upstream React code, proprietary source, or proprietary dependency is
copied into Hermes Companion.

## Canonical repositories and immutable revisions

| Product requested | Canonical repository | Inspected commit |
| --- | --- | --- |
| T3 Code | `https://github.com/pingdotgg/t3code` | `f61fa9499d96fee825492aba204593c37b27e0cb` |
| Hermes Desktop | `https://github.com/NousResearch/hermes-agent` (`apps/desktop`) | `3b2ef789dfcf92f5b7b18c08c59d25948e50857f` |
| Hermes Dashboard | `https://github.com/NousResearch/hermes-agent` (`web`, `hermes_cli/web_server.py`) | `3b2ef789dfcf92f5b7b18c08c59d25948e50857f` |
| Hermes Workspace | `https://github.com/outsourc-e/hermes-workspace` | `c1e6ed979dcb8dddf79c5b163150c6c23c4dce0c` |
| Hermes Agent | `https://github.com/NousResearch/hermes-agent` | `3b2ef789dfcf92f5b7b18c08c59d25948e50857f` |

This table records the original cross-repository audit. Later Hermes-only UI,
context-breakdown, and remote-MCP research inspected the canonical checkout at
the local canonical Hermes Agent checkout, SHA
`586aae4bf13c20c3f2966cad590b27946b227bbb`. Its locked findings and remaining
line-level evidence task are recorded in
[`hermes-desktop-ui-spec.md`](hermes-desktop-ui-spec.md) and
[`remaining-research-plan.md`](remaining-research-plan.md). The later pin does
not silently rewrite observations made against the original revision.

The similarly named community repository `fathah/hermes-desktop` is not a
canonical Hermes source and is excluded from design evidence.

## Pinned P0 contract evidence (immutable)

SHA: `586aae4bf13c20c3f2966cad590b27946b227bbb` (local canonical Hermes Agent checkout)

Use exact checkouts and line ranges below when re-auditing.

### Context-breakdown contract (Hermes Serve)

| Upstream evidence | Line anchor | What it proves |
| --- | --- | --- |
| `tui_gateway/server.py` defines `session.context_breakdown` and returns `_ok` with keys when no agent is present | 6302-6330 | The RPC method exists on Serve and returns `categories`, `context_max`, `context_percent`, `context_used`, `estimated_total`, and `model` keys. |
| `tui_gateway/server.py` defines `_get_usage()` and context usage gating behavior | 3041-3081 | `context_max/context_used/context_percent` are emitted from the compressor’s `last_prompt_tokens`/`context_length` fields when both are valid; fallback leaves unknown fields absent/zero rather than fabricating totals. |
| `agent/context_breakdown.py` builds context payload from stable/context/volatile/system structures | 89-156 | Category IDs and labels (`system_prompt`, `tool_definitions`, `rules`, `skills`, `mcp`, `subagent_definitions`, `memory`, `conversation`) with color/label/token shape are explicitly computed in Hermes code. |
| `agent/context_breakdown.py` fallback behavior | 128-137 | `context_max`, `context_used`, `context_percent`, and `estimated_total` are derived from compressor state / token heuristics and can legitimately be `0` when unavailable. |

### MCP remote discovery and transport contract

| Upstream evidence | Line anchor | What it proves |
| --- | --- | --- |
| `tui_gateway/entry.py`: `wait_for_mcp_discovery`, `mcp_discovery_in_flight`, `join_mcp_discovery`, startup thread spawn | 207-348 | MCP discovery runs in a bounded background thread at startup; callers can wait for bounded or complete completion. |
| `tools/mcp_tool.py` module docstring and transport inventory | 3-7, 58-60, 224-228 | Hermes MCP client supports stdio and HTTP/StreamableHTTP, SSE (`transport: sse`), and explicitly treats MCP as optional dependency. |
| `tools/mcp_tool.py` content-type preflight gate | 2049-2174 | `_preflight_content_type()` accepts `application/json` and `text/event-stream`, rejects non-MCP web-page responses, with POST initialize fallback before failing. |
| `tools/mcp_tool.py` HTTP auth/transport logic | 2176-2350 | `_run_http()` uses `mcp.client.streamable_http`, supports `mcp-protocol-version` defaults, OAuth 2.1 PKCE through `mcp_oauth_manager`, client certificates, and mTLS settings, and reconnect lifecycle handling. |
| `tools/mcp_tool.py` tool registration status APIs | 4777-4800 | `get_mcp_status()` is a typed status surface with `name`, `transport`, `tools`, `connected`, `disabled`, and `status` fields. |
| `tools/mcp_tool.py` registration entrypoint | 4580-4600 | `register_mcp_servers()` is idempotent, skips `enabled: false`, loads explicit config keys, and can reconnect cached parked servers. |
| `tools/mcp_tool.py` discovery entrypoint | 4697-4743 | `discover_mcp_tools()` is idempotent and returns current tool names; it is safe when MCP SDK is unavailable. |

### MCP UX and config expectations (upstream docs)

| Upstream evidence | Line anchor | What it proves |
| --- | --- | --- |
| `website/docs/user-guide/features/mcp.md` HTTP MCP section | 195-205 | HTTPS MCP servers are first-class by `url` configuration in `mcp_servers`. |
| `website/docs/user-guide/features/mcp.md` OAuth section | 212-230 | `auth: oauth` is supported and documented with Hermes-managed browser flow and remote-host fallback (`paste the redirect URL`/SSH forward). |
| `website/docs/user-guide/features/mcp.md` mTLS section | 248-279 | `client_cert` and `client_key` are documented for HTTPS MCP mTLS authentication. |
| `website/docs/user-guide/features/mcp.md` CLI/credentials behavior | 80-84, 172-176 | Remote catalog entries can require API key or OAuth with token/reveal semantics and config-driven onboarding. |

### Shared composer attachment and voice contract

| Upstream evidence | Line anchor | What it proves |
| --- | --- | --- |
| `tui_gateway/server.py` remote image attachment | 9562-9620 | `image.attach_bytes` accepts a session ID, base64/data-URL image bytes, and a filename hint; it caps images at 25 MB and queues them for the next `prompt.submit`. |
| `tui_gateway/server.py` PDF attachment | 9623-9760 | `pdf.attach` accepts host paths or uploaded base64, caps uploads/pages, renders pages through `pdftoppm`, and queues the rendered images. Availability therefore depends on Poppler on the Hermes execution host. |
| `tui_gateway/server.py` general file attachment | 9890-9934 | `file.attach` stages remote client bytes inside the active session workspace and returns the authoritative workspace-relative `ref_text` for the following prompt. |
| Hermes Desktop `use-prompt-actions/submit.ts` | 68-125, 299-323 | Desktop pins session identity, synchronizes attachments before submit, rewrites the prompt with returned refs, and only then invokes `prompt.submit`; attachments are not renderer-only decoration. |
| `tui_gateway/server.py` voice status and lifecycle | 13290-13477 | Voice is a stateful Serve feature: `voice.toggle status` reports audio/STT availability, `voice.record` emits later `voice.status`/`voice.transcript` events on the owning session, and `voice.tts` is separately invoked. A local boolean is not an implementation. |

Companion now follows the verified attachment sequence on the same authenticated
Serve socket used for the turn. Image, PDF, and file bytes cross the typed
`ChatTurnControl` capability, are attached after create/resume and before
`prompt.submit`, and general files use Hermes' returned `ref_text`. The visible
file control is capped to eight files and 25 MB each. The previous microphone
that only toggled renderer state was removed; voice stays absent until a
persistent event subscriber, permission/error states, and live execution-host
availability probe are implemented.

Classification used below:

- **Verified upstream behavior**: a concrete canonical implementation or
  advertised supported endpoint exists at the pinned revision.
- **Adapted behavior**: the companion preserves the behavior but reimplements
  it in Svelte/Electron and its single-capability architecture.
- **New companion-owned behavior**: the plan intentionally assigns the state
  or mechanism to the companion; upstream is only a reference or has no match.
- **Unsupported pending an API**: UI may exist upstream, but no supported
  Hermes Agent/control contract was found that the companion can safely call.

## Repository-by-repository findings

### T3 Code

| Area | Source inspected | Observed behavior |
| --- | --- | --- |
| Architecture | `docs/architecture/overview.md`, `docs/reference/workspace-layout.md`, `apps/server/src/serverLayers.ts`, `apps/server/src/wsServer.ts`, `packages/contracts/src/rpc.ts` | A typed WebSocket boundary fronts a server-owned runtime. Provider events are normalized into an orchestration model and ordered through queue-backed workers. |
| UI/state | `apps/web/src/state/threads.ts`, `apps/web/src/state/projects.ts`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/RightPanelTabs.tsx`, `apps/web/src/components/Sidebar.tsx` | Project/thread identity is shared across chat and coding surfaces; terminal, preview, review, and Git state are thread/project scoped. The implementation is React and is reference-only. |
| Provider execution | `apps/server/src/provider/builtInDrivers.ts`, `apps/server/src/provider/ProviderDriver.ts`, `packages/contracts/src/providerRuntime.ts` | Codex, Claude, Cursor, Grok, and OpenCode are registered through a provider-driver SPI with normalized sessions, turns, requests, approvals, and tool lifecycle events. |
| Codex | `apps/server/src/provider/Layers/CodexProvider.ts`, `apps/server/src/provider/Layers/CodexAdapter.ts` | Runs `codex app-server` and speaks its structured protocol; it is not implemented as `codex exec --json`. |
| Claude Code | `apps/server/src/provider/Layers/ClaudeProvider.ts`, `apps/server/src/provider/Layers/ClaudeAdapter.ts`, `apps/server/src/textGeneration/ClaudeTextGeneration.ts` | Uses the Claude Agent SDK for sessions/events/permissions. `claude -p --output-format json` appears only in the narrower text-generation path, not as the full interactive adapter. |
| Cursor | `apps/server/src/provider/acp/AcpJsonRpcConnection.ts`, `apps/server/src/provider/Layers/CursorAdapter.ts`, `packages/effect-acp/test/examples/cursor-acp-client.example.ts` | Starts `cursor-agent acp` and uses ACP JSON-RPC, including permission requests and cancellation. |
| OpenCode | `apps/server/src/provider/opencodeRuntime.ts`, `apps/server/src/provider/Layers/OpenCodeAdapter.ts`, `apps/server/src/provider/Layers/OpenCodeProvider.ts` | Starts/reuses an OpenCode server and uses the OpenCode SDK with normalized permission and question responses. It is not a one-shot `opencode run --format json` adapter. |
| Worktrees/Git | `apps/server/src/git/GitManager.ts`, `apps/server/src/git/GitWorkflowService.ts`, `apps/server/src/vcs/GitVcsDriverCore.ts`, `packages/contracts/src/git.ts` | Git/worktree lifecycle is host-side and project-scoped. Status, branch, commit, push, and source-control operations cross typed contracts. |
| Review | `apps/server/src/review/ReviewService.ts`, `packages/contracts/src/review.ts`, `apps/web/src/components/chat/ChangedFilesTree.tsx` | Review exposes working-tree and branch-range sources, changed-file metadata, and per-file unified diffs. |
| Terminals | `apps/server/src/terminal/Manager.ts`, `packages/contracts/src/terminal.ts`, `apps/web/src/components/ThreadTerminalDrawer.tsx` | PTYs are server-owned, stream typed events, and are bound to thread/workspace context. |
| Preview/browser | `packages/contracts/src/preview.ts`, `apps/server/src/preview/Manager.ts`, `apps/desktop/src/preview/Manager.ts`, `apps/web/src/browser/ElectronBrowserHost.tsx` | Preview sessions and viewport state are per thread/tab. T3’s desktop preview uses an Electron-native host and injected automation/picking runtime. |
| Annotations | `apps/desktop/src/preview/PickPreload.ts`, `apps/desktop/src/preview/PickedElementPayload.ts`, `apps/web/src/lib/previewAnnotation.ts` | Element picks carry structured DOM metadata into the composer/task context. |
| Remote model | `docs/architecture/remote.md`, `packages/contracts/src/environment.ts`, `packages/contracts/src/remoteAccess.ts` | The execution environment owns provider auth, projects, terminals, Git, and files; a client stores ways to reach it. Provider credentials remain on the execution host. |
| Forge adapters | `apps/server/src/sourceControl/GitHubCli.ts`, `GitLabCli.ts`, `AzureDevOpsCli.ts`, `BitbucketApi.ts` | Git is provider-neutral and forge enrichment is adapter-based rather than embedded in the Git core. |

### Hermes Desktop

| Area | Source inspected | Observed behavior |
| --- | --- | --- |
| Shell/UI | `apps/desktop/src/app/shell/app-shell.tsx`, `app/master-detail.tsx`, `app/chat/index.tsx`, `app/right-sidebar/index.tsx` | A profile/session master-detail shell keeps chat primary and exposes files, preview, terminal, and review in side rails. React code is not reusable in this project. |
| Hermes transport | `apps/shared/src/json-rpc-gateway.ts`, `apps/desktop/src/hermes.ts`, `apps/desktop/src/app/gateway/hooks/use-gateway-boot.ts` | Desktop uses newline-compatible JSON-RPC events over WebSocket. Reconnects mint fresh single-use WS tickets for OAuth; token mode uses a URL token. |
| Sessions/runs | `apps/desktop/src/app/session/hooks/use-session-actions/index.ts`, `use-prompt-actions/submit.ts` | `session.create` includes `cols`, `source`, optional `cwd/profile/model/provider`; `prompt.submit` is event-completed and may legitimately take up to the agent turn ceiling. |
| Approvals | `apps/desktop/src/components/assistant-ui/tool/approval.tsx`, `apps/desktop/src/store/prompts.ts`, `apps/desktop/src/store/native-notifications.ts` | `approval.request` is session-scoped; response is `approval.respond {choice, session_id}`. Off-screen blocking prompts can trigger native notifications. |
| Worktrees | `apps/desktop/electron/git-worktree-ops.ts`, `apps/desktop/src/app/chat/sidebar/projects/*`, `apps/desktop/src/global.d.ts` | Desktop exposes real Git worktree list/add/remove operations and groups sessions by project/workspace. |
| Diff/review | `apps/desktop/electron/git-review-ops.ts`, `apps/desktop/src/app/right-sidebar/review/file-tree.tsx`, `apps/desktop/src/store/review.ts` | Review supports scopes, changed files, diffs, stage/unstage/revert, commit context, push, and PR information. |
| Files/terminal | `apps/desktop/src/app/right-sidebar/files/use-project-tree.ts`, `apps/desktop/src/app/right-sidebar/terminal/*`, `apps/desktop/electron/hardening.ts` | File reads are IPC-hardened; persistent terminals and agent terminal streams are separate rail concepts. |
| Preview/browser | `apps/desktop/src/app/chat/right-rail/preview-pane.tsx`, `apps/desktop/src/store/preview.ts`, `apps/desktop/electron/session-windows.ts` | The official desktop uses an Electron `<webview>` with `persist:hermes-preview`, context isolation, no Node integration, and sandboxing. It does **not** establish `WebContentsView` as upstream behavior. Companion `WebContentsView` is a new/adapted security design. |
| Settings/operations | `apps/desktop/src/app/settings/*`, `apps/desktop/src/app/profiles/*`, `apps/desktop/src/app/skills/*`, `apps/desktop/src/app/cron/*`, `apps/desktop/src/hermes.ts` | Desktop calls the Hermes dashboard/control endpoints for profiles, config, credentials, providers, models, toolsets, skills, MCP, cron, messaging, memory, analytics, and maintenance. |
| Codex account/runtime distinction | `hermes_cli/web_server.py`, `hermes_cli/codex_runtime_switch.py`, `hermes_cli/runtime_provider.py`, `agent/transports/codex_app_server.py`, `agent/codex_runtime.py` | OpenAI Codex device OAuth unlocks `openai-codex` models. The default `model.openai_runtime: auto` keeps Hermes's own tool loop. The explicit `codex_app_server` opt-in makes Hermes spawn Codex, project its events into Hermes, and translate command/file approvals through Hermes. This is not a companion-owned harness. |
| Updates/packaging | `apps/desktop/electron/update-*.ts`, `apps/desktop/scripts/notarize*.mjs`, `electron-builder.config.cjs` | The official app has platform-specific update, rebuild, signing/notarization, and relaunch handling; an unsigned local artifact is not release parity. |

### Hermes Dashboard

| Area | Source inspected | Observed behavior |
| --- | --- | --- |
| API boundary | `hermes_cli/web_server.py`, `web/src/lib/api.ts` | The dashboard is a machine/profile management service with authenticated `/api/*` routes. This is distinct from the standalone Agent API server. |
| Profiles/sessions | `web/src/components/ProfileSwitcher.tsx`, `web/src/pages/SessionsPage.tsx`, `web_server.py` routes `/api/profiles*`, `/api/sessions*` | One profile selector scopes management writes. Session search, detail, rename, delete, archive/prune, export, and cross-profile listing exist on the dashboard service. |
| Config/providers/credentials | `web/src/pages/ConfigPage.tsx`, `ModelsPage.tsx`, `EnvPage.tsx`, `OAuthProvidersCard.tsx`; `/api/config*`, `/api/model*`, `/api/env*`, `/api/providers/oauth*` | Config is schema-driven and deep-merged. Credentials are redacted/reveal-gated. OAuth flows can be PKCE, device-code, or explicit external-CLI fallback. |
| Skills/MCP/toolsets | `web/src/pages/SkillsPage.tsx`, `McpPage.tsx`, `components/ToolsetConfigDrawer.tsx`; `/api/skills*`, `/api/mcp*`, `/api/tools/toolsets*` | Full management, hub/catalog, enable/test/configure flows exist and are profile scoped. |
| Memory/learning | `/api/memory*`, `/api/curator*`, `/api/learning*`; desktop starmap and learning surfaces | Provider status/reset, curator control, and learning graph/node edits are supported control-service behaviors. |
| Messaging/jobs/webhooks | `web/src/pages/ChannelsPage.tsx`, `CronPage.tsx`, `WebhooksPage.tsx`; corresponding route families in `web_server.py` | Platform setup/test, cron CRUD/control, delivery targets, and webhook lifecycle are supported dashboard behaviors. |
| Files/Git/terminal | `/api/fs*`, `/api/git*`, `/api/pty`; `web/src/pages/ChatPage.tsx` | Dashboard offers hardened file/Git operations and a PTY-backed embedded TUI. The companion should use its own worktree-scoped native/bridge path for coding state, not mirror dashboard private files. |
| Analytics/logs/maintenance | `web/src/pages/AnalyticsPage.tsx`, `LogsPage.tsx`, `SystemPage.tsx`; `/api/analytics*`, `/api/logs`, `/api/ops*`, `/api/hermes/update*`, `/api/actions/*/status` | These are real control endpoints, including async action-tail status. |
| WebSocket auth | `web_server.py` `/api/ws`, `/api/pty`, auth middleware; Desktop gateway boot code | Dashboard WebSocket access is not authenticated by an arbitrary Authorization header. OAuth uses short-lived single-use tickets; token mode uses the dashboard’s WS-token mechanism. |

### Hermes Workspace

| Area | Source inspected | Observed behavior |
| --- | --- | --- |
| UI breadth | `FEATURES-INVENTORY.md`, `src/routes/*`, `src/screens/*` | Workspace supplies chat, files, terminal, jobs, tasks, agents, conductor, swarms, reports, artifacts, operations, and dashboards. This proves desired UX behavior, not Agent API support. |
| Chat routing | `docs/workspace-chat-session-routing.md`, `src/routes/api/send-stream.ts`, `src/server/openai-compat-api.ts` | Portable chat uses OpenAI-compatible requests and must forward stable `X-Hermes-Session-Id` independently of bearer auth. |
| Tasks/kanban | `src/lib/tasks-api.ts`, `src/server/tasks-store.ts`, `src/server/kanban-backend.ts`, `src/routes/api/hermes-tasks*`, `claude-tasks*` | Tasks are Workspace flat-file/local-backend or dashboard-proxy state, including reads of `~/.hermes/tasks.json`; they are not a supported Hermes Agent resource API. |
| Agents/operations | `src/lib/workspace-agents.ts`, `src/server/claude-agent.ts`, `src/server/claude-tasks-backend.ts`, `src/routes/operations.tsx` | Agent/crew operations are Workspace-owned process and storage abstractions, not advertised by Agent `/v1/capabilities`. |
| Conductor/swarm | `docs/swarm/ARCHITECTURE.md`, `src/routes/api/swarm-dispatch.ts`, `src/server/swarm-*.ts`, `src/routes/conductor.tsx` | Orchestration is implemented through Workspace state, profiles, tmux sessions, checkpoint polling, and local runtime files. It is not a stable Hermes Agent API. |
| Checkpoints | `src/lib/workspace-checkpoints.ts`, `src/server/swarm-checkpoints.ts`, `/api/workspace/checkpoints*` clients | Checkpoints and verification flows are Workspace contracts. They cannot be treated as Hermes-owned endpoints without an upstream API. |
| Artifacts | `src/server/tool-artifacts-store.ts`, `src/routes/api/artifacts*`, `src/screens/swarm2/swarm2-artifacts.tsx` | Artifacts live in a Workspace-owned store and routes. No equivalent advertised Agent resource API was found. |
| Terminal/files | `src/server/terminal-sessions.ts`, `src/routes/api/terminal-*`, `src/routes/api/files*` | Workspace implements its own host-local file and PTY services. These are behavioral references for the companion bridge, not Hermes APIs. |
| Approvals | `src/lib/approvals-store.ts`, `src/screens/gateway/components/approvals-*` | Workspace aggregates approval presentation, but its store/routes do not establish a universal intercept API for peer CLI harnesses. |

### Hermes Agent

| Area | Source inspected | Observed behavior |
| --- | --- | --- |
| Advertised HTTP API | `gateway/platforms/api_server.py` `_handle_capabilities` and route registration | `/v1/capabilities` advertises health, models, chat completions, responses, runs/events/approval/stop, skills, toolsets, sessions, session messages/fork/chat/stream, and jobs. |
| Session resources | `gateway/platforms/api_server.py` `_handle_list_sessions` through `_handle_session_chat_stream` | Envelopes use `object`, `data`, `started_at`, `last_active`, and `timestamp`. Agent PATCH supports `title` and `end_reason` only; it does not accept `archived`. |
| Structured runs | `/v1/runs`, `/v1/runs/{id}/events`, `/approval`, `/stop` handlers in `api_server.py` | The standalone API server exposes an external run lifecycle and approval response path, but its request accepts input/instructions/model/session/history—not `cwd`, a worktree ID, or another execution-root field. It cannot safely power Companion coding runs until upstream adds worktree context. |
| Serve JSON-RPC | `tui_gateway/server.py`, `tui_gateway/transport.py`, `tui_gateway/ws.py`, `apps/shared/src/json-rpc-gateway.ts` | `session.create`, `prompt.submit`, `session.interrupt`, `approval.respond`, and structured `event` frames are verified. Transport may be stdio or WebSocket, but connection/auth provisioning is host-specific. |
| Approval semantics | `tui_gateway/server.py` `_emit_approval_request` and `approval.respond`; `tools/approval.py` | Approval commands are redacted before egress; choices are resolved against the session key. Observer hooks are read-only and cannot pre-answer approvals. |
| Ownership boundary | `gateway/platforms/api_server.py`, `gateway/session.py`, config/skill/memory/tool modules | Profiles, sessions, model/provider state, memory, skills, MCP, jobs, credentials, and agent execution remain Hermes-owned. Stable IDs should be referenced rather than mirrored. |
| Unsupported parity families | Agent `/v1/capabilities` plus registered API-server routes | No advertised Agent resource API for Workspace agents/crews/conductor/task boards/checkpoints/reports/artifacts exists at this SHA. Workspace implementations do not change that conclusion. |

## Full plan traceability matrix

| Companion-plan requirement | Concrete upstream evidence | Classification | Companion state/evidence |
| --- | --- | --- | --- |
| Standalone MIT Electron + SvelteKit/Svelte 5 | Hermes/T3 Electron boundaries are behavioral references; neither supplies a Svelte app | New companion-owned behavior | `LICENSE`, `apps/desktop/package.json`, `apps/desktop/electron/main.cjs` |
| adapter-node bound only to Electron loopback | No matching upstream architecture | New companion-owned behavior | Electron loopback bootstrap and native descriptor in `apps/desktop/electron/main.cjs` |
| Hardened native boundary | Hermes Desktop `electron/main.ts`, `preload.ts`, `hardening.ts`; T3 desktop boundary | Adapted behavior | `apps/desktop/electron/main.cjs`, `preload.cjs` |
| Separately deployable remote bridge | T3 remote environment model; no canonical companion bridge | New companion-owned behavior | `apps/bridge`, versioned capability contract |
| One typed capability path for UI/agent/API | T3 shared typed contracts and ordered server boundary | Adapted/new architecture | SvelteKit remote functions + Zod in `apps/desktop/src/lib/client/remote`, `packages/contracts` |
| Hermes/companion ownership split | Agent resource ownership; T3 execution-environment ownership | Adapted/new architecture | `companion-repository.ts`, bridge store; only stable Hermes IDs retained |
| Provider connections and execution | Hermes provider catalog, credential pools, model picker, and optional Codex app-server runtime | Verified upstream behavior | Hermes is the sole runtime. Companion delegates OAuth/API keys, model discovery, execution, and approvals to Hermes; all peer CLI launch code was removed. |
| Hermes first-class default | Agent Serve/API protocols; Hermes Desktop client; Hermes remote HTTP MCP client | Verified upstream behavior | Local/shared-filesystem coding can use an explicit authorized Serve URL. Separate-service Railway coding must keep Hermes as the only runtime while exposing Companion-owned worktree operations to it through authenticated Streamable HTTP MCP. Agent `/v1/runs` is not used as though it can bind an arbitrary host working directory. |
| Remote project/worktree/PTY/Git/preview/annotation capabilities | T3 remote model; no Hermes bridge equivalent | New companion-owned behavior | bridge capability schemas/server/services; provider login and agent runs are intentionally not bridge capabilities |
| Bridge beside Hermes, private network, persistent volume | Hermes remote HTTP MCP client; Railway private networking and service-attached volumes | New companion-owned behavior | The preferred candidate uses separate Hermes and bridge services in one Railway project/environment. The bridge owns its workspace/cache volume and public Electron/preview edge; Hermes consumes bridge tools over private Streamable HTTP MCP. This must pass live Railway UAT before the topology is locked; s6/co-location remains a deferred user decision. |
| Original token-based Svelte design system | Hermes Desktop `DESIGN.md` and shell density are visual references only | Adapted behavior | Svelte tokens/components; no React or `@nous-research/ui` dependency |
| shadcn-svelte/Bits UI foundation | No upstream Svelte implementation | New companion-owned behavior | source-installed shadcn-svelte primitives |
| Selective Svelte AI chat primitives | No upstream Svelte implementation | New companion-owned behavior | conversation/message primitives only |
| Shared profile/project/session shell | Hermes Desktop shell; T3 project/thread state | Adapted behavior | `+page.svelte`, companion shell/navigation |
| Fast Chat/Code global switch, preserved context | T3 shared thread context; Hermes Desktop master/detail shell | Adapted behavior | global mode store and shortcuts |
| Persistent resizable Browser/Terminal/Files dock | T3 right panels; Hermes Desktop right rail | Adapted behavior | workspace dock components |
| Code status/run/diffs/commits/review/PR | T3 review/Git services; Hermes Desktop review rail | Adapted behavior | worktree status and review UI; rich forge parity partial |
| Full-screen preview + floating composer | No exact upstream match | New companion-owned behavior | reduced-chrome browser mode |
| Worktree and branch per coding thread | T3 worktree lifecycle; Hermes Desktop Git worktrees | Adapted/new ownership | Code mode automatically creates/restores a worktree keyed by persisted Hermes session ID; end-to-end local/remote UAT remains |
| One active writer per worktree | T3 serialized orchestration provides a precedent, not this invariant | New companion-owned behavior | repository/bridge writer lease enforcement |
| Parallel implementations in child worktrees | T3 worktree isolation and review merge flow | Adapted/new behavior | parent-linked child creation, independent writer leases, clean-tree gates, review UI, merge commit, and automatic conflict abort are implemented; live local/remote UAT remains |
| Provider-neutral Git, GitHub first rich forge | T3 forge registry and GitHub/GitLab/Azure/Bitbucket adapters | Adapted behavior | generic Git plus execution-host `gh` status/auth discovery, active-PR metadata/link, and gated draft PR; stacks/review-decision lifecycle partial; deterministic native lifecycle UAT passed, live GitHub auth remains pending |
| Embedded browser with `WebContentsView` | Hermes Desktop uses `<webview>`; T3 has an Electron browser host | New/adapted security behavior | `WebContentsView` in Electron main; must not be labeled verified Hermes behavior |
| General web session isolation | Hermes preview uses a dedicated persistent partition | Adapted behavior | isolated Electron sessions; UAT pending |
| Authenticated per-worktree preview relay | No upstream end-to-end equivalent | New companion-owned behavior | bridge preview leases/proxy |
| Design Mode injection only on authorized previews | T3 pick preload/payload design | Adapted/new behavior | authorized preview preload and validated annotation capability |
| Structured design-annotation task and refresh loop | T3 structured pick metadata; no Hermes task API | New companion-owned behavior | Companion persists task/run state, streams normalized Hermes events back to the task, routes approvals through the shared inbox, and reopens that worktree's preview lease on completion. Local Serve linkage exists; remote Railway execution must pass opaque worktree context and let Hermes edit through Companion MCP tools. |
| Unified Hermes-backed approval inbox | Hermes Serve and `/v1/runs` approvals are verified; Hermes's optional Codex app-server runtime translates exec/file approvals into the Hermes callback | Verified/adapted behavior | Only Hermes approvals are displayed. Companion has no peer/native approval path. |
| Profiles/session history/search/chat | Agent session resources; dashboard search/profile endpoints | Verified upstream behavior | Agent resources are schema-validated; archive is routed only through the explicit Dashboard control service |
| Files and terminals | T3/Workspace host services; Hermes Desktop rail | Adapted/new companion ownership | confined files + PTY; editing/search/language services partial |
| Project management | T3 projects/worktrees; Hermes Desktop workspace groups | Adapted/new companion ownership | bind/create/remove/inspect implemented |
| Models/providers/config/credentials/toolsets/permissions | Hermes Dashboard exact route families and schema-driven config | Verified upstream behavior | control clients/UI implemented; live provider flows pending |
| Skills/MCP/memory/search/graph | Hermes Dashboard endpoints and Desktop starmap | Verified upstream behavior | management/read/edit surfaces implemented; live-host UAT pending |
| Artifacts | Workspace-owned `tool-artifacts-store`; absent Agent advertised API | Unsupported pending an API | must remain disabled, not mirrored from Workspace files |
| Messaging/cron/webhooks | Hermes Dashboard route families; Agent jobs resource API | Verified upstream behavior | messaging/cron implemented; webhook parity still incomplete |
| Audit/logs/analytics/cost/rate limits | Hermes Dashboard analytics/logs; T3 provider rate-limit events | Verified upstream/adapted | analytics/logs/actions exist; full rate-limit and action-tail parity partial |
| Backup/update/system health | Hermes Dashboard System routes; Desktop update machinery | Verified upstream/adapted | maintenance actions/status exist; signed updater parity incomplete |
| Agents/teams/crews/conductor/swarm/tasks/kanban/checkpoints/reports | Workspace local/tmux/storage implementations; no Agent advertised resource API | Unsupported pending an API | capability registry must stay unavailable; do not parse Workspace/Hermes private state |
| Notifications | Hermes Desktop native notification policy | Adapted behavior | Electron notification capability exists |
| Local/remote profile model | Hermes Desktop pooled profiles; T3 execution environments | Verified upstream/adapted | saved local/remote connections and stable Hermes IDs |
| New laptop uses remote worktrees/Hermes/previews | Hermes owns the remote profile, provider credentials, models, and agent state; companion bridge owns worktrees and preview relay | Verified/adapted/new behavior | Bridge primitives exist. The separate bridge service owns the remote workspace; Electron uses its authenticated public relay while Hermes reaches the same capabilities privately through MCP. Live Railway UAT remains. |
| Provider auth stays on execution host | Hermes credential pools and `/api/providers/oauth`; Codex device OAuth unlocks `openai-codex` models, Claude Code credentials can seed Anthropic access | Verified upstream behavior | Companion calls Hermes provider capabilities only and never reads credential files or starts provider CLIs |
| Unit/integration coverage listed in plan | Upstream suites demonstrate contract-level testing | New companion responsibility | current unit suite covers core boundaries; full integration matrix incomplete |
| macOS/Windows/Linux Electron UAT | Hermes Desktop release scripts demonstrate expected scope | New companion responsibility | real BrowserWindow UAT harness and CI/release matrix evidence upload implemented; macOS passed locally, Windows/Linux runs pending |
| Immutable desktop artifacts + separately versioned bridge image | Hermes Desktop signing/notarization/update patterns | Adapted/new release behavior | workflows configured; signing, publication, and compatibility checks incomplete |
| Stock dashboard retained as fallback | Hermes Dashboard is independently deployable | Verified upstream/product decision | no dashboard fork or replacement mutation |
| Replacement status only at full parity | No source inference needed; locked product rule | Product acceptance rule | `docs/requirements-status.md` correctly blocks completion |

## Assumption and guessed-contract ledger

These are implementation defects or provisional paths discovered by this audit.
They must be corrected before product implementation resumes.

| Current companion location | Assumption/guess | Source-backed finding | Required correction |
| --- | --- | --- | --- |
| former Electron/bridge peer harnesses | Provider connections were incorrectly interpreted as authorization to launch Codex, Claude Code, OpenCode, and Cursor directly | Hermes Desktop/Dashboard connect credentials to Hermes providers. Hermes defaults to its native loop; `model.openai_runtime: codex_app_server` is a separate explicit upstream opt-in where Hermes—not Companion—spawns Codex and bridges approvals. | Corrected: peer adapter package, native launch/login handlers, bridge run/login capabilities, and peer stream normalizers were deleted. |
| `hermes-serve-runs.ts` `serveUrl()` | Any dashboard `controlUrl` can be converted to `/api/ws` and authenticated with a Bearer header | Hermes Desktop mints fresh single-use WS tickets for OAuth; dashboard token mode uses its WS URL token contract. | Require a pre-authorized `serveWsUrl` or add a supported ticket-minting capability. Never infer an authenticated WS URL from `controlUrl`. |
| `hermes-serve-runs.ts` | `prompt.submit` should time out after 30 seconds | Hermes Desktop uses the agent turn ceiling (1,800 seconds) because completion is event-driven. | Make submit acknowledgement event-driven and use the upstream-compatible ceiling/cancellation semantics. |
| prospective Agent API run fallback | Advertised `/v1/runs` streaming and approvals are sufficient for a coding run | The request contract has no `cwd`, worktree ID, or execution-root field; using it would run against the Agent host's ambient directory. | Keep coding-run availability tied to an authorized Serve transport until Hermes advertises a supported worktree context. |
| `hermes-serve-runs.ts` remote path | Passing the bridge worktree's absolute path as `session.create.cwd` works when Hermes and the bridge are separate Railway services | A path is meaningful only inside the container/volume that owns it. Hermes's supported remote HTTP MCP client lets the agent use external tools without seeing that filesystem. | Keep the existing `cwd` flow for local/shared-filesystem execution only. Add a remote execution adapter that supplies Companion MCP context and opaque worktree IDs; all file/process/Git work stays in the bridge. |
| former Railway s6 assumption | A service-attached Railway volume forces Companion Bridge into the Hermes image | Volumes are service-attached, but the bridge—not Hermes—can own the workspace volume. Hermes can call the bridge privately over supported remote HTTP MCP. | Test the separate-service candidate documented in `railway-deployment.md`. s6/co-location remains deferred; if the candidate fails, stop and ask the user before selecting another topology. No maintained Hermes fork is permitted. |
| `hermes-client.ts` `setSessionArchived()` | Standalone Agent `PATCH /api/sessions/{id}` accepts `{archived}` | Agent API explicitly permits only `title` and `end_reason`. Dashboard has separate richer session management. | Route archive only through a discovered dashboard-control capability, or mark archive unavailable on pure Agent API connections. |
| `hermes-client.ts` response normalization | Accepting `items`, `sessions`, camelCase, and multiple message shapes is treated as equivalent to a verified schema | Official Agent envelopes are `object`/`data` with snake_case timestamps. Permissive reads mask incompatible servers. | Validate advertised Agent schemas strictly; isolate documented compatibility shims by API version. |
| connection UI default `ws://127.0.0.1:3001/api/ws` | Port/path is a universal Hermes Serve default | The dashboard commonly owns `/api/ws` on its configured dashboard origin (often 9119), and stdio Serve has no universal WS origin. | Remove the guessed default; discover/mint from the connected host or require an explicit URL. |
| capability registry approval availability | Presence of `controlUrl` implies interceptable Hermes approvals | Only advertised `/v1/runs` approval or a valid Serve transport proves interception. | Base availability on discovered run/Serve capability, not URL presence. |
| operations capability probing | A non-404/405 response proves a usable endpoint | Auth failures and schema mismatches can still produce false-positive availability. | Require successful authenticated schema/version probes and validate response bodies. |
| GitHub `gh` flow | CLI presence implies rich forge support | T3 separately discovers auth/status and normalizes PR metadata; live auth and remote compatibility matter. | Corrected: baseline Git stays available; `git.github.status` now probes `gh --version` and `gh auth status --hostname github.com` on the execution host, and the PR command/UI are gated on successful authentication. Deterministic fixture UAT passes; live authentication remains pending. |

Already corrected before this expanded audit:

- Removed the guessed `hermes` CLI harness invocation; Hermes execution uses
  documented Agent run/Serve protocols.
- Removed Hermes from the peer CLI adapter table.
- Replaced guessed Hermes session timestamps/envelopes with the official
  `data`, `started_at`, `last_active`, and `timestamp` fields.
- Separated Agent API, dashboard/control, Serve, and bridge URLs and tokens.
- Stopped claiming broad dashboard parity from a single config endpoint.
- Marked Workspace orchestration/artifacts unavailable rather than reading its
  local stores or Hermes private files.
- Corrected remote worktree identity so desktop and bridge share one stable ID.
- Replaced the guessed control-service placeholder with schema-validated,
  loopback-only discovery of the documented Agent API (`8642`) and Dashboard
  (`9119`) endpoints. Discovery never constructs or authorizes a Serve
  WebSocket URL, and control-only availability is represented as partial rather
  than disconnected.
- Adapted Hermes Desktop's supported local Dashboard token handoff from
  `apps/desktop/electron/dashboard-token.cjs`: the Companion reads only the
  token injected into the served loopback HTML, keeps it server-side, sends it
  with `X-Hermes-Session-Token`, and never parses Hermes private files or
  exposes the value to Svelte. A token-gated Electron fixture and a live local
  Dashboard v0.18.0 protected-endpoint sweep verify this path.

## Resume gate

The user reviewed the audit and clarified that Hermes Desktop/Workspace is the
product and provider-connection reference. Hermes is the only agent runtime;
connected accounts unlock Hermes models rather than becoming companion-owned
harnesses. Hermes WS authentication/discovery, session archive,
timeout, credential separation, and capability-probe corrections now have
passing regression coverage. The model-provider surface now mirrors Hermes's
three supported auth behaviors: PKCE code submission, device-code polling, and
an explicit external host-CLI fallback. API-key entries use Hermes's live
provider validation endpoint before storage.

Live-host verification remains mandatory for OAuth/device flows, provider CLI
versions, Railway topology, GitHub authentication, preview relay, signed update
delivery, and macOS/Windows/Linux UAT.
