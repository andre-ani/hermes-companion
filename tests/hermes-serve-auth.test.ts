import { describe, expect, it, vi } from 'vitest';
import { configureHermesServeAuth, HermesServeAuthSession, resolveHermesServeWebSocketUrl } from '../apps/desktop/src/lib/server/hermes-serve-auth';

describe('HermesServeAuthSession', () => {
  it('signs in once and mints a fresh single-use ticket for every socket', async () => {
    let ticket = 0;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/password-login') {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ provider: 'basic', username: 'andre', password: 'secret' });
        return new Response('{}', { status: 200, headers: { 'set-cookie': 'hermes_session=authenticated; Path=/; HttpOnly' } });
      }
      expect(new Headers(init?.headers).get('cookie')).toBe('hermes_session=authenticated');
      return Response.json({ ticket: `ticket-${++ticket}` });
    }) as typeof fetch;

    const session = new HermesServeAuthSession('https://hermes.example.com', { username: 'andre', password: 'secret' }, fetcher);
    expect(await session.mintWebSocketUrl()).toBe('wss://hermes.example.com/api/ws?ticket=ticket-1');
    expect(await session.mintWebSocketUrl()).toBe('wss://hermes.example.com/api/ws?ticket=ticket-2');
    expect(fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/auth/password-login')).toHaveLength(1);
  });

  it('re-authenticates once when the Serve session expires', async () => {
    let logins = 0;
    let tickets = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/password-login') {
        logins += 1;
        return new Response('{}', { status: 200, headers: { 'set-cookie': `session=${logins}; Path=/` } });
      }
      tickets += 1;
      if (tickets === 1) return new Response('expired', { status: 401 });
      return Response.json({ ticket: 'renewed' });
    }) as typeof fetch;

    const session = new HermesServeAuthSession('https://hermes.example.com', { username: 'andre', password: 'secret' }, fetcher);
    expect(await session.mintWebSocketUrl()).toContain('ticket=renewed');
    expect(logins).toBe(2);
  });

  it('prefers a freshly minted ticket over a persisted static WebSocket URL', async () => {
    let ticket = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/password-login') {
        return new Response('{}', { status: 200, headers: { 'set-cookie': 'session=owner; Path=/' } });
      }
      return Response.json({ ticket: `fresh-${++ticket}` });
    }) as typeof fetch;
    const connection = {
      id: 'owner-gateway', name: 'Hermes', kind: 'remote' as const, url: 'https://hermes.example.com', controlUrl: null,
      serveUrl: 'https://hermes.example.com', serveWsUrl: 'wss://hermes.example.com/api/ws?ticket=stale', bridgeUrl: null, hermesProfileId: 'hermes-code'
    };
    configureHermesServeAuth(connection, 'owner', 'secret', fetcher);

    expect(await resolveHermesServeWebSocketUrl(connection)).toBe('wss://hermes.example.com/api/ws?ticket=fresh-1');
    expect(await resolveHermesServeWebSocketUrl(connection)).toBe('wss://hermes.example.com/api/ws?ticket=fresh-2');
    configureHermesServeAuth(connection);
  });
});
