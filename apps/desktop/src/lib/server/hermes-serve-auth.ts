import type { GatewayConnection } from '@hermes-companion/contracts';

type ServeCredentials = { username: string; password: string };
type FetchLike = typeof fetch;

const cookiePairs = (headers: Headers) => {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') ?? ''];
  return values.map((value) => value.split(';', 1)[0]?.trim()).filter(Boolean);
};

export class HermesServeAuthSession {
  private cookie = '';
  private loginPromise: Promise<void> | null = null;

  constructor(readonly origin: string, private readonly credentials: ServeCredentials, private readonly fetcher: FetchLike = fetch) {}

  private url(path: string) { return new URL(path, `${this.origin.replace(/\/$/, '')}/`); }

  private async login() {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      const response = await this.fetcher(this.url('/auth/password-login'), {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'basic', username: this.credentials.username, password: this.credentials.password }),
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail.slice(0, 300) || `Hermes Serve sign-in failed (${response.status}).`);
      }
      const cookies = cookiePairs(response.headers);
      if (!cookies.length) throw new Error('Hermes Serve did not establish an authenticated session.');
      this.cookie = cookies.join('; ');
    })().finally(() => { this.loginPromise = null; });
    return this.loginPromise;
  }

  async request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    if (!this.cookie) await this.login();
    const headers = new Headers(init.headers);
    headers.set('cookie', this.cookie);
    const response = await this.fetcher(this.url(path), { ...init, headers });
    if (retry && (response.status === 401 || response.status === 403)) {
      this.cookie = '';
      await this.login();
      return this.request(path, init, false);
    }
    return response;
  }

  async mintWebSocketUrl() {
    const response = await this.request('/api/auth/ws-ticket', { method: 'POST', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Hermes Serve could not mint a WebSocket ticket (${response.status}).`);
    const payload = await response.json() as { ticket?: unknown };
    if (typeof payload.ticket !== 'string' || !payload.ticket) throw new Error('Hermes Serve returned an invalid WebSocket ticket.');
    const url = this.url('/api/ws');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', payload.ticket);
    return url.toString();
  }
}

const sessions = new Map<string, HermesServeAuthSession>();

export const configureHermesServeAuth = (connection: GatewayConnection, username = '', password = '') => {
  if (!connection.serveUrl || !username || !password) { sessions.delete(connection.id); return null; }
  const session = new HermesServeAuthSession(connection.serveUrl, { username, password });
  sessions.set(connection.id, session);
  return session;
};

export const getHermesServeAuth = (connection: GatewayConnection) => sessions.get(connection.id) ?? null;
export const hasHermesServeAuth = (connection: GatewayConnection) => sessions.has(connection.id);
export const resolveHermesServeWebSocketUrl = async (connection: GatewayConnection) => {
  if (connection.serveWsUrl) return connection.serveWsUrl;
  const session = getHermesServeAuth(connection);
  return session ? session.mintWebSocketUrl() : null;
};
