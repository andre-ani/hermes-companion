import { describe, expect, it } from 'vitest';
import { normalizeBrowserBounds } from '../apps/desktop/electron/browser-view-geometry.cjs';

describe('native browser geometry', () => {
  it('clamps renderer geometry to the BrowserWindow content area', () => {
    expect(normalizeBrowserBounds({ x: 900, y: 40, width: 300, height: 900 }, [1000, 800])).toEqual({ x: 900, y: 40, width: 100, height: 760 });
  });

  it('rejects stale or off-screen geometry instead of creating a tiny detached view', () => {
    expect(normalizeBrowserBounds({ x: 1100, y: 40, width: 300, height: 300 }, [1000, 800])).toBeNull();
    expect(normalizeBrowserBounds({ x: 0, y: 0, width: 0, height: 300 }, [1000, 800])).toBeNull();
  });
});
