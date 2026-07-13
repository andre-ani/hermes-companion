# Hermes Companion design system

This document defines the application-wide visual system. Components consume
semantic roles; they do not embed theme-specific palette values.

## Theme layers

Theme composition has three independent layers:

1. **Macro mode** controls luminance and user preference. The supported values
   are `light`, `dark`, and `system`, applied with `data-theme-mode` on the root.
2. **Meta palette** controls the product palette without changing component
   meaning. `graphite` is the neutral default; palettes such as `dracula` set
   `data-theme-palette` and override accent and status primitives only.
3. **Micro tone** communicates local semantic state. Components use roles such
   as positive, working, info, warning, and negative through `--status-*` and
   `--tone-*-{bg,border}`. A badge never chooses an arbitrary named color for a
   semantic state.

All color primitives and semantic aliases use OKLCH. The base application,
sidebar, inspector, terminal, and editor floor share `--background`; elevation
is reserved for overlays and genuinely raised controls.

Context-allocation graphics use a hybrid categorical palette. Recurring product
roles keep pinned hues so they become recognizable across sessions. Unrecognized
roles receive a deterministic hue derived from their stable identifier, then
probe around the OKLCH hue wheel until separated from colors already in the
report. Theme tokens own lightness and chroma, so macro and meta themes can keep
the palette perceptually balanced. Color remains supplementary: every segment
has a separated boundary and a text label with its numeric value.

## Typography

- Inter Variable is the prose family for sentences, paragraphs, descriptions,
  message bodies, and other sustained reading.
- Manrope Variable is the interface-hierarchy family for headings, categories,
  navigation, controls, menus, and compact status language.
- JetBrains Mono Variable is the sole code family for source, terminals,
  paths, commands, keybindings, logs, and inline code.
- Type sizes are fluid semantic tokens rather than per-component breakpoint
  jumps. Variable-font optical sizing is enabled.
- `font-size-adjust: from-font` keeps fallbacks and mixed inline code visually
  stable. A line-height fallback covers older engines.
- Overlay text is never larger than the control or context that invoked it
  unless the overlay establishes a genuinely higher content hierarchy. Compact
  status language is smaller and quieter than body prose.
- Text-bearing controls use the shared `--line-height-ui` safety line box.
  `leading-none` is reserved for icon-only geometry: it is never used where a
  label can be enlarged, truncated, or contain descenders. Ellipsis is an
  inline-width behavior, not permission to clip glyphs vertically.
- Rendered Markdown uses the shared `prose-copy` primitive. Paragraphs, lists,
  nested lists, blockquotes, tables, and figures receive semantic flow spacing
  from that primitive rather than relying on browser defaults or a renderer's
  incidental utility classes. Adjacent list items always have visible rhythm;
  renderer wrappers must not erase it.
- Provider marks are utility icons, not brand-color badges. They use the same
  muted icon role as surrounding chrome, including a theme-owned monochrome
  treatment for externally loaded logo images.

## Logical hierarchy

- A heading is placed at the boundary of the content it scopes, not in an
  adjacent control row.
- Control rows describe available operations through accessible names; they do
  not repeat the current content heading merely to fill space.
- Global overlay groups such as Pinned appear before profile grouping recipes
  and do not inherit or interrupt the recipe heading. The recipe receives one
  heading immediately before its own grouped content.
- Repetition is justified only when it restores context after an independently
  scrolling or deeply nested boundary. Consecutive identical labels separated
  only by controls or an overlay group indicate incorrect ownership.
- Typography, spacing, and optional boundaries must agree about ownership. A
  larger label cannot imply a broader scope than the data it actually governs.

## Motion

Motion uses three durations and shared easing curves:

- `--motion-fast`: hover, focus, color, and opacity feedback.
- `--motion-enter`: local content entry and exit.
- `--motion-layout`: pane size and shell geometry changes.

Pane width/height and adjacent content position animate together. A closing
side pane retains its last configured width and translates completely outside
the viewport while its layout track releases that same space. Its descendants
never reflow through intermediate compressed widths. Dragging temporarily
disables layout transitions so the split tracks the pointer. The reduced-motion
query sets every duration to zero without changing behavior.

