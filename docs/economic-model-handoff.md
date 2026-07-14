# Economic model and context-usage handoff

This document prevents model, cost, and context UI from claiming more than
Hermes has supplied. Hermes computes provider/model and session context data;
Companion validates and renders it. Companion never estimates private agent
state or maintains a shadow billing ledger.

## Ownership and product boundary

- Hermes owns provider OAuth/API keys, model catalog and selection, billing/rate
  information, session messages, memory, skills, tools, approvals, and context
  accounting.
- Companion owns presentation and desktop/workspace interaction only.
- Codex OAuth is a Hermes provider connection that unlocks Hermes models. It
  does not authorize Companion to launch a Codex CLI or create a second
  cost-bearing runtime.
- Do not add React, copied reference code, or Hermes Workspace visual patterns.

## Verified context method

With an authorized Hermes Serve URL, Companion calls:

```text
session.context_breakdown { session_id }
```

The only application path is the upstream-aligned controller method in
`packages/hermes-adapter/src/session-controller.ts`, projected by the thin
Svelte adapter in `apps/desktop/src/lib/client/hermes-chat.svelte.ts`. The
Svelte boundary validates returned data with the shared `ContextUsage` schema.

| Hermes field | Rendered meaning |
| --- | --- |
| `context_max` | usable model context limit |
| `context_used` | current consumed context |
| `context_percent` | upstream-calculated percentage, only if valid |
| `estimated_total` | upstream estimate/total when supplied |
| `model` | reporting model |
| `categories` | Hermes-provided allocation categories |

Categories are data-led. Label returned categories—for example messages, tool
output, attachments/files, memory/skills, and system/instructions when
provided—but do not hard-code a pie chart or imply a missing category is zero.
If Serve is unavailable, the request fails, a field is malformed, or a usable
limit is absent, return the explicit unavailable reason and do not draw a
percentage/capacity meter.

## Context popover specification

The required trigger is a quiet token count or meter in the status bar. An
optional mirror may sit beside the active model in the shared composer. Both
open the same 260–300px keyboard-accessible popover containing:

1. model name;
2. used / usable context where both values are valid;
3. upstream percentage only when it agrees with valid numeric bounds;
4. category rows in Hermes-returned order and labels;
5. estimated total and automatic summarization state only if Hermes returns
   them;
6. a concise unavailable explanation if the request cannot be made.

The popover is informational. It must not imply clicking changes model,
context, spend, or approval policy.

## Provider, model, and economic UX

- Model selector uses real Hermes provider/model capability data only.
  Connection, device OAuth, API-key validation, and account state are Hermes
  facts, never synthesized UI.
- Model mutation remains on the existing typed session/config capability path.
  The composer presents concise current-model state; provider management lives
  in Settings → Models.
- Rate limits, spend, usage windows, and subscription messaging render only
  from a supported audited Hermes control/analytics endpoint. They are
  summaries, not local calculations.
- OAuth/subscription copy says it enables Hermes model access. It never says
  Companion executes Codex/Claude/Cursor directly.

## Functional and economic gates

| UI | Required rule |
| --- | --- |
| Status-bar context/popover | Required when validated Serve breakdown data exists; otherwise hide the meter or show a precise unavailable state. |
| Composer context mirror | Optional; if present, it uses the same validated data and popover as the status bar. |
| Model selector | Disable with host reason when selection is unsupported/disconnected. |
| Voice | Absent without native permission and a supported voice path. |
| Cost/rate-limit views | Absent or labelled unavailable until Hermes returns supported data. |
| YOLO | Maps to real Hermes approval policy; it is never a local spend/bypass preference. |
| Provider connect | Uses Hermes OAuth/API-key workflow only; never transfers laptop credentials to another runtime. |

## Implementation and verification

1. Build the shared Composer required by
   [`hermes-desktop-ui-spec.md`](hermes-desktop-ui-spec.md) without changing
   the typed context capability.
2. Add context popover availability/schema guards before adding visual meters.
3. Verify provider/model and context states against deterministic fixture and
   live authorized Hermes Serve/control hosts independently.
4. Add cost/rate-limit UI only after an audited supported response contract is
   recorded in `upstream-audit.md`.

Remaining source and live-contract research is bounded in
[`remaining-research-plan.md`](remaining-research-plan.md). Do not reopen the
broad visual audit while executing that plan.

Required tests and screenshots:

- unit tests for valid, partial, malformed, and unavailable breakdowns;
- Electron UAT for keyboard open/close, returned values, and no-Serve state;
- screenshot with active model + real context popover;
- screenshot proving no meter appears for a connection unable to return the
  method;
- assertion that no message tokenization, local billing estimate, peer CLI
  launch, credential export, or private Hermes-file parsing was introduced.
