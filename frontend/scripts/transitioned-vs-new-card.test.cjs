const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Metric #43 (P1.1.d, 2026-10-31).
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const cards = read("src/features/analytics/cards/tenants-cards.tsx");
const card = cards.slice(cards.indexOf("export function TransitionedVsNewCard"), cards.indexOf("const AGREEMENTS_ENDING"));

test("the card reads the two parts the server sends, as a segmented bar", () => {
  assert.match(card, /key: "TRANSITIONED", label: "Transitioned"/);
  assert.match(card, /key: "NEW", label: "New"/);
  assert.match(card, /<SegmentedBar /);
});

test("the card has an empty line for a period with nobody joining", () => {
  assert.match(card, /emptyText="Nobody joined in this period"/);
});

test("the card is registered and sits beside the move-ins it splits", () => {
  assert.match(read("src/features/analytics/registry.ts"), /"tenants\.transitioned_vs_new": TransitionedVsNewCard/);
  assert.match(read("src/features/analytics/divisions.ts"), /"tenants\.moves", "tenants\.transitioned_vs_new"/);
});

test("its copy has no semicolons", () => {
  assert.doesNotMatch(card.slice(card.indexOf("info={["), card.indexOf("onRetry={onRetry}")), /;/);
});
