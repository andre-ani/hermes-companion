import WebSocket from 'ws';
import type { GatewayConnection } from '@hermes-companion/contracts';
import { requestHermesGateway } from '@hermes-companion/hermes-adapter';
import { resolveHermesServeWebSocketUrl } from './hermes-serve-auth.js';

export const requestHermesServe = <T>(
  connection: GatewayConnection,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15_000
) => requestHermesGateway<T>({
  profileId: connection.hermesProfileId ?? 'default',
  socketProvider: {
    async getFreshSocketUrl() {
      const url = await resolveHermesServeWebSocketUrl(connection);
      if (!url) throw new Error('This profile does not expose an authorized Hermes Serve WebSocket URL.');
      return url;
    }
  },
  socketFactory: (url) => new WebSocket(url) as never
}, method, params, timeoutMs);
