# Hermes Companion

Hermes Companion is an experimental macOS Electron client for
[Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent).
It keeps Hermes as the agent runtime and adds a profile-led desktop shell for
conversations, projects, worktrees, terminals, files, diffs, and previews.

This is a vibe-coded weekend project. It is being built in public because the
ideas and implementation may be useful to other people, not because it is a
finished or supported product. Expect rough edges, incomplete flows, breaking
changes, and some unusually ambitious UI work for a personal prototype.

## Status

Hermes Companion is pre-release software under active development. The current
goal is a stable personal daily driver on macOS—not complete Hermes Desktop,
IDE, or cross-platform parity. Synthetic demo records are intentionally
avoided: visible sessions and capabilities should come from real Hermes or
Companion-owned state.

Do not depend on this repository for production workloads or sensitive data.
There are no hosted binaries, support guarantees, migration promises, or
security warranty. Review the source, use your own infrastructure and
credentials, and rotate any development credential you suspect was exposed.

## Architecture

- **Hermes Agent** owns profiles, sessions, messages, models, approvals, tools,
  skills, MCP, memory, cron, and messaging state.
- **Electron/SvelteKit** owns the native macOS shell and presentation state.
- **Companion Bridge** owns narrowly scoped desktop execution capabilities such
  as worktrees, PTYs, files, Git operations, and preview leases.
- Long-lived connection credentials are stored through Electron's encrypted
  credential store rather than ordinary application metadata.

Hermes Workspace is not part of the runtime, and Companion does not launch a
second agent backend or peer coding harness.

## Local development

Requirements:

- Node.js 22+
- npm
- macOS for Electron qualification
- a separately configured Hermes Agent runtime

```sh
npm install
npm run dev
```

The renderer uses loopback port `5400`. Local secrets belong in ignored
environment files or the application's encrypted credential store. Never add
API keys, Railway tokens, Hermes passwords, exported credential stores, or
packaged application artifacts to the repository.

Useful checks:

```sh
npm run check
npm test
npm run build
```

## Project notes

- [Active release goal](docs/active-goal.md)
- [Architecture](docs/architecture.md)
- [Design system](docs/design-system.md)
- [Profile-led shell contract](docs/profile-led-shell-contract.md)
- [Pinned upstream audit](docs/upstream-audit.md)

Research documents describe inspected upstream behavior and design references;
they are not claims that every described feature is complete.

## License

[MIT](LICENSE)
