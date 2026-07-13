import { command, query } from '$app/server';
import { z } from '@hermes-companion/contracts';
import { invokeNative } from '$lib/server/native-client';

const browserUrl = z.object({ url: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Browser URL must use HTTP or HTTPS') });
type BrowserState = { open: boolean; kind: 'general' | 'preview' | null; url: string | null; fullscreen: boolean };

export const getBrowserStatus = query(z.object({}), async () => invokeNative<BrowserState>('browser.status', {}));
export const openGeneralBrowser = command(browserUrl, async ({ url }) => invokeNative<BrowserState>('browser.open', { url }));
export const navigateBrowser = command(browserUrl, async ({ url }) => invokeNative<BrowserState>('browser.navigate', { url }));
export const controlBrowser = command(z.object({ action: z.enum(['back', 'forward', 'reload', 'close']) }), async ({ action }) => invokeNative<BrowserState | { ok: boolean }>(`browser.${action}`, {}));
export const setBrowserFullscreen = command(z.object({ fullscreen: z.boolean() }), async ({ fullscreen }) => invokeNative<{ ok: boolean; fullscreen: boolean }>('browser.layout', { fullscreen }));
export const setBrowserBounds = command(z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }), async (bounds) => invokeNative<{ ok: boolean }>('browser.bounds', bounds));
export const openBrowserDevTools = command(z.object({}), async () => invokeNative<{ ok: boolean }>('browser.devtools', {}));
