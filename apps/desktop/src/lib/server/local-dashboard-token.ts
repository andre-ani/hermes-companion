const MAX_DASHBOARD_INDEX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 3_000;

const loopbackDashboardUrl = (value: string) => {
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) {
    throw new Error('Automatic Dashboard session-token discovery is limited to loopback hosts.');
  }
  return new URL('/', target.origin);
};

export const extractInjectedDashboardToken = (html: string) => {
  const match = /window\.__HERMES_SESSION_TOKEN__\s*=\s*("(?:\\.|[^"\\])*")/.exec(html);
  if (!match) return null;
  try {
    const token = JSON.parse(match[1]);
    return typeof token === 'string' && token.length >= 16 && token.length <= 4_096 ? token : null;
  } catch {
    return null;
  }
};

export const resolveServedLocalDashboardToken = async (baseUrl: string | null | undefined, fetcher: typeof fetch = fetch, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  if (!baseUrl) return null;
  let target: URL;
  try { target = loopbackDashboardUrl(baseUrl); } catch { return null; }
  try {
    const response = await fetcher(target, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_DASHBOARD_INDEX_BYTES) return null;
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_DASHBOARD_INDEX_BYTES) return null;
    return extractInjectedDashboardToken(html);
  } catch {
    return null;
  }
};
