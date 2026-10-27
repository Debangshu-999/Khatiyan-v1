/** Shrink only when needed, without making a heading smaller than its floor. */
export function modalTitleFontSize(availableWidth: number, naturalWidth: number, baseSize: number, minimumScale = 0.65) {
  if (availableWidth <= 0 || naturalWidth <= 0) return baseSize;
  return Math.max(baseSize * minimumScale, Math.min(baseSize, baseSize * Math.max(0, availableWidth - 2) / naturalWidth));
}
