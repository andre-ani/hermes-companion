# Packaged live-Railway chat recovery acceptance

This is the release gate for the first upstream-subtraction slice. It uses the
existing saved Railway connection and the packaged macOS application. It does
not deploy, change Railway configuration, or record Serve tickets or durable
credentials.

## Run

```text
npm run dist --workspace=@hermes-companion/desktop
npm run acceptance:live-railway-chat
```

The workflow generates a unique nonce, opens the packaged application, and
guides the operator through one long-running terminal-backed request. After the
tool begins, reload the renderer, briefly disconnect and restore the Mac's
network, wait for completion, then quit and relaunch the packaged application.

The gate passes only when the same durable session returns, context/model/status
rehydrate from Hermes, and the transcript contains exactly one user request,
one tool execution/result, and one final response containing the nonce. The
operator must also confirm that no credential, cookie, ticket, or authenticated
socket URL appeared in UI, logs, or persisted state.

The script writes a mode-0600, sanitized JSON report under the ignored
`acceptance-artifacts/live-railway-chat-recovery` directory. Rollback is the
verified commit immediately before the chat migration; no second chat
implementation or runtime feature flag is retained.
