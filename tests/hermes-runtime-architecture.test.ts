import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('lean Hermes runtime process ownership', () => {
  it('lets the inherited upstream entrypoint own init and activates Serve cookie authentication', async () => {
    const script = await readFile('infra/hermes-runtime/start.sh', 'utf8');
    const dockerfile = await readFile('infra/hermes-runtime/Dockerfile', 'utf8');
    const railway = await readFile('railway.toml', 'utf8');
    expect(script).not.toMatch(/(?:^|\s)\/init(?:\s|$)/m);
    expect(script).not.toContain('main-wrapper.sh');
    expect(script).toContain(': "${HERMES_INTERNAL_HOST:=0.0.0.0}"');
    expect(script).toContain('exec /opt/hermes/.venv/bin/hermes serve --host "$HERMES_INTERNAL_HOST" --port "$HERMES_INTERNAL_PORT"');
    expect(dockerfile).not.toMatch(/^ENTRYPOINT\b/m);
    expect(dockerfile).toContain('CMD ["/opt/hermes-companion/start.sh"]');
    expect(railway).not.toContain('startCommand');
  });
});