Intermediate shell geometry is a supported state, not an implementation gap.
The registered `--shell-sidebar-track` length is the single interpolation owner
for both the sidebar grid track and every header constraint that depends on it.
The session title's leading padding is continuously clamped between its normal
pane inset and the native/viewport-control exclusion edge. Visibility selectors
may choose the target track length, but may not switch dependent padding,
insets, or alignment while that track is animating.

## Pane geometry

- Left, right, and bottom panels are state-owned shell regions; their toggles
  remain in persistent viewport chrome.
- Separators have invisible forgiving hit zones and no decorative grip.
- Left width is constrained to 224–420 px.
- Right width is constrained to 280 px–48% of the workspace.
- Bottom height is constrained to 176 px–62% of the center workspace.
- Hiding a panel never removes its restore control or depends on a transient
  component reference.
- Visibility animation has two coordinated owners: the shell track interpolates
  available center space while the fixed-width pane translates by exactly its
  own width. A pane must not size itself from a track that is animating to zero.
- Dependent header content consumes the interpolated track value rather than
  branching on `visible`. Opening and closing tests sample the first,
  intermediate, and final frames and require the title edge to remain outside
  the macOS/viewport-control exclusion zone throughout.
- Pane toggles are fixed viewport chrome with positive `visible` state,
  `aria-controls`, and `aria-expanded`. No content mode, including settings,
  may override a pane's visibility track after the state owner has reopened it.
- Native draggable titlebar regions and viewport controls occupy disjoint
  rectangles. No full-width draggable layer may sit above or below a control:
  Electron suppresses pointer events anywhere draggable geometry wins the
  native hit map. The pane header is `no-drag`; only its non-interactive title
  and empty flex gap opt into dragging, outside the reserved leading and
  trailing control islands.
- Side panes consume `--surface-pane`, a theme-relative elevation derived from
  `--background`. Macro and meta themes may change the underlying background;
  they do not bypass the pane relationship by assigning component colors.

## Scroll ownership

Every center surface declares exactly one vertical scroll owner. Its complete
ancestor chain resolves to a definite block size and uses `min-block-size: 0`
at every shrinking grid or flex boundary. Ancestors may use `overflow: clip`
to enforce pane geometry only after a descendant owns `overflow-y: auto`.

Conversation content, settings content, code content, and terminal content each
own their scrolling independently. Scroll owners use contained overscroll and
must allow their final focusable/content element to reach the visible block-end
at the minimum supported window size. A clipped last item is treated as a
geometry defect, not patched with extra bottom padding.

## Failure surfaces

Route completeness includes success, loading, empty, permission, offline, and
error states. The root SvelteKit error route owns all HTTP and unexpected route
failures, including 404 and 500 responses, so framework fallback markup is
never user-facing. The shared error primitive is deliberately minimal,
top-centered below native chrome, focuses its heading on entry, uses safe copy
for each status family, and always offers Back and Reload recovery actions.

Feature work that adds a route or asynchronous boundary must connect to this
shared failure system rather than inventing a page-specific fatal state. Local
recoverable failures may remain inline when the surrounding task can continue.

Transient cross-surface failures use the shared manual-popover notification
host. It is top-centered below viewport chrome, capped to a compact reading
width, uses semantic tone tokens, and never inherits the width or positioning
of the content region that happened to fail. Empty notifications are removed
from layout and hit testing; visible notifications remain until explicitly
dismissed.

## Development data

Synthetic profiles, sessions, projects, messages, artifacts, and generation
modes are not product state. The release UI contains no fixture loader, demo
generator, or hidden parallel session store. Tests may construct isolated
fixtures in temporary storage, but production surfaces render only real Hermes
and Companion-owned workspace state. Repository migration removes identifiers
from the retired showcase/generation system when legacy state is encountered.

## Vertical lists

Every vertical panel is a min-width-zero truncation boundary. Session titles,
repository names, branches, paths, terminal tabs, and inspector list content
truncate with ellipses rather than widening the panel or covering actions.
Full values remain available through the relevant focused row, tooltip, or
detail surface when needed.

### Sidebar categories

