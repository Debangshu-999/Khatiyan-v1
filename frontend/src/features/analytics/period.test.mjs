import assert from "node:assert/strict";
import test from "node:test";

import { bucketLabel, customRangeErrors, formatDateRange, formatMonthRange, istToday, periodLine, periodSectionTitle, presetSubtitle } from "./period.ts";

test("trend buckets are labelled short enough for an axis", () => {
  assert.equal(bucketLabel("2026-07-01", "2026-07-31", "MONTH"), "Jul");
  assert.equal(bucketLabel("2026-04-01", "2026-06-30", "QUARTER"), "Apr–Jun");
  assert.equal(bucketLabel("2025-04-01", "2026-03-31", "YEAR"), "FY25–26");
  assert.equal(bucketLabel("2026-09-01", "2026-09-26", "NONE"), "Sep");
});

test("today is the IST date even when UTC is still yesterday", () => {
  assert.equal(istToday(new Date("2026-09-25T19:00:00Z")), "2026-09-26");
  assert.equal(istToday(new Date("2026-09-25T18:00:00Z")), "2026-09-25");
});

test("date ranges drop what repeats", () => {
  assert.equal(formatDateRange("2026-07-01", "2026-09-26"), "1 Jul – 26 Sep 2026");
  assert.equal(formatDateRange("2026-09-01", "2026-09-26"), "1 – 26 Sep 2026");
  assert.equal(formatDateRange("2025-11-14", "2026-02-02"), "14 Nov 2025 – 2 Feb 2026");
  assert.equal(formatDateRange("2026-09-26", "2026-09-26"), "26 Sep 2026");
});

test("each preset explains its dates", () => {
  const today = "2026-09-26";
  assert.equal(presetSubtitle("THIS_MONTH", today, null), "Sep 2026, so far");
  assert.equal(presetSubtitle("LAST_MONTH", today, null), "August 2026");
  assert.equal(presetSubtitle("LAST_3_MONTHS", today, null), "Jul – Sep 2026");
  assert.equal(presetSubtitle("LAST_6_MONTHS", today, null), "Apr – Sep 2026");
  assert.equal(presetSubtitle("CURRENT_FY", today, null), "FY 2026–27, from 1 Apr");
  assert.equal(presetSubtitle("CURRENT_FY", "2026-02-10", null), "FY 2025–26, from 1 Apr");
  assert.equal(presetSubtitle("ALL_TIME", today, "2026-01-14"), "Since Jan 2026");
  assert.equal(presetSubtitle("ALL_TIME", today, null), "Since this property joined");
  assert.equal(presetSubtitle("CUSTOM", today, null), "Pick a start and end date");
  assert.equal(presetSubtitle("LAST_3_MONTHS", "2026-01-15", null), "Nov 2025 – Jan 2026");
});

test("month ranges name months, never days", () => {
  assert.equal(formatMonthRange("2026-09-01", "2026-09-26"), "Sep 2026");
  assert.equal(formatMonthRange("2026-07-01", "2026-09-26"), "Jul – Sep 2026");
  assert.equal(formatMonthRange("2025-11-14", "2026-02-02"), "Nov 2025 – Feb 2026");
});

test("the period line and section title come from the server's dates, as months", () => {
  const period = { preset: "LAST_3_MONTHS", from: "2026-07-01", to: "2026-09-26", compareFrom: "2026-04-01", compareTo: "2026-06-26", bucket: "MONTH", dataSince: "2026-01-14" };
  assert.equal(periodLine(period), "Jul – Sep 2026 vs Apr – Jun 2026");
  assert.equal(periodLine({ ...period, preset: "THIS_MONTH", from: "2026-09-01", compareFrom: "2026-08-01", compareTo: "2026-08-26" }), "Sep 2026 vs Aug 2026");
  assert.equal(periodLine({ ...period, compareFrom: null, compareTo: null }), "Jul – Sep 2026");
  assert.equal(periodSectionTitle(period), "Last 3 months");
  assert.equal(periodSectionTitle({ ...period, preset: "CUSTOM", from: "2026-07-01", to: "2026-08-15" }), "1 Jul – 15 Aug 2026");
});

test("custom range errors match the server's", () => {
  assert.deepEqual(customRangeErrors(null, null, "2026-09-26", "2026-01-14"), { from: "Pick a start date", to: "Pick an end date" });
  assert.deepEqual(customRangeErrors("2026-01-01", "2026-09-30", "2026-09-26", "2026-01-14"), {
    from: "Pick a start date on or after 14 Jan 2026",
    to: "Pick an end date no later than today",
  });
  assert.deepEqual(customRangeErrors("2026-08-20", "2026-08-03", "2026-09-26", "2026-01-14"), { to: "Pick an end date on or after the start date" });
  assert.deepEqual(customRangeErrors("2026-07-01", "2026-08-15", "2026-09-26", "2026-01-14"), {});
});
