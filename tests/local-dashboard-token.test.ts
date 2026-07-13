import { describe, expect, it, vi } from 'vitest';
import { extractInjectedDashboardToken, resolveServedLocalDashboardToken } from '../apps/desktop/src/lib/server/local-dashboard-token';

describe('served local Dashboard session token', () => {
  it('parses the exact upstream HTML injection without exposing arbitrary script data', () => {
    expect(extractInjectedDashboardToken('<script>window.__HERMES_SESSION_TOKEN__="dashboard-token-123456";</script>')).toBe('dashboard-token-123456');
    expect(extractInjectedDashboardToken('<script>window.otherToken="dashboard-token-123456";</script>')).toBeNull();
    expect(extractInjectedDashboardToken('<script>window.__HERMES_SESSION_TOKEN__="short";</script>')).toBeNull();
  });

  it('fetches only loopback Dashboard origins', async () => {
    const fetcher = vi.fn(async () => new Response('<script>window.__HERMES_SESSION_TOKEN__="dashboard-token-123456";</script>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(resolveServedLocalDashboardToken('http://127.0.0.1:9119', fetcher as typeof fetch)).resolves.toBe('dashboard-token-123456');
    expect(fetcher).toHaveBeenCalledWith(new URL('http://127.0.0.1:9119/'), expect.any(Object));
    await expect(resolveServedLocalDashboardToken('https://gateway.example.com', fetcher as typeof fetch)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized Dashboard index responses', async () => {
    const fetcher = vi.fn(async () => new Response('ignored', { status: 200, headers: { 'content-length': String(3 * 1024 * 1024) } }));
    await expect(resolveServedLocalDashboardToken('http://localhost:9119', fetcher as typeof fetch)).resolves.toBeNull();
  });
});
