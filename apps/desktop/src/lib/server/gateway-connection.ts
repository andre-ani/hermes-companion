import type { GatewayConnection } from '@hermes-companion/contracts';
import { buildCapabilityRegistry } from './capability-registry.js';
import { getCompanionRepository } from './companion-repository.js';
import { setExecutionHostConnection } from './execution-host.js';
import { setActiveHermesClient } from './hermes-client.js';
import { configureHermesServeAuth } from './hermes-serve-auth.js';
import { resolveServedLocalDashboardToken } from './local-dashboard-token.js';
import { invokeNative } from './native-client.js';

export type ConnectHermesInput = {
  connection: GatewayConnection;
  token?: string;
  controlToken?: string;
  bridgeToken?: string;
  serveUsername?: string;
  servePassword?: string;
};

export async function connectHermes(input: ConnectHermesInput) {
  const { connection } = input;
  const existingSecret = (key: string) => invokeNative<{ value: string | null }>('secret.get', { key }).then((result) => result.value ?? '').catch(() => '');
  const [storedToken, storedControlToken, storedBridgeToken, storedServeUsername, storedServePassword] = await Promise.all([
    existingSecret(`gateway:${connection.id}`), existingSecret(`control:${connection.id}`), existingSecret(`bridge:${connection.id}`),
    existingSecret(`serve-username:${connection.id}`), existingSecret(`serve-password:${connection.id}`)
  ]);
  const token = input.token || storedToken;
  const serveUsername = input.serveUsername || storedServeUsername;
  const servePassword = input.servePassword || storedServePassword;
  const bridgeToken = input.bridgeToken || storedBridgeToken;
  configureHermesServeAuth(connection, serveUsername, servePassword);
  const controlToken = input.controlToken || storedControlToken || await resolveServedLocalDashboardToken(connection.controlUrl) || '';
  const client = setActiveHermesClient(connection, token, controlToken);
  setExecutionHostConnection(connection, bridgeToken);
  const status = await client.probe();
  if (status.status === 'disconnected') throw new Error(status.error ?? 'Could not connect to Hermes.');

  const repository = getCompanionRepository();
  await repository.upsertConnection(connection);
  const secrets = [
    [token, `gateway:${connection.id}`],
    [controlToken, `control:${connection.id}`],
    [bridgeToken, `bridge:${connection.id}`],
    [serveUsername, `serve-username:${connection.id}`],
    [servePassword, `serve-password:${connection.id}`]
  ] as const;
  const persisted: boolean[] = [];
  for (const [value, key] of secrets) {
    persisted.push(value ? await invokeNative('secret.set', { key, value }).then(() => true).catch(() => false) : true);
  }
  await repository.recordAudit('gateway.connected', connection.id, { status: status.status });
  return { status, capabilities: buildCapabilityRegistry(status), credentialsPersisted: persisted.every(Boolean) };
}
