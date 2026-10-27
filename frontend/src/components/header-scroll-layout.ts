/** Shared by the header interpolation and its scroll container. */
export const SCREEN_HEADER_COLLAPSE_DISTANCE = 72;

/**
 * Whether a page fits the screen with nothing to scroll to: what is on it,
 * not counting the breathing room under its last piece, is no taller than the
 * screen. Unmeasured, it is not known to fit, so scrolling is left alone.
 */
export function contentFitsWithoutScroll(contentHeight: number, paddingBottom: number, viewportHeight: number) {
  return viewportHeight > 0 && contentHeight > 0 && contentHeight - paddingBottom <= viewportHeight + 1;
}

export function getHeaderScrollMinHeight(viewportHeight: number, callerMinHeight = 0) {
  if (viewportHeight <= 0) return undefined;
  // Collapsing the header reduces natural content height. Keep the minimum
  // scroll range independent of that height so even short pages can reach 1.
  return Math.max(callerMinHeight, viewportHeight + SCREEN_HEADER_COLLAPSE_DISTANCE);
}