Every first-level sidebar list group uses the shared category disclosure row.
The row owns, in order, an uppercase category label, an adjacent tabular count,
a reserved disclosure slot, and right-aligned contextual actions. The count is
part of the category identity rather than an action and never floats to the far
edge by itself.

The chevron occupies stable geometry but becomes visible only when the row is
hovered or contains keyboard focus. It rotates to communicate collapsed state;
the native button exposes the same state with `aria-expanded`. Collapsed list
content becomes inert as it animates closed, so visual and keyboard state never
diverge. Messaging categories use their concrete platform names, such as Slack
or Discord, rather than a generic Messaging label. Low-priority bottom groups,
including messaging platforms and jobs, begin collapsed.

Category content keeps the full interactive row width while reserving a leading
gutter before its text. The gutter aligns with the category disclosure origin
and carries session state rather than decorative indentation. Working uses a
neutral motion indicator; approval, waiting-for-input, review, blocked,
completed, and unread each use a distinct icon or shape plus a semantic
`--signal-*` micro-theme token. Shape and accessible text preserve meaning when
color is unavailable. Lists use `--list-row-gap`, whose value can scale with a
density theme but may never resolve below one physical CSS pixel.

Signal tokens are the customization boundary. Macro modes provide light and
dark perceptual values, meta palettes may override the full signal family, and
components consume only semantic signal roles. Individual sessions never store
or choose presentation colors.

## Adaptive composer

The composer is one capability surface built on the shared AI Elements prompt
input. It does not fork into chat, code, preview, or new-session implementations.
Its visible result is composed from independent axes:

- **Placement** supplies context: conversation, new session, project, or overlay.
- **Presentation** supplies density: peek, compact, standard, full, or auto.
- **Capabilities** independently add attachments, model selection, permission,
  context usage, voice, submission, and completion providers.
- **Container size** may compress labels and secondary controls, but never
  changes what an action means or moves it into an unrelated region.

Explicit state wins when a workflow requires a stable presentation. `auto`
selects a placement-appropriate baseline, then container queries handle local
space. Peek is a focus- and hover-revealed enhancement; keyboard focus always
expands it, and reduced-motion behavior remains fully functional.

Slash commands and `@` context use the textarea as an ARIA combobox. The
completion surface is owned and positioned by the same composer frame, so its
anchor cannot drift through a generic viewport portal. Matching is synchronous
over already-loaded contextual providers; remote discovery enriches those
providers before typing rather than adding network latency to each keystroke.
Arrow keys move the active option, Enter or Tab selects it, and Escape closes
the surface without moving focus away from the prompt.

All primary conversation and project placements consume
`--composer-max-inline-size`; session scope must never select a different width
recipe. Context changes can replace the surrounding surface without resizing
the composer track.

An active conversation has one centered **chat rail**. Message rows and the
composer consume the same outer width and inline padding, so assistant metadata
and content share the rail's start edge while user metadata and content share
its end edge. Role alignment happens inside a full-width message row; shrinking
or offsetting the row itself creates competing grids and is prohibited. Empty
optional regions, including attachment and status slots, contribute exactly
zero geometry. The idle follow-up composer starts compact and expands only for
content or an explicit interaction state.

The new-session surface is not a prose reading column. Its conversation content
track fills the center pane, then the welcome composition owns the single
`--composer-max-inline-size` constraint. A reading-column max width and a
composer max width must never be applied to ancestor and descendant
simultaneously; that creates an oversized child clipped at the ancestor edge.

Project context above the composer is control chrome, not decorative metadata.
A project is selected before a new project session begins, through the project
picker or add-project flow; an active project session never exposes a project
switcher that can silently navigate or create another thread. Its project name
is read-only identity. Branch is the only mutable project-context control, and
it becomes a menu only when more than one real worktree branch is available.
An execution-machine trigger is likewise omitted unless the runtime offers more
than one meaningful target; static context is identity, not a fake control.

Compact data visualizations inside icon triggers retain visual priority on
hover. Hover may use a low-opacity semantic wash or an opacity transition, but
must not place an opaque surface behind a radial, sparkline, badge, or other
meaning-bearing mark. Focus remains visibly indicated independently.

