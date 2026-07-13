import { command, query } from '$app/server';
import { z } from '@hermes-companion/contracts';
import { invokeNative } from '$lib/server/native-client';

const browserIdentity = z.object({ ownerKey: z.string().min(1), browserLeaseId: z.string().min(1) });
const browserUrl = browserIdentity.extend({ url: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Browser URL must use HTTP or HTTPS') });
type BrowserState = { open: boolean; kind: 'general' | 'preview' | null; url: string | null; fullscreen: boolean; ownerKey: string | null; browserLeaseId: string | null };

export const claimBrowser = command(browserIdentity, async (identity) => invokeNative<{ ok: boolean }>('browser.claim', identity));
export const releaseBrowser = command(browserIdentity, async (identity) => invokeNative<{ ok: boolean }>('browser.release', identity));
export const getBrowserStatus = query(browserIdentity, async (identity) => invokeNative<BrowserState>('browser.status', identity));
export const openGeneralBrowser = command(browserUrl, async (input) => invokeNative<BrowserState>('browser.open', input));
export const navigateBrowser = command(browserUrl, async (input) => invokeNative<BrowserState>('browser.navigate', input));
export const controlBrowser = command(browserIdentity.extend({ action: z.enum(['back', 'forward', 'reload', 'close']) }), async ({ action, ...identity }) => invokeNative<BrowserState | { ok: boolean }>(`browser.${action}`, identity));
export const setBrowserFullscreen = command(browserIdentity.extend({ fullscreen: z.boolean() }), async (input) => invokeNative<{ ok: boolean; fullscreen: boolean }>('browser.layout', input));
export const setBrowserBounds = command(browserIdentity.extend({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }), async (input) => invokeNative<{ ok: boolean }>('browser.bounds', input));
export const openBrowserDevTools = command(browserIdentity, async (identity) => invokeNative<{ ok: boolean }>('browser.devtools', identity));
