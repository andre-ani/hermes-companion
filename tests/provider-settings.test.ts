import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyOpenRouterCredential } from '../apps/desktop/src/lib/server/direct-provider';

const desktop = new URL('../apps/desktop/src/', import.meta.url);
const source = (path: string) => readFile(new URL(path, desktop), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('OpenRouter policy credentials', () => {
  it('verifies an explicit candidate without exposing it in the result', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer candidate-secret');
      return new Response(JSON.stringify({ data: { label: 'candidate' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetch);
    expect(await verifyOpenRouterCredential('candidate-secret')).toEqual({ verified: true, error: null });
    expect(JSON.stringify(await verifyOpenRouterCredential('candidate-secret'))).not.toContain('candidate-secret');
  });

  it('rejects a candidate before secure storage is replaced', async () => {
    const remote = await source('lib/client/remote/settings.remote.ts');
    const verification = remote.indexOf('verifyOpenRouterCredential(candidate ?? currentCredential.apiKey)');
    const rejection = remote.indexOf("return { ok: false as const", verification);
    const storage = remote.indexOf("invokeNative('secret.set'", rejection);
    expect(verification).toBeGreaterThan(-1);
    expect(rejection).toBeGreaterThan(verification);
    expect(storage).toBeGreaterThan(rejection);
  });

  it('uses one candidate-aware Save and Verify path in the provider UI', async () => {
    const page = await source('lib/components/companion/settings-page.svelte');
    expect(page).toContain("openRouterApiKey: openRouterApiKey || undefined");
    expect(page).toContain("verifyOpenRouter: section.id === 'providers'");
    expect(page).toContain("if (!result.ok) throw new Error(result.error)");
    expect(page).toContain("'Save & verify'");
    expect(page).not.toContain('testOpenRouterConnection');
    expect(page).toContain('Companion never uses this key as a second chat runtime.');
    expect(page).not.toContain('Enable AI SDK direct path');
    expect(page).not.toContain('for="openrouter-model"');
  });
});
