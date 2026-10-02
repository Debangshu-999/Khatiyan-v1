// Geometry for the chart kit. Pure and unit-tested: node --test imports this
// file directly, so it imports nothing.

export type DonutSegment = { index: number; start: number; length: number };

/** Slices in percent of the ring, clockwise from the top, with a surface gap between neighbours. */
export function donutSegments(values: number[], gap = 1): DonutSegment[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return [];
  const visible = values.filter((value) => value > 0).length;
  const segmentGap = visible > 1 ? gap : 0;
  const segments: DonutSegment[] = [];
  let cursor = 0;
  values.forEach((value, index) => {
    if (value <= 0) return;
    const share = (value / total) * 100;
    segments.push({ index, length: share > segmentGap * 2 ? share - segmentGap : share * 0.6, start: cursor });
    cursor += share;
  });
  return segments;
}

function coordinate(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * One donut slice as an SVG arc: starting `start` percent round from twelve
 * o'clock and running clockwise for `length` percent. Drawn as a path, not a
 * dashed circle, because a dash cannot cross a circle's own start point without
 * a rotation, and react-native-svg writes a rotation's origin as an invalid DOM
 * attribute on web.
 */
export function arcPath(cx: number, cy: number, radius: number, start: number, length: number): string {
  const r = coordinate(radius);
  if (length >= 99.999) {
    // An arc cannot end where it began, so a whole ring is two halves.
    return `M${coordinate(cx)},${coordinate(cy - radius)}A${r},${r} 0 1 1 ${coordinate(cx)},${coordinate(cy + radius)}A${r},${r} 0 1 1 ${coordinate(cx)},${coordinate(cy - radius)}`;
  }
  const from = -Math.PI / 2 + (2 * Math.PI * start) / 100;
  const to = from + (2 * Math.PI * length) / 100;
  const largeArc = length > 50 ? 1 : 0;
  return `M${coordinate(cx + radius * Math.cos(from))},${coordinate(cy + radius * Math.sin(from))}A${r},${r} 0 ${largeArc} 1 ${coordinate(cx + radius * Math.cos(to))},${coordinate(cy + radius * Math.sin(to))}`;
}

export type SegmentRect = { index: number; x: number; width: number };

/** One horizontal bar split by value, with a 2px gap between parts. Zero parts are skipped. */
export function segmentRects(values: number[], width: number, gap = 2): SegmentRect[] {
  const present = values.map((value, index) => ({ index, value: Math.max(0, value) })).filter((entry) => entry.value > 0);
  const total = present.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) return [];
  const usable = width - gap * (present.length - 1);
  let x = 0;
  return present.map((entry) => {
    const rect = { index: entry.index, width: (entry.value / total) * usable, x };
    x += rect.width + gap;
    return rect;
  });
}

function niceCeiling(max: number, steps: number[]): number {
  const base = 10 ** Math.floor(Math.log10(max));
  for (const step of steps) {
    if (step * base >= max) return step * base;
  }
  return 10 * base;
}

/** An axis that ends on a round number. Counts of five or fewer tick every whole number. */
export function axisScale(max: number, integer: boolean): { ceiling: number; ticks: number[] } {
  if (integer && max <= 5) {
    const ceiling = Math.max(1, Math.ceil(max));
    return { ceiling, ticks: Array.from({ length: ceiling + 1 }, (_, i) => i) };
  }
  const ceiling = max <= 0 ? 1 : niceCeiling(max, integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]);
  return { ceiling, ticks: [0, ceiling / 2, ceiling] };
}

/** An axis for values that can go negative (a margin in a loss month). It reaches below zero only when a value does. */
export function signedScale(values: number[]): { min: number; max: number; ticks: number[] } {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  if (low === 0 && high === 0) return { max: 1, min: 0, ticks: [0, 1] };
  const steps = [1, 2, 2.5, 5, 10];
  const max = high > 0 ? niceCeiling(high, steps) : 0;
  const min = low < 0 ? -niceCeiling(-low, steps) : 0;
  const ticks = min === 0 ? [0, max / 2, max] : max === 0 ? [min, min / 2, 0] : [min, 0, max];
  return { max, min, ticks };
}

export type LinePoint = { index: number; x: number; y: number };

/** A line's points, broken wherever a value is missing so a gap never draws as a slope. */
export function lineSegments(values: (number | null)[], x: (index: number) => number, y: (value: number) => number): LinePoint[][] {
  const segments: LinePoint[][] = [];
  let current: LinePoint[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ index, x: x(index), y: y(value) });
  });
  if (current.length) segments.push(current);
  return segments;
}

/** How many buckets an over-time chart shows before it scrolls sideways. */
export const BUCKETS_PER_VIEW = 5;

/**
 * One bucket's width and the whole plot's, for an over-time chart.
 *
 * Up to five buckets share the width that shows. Past five, each keeps a fifth
 * of it and the plot grows to the right, to be scrolled. A mark sits at the
 * middle of its slot, which also keeps the first one clear of the axis labels.
 */
export function plotLayout(viewport: number, bucketCount: number): { contentWidth: number; slot: number } {
  if (viewport <= 0 || bucketCount <= 0) return { contentWidth: Math.max(0, viewport), slot: 0 };
  const slot = viewport / Math.min(bucketCount, BUCKETS_PER_VIEW);
  return { contentWidth: slot * bucketCount, slot };
}

/** A column anchored to the baseline with only its top corners rounded. */
export function roundedTopBarPath(x: number, baseline: number, width: number, height: number, radius = 4): string {
  if (height <= 0) return "";
  const r = Math.min(radius, height, width / 2);
  const top = baseline - height;
  return `M${x},${baseline}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${baseline}Z`;
}

/** Which steps of an ordinal ramp to use for `count` buckets, spread from lightest to darkest. */
export function rampIndexes(count: number, steps: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.floor((steps - 1) / 2)];
  return Array.from({ length: count }, (_, i) => Math.round((i * (steps - 1)) / (count - 1)));
}
