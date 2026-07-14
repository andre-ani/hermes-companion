import {
  JsonRpcGatewayClient,
  resolveGatewayWsUrl,
  type WebSocketLike
} from '@hermes/shared';

export type HermesGatewayRequestOptions = {
  profileId: string;
  socketProvider: { getFreshSocketUrl(profileId: string): Promise<string> };
  socketFactory?: (url: string) => WebSocketLike;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
};

/**
 * Thin one-shot adapter over the pinned upstream gateway client. Session
 * lifecycle work belongs in UpstreamHermesSessionController instead.
 */
export async function requestHermesGateway<T>(
  options: HermesGatewayRequestOptions,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = options.requestTimeoutMs ?? 15_000
): Promise<T> {
  const client = new JsonRpcGatewayClient({
    connectTimeoutMs: options.connectTimeoutMs,
    requestTimeoutMs: options.requestTimeoutMs,
    socketFactory: options.socketFactory
  });
  try {
    const url = await resolveGatewayWsUrl(
      { getGatewayWsUrl: () => options.socketProvider.getFreshSocketUrl(options.profileId) },
      { authMode: 'oauth', profile: options.profileId, wsUrl: '' }
    );
    await client.connect(url);
    return await client.request<T>(method, params, timeoutMs);
  } finally {
    client.close();
  }
}
