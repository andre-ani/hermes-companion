# Lean Hermes Railway runtime

Railway builds a minimal image from the exact pinned upstream Hermes Agent
digest. There is no Hermes fork, Workspace UI, web dashboard, OAuth proxy,
model registry adapter, patched Hermes source, or second agent runtime.

The image adds only the Companion execution bridge required by the release's
terminal, files, Git, and preview surfaces. It runs beside `hermes serve` in
the same container so both operate on the same persistent checkouts. The
bridge owns the public port and proxies all non-Companion HTTP and WebSocket
traffic to upstream Hermes inside the same container.

Runtime surfaces:

- Railway `$PORT`: the authenticated Companion bridge plus a transparent
  proxy to headless `hermes serve` HTTP/WebSocket APIs;
- container-private port `8000`: upstream `hermes serve`, run through upstream
  `/init` and its native privilege-dropping wrapper. Serve binds the container
  interface so upstream cookie authentication is active, but Railway publishes
  only the bridge port;
- private port `8642`: authenticated upstream gateway API;
- `/opt/data`: the single persistent Hermes home for profiles, credentials,
  sessions, cron jobs, skills, plugins, MCP configuration, and gateway state.
- `/opt/data/hermes-companion`: persistent execution-bridge state for real
  project/worktree bindings and preview leases.

At container initialization, `025-hermes-companion-state` repairs ownership
and restrictive permissions on the Companion state directory before the
upstream Hermes wrapper drops to the `hermes` user. This is an in-place,
non-destructive migration for volumes created by older root-running bridge
deployments; it never replaces or deletes `bridge-state.json`.

Companion intentionally does not expose session forking in this release. The
upstream fork route exists only on the private gateway API, not on the public
`hermes serve` contract. Do not extend the bridge solely to surface that
nonessential action.

The gateway's desired running state is persisted by Hermes. Upstream `/init`
reconciles it into the native s6 supervision tree on every container start;
the Railway start command must not launch a second foreground gateway.

Required production secrets are `API_SERVER_KEY`, `BRIDGE_TOKEN`,
`HERMES_DASHBOARD_BASIC_AUTH_USERNAME`,
`HERMES_DASHBOARD_BASIC_AUTH_PASSWORD`, and
`HERMES_DASHBOARD_BASIC_AUTH_SECRET`. The latter three are the upstream Serve
password-auth provider; despite the historical environment-variable prefix,
they do not enable or run the dashboard.

Required non-secret runtime variables are:

- `HERMES_HOME=/opt/data`, so Hermes state uses the persistent volume;
- `TERMINAL_CWD=/opt/data`, so sessions without an explicit project/worktree
  start in a writable workspace instead of the upstream image directory.

Do not rely on `HOME` alone for either contract. The upstream command wrapper
sets `HOME` for the `hermes` user but intentionally restores the image working
directory before starting Serve.
