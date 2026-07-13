<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Alert from '$lib/components/ui/alert';
  import * as Field from '$lib/components/ui/field';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import {
    cancelHermesProviderOAuth, pollHermesProviderOAuth, startHermesProviderOAuth,
    submitHermesProviderOAuthCode
  } from '$lib/client/remote/operations.remote';
  import { Check, CircleAlert, Copy, ExternalLink, LoaderCircle } from '@lucide/svelte';

  type RecordValue = Record<string, unknown>;
  type Phase = 'external' | 'starting' | 'pkce' | 'device' | 'submitting' | 'approved' | 'error';

  let { provider, onclose, onsuccess }: { provider: RecordValue; onclose: () => void; onsuccess: () => void } = $props();
  let open = $state(true);
  let phase = $state<Phase>('starting');
  let start = $state<RecordValue>({});
  let code = $state('');
  let error = $state('');
  let secondsLeft = $state<number | null>(null);
  let copied = $state(false);
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;
  let closing = false;

  const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
  const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const providerId = $derived(text(provider.id));
  const providerName = $derived(text(provider.name, providerId));
  const sessionId = $derived(text(start.session_id));
  const authUrl = $derived(text(start.auth_url, text(start.verification_url)));

  function stopTimers() {
    if (pollTimer) clearTimeout(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    pollTimer = undefined; countdownTimer = undefined;
  }

  async function close() {
    if (closing) return;
    closing = true; stopTimers();
    if (sessionId && phase !== 'approved' && phase !== 'error') {
      await resolveRemoteResult(cancelHermesProviderOAuth({ sessionId })).catch(() => undefined);
    }
    onclose();
  }

  function fail(message: string) { stopTimers(); error = message; phase = 'error'; }

  function startCountdown(expiresIn: number) {
    secondsLeft = expiresIn;
    countdownTimer = setInterval(() => {
      secondsLeft = Math.max(0, (secondsLeft ?? 1) - 1);
      if (secondsLeft === 0) fail('This sign-in session expired. Close this dialog and try again.');
    }, 1_000);
  }

  async function poll() {
    if (phase !== 'device' || !sessionId) return;
    try {
      const result = await resolveRemoteResult(pollHermesProviderOAuth({ providerId, sessionId })) as RecordValue;
      const status = text(result.status);
      if (status === 'approved') { stopTimers(); phase = 'approved'; await onsuccess(); return; }
      if (status !== 'pending') { fail(text(result.error_message, `Sign-in ${status || 'failed'}.`)); return; }
      pollTimer = setTimeout(poll, Math.max(1_000, number(start.poll_interval, 2) * 1_000));
    } catch (cause) { fail(cause instanceof Error ? cause.message : 'Polling failed.'); }
  }

  async function begin() {
    if (phase === 'external') return;
    try {
      start = await resolveRemoteResult(startHermesProviderOAuth({ providerId })) as RecordValue;
      startCountdown(number(start.expires_in, 900));
      phase = text(start.flow) === 'device_code' ? 'device' : 'pkce';
      if (authUrl) window.open(authUrl, '_blank', 'noopener,noreferrer');
      if (phase === 'device') pollTimer = setTimeout(poll, Math.max(1_000, number(start.poll_interval, 2) * 1_000));
    } catch (cause) { fail(cause instanceof Error ? cause.message : 'Could not start provider sign-in.'); }
  }

  async function submitCode() {
    if (!sessionId || !code.trim()) return;
    phase = 'submitting'; error = '';
    try {
      const result = await resolveRemoteResult(submitHermesProviderOAuthCode({ providerId, sessionId, code: code.trim() })) as RecordValue;
      if (result.ok === true && result.status === 'approved') { stopTimers(); phase = 'approved'; await onsuccess(); }
      else fail(text(result.message, 'Token exchange failed.'));
    } catch (cause) { fail(cause instanceof Error ? cause.message : 'Code submission failed.'); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); copied = true; setTimeout(() => copied = false, 2_000); }
    catch { copied = false; }
  }

  function formatTime(value: number | null) {
    if (value === null) return '';
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  onMount(() => { if (provider.flow === 'external') phase = 'external'; else void begin(); });
  onDestroy(stopTimers);
  $effect(() => { if (!open) void close(); });
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Connect {providerName}</Dialog.Title>
      <Dialog.Description>
        {phase === 'external' ? 'This provider authenticates through its host-side CLI.' : secondsLeft !== null ? `Session expires in ${formatTime(secondsLeft)}.` : 'Starting sign-in…'}
      </Dialog.Description>
    </Dialog.Header>

    {#if phase === 'starting' || phase === 'submitting'}
      <div class="oauth-progress"><LoaderCircle class="spin" /> {phase === 'starting' ? 'Starting secure sign-in…' : 'Exchanging authorization code…'}</div>
    {:else if phase === 'external'}
      <p class="oauth-copy">Run this command in a terminal on the Hermes execution host. Companion does not transfer CLI or subscription credentials between machines.</p>
      <div class="code-row"><code>{text(provider.cli_command)}</code><Button size="icon-sm" variant="outline" aria-label="Copy command" onclick={() => copy(text(provider.cli_command))}>{#if copied}<Check />{:else}<Copy />{/if}</Button></div>
      {#if text(provider.docs_url)}<a class="oauth-link" href={text(provider.docs_url)} target="_blank" rel="noopener noreferrer"><ExternalLink /> Provider documentation</a>{/if}
    {:else if phase === 'pkce'}
      <p class="oauth-copy">Complete authorization in the browser, then paste the returned code here.</p>
      <form onsubmit={(event) => { event.preventDefault(); void submitCode(); }}>
        <Field.Field><Field.FieldLabel for="oauth-code">Authorization code</Field.FieldLabel><Input id="oauth-code" bind:value={code} autocomplete="one-time-code" autofocus required /></Field.Field>
        <div class="oauth-actions"><a class="oauth-link" href={authUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Re-open authorization</a><Button type="submit" disabled={!code.trim()}>Submit code</Button></div>
      </form>
    {:else if phase === 'device'}
      <p class="oauth-copy">Enter this one-time code on the provider page. Hermes will connect automatically after approval.</p>
      <div class="code-row device"><code>{text(start.user_code)}</code><Button size="sm" variant="outline" onclick={() => copy(text(start.user_code))}>{#if copied}<Check data-icon="inline-start" />Copied{:else}<Copy data-icon="inline-start" />Copy{/if}</Button></div>
      <a class="oauth-link" href={authUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Re-open verification page</a>
      <div class="oauth-progress"><LoaderCircle class="spin" /> Waiting for provider approval…</div>
    {:else if phase === 'approved'}
      <div class="oauth-success"><Check /> {providerName} is connected.</div>
    {:else if phase === 'error'}
      <Alert.Root variant="destructive"><CircleAlert /><Alert.Title>Sign-in failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root>
    {/if}

    <Dialog.Footer><Button variant="outline" onclick={() => { open = false; }}>{phase === 'approved' ? 'Done' : 'Close'}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .oauth-copy { margin: 0; color: var(--muted-foreground); line-height: 1.55; }
  .oauth-progress, .oauth-success, .code-row, .oauth-actions { display: flex; align-items: center; gap: .65rem; }
  .oauth-progress { color: var(--muted-foreground); }
  .oauth-success { color: var(--success); }
  .oauth-progress :global(svg), .oauth-success :global(svg), .oauth-link :global(svg) { inline-size: 1rem; }
  :global(svg.spin) { animation: spin 1s linear infinite; }
  .code-row { justify-content: space-between; border: 1px solid var(--border); border-radius: var(--radius); background: var(--muted); padding: .65rem; }
  .code-row code { overflow-wrap: anywhere; font-family: var(--font-mono); font-size: .72rem; }
  .code-row.device code { font-size: 1.35rem; letter-spacing: .16em; }
  form { display: grid; gap: .75rem; }
  .oauth-actions { justify-content: space-between; }
  .oauth-link { display: inline-flex; align-items: center; gap: .3rem; color: var(--muted-foreground); font-size: .72rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { :global(svg.spin) { animation: none; } }
</style>
