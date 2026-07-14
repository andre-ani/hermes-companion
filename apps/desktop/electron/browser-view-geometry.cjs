// BrowserView/WebContentsView bounds are owned by the Electron process.
// Renderer rectangles are advisory and may be stale during pane motion or
// teardown, so normalize them before they reach contentView.
function normalizeBrowserBounds(input, contentSize) {
  const contentWidth = Number(contentSize?.[0]);
  const contentHeight = Number(contentSize?.[1]);
  if (!Number.isFinite(contentWidth) || !Number.isFinite(contentHeight) || contentWidth < 1 || contentHeight < 1) return null;

  const values = [input?.x, input?.y, input?.width, input?.height].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [x, y, width, height] = values.map((value) => Math.round(value));
  if (width < 1 || height < 1 || x >= contentWidth || y >= contentHeight) return null;

  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(contentWidth, left + width);
  const bottom = Math.min(contentHeight, top + height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

module.exports = { normalizeBrowserBounds };
