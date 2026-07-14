import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Hermes background run architecture', () => {
  it('keeps the upstream-backed run coordinator reachable from the worktree-owned inspector', async () => {
    const [dock, harnesses, coordinator, contracts] = await Promise.all([
      readFile('apps/desktop/src/lib/components/companion/workspace-dock.svelte', 'utf8'),
      readFile('apps/desktop/src/lib/client/remote/harnesses.remote.ts', 'utf8'),
      readFile('apps/desktop/src/lib/server/hermes-run-coordinator.ts', 'utf8'),
      readFile('packages/contracts/src/index.ts', 'utf8')
    ]);
    await expect(access('apps/desktop/src/lib/server/hermes-serve-runs.ts')).rejects.toThrow();
    await expect(access('apps/desktop/src/lib/server/hermes-session-recovery.ts')).rejects.toThrow();
    expect(dock).toContain("import HarnessPanel from './harness-panel.svelte'");
    expect(dock).toContain("openSurface('run')");
    expect(dock).toContain('<HarnessPanel {worktree} />');
    expect(contracts).toContain("'agents', 'run'");
    expect(harnesses).toContain('getHermesRunCoordinator()');
    expect(harnesses).not.toContain('releaseWriter');
    expect(coordinator).toContain('UpstreamHermesSessionController');
    expect(coordinator).toContain('bindRunSession');
    expect(coordinator).not.toContain('promptDispatched');
    expect(coordinator).not.toContain('transportSessionId');
  });
});
