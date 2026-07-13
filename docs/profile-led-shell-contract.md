# Profile-led shell contract

This is the explicit product decision made on 2026-07-11. It supersedes the
former global **Chat / Code** mode switch. It is an information architecture
and interaction contract, not a request to copy any reference implementation.

## Primary context

- A Hermes profile is the only top-level application context. The active
  profile supplies Hermes identity, connection, model/provider availability,
  and the profile's saved Companion presentation preferences.
- The default profile label is **Hermes Agent**. The profile control opens a
  compact chooser showing every configured profile with its name and concise
  description.
- Profiles may customize the UI. This is the presentation layer above the
  Hermes-owned profile; it must store only Companion preferences and stable
  Hermes IDs, never duplicate Hermes configuration or state.
- The former Chat and Code application modes are removed. A session's context
  and selected right-dock surface determine the active work surface instead.

## Profile presentation layers

Profile creation establishes Hermes runtime identity first. Companion adds
presentation without turning it into another runtime or duplicating Hermes
configuration. The layers are applied in this order:

1. **Hermes profile** — identity, connection, credentials, models, tools, and
   other runtime-owned behavior.
2. **Companion UI preset** — a named, reusable bundle of semantic presentation
   choices such as density, visible work surfaces, navigation vocabulary, and
   default session-tree behavior. Presets configure supported tokens and
   regions; they do not inject arbitrary CSS or fork the shell.
3. **Profile UI overrides** — sparse, per-profile values layered over the
   preset. Changing a preset does not erase explicit overrides.
4. **Current-view override** — a temporary presentation/filter selection made
   while working. The user can promote it to the active profile's saved
   default; otherwise it remains ephemeral.

Hermes profiles may choose different presets and tree presentations, such as a
Chats tree or a directory-backed Projects tree. Those preferences are layered
onto real Hermes profiles; the companion does not seed presentation-only
profiles.

## Full-height shell geometry

- Left navigation and right dock run from the top to the status bar. The
  center workspace alone owns its contextual header.
- The left rail starts with sidebar visibility and history back/forward
  controls. Back and forward are present but disabled unless a real in-app
  destination exists.
- Below those controls is the profile switcher and a command-palette search
  trigger. Invoking search opens the existing command palette focused on its
  search input.
- Remove the large `Connect gateway` call-to-action and the purposeless
  top-right session ellipsis. Connection setup remains available from profile
  management and any precise unavailable-state explanation.
- The right dock is a full-height, resizable tabbed surface area. It follows
  the observed T3 Code behavior: open surfaces persist as tabs with their own
  close affordances; the empty state offers Browser, Terminal, Files, and Diff.
  This is a behavioral reference only; no T3 Code source is copied.

## Left navigation

The primary actions below the profile control are always:

1. New chat
2. Capabilities
3. Messaging
4. Artifacts

They are not a separate dashboard or permanent mode. Each reuses the center
workspace while retaining the active Hermes profile.

## Session trees and views

`Sessions` is the global resource name. Each profile chooses a saved default
presentation, with a per-profile override control:

| Presentation | Grouping behavior |
| --- | --- |
| Sessions | One global session list across the active connection. Messaging and scheduled/cron sessions occupy separate bottom-aligned groups. |
| Projects | Directory-backed projects with their coding sessions nested beneath them. Project actions may require a separately confirmed directory rename; no filesystem rename is implied by a display-name change. |
| Chats | Sessions belonging to the active profile. |
| Jobs | Scheduled and cron-backed sessions, ordered and filtered with the same tree model. |

- The control that selects a presentation is a filter/grouping function, not a
  new runtime model. A profile-specific override persists for that profile.
- The tree label is profile-owned vocabulary and may be re-contextualized
  independently of the underlying global `Session` resource.
- A saved tree filter is structured data, not UI-only state. It can constrain
  status, pull-request state, environment, source/platform, owning profile,
  project, and archive state; choose one or
  more grouping stages (pins, profile, project, source, recency); and choose a
  stable sort. Empty constraint arrays mean “all,” so presets remain portable
  when projects or messaging integrations change.
- The built-in Sessions, Projects, Chats, and Jobs presentations are default
  filter recipes. A custom filter may start from one of those recipes and then
  diverge. Saving it affects only the active profile. Resetting removes the
  override and reveals the preset/default recipe again.
- Filtering, grouping, and labeling change navigation presentation only. They
  never move, clone, archive, or mutate the underlying Hermes session.
- Trees are quiet nested lists: no decorative left-border hierarchy markers.
- Pinned sessions appear first. Pins are global rather than profile-bound; a
  pinned entry visibly identifies its owning profile and selecting it may
  switch the active profile.
- Existing session actions (open, rename, archive/restore, delete, and related
  supported actions) remain available from each session's contextual action
  menu. Unsupported actions must be absent or explain why.

## Center-header actions

- A profile may define multiple project-scoped custom actions. One selected
  primary action appears as the immediate center-header action; its adjacent
  menu exposes the remaining actions and their keybindings.
- Standard action families are independently profile-configurable. Git actions
  may be enabled or hidden, with Commit, Push, or Create PR selected as the
  immediate action without converting those actions into custom commands.
- The bottom-panel and right-panel visibility controls belong to the global
  shell layer. Their placement does not depend on either panel being visible,
  and hiding a panel must never remove or disable the control needed to restore
  it. The bottom panel opens beneath the center pane only.
- Profile creation presents Hermes-owned identity, clone, skills/config, and
  SOUL options first. Companion sidebar filters, grouping recipes, custom
  actions, and standard header actions are a subsequent overlay on that same
  Hermes profile.

## Visual direction

Adopt the restrained default T3 Code visual language: compact neutral graphite
surfaces, low-chroma borders, quiet tabs, high-density controls, and color
reserved for actual status. This replaces the existing violet-forward palette.
Maintain semantic color tokens, visible keyboard focus, reduced-motion support,
and an accessible native/menu primitive for the profile chooser and context
actions.

## Capability boundary

- Cross-profile session aggregation and profile descriptions require a
  supported Hermes control/profile capability. It must not be faked from
  private files.
- Pinning and per-profile presentation preferences are Companion-owned UI
  preferences and must be modeled through one typed remote capability path.
- Messaging sessions are Hermes-owned data. They appear in the global Sessions
  presentation only when the connected Hermes host advertises them.
