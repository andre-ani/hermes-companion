import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const desktopSource = new URL('../apps/desktop/src/', import.meta.url);
const electronSource = new URL('../apps/desktop/electron/', import.meta.url);
const source = (path: string) => readFile(new URL(path, desktopSource), 'utf8');

async function electronSources() {
  const entries = await readdir(electronSource, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.cjs'))
    .map((entry) => entry.name)
    .sort();
  return (await Promise.all(files.map(async (file) => `\n/* ${file} */\n${await readFile(new URL(file, electronSource), 'utf8')}`))).join('\n');
}

function componentInvocation(contents: string, name: string) {
  const start = contents.search(new RegExp(`<${name}(?:\\s|/?>)`));
  if (start < 0) return '';
  const end = contents.indexOf('/>', start);
  return contents.slice(start, end < 0 ? start + 1_000 : end + 2);
}

function reactiveEffects(contents: string) {
  const starts = [...contents.matchAll(/\$effect\s*\(/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  return starts.map((start) => contents.slice(start, start + 1_200));
}

function eventHandlers(contents: string, event: string) {
  const escaped = event.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...contents.matchAll(new RegExp(`\\.(?:on|once)\\(\\s*(['\"])${escaped}\\1`, 'g'))];
  return matches.map((match) => contents.slice(match.index ?? 0, (match.index ?? 0) + 900));
}

function functionSource(contents: string, name: string) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(contents);
  if (!match) return '';
  const start = match.index;
  const next = contents.slice(start + match[0].length).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/);
  return contents.slice(start, next < 0 ? contents.length : start + match[0].length + next);
}

const browserCleanup = /(?:browser.{0,80}(?:close|release|detach|dispose)|(?:close|release|detach|dispose).{0,80}browser)/is;

describe('native BrowserView ownership', () => {
  it('derives one dock/browser owner from both the active profile and session context', async () => {
    const page = await source('routes/+page.svelte');
    const layoutIdentityStart = page.indexOf('const workspaceLayoutIdentity');
    const layoutIdentityEnd = layoutIdentityStart < 0 ? -1 : page.indexOf('const inspectorOwnerKey', layoutIdentityStart);
    const layoutIdentity = layoutIdentityStart < 0 ? '' : page.slice(layoutIdentityStart, layoutIdentityEnd < 0 ? layoutIdentityStart + 1_200 : layoutIdentityEnd);
    const ownerKeyStart = page.indexOf('const inspectorOwnerKey');
    const ownerKeyEnd = ownerKeyStart < 0 ? -1 : page.indexOf(';', ownerKeyStart);
    const ownerKeyDeclaration = ownerKeyStart < 0 ? '' : page.slice(ownerKeyStart, ownerKeyEnd < 0 ? ownerKeyStart + 500 : ownerKeyEnd + 1);
    const dockInvocation = componentInvocation(page, 'WorkspaceDock');

    expect.soft(/owner\.profileId/.test(layoutIdentity), 'layout identity must preserve the visible profile owner').toBe(true);
    expect.soft(/owner\.sessionId\s*!==\s*activeSessionId/.test(layoutIdentity), 'layout identity must reject a stale visible session owner').toBe(true);
    expect.soft(/connectionId:\s*owner\.connectionId[\s\S]*profileId:\s*owner\.profileId[\s\S]*kind:\s*['"]session['"][\s\S]*id:\s*owner\.sessionId/.test(layoutIdentity), 'session layout ownership must include connection, profile, and session identity').toBe(true);
    expect.soft(/workspaceLayoutOwnerKey\(workspaceLayoutIdentity\)/.test(ownerKeyDeclaration), 'browser owner key must derive from the typed workspace layout identity').toBe(true);
    expect.soft(/\b(?:browserOwnerKey|ownerKey)\b(?:=\{[^}]*(?:inspector|dock|browser)[A-Za-z]*Owner[A-Za-z]*\})?/i.test(dockInvocation), 'WorkspaceDock must receive the root-owned browser owner key').toBe(true);
    expect.soft(/(?:\{inspectorVisible\}|(?:visible|inspectorVisible)=\{inspectorVisible\})/.test(dockInvocation), 'WorkspaceDock must receive root inspector visibility').toBe(true);
  });

  it('carries owner and generation/lease identity through every typed browser command', async () => {
    const [remote, main] = await Promise.all([
      source('lib/client/remote/browser.remote.ts'),
      readFile(new URL('main.cjs', electronSource), 'utf8')
    ]);
    const browserCasesStart = main.indexOf("case 'browser.open'");
    const browserCasesEnd = main.indexOf("case 'notification.status'", browserCasesStart);
    const browserCases = browserCasesStart < 0 ? '' : main.slice(browserCasesStart, browserCasesEnd < 0 ? browserCasesStart + 3_000 : browserCasesEnd);

    expect.soft(/\bowner(?:Key|Id)\b/.test(remote), 'typed browser commands must require an owner key').toBe(true);
    expect.soft(/\b(?:browserLeaseId|leaseId|viewId|generation)\b/.test(remote), 'typed browser commands must require a view generation or lease').toBe(true);
    expect.soft(/input\.owner(?:Key|Id)/.test(browserCases), 'native browser dispatch must forward the owner key').toBe(true);
    expect.soft(/input\.(?:browserLeaseId|leaseId|viewId|generation)/.test(browserCases), 'native browser dispatch must forward generation or lease identity').toBe(true);
  });

  it('claims and releases each browser lease explicitly', async () => {
    const [remote, dock, main] = await Promise.all([
      source('lib/client/remote/browser.remote.ts'),
      source('lib/components/companion/workspace-dock.svelte'),
      readFile(new URL('main.cjs', electronSource), 'utf8')
    ]);

    expect.soft(/export\s+const\s+claimBrowser\b[\s\S]*?['"]browser\.claim['"]/.test(remote), 'the typed adapter must expose an explicit browser claim').toBe(true);
    expect.soft(/export\s+const\s+releaseBrowser\b[\s\S]*?['"]browser\.release['"]/.test(remote), 'the typed adapter must expose an explicit browser release').toBe(true);
    expect.soft(/claimBrowser\s*\(\s*identity\s*\)/.test(dock), 'the visible dock must claim its current identity before using the browser').toBe(true);
    expect.soft(/releaseBrowser\s*\(\s*\{[^}]*ownerKey[^}]*browserLeaseId/s.test(dock), 'dock teardown must release the exact owner and lease').toBe(true);
    expect.soft(/case\s+['"]browser\.claim['"][\s\S]{0,180}input\.ownerKey[\s\S]{0,180}input\.browserLeaseId/.test(main), 'native claim dispatch must receive both identity fields').toBe(true);
    expect.soft(/case\s+['"]browser\.release['"][\s\S]{0,180}input\.ownerKey[\s\S]{0,180}input\.browserLeaseId/.test(main), 'native release dispatch must receive both identity fields').toBe(true);
  });

  it('parks an inactive Browser tab without destroying its session context', async () => {
    const [page, dock, main] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/components/companion/workspace-dock.svelte'),
      readFile(new URL('main.cjs', electronSource), 'utf8')
    ]);
    const release = functionSource(main, 'releaseBrowserView');

    expect.soft(/lease belongs to the logical workspace owner, not to tab visibility/.test(page), 'tab visibility must not rotate the logical browser lease').toBe(true);
    expect.soft(/async function parkBrowserView\s*\([^)]*\)[\s\S]*?setBrowserBounds\s*\(\s*\{[^}]*width:\s*1,[^}]*height:\s*1/s.test(dock), 'an inactive Browser tab must park its native view instead of releasing it').toBe(true);
    expect.soft(/if\s*\(isBrowserVisible\)[\s\S]*?void parkBrowserView\(identity\)/s.test(dock), 'tab visibility teardown must use the parking path').toBe(true);
    expect.soft(/function\s+browserOwnerKeyFor\s*\(owner:\s*WorkspaceLayoutOwner\s*\|\s*null\)/.test(page), 'browser ownership must be derived from the logical workspace resource').toBe(true);
    expect.soft(/<WorkspaceDock[\s\S]*\{browserOwnerKey\}/.test(page), 'the dock must remain mounted while layout hydration reconciles').toBe(true);
    expect.soft(/const\s+ownerKey\s*=\s*browserOwnerKey[\s\S]{0,120}const\s+leaseId\s*=\s*browserLeaseId[\s\S]{0,220}releaseBrowserLease\(ownerKey,\s*leaseId\)/.test(dock), 'dock cleanup must release the identity captured by the outgoing activation').toBe(true);
    expect.soft(/if\s*\(\s*!sameBrowserIdentity\(ownerKey,\s*browserLeaseId\)\s*\)\s*return\s*\{\s*ok:\s*false\s*\}/.test(release), 'a delayed release must be rejected before native view destruction').toBe(true);
  });

  it('keeps preview attachment on the same governed browser identity path', async () => {
    const [previews, main] = await Promise.all([
      source('lib/client/remote/previews.remote.ts'),
      readFile(new URL('main.cjs', electronSource), 'utf8')
    ]);

    expect.soft(/invokeNative\(\s*['"]preview\.open['"]\s*,\s*\{[^}]*leaseId[^}]*ownerKey[^}]*browserLeaseId[^}]*\}/s.test(previews), 'preview.open must forward its preview lease, owner, and browser lease').toBe(true);
    expect.soft(/case\s+['"]preview\.open['"][\s\S]{0,220}openBrowserView\(\s*input\.leaseId\s*,\s*input\.ownerKey\s*,\s*input\.browserLeaseId\s*\)/.test(main), 'native preview dispatch must preserve the complete browser identity').toBe(true);
  });

  it('rejects stale browser and preview loads after an owner or lease changes', async () => {
    const main = await readFile(new URL('main.cjs', electronSource), 'utf8');
    const loaders = ['openGeneralBrowser', 'navigateBrowser', 'openBrowserView'].map((name) => ({ name, source: functionSource(main, name) }));

    for (const loader of loaders) {
      expect.soft(loader.source.includes('loadURL('), `${loader.name} must perform a governed asynchronous load`).toBe(true);
      expect.soft(/sameBrowserIdentity\(\s*ownerKey\s*,\s*browserLeaseId\s*\)/.test(loader.source), `${loader.name} must re-check identity after loading`).toBe(true);
      expect.soft(/browserViewController\.view\s*!==\s*view/.test(loader.source), `${loader.name} must reject a superseded native view`).toBe(true);
    }
  });

  it('resets fullscreen layout whenever an owned view closes or releases', async () => {
    const main = await readFile(new URL('main.cjs', electronSource), 'utf8');
    const destroy = functionSource(main, 'destroyBrowserView');
    const close = functionSource(main, 'closeBrowserView');
    const release = functionSource(main, 'releaseBrowserView');

    expect.soft(/browserViewController\.layout\s*=\s*['"]dock['"]/.test(destroy), 'destroying a view must reset layout to docked').toBe(true);
    expect.soft(/destroyBrowserView\s*\(/.test(close), 'browser.close must use the layout-resetting destroy path').toBe(true);
    expect.soft(/destroyBrowserView\s*\(/.test(release), 'browser.release must use the layout-resetting destroy path').toBe(true);
  });

  it('does not let background annotation refresh attach a native preview', async () => {
    const annotations = await source('lib/client/remote/annotations.remote.ts');

    expect.soft(/invokeNative\(\s*['"]preview\.register['"]/.test(annotations), 'annotation refresh may register updated preview metadata').toBe(true);
    expect.soft(/invokeNative\(\s*['"]preview\.open['"]/.test(annotations), 'background annotation refresh must not open or attach a native preview').toBe(false);
  });

  it('releases or detaches the native browser when its dock hides or its owner changes', async () => {
    const [page, dock] = await Promise.all([
      source('routes/+page.svelte'),
      source('lib/components/companion/workspace-dock.svelte')
    ]);
    const effects = [...reactiveEffects(page), ...reactiveEffects(dock)];
    const ownsVisibilityTeardown = effects.some((effect) => /\b(?:inspectorVisible|visible)\b/.test(effect) && browserCleanup.test(effect));
    const ownsOwnerChangeTeardown = effects.some((effect) => /\b(?:browserOwnerKey|ownerKey|inspectorOwnerKey)\b/.test(effect) && browserCleanup.test(effect));

    expect.soft(ownsVisibilityTeardown, 'an inspector-visibility effect must release or detach its native browser').toBe(true);
    expect.soft(ownsOwnerChangeTeardown, 'an owner-change effect must release or detach the previous native browser').toBe(true);
  });

  it('tears down the native browser on renderer reload, renderer crash, and BrowserWindow close', async () => {
    const electron = await electronSources();
    const reloadHandlers = ['did-start-navigation', 'did-start-loading', 'will-navigate']
      .flatMap((event) => eventHandlers(electron, event));
    const crashHandlers = eventHandlers(electron, 'render-process-gone');
    const windowCloseHandlers = ['close', 'closed'].flatMap((event) => eventHandlers(electron, event));

    expect.soft(reloadHandlers.some((handler) => browserCleanup.test(handler)), 'renderer reload/navigation must release the native browser').toBe(true);
    expect.soft(crashHandlers.some((handler) => browserCleanup.test(handler)), 'renderer crash must release the native browser').toBe(true);
    expect.soft(windowCloseHandlers.some((handler) => browserCleanup.test(handler)), 'BrowserWindow close must release the native browser').toBe(true);
  });

  it('keeps native bounds inside the content coordinate system and detaches stale geometry', async () => {
    const electron = await electronSources();
    const main = await readFile(new URL('main.cjs', electronSource), 'utf8');
    expect.soft(main.includes("require('./browser-view-geometry.cjs')"), 'native bounds must be normalized by the Electron owner').toBe(true);
    const boundsHandler = main.slice(main.indexOf("case 'browser.bounds'"), main.indexOf("case 'browser.layout'"));
    expect.soft(/setViewBounds\(\)/.test(boundsHandler), 'bounds updates must flow through the native geometry owner').toBe(true);
    const setBounds = functionSource(main, 'setViewBounds');
    expect.soft(/normalizeBrowserBounds\(bounds,\s*\[width,\s*height\]\)/.test(setBounds), 'renderer geometry must be clamped to BrowserWindow content size').toBe(true);
    expect.soft(/detachBrowserView\(view\)/.test(setBounds), 'stale or off-screen geometry must detach instead of pinning a tiny view').toBe(true);
    expect.soft(/did-start-loading/.test(electron), 'renderer loading must release native browser ownership').toBe(true);
  });

  it('converges the dock after native browser teardown or a failed open', async () => {
    const dock = await source('lib/components/companion/workspace-dock.svelte');
    const openWeb = functionSource(dock, 'openWeb');
    const visibilityEffects = reactiveEffects(dock).filter((effect) => /isBrowserVisible/.test(effect));

    expect.soft(/stopBrowserGeometrySync\(\)/.test(openWeb), 'failed native opens must stop the renderer geometry loop').toBe(true);
    expect.soft(/browserState\s*=\s*closedBrowserState\(\)/.test(openWeb), 'failed native opens must close the renderer browser state').toBe(true);
    expect.soft(/browserOperationGeneration/.test(openWeb) && /current\(\)/.test(openWeb), 'stale open completions must not mutate a newer browser activation').toBe(true);
    expect.soft(/loadBrowserStatus\(\{\s*invalidatePendingOpen:\s*true\s*\}\)/.test(dock), 'activation status reconciliation must invalidate an in-flight open for the prior lease state').toBe(true);
    expect.soft(visibilityEffects.some((effect) => /loadBrowserStatus\(/.test(effect)), 'new leases must reconcile against native status instead of only claiming').toBe(true);
  });

  it('does not keep an unowned raw BrowserView or layout alive at app scope', async () => {
    const main = await readFile(new URL('main.cjs', electronSource), 'utf8');

    expect.soft(/^let browserView\s*(?:;|=)/m.test(main), 'raw BrowserView must be encapsulated by an owner-aware controller').toBe(false);
    expect.soft(/^let browserViewKind\s*(?:;|=)/m.test(main), 'browser kind must live inside the owned view lease').toBe(false);
    expect.soft(/^let browserViewBounds\s*(?:;|=)/m.test(main), 'browser bounds must live inside the owned view lease').toBe(false);
    expect.soft(/^let browserLayout\s*(?:;|=)/m.test(main), 'browser layout must live inside the owned view lease').toBe(false);
    expect.soft(main.includes('open: Boolean(browserView)'), 'browser status must not treat a stale pointer as an open owned view').toBe(false);
  });
});