Controls embedded in a rounded composer participate in its geometry language:
icon-only actions are circular, while text-bearing controls such as model and
permission selectors are pill-shaped in every state, including hover and
focus. A nested control must not fall back to the application button's default
corner radius merely because its background is normally transparent.

Composer approval copy represents the global execution policy, never a queue
of pending approval requests. It exposes the runtime's Manual, Smart, and Off
choices in-place. A request that needs a one-time decision belongs to the
affected run or its dedicated approval inbox, where its worktree and action
context are available.

### Surface-bound copy

Text is part of a component's geometry. Author it for the narrowest actual
surface—not an unconstrained mockup—and verify it alongside every required
icon, selection mark, shortcut, and trailing action. Compact controls lead with
a stable action label; optional secondary copy earns its space only when it
materially distinguishes a choice. Do not place sentence-length explanation in
a menu or status surface and rely on ellipsis as the design. Simplify the
choice, move explanation to a detail surface, or use a deliberate secondary
view instead. Primary labels must remain readable and actionable.

Interactive descendants and their portalled overlays are not clipping
collateral. A conversation owns horizontal containment at its scroll boundary;
every message, checkpoint rail, and separator has a shrinkable inline track so
long labels cannot create a second scrollbar or move content off the reading
rail. Tooltips and popovers escape through their portal, not by letting the
message tree overflow. A reasoning disclosure animates its measured block size
and opacity with shared motion tokens; it does not use a generic slide keyframe
that makes prose pop into or out of the reading flow. Reasoning detail consumes
the same muted status type role as its “Thought for …” trigger.

Hermes personality statuses such as a face plus “ruminating” are transient
reasoning-state copy, not transcript content. They feed the same Thinking
component and clear when that reasoning/run state becomes terminal; they must
never remain as a competing block beside a completed thought. A profile setting
chooses `plain`, `Hermes personality`, or `hidden` thinking status. This changes
presentation only—the underlying reasoning disclosure and duration remain one
shared state machine.

Approval mode and context capacity are profile-owned display choices. They
default to the status line, where compact text and capacity meters can remain
visible without competing with composition. A profile may opt either control
into the composer, both surfaces, or neither. The status-line context trigger
uses token totals, a short capacity meter, and percent—not the composer’s
radial icon. Standard and full composer surfaces share one semantic radius;
the compact composer remains a deliberate pill state.

Session provenance does not select composer density. An active session always
uses the compact, full-rounded conversation composer; a linked project or
worktree enriches that same composer with context controls above it. Full and
standard composer states require an explicit new-session, expanded, or
work-surface interaction—not fixture data, a session kind, or hidden routing.
Every icon-only voice or submit affordance inside a rounded composer is circular
so the control geometry matches the surface it belongs to.

Selecting a session is navigation only. It must never create a project,
worktree, cost-bearing provider run, or other external resource as a side
effect. Resource creation is an explicit named action. Fixture sessions resolve
only to their declared fixture resources and never fall through to filesystem
provisioning.

The workspace snapshot is the shell's critical loading boundary. It may read
local state and bounded gateway health, but optional third-party enrichment
such as a provider model catalog loads through a separate capability after the
shell is usable. During a cold start, the center pane shows one deliberate
workspace-loading state; stale workspace content remains usable during a
background refresh. Never replace populated navigation or a new-chat surface
with independently placed skeletons because a secondary query is pending.

Before the first workspace snapshot settles, the application shell is not
partially visible. One boot surface owns that phase; shell chrome, navigation,
and content become visible together only after their final tracks and hierarchy
are known. The initial transition uses the same motion tokens as the shell and
does not animate temporary geometry, so a reload cannot reveal top-left icons,
unpositioned text, or a layout shift before the real interface appears.

Project trees reuse the same leading-icon, title, and trailing-state tracks as
their child session rows. Parent and child titles share type size and weight,
and begin on the exact same inline coordinate. Project disclosure owns a real
expanded state: closed projects use the folder icon, open projects use the open
folder icon, and selecting a project may open it without preventing a later
manual collapse. Status signals and timestamps align to the title’s block-start,
not the vertical center of a multi-line row.

## Settings as a shell mode

