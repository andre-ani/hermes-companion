import { describe, expect, it } from 'vitest';
import { discoverLocalServers, parseListeningServers } from '../apps/desktop/src/lib/server/local-server-discovery';

describe('local server discovery', () => {
  const listing = `p3038\ncnode\nf21\nn127.0.0.1:5173\np8101\ncpython3.12\nf7\nn[::1]:6767\np1812\ncnginx\nf6\nn*:8080\n`;

  it('lists only loopback or wildcard HTTP candidates with a stable URL', () => {
    expect(parseListeningServers(listing)).toEqual([
      { name: 'Node', port: 5173, url: 'http://localhost:5173' },
      { name: 'Python3.12', port: 6767, url: 'http://localhost:6767' },
      { name: 'Nginx', port: 8080, url: 'http://localhost:8080' }
    ]);
  });

  it('fails closed when process inspection is unavailable', async () => {
    await expect(discoverLocalServers({ list: async () => { throw new Error('lsof unavailable'); } })).resolves.toEqual([]);
  });
});
