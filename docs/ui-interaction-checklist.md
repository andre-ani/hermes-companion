# UI and Electron manual verification checklist

- Keyboard: skip link, profile rail, sessions, Chat/Code switch, command palette,
  dialogs, operations tables and approval buttons are reachable in logical order.
- Command palette: `Cmd/Ctrl+K`, arrows, Enter and Escape work without focus loss.
- Dialogs: opening moves focus inside; Escape closes; focus returns to trigger.
- Reduced motion: no required information depends on animation and no ad-hoc
  component durations bypass global preferences.
- Full-screen preview: Electron view leaves the floating composer visible;
  exit restores dock bounds and chrome.
- Browser isolation: general and preview tabs cannot read companion/Hermes
  cookies or invoke privileged renderer APIs.
- Scaling: at 200% zoom, operations forms, tables, project dialog and composer
  remain usable without clipped actions.
- Platform passes: VoiceOver/Safari engine on macOS, Narrator/Edge engine on
  Windows, and keyboard plus screen-reader smoke on Linux.

Automated baseline: `npm run electron:uat --workspace=@hermes-companion/desktop`
launches the real Electron boundary against its packaged adapter-node build,
waits for the shell to settle, validates the main landmark, controls, and
preload bridge, and writes JSON plus PNG evidence under `uat-artifacts/`.