Settings is a navigation mode of the existing shell, not a modal, sheet, or
second application. Entering it replaces the sidebar's profile/actions/session
tree with settings navigation while retaining the sidebar geometry, native
window exclusion zone, global panel controls, and persistent account footer.
The footer's settings action is a reversible toggle; Back and the same action
both restore the prior workspace without painting a second sidebar over it.

Settings content uses a constrained reading width and scrolls independently of
the navigation. Categories, nested controls, search terms, descriptions, and
command-palette metadata come from one typed settings registry. A setting is
therefore addressable as `(sectionId, itemId)` from sidebar search, command
search, deep links, and future agent actions. No surface maintains its own
parallel list of settings labels or aliases.

Search is an index over leaf controls as well as category names. Results name
both owners (`Appearance › Palette`) and navigate to the owning page before
scrolling the control into view. Adding a setting without a registry entry is a
composition defect because it makes the capability undiscoverable outside its
rendered page.

## Provider boundary

Hermes Agent is the sole runtime. Companion has no direct AI SDK/OpenRouter chat
path or parallel session store. An optional OpenRouter inference key is kept in
Electron's encrypted credential storage solely to inspect the effective model
inventory and provider policy that constrain Hermes-owned OpenRouter choices;
the renderer receives only configured/verified state and cannot read the value.

OpenRouter account policy is an additive, read-only constraint over the
Hermes-owned catalog. The stored inference key loads OpenRouter's effective
`models/user` inventory, which already reflects that key's provider preferences,
privacy settings, and guardrails. Concrete OpenRouter models absent from that
verified inventory remain visible for context but are disabled, state the reason
in text, and cannot become a session override. Router and preset entries remain
selectable with an explicit “policy applied when resolved” state because their
eventual concrete model is not knowable before routing. A missing or failed
policy read never invents restrictions.

Named guardrail inspection is optional and uses a separately encrypted
management key. Management credentials are read-only in Companion and never
enter inference requests. Settings may show safe definition summaries (model or
provider counts, budgets, reset cadence, and ZDR), but never raw keys or content
filter patterns. Workspace definitions and aggregate assignment counts are not
presented as proof that a specific inference key has a particular named
guardrail; the effective inference-key inventory remains authoritative.

Model identity keeps three facts separate: selection source, requested model,
and provider-reported resolved model. A selection key therefore includes source
and model ID. Human-readable catalog names are primary UI text, stable raw IDs
remain secondary detail, and one provider-mark component owns icon lookup and
fallback everywhere. Router models retain their requested identity while each
assistant response records and displays the resolved model when the provider
reports one; the hosting provider is supporting metadata, not a replacement for
the model author.

Resolved model provenance uses one shared “via provider” presentation. When a
routing layer adds information, render `routing provider icon → resolved model
icon + human model name` and preserve the requested router/preset as accessible
detail. Collapse the routing side when it would duplicate the resolved provider
(never “Claude via Claude” or the same icon twice). OpenRouter, Nous Portal, and
future aggregators use this rule; direct subscription/OAuth runtimes such as
Codex or Claude show only their effective runtime/model identity unless Hermes
reports a distinct upstream route.

The presentation must degrade truthfully. If a transport reports only the
requested router or preset, show that requested identity alone. Never derive a
resolved model from assistant prose, catalog defaults, pricing records, or a
provider guess. `model-provenance.svelte` and its pure presentation helper own
the duplicate-collapse rule so transcript, future status-line, and inspection
surfaces cannot disagree about attribution.

Direct-provider turns are durable state machines, not a single awaited request.
The user message and assistant placeholder persist before generation starts;
cumulative snapshots update that same assistant message while it streams, and
the terminal completed, cancelled, failed, or interrupted state is persisted
without discarding partial output. A client request ID makes retries idempotent,
and explicit cancellation is the only renderer action that aborts generation.

## AI element coverage

The shipped Svelte AI Elements primitives are treated as state vocabulary, not
an unrelated component gallery. Conversation, message, response, reasoning,
checkpoint, prompt input, model selection, context, approval, plan, task, tool,
code, copy, and shimmer states must each have at least one maintained product or
development surface. The Advanced settings coverage surface is the fallback
for valid states that do not yet have live Hermes data. “Open in chat” is not
offered inside the chat window because it would create a circular navigation
action with no change of context.
