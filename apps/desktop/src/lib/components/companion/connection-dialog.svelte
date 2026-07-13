<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import * as Alert from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { connectGateway, discoverLocalHermesServices } from '$lib/client/remote/gateway.remote';
  import { resolveRemoteResult } from '$lib/client/remote/resolve-remote-result';
  import type { GatewayConnection, GatewayStatus, LocalHermesDiscovery } from '@hermes-companion/contracts';

  let { open = $bindable(false), connection = null, onconnected }: { open?: boolean; connection?: GatewayConnection | null; onconnected?: (status: GatewayStatus) => void } = $props();
  let name = $state('Hermes');
  let description = $state('');
  let url = $state('http://127.0.0.1:8642');
  let token = $state('');
  let controlToken = $state('');
  let bridgeUrl = $state('');
  let bridgeToken = $state('');
  let serveUsername = $state('');
  let servePassword = $state('');
  let controlUrl = $state('');
  let serveWsUrl = $state('');
  let pending = $state(false);
  let discovering = $state(false);
  let discovery = $state<LocalHermesDiscovery | null>(null);
  let discoveryError = $state('');
  let error = $state('');

  $effect(() => {
    if (!open) return;
    name = connection?.name ?? 'Hermes';
    description = connection?.description ?? '';
    url = connection?.serveUrl ?? connection?.url ?? 'http://127.0.0.1:8642';
    controlUrl = connection?.controlUrl ?? '';
    serveWsUrl = connection?.serveWsUrl ?? '';
    bridgeUrl = connection?.bridgeUrl ?? '';
    token = ''; controlToken = ''; bridgeToken = ''; serveUsername = ''; servePassword = ''; error = '';
  });

  async function discoverLocal() {
    discovering = true; discoveryError = ''; discovery = null;
    try {
      const result = await resolveRemoteResult(discoverLocalHermesServices({})) as LocalHermesDiscovery;
      discovery = result;
      if (result.agent.available) url = result.agent.url;
      else if (result.control.compatible) url = result.control.url;
      if (result.control.compatible) controlUrl = result.control.url;
      if (result.agent.available || result.control.available) name = 'Local Hermes';
    } catch (cause) {
      discoveryError = cause instanceof Error ? cause.message : 'Local Hermes discovery failed.';
    } finally {
      discovering = false;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault(); pending = true; error = '';
    try {
      const result = await resolveRemoteResult(connectGateway({
        id: connection?.id ?? crypto.randomUUID(), name, description, kind: url.includes('127.0.0.1') || url.includes('localhost') ? 'local' : 'remote', url,
        controlUrl: controlUrl.trim() || null, serveUrl: url.trim(), serveWsUrl: serveWsUrl.trim() || null,
        bridgeUrl: bridgeUrl.trim() || null, token, controlToken, bridgeToken, serveUsername, servePassword, hermesProfileId: connection?.hermesProfileId ?? null
      }));
      open = false; onconnected?.(result.status);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not connect to the gateway.'; }
    finally { pending = false; }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[min(88vh,48rem)] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{connection ? 'Edit Hermes connection' : 'Connect a Hermes gateway'}</Dialog.Title>
      <Dialog.Description>Connect directly to Hermes. Electron encrypts saved credentials with the operating system credential store.</Dialog.Description>
    </Dialog.Header>
    <form onsubmit={submit} class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <p class="text-muted-foreground text-xs">Running Hermes locally?</p>
        <Button type="button" variant="secondary" size="sm" disabled={discovering} onclick={discoverLocal}>
          {discovering ? 'Checking…' : 'Discover local Hermes'}
        </Button>
      </div>
      {#if discovery}
        <Alert.Root>
          <Alert.Title>
            {discovery.agent.compatible && discovery.control.compatible ? 'Local Hermes is ready' : discovery.agent.available || discovery.control.available ? 'Local Hermes was partially discovered' : 'Local Hermes was not found'}
          </Alert.Title>
          <Alert.Description>
            Agent API: {discovery.agent.detail} Dashboard: {discovery.control.detail}
          </Alert.Description>
        </Alert.Root>
      {:else if discoveryError}
        <Alert.Root variant="destructive">
          <Alert.Title>Discovery failed</Alert.Title>
          <Alert.Description>{discoveryError}</Alert.Description>
        </Alert.Root>
      {/if}

      <Field.FieldSet>
        <Field.FieldLegend>Hermes services</Field.FieldLegend>
        <Field.FieldGroup class="grid gap-3 sm:grid-cols-2">
          <Field.Field>
            <Field.FieldLabel for="serve-username">Serve username</Field.FieldLabel>
            <Input id="serve-username" bind:value={serveUsername} autocomplete="username" />
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="serve-password">Serve password</Field.FieldLabel>
            <Input id="serve-password" bind:value={servePassword} type="password" autocomplete="current-password" />
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="gateway-name">Connection name</Field.FieldLabel>
            <Input id="gateway-name" bind:value={name} required />
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="gateway-description">Profile description</Field.FieldLabel>
            <Input id="gateway-description" bind:value={description} maxlength={280} placeholder="A short description shown in the profile switcher" />
          </Field.Field>
          <Field.Field data-invalid={Boolean(error)}>
            <Field.FieldLabel for="gateway-url">Agent API URL or Dashboard fallback</Field.FieldLabel>
            <Input id="gateway-url" bind:value={url} type="url" aria-invalid={Boolean(error)} required />
            <Field.FieldDescription>Defaults to 127.0.0.1:8642. Dashboard-only hosts use their verified Dashboard URL and connect with partial capabilities.</Field.FieldDescription>
            {#if error}<Field.FieldError>{error}</Field.FieldError>{/if}
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="gateway-token">Agent API bearer token</Field.FieldLabel>
            <Input id="gateway-token" bind:value={token} type="password" autocomplete="off" />
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="control-url">Dashboard control URL</Field.FieldLabel>
            <Input id="control-url" bind:value={controlUrl} type="url" placeholder="http://127.0.0.1:9119" />
            <Field.FieldDescription>Optional; used for supported Dashboard APIs.</Field.FieldDescription>
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="control-token">Dashboard control token</Field.FieldLabel>
            <Input id="control-token" bind:value={controlToken} type="password" autocomplete="off" />
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="serve-ws-url">Authorized Serve WebSocket URL</Field.FieldLabel>
            <Input id="serve-ws-url" bind:value={serveWsUrl} type="url" placeholder="wss://gateway.example.com/api/ws?ticket=…" />
            <Field.FieldDescription>Optional and host-issued; never derived from the Dashboard URL.</Field.FieldDescription>
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="bridge-url">Companion execution URL</Field.FieldLabel>
            <Input id="bridge-url" bind:value={bridgeUrl} type="url" placeholder="https://gateway.example.com" />
            <Field.FieldDescription>Optional; enables terminal, files, Git, and preview on the Hermes host.</Field.FieldDescription>
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="bridge-token">Companion execution token</Field.FieldLabel>
            <Input id="bridge-token" bind:value={bridgeToken} type="password" autocomplete="off" placeholder={connection?.bridgeUrl ? 'Stored securely' : ''} />
          </Field.Field>
        </Field.FieldGroup>
      </Field.FieldSet>

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? 'Checking…' : connection ? 'Save connection' : 'Connect'}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
