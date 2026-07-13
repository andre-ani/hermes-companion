import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const image = process.env.BRIDGE_UAT_IMAGE ?? 'hermes-companion-bridge:uat';
const name = `hermes-bridge-uat-${process.pid}`;
const token = randomBytes(32).toString('hex');

async function docker(...args) {
  return exec('docker', args, { maxBuffer: 10 * 1024 * 1024 });
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Container did not become healthy within 15 seconds.');
}

try {
  if (process.env.BRIDGE_UAT_SKIP_BUILD !== '1') {
    const build = spawn('docker', ['build', '-f', 'apps/bridge/Dockerfile', '-t', image, '.'], {
      cwd: new URL('../../..', import.meta.url),
      stdio: 'inherit'
    });
    const buildCode = await new Promise((resolve) => build.on('close', resolve));
    if (buildCode !== 0) throw new Error(`Docker build exited with ${buildCode}.`);
  }

  const { stdout: containerId } = await docker(
    'run', '--name', name, '--detach', '--publish', '127.0.0.1::9130',
    '--env', `BRIDGE_TOKEN=${token}`, image
  );
  const { stdout: mapping } = await docker('port', name, '9130/tcp');
  const port = mapping.trim().match(/:(\d+)$/)?.[1];
  if (!port) throw new Error(`Could not resolve published port for ${containerId.trim()}.`);
  const base = `http://127.0.0.1:${port}`;
  const health = await waitFor(`${base}/healthz`);

  const unauthenticated = await fetch(`${base}/v1/capability`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  if (unauthenticated.status !== 404) throw new Error(`Unauthenticated capability returned ${unauthenticated.status}.`);

  const authenticated = await fetch(`${base}/v1/capability`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      version: 'v1', requestId: randomUUID(), capability: 'worktrees',
      payload: { action: 'worktree.list' }
    })
  });
  const capability = await authenticated.json();
  if (!authenticated.ok || capability.ok !== true) {
    throw new Error(`Authenticated capability failed (${authenticated.status}): ${JSON.stringify(capability)}`);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, image, health, authentication: { unauthenticated: 404, authenticated: authenticated.status } }, null, 2)}\n`);
} finally {
  await docker('rm', '--force', name).catch(() => undefined);
}
