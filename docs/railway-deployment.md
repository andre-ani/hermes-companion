# Railway deployment

Hermes Companion's remote runtime is intentionally just upstream Hermes Agent.
It is not Hermes Workspace and does not deploy a second product-shaped backend.

```text
Electron desktop
  | authenticated HTTPS / WSS
  v
Hermes Agent
  |- Serve (public desktop transport)
  |- gateway (native session/runtime transport)
  |- cron
  |- profiles, sessions, channels, tools, skills, plugins, MCP
  `- persistent /opt/data
```

## Production shape

The Railway project contains one service:

- `hermes-agent`, pulled from a pinned official Nous Research image digest.

The deployment does not include Hermes Workspace, a web dashboard, a model
registry adapter, an OAuth proxy, a Companion workspace service, or a Hermes
fork. Hermes's own Serve, gateway, cron, tools, skills, plugins, sessions,
profiles, and channels are the backend feature surface.

Railway `$PORT` exposes authenticated `hermes serve`. The native gateway is
supervised by the upstream image and listens on its configured private port.
The persistent volume at `/opt/data` is Hermes's home and retains its normal
configuration and state.

The service must set both `HERMES_HOME=/opt/data` and
`TERMINAL_CWD=/opt/data`. `HERMES_HOME` places Hermes-owned state on the
persistent volume. `TERMINAL_CWD` gives new sessions a writable default
workspace: the upstream image deliberately restores its application working
directory (`/opt/hermes`) before launching the container command, and that
directory is not a valid place for uploaded attachments or user work. An
explicit project/worktree cwd still overrides this default per session.

## Desktop integration rule

Companion integrates with supported Hermes transports and configuration. It
must not recreate Hermes orchestration, session state, approvals, tools, or
provider routing in a parallel backend. Desktop-only presentation and native
shell concerns stay in Electron; agent behavior stays in Hermes.

Each Serve WebSocket connection obtains a fresh, short-lived ticket through
the upstream password-auth flow. Long-lived credentials belong in Electron's
encrypted secret store and must never be written into connection metadata.

The retired direct AI SDK/OpenRouter chat path and its parallel session store
have been removed. OpenRouter credentials in Companion are read-only policy and
catalog inputs; all conversation execution remains in Hermes.

## No-fork policy

The default is zero Hermes patches. If an upstream limitation is discovered,
record the missing capability and ask before introducing another service,
co-locating a process, or patching Hermes. Do not silently grow a second
runtime around it.

## Deployment gate

The remote runtime is ready for Companion development when:

1. the single Hermes service is healthy and its volume survives redeploys;
2. a fresh session reports a writable cwd under `/opt/data` and can stage a
   native `file.attach` upload there;
3. Serve login and a newly minted WebSocket ticket work from Electron;
4. sessions stream through Hermes, including tool events and approvals;
5. profiles, cron jobs, channels, skills, plugins, and MCP reflect Hermes's
   native state rather than demo or duplicated Companion data;
6. reconnecting or restarting does not lose Hermes-owned session state.
