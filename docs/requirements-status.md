# Daily-driver evidence ledger

The current scope and stop condition are in `active-goal.md`. Earlier packaged
recovery evidence remains useful regression evidence, but it exercised the
custom Companion chat state machine and does not prove the target ownership
model.

| Capability | Current evidence | Target-architecture status |
| --- | --- | --- |
| Railway auth and pinned runtime | Password login, fresh ticket minting, encrypted credential persistence, and live Serve probes previously passed. | Retain as Companion-owned; lock image digest to source/submodule revision. |
| Sessions and chat | The pinned shared gateway client owns the socket; focused tests prove fresh tickets, durable resume, no prompt replay, renderer-controller recreation, event reconciliation, current-transport cancellation/approval, and truthful lost-approval handling. The packaged live Railway workflow passed renderer reload, network interruption, completion, and process relaunch with one prompt and one tool execution. The owner separately reported a sleeping request surviving app reload plus a three-second Wi-Fi interruption. | Complete for the stable daily driver. No custom chat control plane remains. |
| Context, model, approvals, subagents | Context queries on the active upstream controller transport; `session.info` and live approval events project transiently. The packaged live workflow restored context, model, and completion status after both disruptions. Real approval emission remains nondeterministic on the live service. | No Companion persistence authority. The pinned inability to replay a lost approval is registered and presented truthfully. |
| Projects and worktrees | The final packaged executable visibly added, renamed, archived, surfaced, and deleted a project; native worktree create/remove and main protection also passed. The rejected metadata reconstruction remains quarantined on `codex/pre-upstream-correction-dirty-snapshot`. | Complete without reconstructing a second Hermes project authority. |
| Terminal, files, Git, preview, browser | The packaged executable passed Files save, terminal binding, isolated Browser ownership, visible revert/stage/unstage/commit/push/draft-PR, and per-session layout restoration. | Complete as Companion-owned execution and presentation behavior. |
| Electron shell | The packaged executable passed normal and 960 x 680 constrained layouts, reduced motion, browser reactivation, renderer reload, and session layout isolation. Dead navigation and automation affordances were removed. | Complete for owner-only macOS dogfooding. |

## Architecture completion requirements

A migrated capability is rejected if it reconstructs a durable Hermes fact from
Companion persistence, stores a transport session ID outside a live controller,
uses polling instead of the available upstream client, asserts custom
scaffolding in tests, introduces React into the product graph, or structurally
ports React application architecture into Svelte.

## Completion and deferred work

The stable-daily-driver goal in `active-goal.md` is complete at application
commit `47fc50a`. Hermes Companion is in dogfooding and maintenance. Signing,
distribution, new platforms, parity additions, automation, and advanced browser
control remain outside this goal.
