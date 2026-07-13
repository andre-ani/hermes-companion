import { command, query } from '$app/server';
import { DesktopPreferences, z } from '@hermes-companion/contracts';
import { getCompanionRepository } from '$lib/server/companion-repository';
import { invokeNative } from '$lib/server/native-client';
import { getOpenRouterCredential, openRouterSecretKey, verifyOpenRouterCredential } from '$lib/server/direct-provider';
import { getOpenRouterManagementCredential, loadOpenRouterPolicy, openRouterManagementSecretKey, verifyOpenRouterManagementCredential } from '$lib/server/openrouter-policy';

const empty = z.object({});
export const getDesktopSettings = query(empty, async () => {
  const [preferences, credential] = await Promise.all([
    getCompanionRepository().getDesktopPreferences(),
    getOpenRouterCredential()
  ]);
  const verification = await verifyOpenRouterCredential(credential.apiKey);
  return { preferences, openRouter: { configured: Boolean(credential.apiKey), source: credential.source, ...verification } };
});

export const getOpenRouterPolicy = query(z.object({ refresh: z.boolean().default(false) }), async ({ refresh }) => loadOpenRouterPolicy(refresh));

export const saveOpenRouterManagementKey = command(z.object({
  apiKey: z.string().trim().max(8_192).optional(),
  clear: z.boolean().default(false)
}), async ({ apiKey, clear }) => {
  const candidate = apiKey?.trim() || null;
  if (candidate) {
    const verification = await verifyOpenRouterManagementCredential(candidate);
    if (!verification.verified) return { ok: false as const, error: verification.error ?? 'OpenRouter rejected the management key.' };
    await invokeNative('secret.set', { key: openRouterManagementSecretKey, value: candidate });
  } else if (clear) await invokeNative('secret.delete', { key: openRouterManagementSecretKey });
  else {
    const current = await getOpenRouterManagementCredential();
    const verification = await verifyOpenRouterManagementCredential(current);
    if (!verification.verified) return { ok: false as const, error: verification.error ?? 'OpenRouter rejected the management key.' };
  }
  return { ok: true as const, policy: await loadOpenRouterPolicy(true) };
});

export const saveDesktopSettings = command(z.object({
  preferences: DesktopPreferences,
  openRouterApiKey: z.string().trim().max(8_192).optional(),
  clearOpenRouterApiKey: z.boolean().default(false),
  verifyOpenRouter: z.boolean().default(false)
}), async ({ preferences, openRouterApiKey, clearOpenRouterApiKey, verifyOpenRouter }) => {
  const candidate = openRouterApiKey?.trim() || null;
  const clearing = clearOpenRouterApiKey && !candidate;
  const currentCredential = await getOpenRouterCredential();

  if (candidate || (verifyOpenRouter && !clearing)) {
    const verification = await verifyOpenRouterCredential(candidate ?? currentCredential.apiKey);
    if (!verification.verified) return { ok: false as const, error: verification.error || 'OpenRouter rejected the credential.' };
  }

  if (clearing) await invokeNative('secret.delete', { key: openRouterSecretKey });
  else if (candidate) await invokeNative('secret.set', { key: openRouterSecretKey, value: candidate });
  const saved = await getCompanionRepository().setDesktopPreferences(preferences);
  const credential = await getOpenRouterCredential();
  const verification = await verifyOpenRouterCredential(credential.apiKey);
  return { ok: true as const, preferences: saved, openRouter: { configured: Boolean(credential.apiKey), source: credential.source, ...verification } };
});
