<script lang="ts">
  import { onMount } from 'svelte';

  let { status = 500 }: { status?: number } = $props();
  let heading: HTMLElement;

  const copy = $derived.by(() => {
    if (status === 404) return { title: 'Page not found', detail: 'The page may have moved or no longer exists.' };
    if (status === 401) return { title: 'Sign in required', detail: 'Your session is no longer available.' };
    if (status === 403) return { title: 'Access unavailable', detail: 'You do not have access to this page.' };
    if (status >= 400 && status < 500) return { title: 'Request unavailable', detail: 'The app could not open this page.' };
    return { title: 'Something went wrong', detail: 'Hermes Companion could not finish loading this page.' };
  });

  onMount(() => heading?.focus());

  function goBack() {
    if (history.length > 1) history.back();
    else location.assign('/');
  }
</script>

<svelte:head><title>{status} · Hermes Companion</title></svelte:head>

<main class="error-page" aria-labelledby="error-title">
  <div class="error-copy">
    <span class="error-status">{status}</span>
    <h1 id="error-title" bind:this={heading} tabindex="-1">{copy.title}</h1>
    <p>{copy.detail}</p>
    <div class="error-actions">
      <button type="button" onclick={goBack}>Back</button>
      <button type="button" onclick={() => location.reload()}>Reload</button>
    </div>
  </div>
</main>

<style>
  .error-page { min-block-size: 100dvh; display: flex; align-items: flex-start; justify-content: center; background: var(--surface-floor); padding: max(4.5rem, 10vh) 1rem 2rem; color: var(--foreground); }
  .error-copy { inline-size: min(100%, 28rem); display: grid; justify-items: center; gap: .35rem; text-align: center; }
  .error-status { color: var(--muted-foreground); font-family: var(--font-mono); font-size: .62rem; }
  h1, p { margin: 0; } h1 { font-size: 1rem; font-weight: 640; outline: none; } p { color: var(--muted-foreground); font-size: .72rem; line-height: 1.5; }
  .error-actions { display: flex; gap: .35rem; margin-block-start: .55rem; }
  button { min-block-size: 1.8rem; border: 1px solid var(--border); border-radius: calc(var(--radius) * .7); background: transparent; padding-inline: .65rem; color: var(--foreground); font-size: .67rem; }
  button:hover, button:focus-visible { background: var(--surface-interactive); }
</style>
