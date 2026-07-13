import { BridgeEnvelope, type GatewayConnection } from '@hermes-companion/contracts';

export class CompanionBridgeClient {
  constructor(readonly url: string, private readonly token: string) {}
  async invoke<T>(capability: BridgeEnvelope['capability'], payload: BridgeEnvelope['payload']): Promise<T> {
    const envelope = BridgeEnvelope.parse({ version: 'v1', requestId: crypto.randomUUID(), capability, payload });
    const response = await fetch(new URL('/v1/capability', `${this.url.replace(/\/$/, '')}/`), {
      method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(125_000)
    });
    const result = await response.json() as { ok?: boolean; data?: T; error?: string };
    if (!response.ok || result.ok === false) throw new Error(result.error ?? `Companion bridge request failed (${response.status}).`);
    return result.data as T;
  }
}

let active: CompanionBridgeClient | null = null;
export const configureBridgeClient = (connection: GatewayConnection, token = '') => {
  active = connection.bridgeUrl ? new CompanionBridgeClient(connection.bridgeUrl, token || process.env.HERMES_BRIDGE_TOKEN || '') : null;
  return active;
};
export const getBridgeClient = () => active;
