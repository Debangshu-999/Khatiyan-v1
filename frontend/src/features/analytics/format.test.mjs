import assert from "node:assert/strict";
import test from "node:test";

import { compactPaise, formatDuration, formatPaise, formatStayLength, groupIndian, percentChange, percentOf } from "./format.ts";

test("groups digits the Indian way", () => {
  assert.equal(groupIndian(342000), "3,42,000");
  assert.equal(groupIndian(12345678), "1,23,45,678");
  assert.equal(groupIndian(999), "999");
});

test("formats paise as whole rupees", () => {
  assert.equal(formatPaise(34200000), "₹3,42,000");
  assert.equal(formatPaise(-150050), "-₹1,501");
  assert.equal(formatPaise(0), "₹0");
});

test("compacts into K, L and Cr without trailing zeros", () => {
  assert.equal(compactPaise(34200000), "₹3.42L");
  assert.equal(compactPaise(7500000), "₹75K");
  assert.equal(compactPaise(2910000), "₹29.1K");
  assert.equal(compactPaise(10000000), "₹1L");
  assert.equal(compactPaise(1500000000), "₹1.5Cr");
  assert.equal(compactPaise(90000), "₹900");
  assert.equal(compactPaise(-2910000), "-₹29.1K");
});

test("percent needs a denominator", () => {
  assert.equal(percentOf(342, 376), 91);
  assert.equal(percentOf(5, 0), null);
  assert.equal(percentChange(108, 100), 8);
  assert.equal(percentChange(5, 0), null);
});

test("durations pick a readable unit", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(150), "2.5 h");
  assert.equal(formatDuration(60 * 30), "30 h");
  assert.equal(formatDuration(60 * 24 * 3), "3 days");
  assert.equal(formatDuration(60 * 24), "24 h");
});

test("stay lengths read in days, then months, then years", () => {
  assert.equal(formatStayLength(1), "1 day");
  assert.equal(formatStayLength(45), "45 days");
  assert.equal(formatStayLength(148), "4.9 months");
  assert.equal(formatStayLength(400), "13 months");
  assert.equal(formatStayLength(800), "2.2 years");
});
