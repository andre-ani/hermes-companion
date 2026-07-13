import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const desktop = new URL('../apps/desktop/src/', import.meta.url);
const source = (path: string) => readFile(new URL(path, desktop), 'utf8');

describe('development data architecture', () => {
  it('keeps workspace data limited to live Hermes state', async () => {
    const gateway = await source('lib/client/remote/gateway.remote.ts');
    const sessions = await source('lib/client/remote/sessions.remote.ts');
    expect(gateway).toContain('const sessions = liveSessions.map');
    expect(gateway).not.toContain('directProviderSessions');
    expect(sessions).toContain('startHermesChatTurn');
    expect(sessions).not.toContain('startDirectChatTurn');
    expect(gateway).not.toContain('showcase');
    expect(sessions).not.toContain('showcase');
    expect(sessions).not.toContain('generated-');
  });
});
