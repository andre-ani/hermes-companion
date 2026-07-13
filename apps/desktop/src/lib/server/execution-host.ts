import type { BridgeEnvelope, GatewayConnection } from '@hermes-companion/contracts';
import { configureBridgeClient, getBridgeClient } from './bridge-client.js';
import { invokeNative } from './native-client.js';

let connection: GatewayConnection | null = null;
export const setExecutionHostConnection = (next: GatewayConnection, token = '') => { connection = next; configureBridgeClient(next, token); };

export async function invokeExecutionHost<T>({
  localCapability,
  localInput,
  remoteCapability,
  remotePayload
}: {
  localCapability: string;
  localInput: unknown;
  remoteCapability: BridgeEnvelope['capability'];
  remotePayload: BridgeEnvelope['payload'];
}): Promise<T> {
  if (connection?.kind === 'remote') {
    const bridge = getBridgeClient(); if (!bridge) throw new Error('This remote profile has no companion bridge URL.');
    return bridge.invoke<T>(remoteCapability, remotePayload);
  }
  return invokeNative<T>(localCapability, localInput);
}
