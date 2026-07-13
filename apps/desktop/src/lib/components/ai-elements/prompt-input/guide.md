# Prompt Input New Guide

Use this order:

1. Header -> Body -> Toolbar

```svelte
<PromptInput>
  <PromptInputHeader />
  <PromptInputBody />
  <PromptInputToolbar />
</PromptInput>
```

How it shows:

- `PromptInputHeader`: top area for chips, context, or status
- `PromptInputBody`: main content area for attachments and textarea
- `PromptInputToolbar`: bottom action row for tools and submit

Hermes composes this primitive through `companion/chat-composer.svelte`. Do not
create page-local prompt forms. Placement, presentation, and capabilities are
orthogonal inputs to that component; responsive behavior belongs to its
container queries. Keystroke consumers such as slash-command completion attach
through the textarea's chained input and key handlers so the primitive retains
IME, paste, attachment, and submit behavior.
