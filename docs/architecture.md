# Architecture

Hermes Companion has three separately versioned processes:

1. The SvelteKit renderer/server owns typed capabilities and UI composition.
2. Electron owns privileged local operations: windows, WebContentsView, Git,
   PTYs, encrypted secrets, notifications, and application lifecycle.
3. The companion bridge provides the same privileged host capabilities beside
   a remote Hermes gateway.

Every user or agent action begins in a `*.remote.ts` capability with a Zod
schema. Local native work goes through the loopback native capability service;
remote native work goes through the versioned bridge. UI components never call
Git, PTYs, or Hermes APIs directly.

## Ownership boundary

Hermes remains authoritative for profiles, sessions, messages, memory, skills,
MCP, approvals, jobs, credentials, messaging, model/provider configuration,
and agent state. The companion persists only connection links plus project,
worktree, run, preview, Git-review, and annotation metadata. The repository does
not read or parse Hermes private files.

## Security boundary

- SvelteKit and the Electron native service bind to loopback only.
- Native requests require a random bearer token stored in a mode-0600 runtime
  descriptor.
- Renderer processes use context isolation, sandboxing, and no Node access.
- General browsing and preview browsing use fresh isolated Electron sessions.
- Design Mode is injected only for an unexpired, authorized preview lease.
- Provider credentials are owned by Hermes and remain on the Hermes execution
  host. Companion never launches provider CLIs. If the user explicitly enables
  Hermes's optional Codex app-server runtime, Hermes owns that subprocess and
  translates its events and approvals into Hermes state.
