# Daily-driver evidence ledger

The current scope and stop condition are in `active-goal.md`. Earlier packaged
recovery evidence remains useful regression evidence, but it exercised the
custom Companion chat state machine and does not prove the target ownership
model.

| Capability | Current evidence | Target-architecture status |
| --- | --- | --- |
| Railway auth and pinned runtime | Password login, fresh ticket minting, encrypted credential persistence, and live Serve probes previously passed. | Retain as Companion-owned; lock image digest to source/submodule revision. |
| Sessions and chat | The pinned shared gateway client owns the socket; focused tests prove fresh tickets, durable resume, no prompt replay, renderer-controller recreation, event reconciliation, current-transport cancellation/approval, and truthful lost-approval handling. The packaged live Railway workflow passed renderer reload, network interruption, completion, and process relaunch with one prompt and one tool execution. | Accepted for the first subtraction slice. No custom chat control plane remains. |
| Context, model, approvals, subagents | Context queries on the active upstream controller transport; `session.info` and live approval events project transiently. The packaged live workflow restored context, model, and completion status after both disruptions. Real approval emission remains nondeterministic on the live service. | No Companion persistence authority. The pinned inability to replay a lost approval is registered and presented truthfully. |
| Projects and worktrees | Hermes project operations plus native/bridge worktree flows have prior evidence. | Frozen during chat slice; later remove synthesized Hermes metadata while keeping bridge authorization and writer leases. |
| Terminal, files, Git, preview, browser | Native/bridge tests and packaged fixture UAT passed. | Companion-owned and out of the first subtraction slice. |
| Electron shell | Packaged layout, settings, browser ownership, and reload fixture UAT passed. The live gate exposed and fixed a duplicate-process launcher bug; the packaged app now holds a single-instance lock and the acceptance launcher reuses it. | Preserve one Electron owner for the renderer server and native endpoint; remove only page-owned Hermes recovery state. |

## Architecture completion requirements

A migrated capability is rejected if it reconstructs a durable Hermes fact from
Companion persistence, stores a transport session ID outside a live controller,
uses polling instead of the available upstream client, asserts custom
scaffolding in tests, introduces React into the product graph, or structurally
ports React application architecture into Svelte.

## Deferred pending review of the accepted chat gate

Code-mode migration, repository/workspace subtraction, the remaining ordinary
coding loop, sleep/wake qualification, shared polish, signing, and distribution
remain deferred until the user approves the next direction.
