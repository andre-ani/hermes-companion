import type { BridgeEnvelope, GatewayConnection } from '@hermes-companion/contracts';
import { configureBridgeClient, getBridgeClient } from './bridge-client.js';
import { invokeNative } from './native-client.js';

let connection: GatewayConnection | null = null;
export const setExecutionHostConnection = (next: GatewayConnection, token = '') => { connection = next; configureBridgeClient(next, token); };

export function requireExecutionHost(expectedConnectionId: string) {
  if (connection?.id !== expectedConnectionId) throw new Error('The active execution host changed before this operation could run.');
  const bridge = connection.kind === 'remote' ? getBridgeClient() : null;
  if (connection.kind === 'remote' && !bridge) throw new Error('This remote profile has no companion bridge URL.');
  return { connection, bridge } as const;
}

export async function invokeExecutionHost<T>({
  localCapability,
  localInput,
  remoteCapability,
  remotePayload,
  expectedConnectionId
}: {
  localCapability: string;
  localInput: unknown;
  remoteCapability: BridgeEnvelope['capability'];
  remotePayload: BridgeEnvelope['payload'];
  expectedConnectionId?: string;
}): Promise<T> {
  const host = expectedConnectionId ? requireExecutionHost(expectedConnectionId) : { connection, bridge: connection?.kind === 'remote' ? getBridgeClient() : null };
  if (host.connection?.kind === 'remote') {
    const bridge = host.bridge; if (!bridge) throw new Error('This remote profile has no companion bridge URL.');
    return bridge.invoke<T>(remoteCapability, remotePayload);
  }
  return invokeNative<T>(localCapability, localInput);
}
