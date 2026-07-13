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

  it('repairs legacy bridge-state ownership before the upstream wrapper drops privileges', async () => {
    const script = await readFile('infra/hermes-runtime/companion-state-init.sh', 'utf8');
    const dockerfile = await readFile('infra/hermes-runtime/Dockerfile', 'utf8');

    expect(script).toMatch(/^#!\/command\/with-contenv sh/m);
    expect(script).toContain('state_dir=/opt/data/hermes-companion');
    expect(script).toContain('install -d -o hermes -g hermes -m 0700 "$state_dir"');
    expect(script).toContain('chown -R hermes:hermes "$state_dir"');
    expect(script).toContain('find "$state_dir" -xdev -type d -exec chmod 0700 {} +');
    expect(script).toContain('find "$state_dir" -xdev -type f -exec chmod 0600 {} +');
    expect(script).not.toMatch(/\brm\b/);
    expect(dockerfile).toContain('COPY infra/hermes-runtime/companion-state-init.sh /etc/cont-init.d/025-hermes-companion-state');
    expect(dockerfile).not.toContain('mkdir -p /opt/data/hermes-companion');
  });
});
