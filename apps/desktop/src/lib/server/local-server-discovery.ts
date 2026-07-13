import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export type LocalServer = {
  name: string;
  port: number;
  url: string;
};

type DiscoveryOptions = {
  list?: () => Promise<string>;
  probe?: (server: LocalServer) => Promise<boolean>;
};

const titleFor = (processName: string) => processName
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const parseListeningServers = (output: string): LocalServer[] => {
  const servers = new Map<number, LocalServer>();
  let processName = '';
  for (const line of output.split('\n')) {
    if (line.startsWith('c')) { processName = line.slice(1); continue; }
    const match = line.match(/^n(.+):(\d+)$/);
    if (!match) continue;
    const [, address, rawPort] = match;
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) continue;
    const normalizedAddress = address.replace(/^\[/, '').replace(/\]$/, '');
    if (!['127.0.0.1', 'localhost', '::1', '*'].includes(normalizedAddress)) continue;
    if (processName && !servers.has(port)) servers.set(port, { name: titleFor(processName), port, url: `http://localhost:${port}` });
  }
  return [...servers.values()].sort((left, right) => left.port - right.port);
};

export const discoverLocalServers = async (options: DiscoveryOptions = {}): Promise<LocalServer[]> => {
  const list = options.list ?? (async () => (await execFile('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'], { maxBuffer: 1_000_000 })).stdout);
  try {
    const candidates = parseListeningServers(await list());
    const probe = options.probe ?? (async (server: LocalServer) => {
      try {
        const response = await fetch(server.url, { headers: { accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(900) });
        return response.ok && (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
      } catch { return false; }
    });
    const results = await Promise.all(candidates.map(async (server) => ({ server, browserReady: await probe(server) })));
    return results.filter((result) => result.browserReady).map((result) => result.server);
  } catch {
    return [];
  }
};
