import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const desktop = new URL('../apps/desktop/src/', import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, desktop), 'utf8');
}

describe('desktop density system', () => {
  it('defines one compact control scale and shell spacing vocabulary', async () => {
    const css = await source('app.css');

    expect(css).toContain('--control-height-sm: 1.5rem');
    expect(css).toContain('--control-height-md: 2rem');
    expect(css).toContain('--control-height-lg: 2rem');
    expect(css).toContain('--density-gap: 0.5rem');
    expect(css).toContain('--panel-padding: 0.625rem');
    expect(css).toContain('--shell-header-height: 2.625rem');
  });

  it.each([
    ['button', 'lib/components/ui/button/button.svelte'],
    ['input', 'lib/components/ui/input/input.svelte'],
    ['select', 'lib/components/ui/select/select-trigger.svelte'],
    ['input group', 'lib/components/ui/input-group/input-group.svelte'],
    ['toggle', 'lib/components/ui/toggle/toggle.svelte'],
    ['tabs', 'lib/components/ui/tabs/tabs-list.svelte']
  ])('%s consumes the shared standard control height', async (_name, path) => {
    expect(await source(path)).toContain('var(--control-height-md)');
  });

  it('uses the shared titlebar height across the workspace and inspector', async () => {
    const page = await source('routes/+page.svelte');
    const dock = await source('lib/components/companion/workspace-dock.svelte');

    expect(page).toContain('.workspace-header { min-block-size: var(--shell-titlebar-height)');
    expect(dock).toContain('min-block-size: var(--shell-titlebar-height)');
  });

  it('keeps the coding editor keyboard-operable and clearly labelled', async () => {
    const dock = await source('lib/components/companion/workspace-dock.svelte');
    const editor = await source('lib/components/companion/code-editor.svelte');

    expect(dock).toContain('file-editor-panel');
    expect(dock).toContain('⌘S');
    expect(editor).toContain("key: 'Mod-s'");
    expect(editor).toContain("'aria-keyshortcuts': 'Meta+S Control+S'");
  });

  it('keeps capability inventory out of the normal session sidebar', async () => {
    const page = await source('routes/+page.svelte');
    const settingsNavigation = await source('lib/components/companion/settings-navigation.svelte');

    expect(page).toContain('class="sidebar-actions"');
    expect(page).toContain('<SettingsNavigation');
    expect(settingsNavigation).toContain('class="settings-nav"');
    expect(page).toContain('class="status-bar"');
    expect(page).toContain("data-native-platform={nativePlatform}");
    expect(page).not.toContain('class="sidebar-operations"');
  });

  it('reserves macOS titlebar space from the native preload platform', async () => {
    const page = await source('routes/+page.svelte');
    const preload = await readFile(new URL('../apps/desktop/electron/preload.cjs', import.meta.url), 'utf8');

    expect(preload).toContain('platform: process.platform');
    expect(page).toContain(".companion-shell[data-native-platform='darwin'] { --window-safe-inline-start: var(--titlebar-safe-inline-start); }");
    expect(page).toContain('.chrome-leading { inset-inline-start: var(--window-safe-inline-start); }');
    expect(page).toContain('.session-sidebar { grid-column: 1; grid-row: 1;');
    expect(page).toContain('padding-block-start: var(--shell-titlebar-height)');
  });

  it('makes a verified Dashboard-only connection explicit instead of retaining a dead Agent default', async () => {
    const connectionDialog = await source('lib/components/companion/connection-dialog.svelte');

    expect(connectionDialog).toContain('else if (result.control.compatible) url = result.control.url');
    expect(connectionDialog).toContain('Dashboard-only hosts use their verified Dashboard URL');
  });
});
