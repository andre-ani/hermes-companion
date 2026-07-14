import { command, query } from '$app/server';
import { PreviewLease, z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { requireExecutionHost } from '$lib/server/execution-host';
import { invokeNative } from '$lib/server/native-client';
import { assertActiveWorktreeOwner, requireActiveWorktree } from '$lib/server/worktree-ownership';

const worktreeId = z.object({ worktreeId: z.string().min(1) });
const browserIdentity = z.object({ ownerKey: z.string().min(1), browserLeaseId: z.string().min(1) });

export const listWorktreePreviews = query(worktreeId, async ({ worktreeId }) => {
  await requireActiveWorktree(worktreeId);
  return getCompanionRepository().listPreviews(worktreeId);
});

export const startWorktreePreview = command(worktreeId.merge(browserIdentity).extend({
  origin: z.string().url().refine((value) => new URL(value).protocol === 'http:', 'Preview origin must use HTTP'),
  ttlSeconds: z.number().int().min(60).max(86_400).default(3_600)
}), async ({ worktreeId, origin, ttlSeconds, ownerKey, browserLeaseId }) => {
  const repository = getCompanionRepository();
  const worktree = await requireActiveWorktree(worktreeId);
  const host = requireExecutionHost(worktree.connectionId);
  let lease: z.infer<typeof PreviewLease>;
  if (host.connection.kind === 'remote') {
    if (!host.bridge) throw new Error('Remote previews require an authenticated companion bridge.');
    lease = PreviewLease.parse(await host.bridge.invoke('preview', { action: 'preview.start', worktreeId, origin, ttlSeconds }));
    if (!lease.relayUrl) throw new Error('The remote bridge has no public preview relay URL configured.');
  } else {
    const target = new URL(origin);
    if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) throw new Error('Local previews must use a loopback origin.');
    lease = { id: crypto.randomUUID(), worktreeId, origin: target.toString(), relayUrl: null, expiresAt: new Date(Date.now() + ttlSeconds * 1_000).toISOString() };
  }
  assertActiveWorktreeOwner(worktree);
  await invokeNative('preview.register', lease);
  assertActiveWorktreeOwner(worktree);
  await invokeNative('preview.open', { leaseId: lease.id, ownerKey, browserLeaseId });
  await repository.addPreview(lease); return lease;
});

export const reopenWorktreePreview = command(browserIdentity.extend({ leaseId: z.string().uuid() }), async ({ leaseId, ownerKey, browserLeaseId }) => {
  const lease = (await getCompanionRepository().listPreviews()).find((item) => item.id === leaseId);
  if (!lease) throw new Error('Preview lease is missing or expired.');
  const worktree = await requireActiveWorktree(lease.worktreeId);
  assertActiveWorktreeOwner(worktree);
  await invokeNative('preview.register', lease);
  assertActiveWorktreeOwner(worktree);
  await invokeNative('preview.open', { leaseId, ownerKey, browserLeaseId }); return lease;
});

export const stopWorktreePreview = command(z.object({ leaseId: z.string().uuid() }), async ({ leaseId }) => {
  const repository = getCompanionRepository(); const lease = (await repository.listPreviews()).find((item) => item.id === leaseId);
  const worktree = lease ? await requireActiveWorktree(lease.worktreeId) : null;
  const host = worktree ? requireExecutionHost(worktree.connectionId) : null;
  if (worktree && host?.connection.kind === 'remote') {
    if (!host.bridge) throw new Error('Remote previews require an authenticated companion bridge.');
    await host.bridge.invoke('preview', { action: 'preview.stop', leaseId });
  }
  await repository.removePreview(leaseId); return { ok: true as const };
});
