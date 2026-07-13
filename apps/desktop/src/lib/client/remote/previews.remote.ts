import { command, query } from '$app/server';
import { PreviewLease, z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { getBridgeClient } from '$lib/server/bridge-client';
import { invokeNative } from '$lib/server/native-client';

const worktreeId = z.object({ worktreeId: z.string().min(1) });

export const listWorktreePreviews = query(worktreeId, async ({ worktreeId }) => getCompanionRepository().listPreviews(worktreeId));

export const startWorktreePreview = command(worktreeId.extend({
  origin: z.string().url().refine((value) => new URL(value).protocol === 'http:', 'Preview origin must use HTTP'),
  designModeAllowed: z.boolean().default(false), ttlSeconds: z.number().int().min(60).max(86_400).default(3_600)
}), async ({ worktreeId, origin, designModeAllowed, ttlSeconds }) => {
  const repository = getCompanionRepository();
  const worktree = (await repository.listWorktrees()).find((item) => item.worktreeId === worktreeId);
  if (!worktree) throw new Error('Worktree was not found.');
  const connection = await repository.getActiveConnection();
  let lease: z.infer<typeof PreviewLease>;
  if (connection?.kind === 'remote') {
    const bridge = getBridgeClient(); if (!bridge) throw new Error('Remote previews require an authenticated companion bridge.');
    lease = PreviewLease.parse(await bridge.invoke('preview', { action: 'preview.start', worktreeId, origin, designModeAllowed, ttlSeconds }));
    if (!lease.relayUrl) throw new Error('The remote bridge has no public preview relay URL configured.');
  } else {
    const target = new URL(origin);
    if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) throw new Error('Local previews must use a loopback origin.');
    lease = { id: crypto.randomUUID(), worktreeId, origin: target.toString(), relayUrl: null, designModeAllowed, expiresAt: new Date(Date.now() + ttlSeconds * 1_000).toISOString() };
  }
  await invokeNative('preview.register', lease); await invokeNative('preview.open', { leaseId: lease.id });
  await repository.addPreview(lease); return lease;
});

export const reopenWorktreePreview = command(z.object({ leaseId: z.string().uuid() }), async ({ leaseId }) => {
  const lease = (await getCompanionRepository().listPreviews()).find((item) => item.id === leaseId);
  if (!lease) throw new Error('Preview lease is missing or expired.');
  await invokeNative('preview.register', lease); await invokeNative('preview.open', { leaseId }); return lease;
});

export const stopWorktreePreview = command(z.object({ leaseId: z.string().uuid() }), async ({ leaseId }) => {
  const repository = getCompanionRepository(); const lease = (await repository.listPreviews()).find((item) => item.id === leaseId);
  const connection = await repository.getActiveConnection();
  if (lease && connection?.kind === 'remote') await getBridgeClient()?.invoke('preview', { action: 'preview.stop', leaseId });
  await repository.removePreview(leaseId); return { ok: true as const };
});
