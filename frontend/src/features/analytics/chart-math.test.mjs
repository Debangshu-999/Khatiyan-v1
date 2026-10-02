import assert from "node:assert/strict";
import test from "node:test";

import { arcPath, axisScale, donutSegments, lineSegments, plotLayout, rampIndexes, roundedTopBarPath, segmentRects, signedScale } from "./chart-math.ts";

test("a plot shows five buckets, then grows to the right", () => {
  // Up to five share the width.
  assert.deepEqual(plotLayout(300, 1), { contentWidth: 300, slot: 300 });
  assert.deepEqual(plotLayout(300, 3), { contentWidth: 300, slot: 100 });
  assert.deepEqual(plotLayout(300, 5), { contentWidth: 300, slot: 60 });
  // Past five, a bucket keeps a fifth and the plot is wider than what shows.
  assert.deepEqual(plotLayout(300, 6), { contentWidth: 360, slot: 60 });
  assert.deepEqual(plotLayout(300, 12), { contentWidth: 720, slot: 60 });
  // Nothing to lay out before the chart is measured, or with no buckets.
  assert.deepEqual(plotLayout(0, 6), { contentWidth: 0, slot: 0 });
  assert.deepEqual(plotLayout(300, 0), { contentWidth: 300, slot: 0 });
});

test("a signed scale reaches below zero only when a value does", () => {
  assert.deepEqual(signedScale([12, 30, 24]), { max: 50, min: 0, ticks: [0, 25, 50] });
  assert.deepEqual(signedScale([-8, 20]), { max: 20, min: -10, ticks: [-10, 0, 20] });
  assert.deepEqual(signedScale([-30, -5]), { max: 0, min: -50, ticks: [-50, -25, 0] });
  assert.deepEqual(signedScale([0, 0]), { max: 1, min: 0, ticks: [0, 1] });
});

test("a line breaks where a value is missing", () => {
  const segments = lineSegments([10, null, 30, 40], (i) => i * 10, (v) => 100 - v);
  assert.deepEqual(segments, [
    [{ index: 0, x: 0, y: 90 }],
    [{ index: 2, x: 20, y: 70 }, { index: 3, x: 30, y: 60 }],
  ]);
});

test("arcs start at twelve o'clock and run clockwise", () => {
  assert.equal(arcPath(50, 50, 40, 0, 25), "M50,10A40,40 0 0 1 90,50");
  assert.equal(arcPath(50, 50, 40, 25, 50), "M90,50A40,40 0 0 1 10,50");
  assert.equal(arcPath(50, 50, 40, 0, 75), "M50,10A40,40 0 1 1 10,50");
  assert.equal(arcPath(50, 50, 40, 0, 100), "M50,10A40,40 0 1 1 50,90A40,40 0 1 1 50,10");
});

test("donut segments share 100 with a gap between them", () => {
  const segments = donutSegments([48, 42, 6, 2, 2]);
  assert.equal(segments.length, 5);
  assert.deepEqual(segments[0], { index: 0, start: 0, length: 47 });
  assert.equal(segments[1].start, 48);
  assert.deepEqual(donutSegments([0, 0]), []);
  assert.deepEqual(donutSegments([0, 5]), [{ index: 1, start: 0, length: 100 }]);
});

test("segment rects fill the width with 2px gaps and skip zeros", () => {
  const rects = segmentRects([1, 0, 1], 102);
  assert.equal(rects.length, 2);
  assert.deepEqual(rects[0], { index: 0, x: 0, width: 50 });
  assert.deepEqual(rects[1], { index: 2, x: 52, width: 50 });
});

test("axis scales keep counts whole", () => {
  assert.deepEqual(axisScale(3, true), { ceiling: 3, ticks: [0, 1, 2, 3] });
  assert.deepEqual(axisScale(0, true), { ceiling: 1, ticks: [0, 1] });
  assert.deepEqual(axisScale(8, true), { ceiling: 10, ticks: [0, 5, 10] });
  assert.deepEqual(axisScale(22, true), { ceiling: 50, ticks: [0, 25, 50] });
  assert.deepEqual(axisScale(950000, false), { ceiling: 1000000, ticks: [0, 500000, 1000000] });
  assert.deepEqual(axisScale(230000, false), { ceiling: 250000, ticks: [0, 125000, 250000] });
});

test("bars round only their top corners", () => {
  assert.equal(roundedTopBarPath(10, 100, 20, 50), "M10,100V54Q10,50 14,50H26Q30,50 30,54V100Z");
  assert.equal(roundedTopBarPath(10, 100, 20, 0), "");
  assert.equal(roundedTopBarPath(10, 100, 20, 2), "M10,100V100Q10,98 12,98H28Q30,98 30,100V100Z");
});

test("ramp picks spread evenly from the steps", () => {
  assert.deepEqual(rampIndexes(5, 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(rampIndexes(3, 5), [0, 2, 4]);
  assert.deepEqual(rampIndexes(4, 5), [0, 1, 3, 4]);
  assert.deepEqual(rampIndexes(1, 5), [2]);
});
