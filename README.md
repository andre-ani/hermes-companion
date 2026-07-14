# Hermes Companion

> [!WARNING]
> **This project is not production ready.** Development has been wrapped up and
> the repository is preserved as an experimental reference. It contains known
> rough edges, incomplete and under-tested flows, and likely additional issues.

Hermes Companion is an experimental macOS Electron client for
[Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent).
It keeps Hermes as the agent runtime and adds a profile-led desktop shell for
conversations, projects, worktrees, terminals, files, diffs, and previews.

This was a vibe-coded weekend project. It is public because the ideas and
implementation may be useful to other people, not because it is a finished or
supported product. If you are looking for a SvelteKit and Electron starting
point for a Hermes-style desktop client, take whatever is useful here and treat
the rest as prototype code.

## Status

Hermes Companion is a concluded prototype, not a release candidate or an
actively supported application. In hindsight, SvelteKit was probably not the
most efficient choice for this experiment: many relevant examples and UI
patterns were React-first, and porting their behavior consumed time that would
otherwise have gone into testing and stabilization. The result is broad and
interesting, but it has many issues and has not received production-level
qualification.

The repository may still be useful for its SvelteKit/Electron shell, Hermes
integration boundaries, worktree and terminal bridges, multi-pane layout,
settings patterns, and experiments in adapting React-oriented AI interface
ideas without shipping React in the product.

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

- [Architecture](docs/architecture.md)
- [Design system](docs/design-system.md)
- [Profile-led shell contract](docs/profile-led-shell-contract.md)

Research documents describe inspected upstream behavior and design references;
they are not claims that every described feature is complete.

## License

[MIT](LICENSE)
