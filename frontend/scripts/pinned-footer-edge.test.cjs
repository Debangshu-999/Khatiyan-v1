const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("the fixed bottom bar has the curved, slightly bolder line and the filter page's gap", () => {
  const footer = read("src/components/pinned-footer.tsx");
  assert.match(footer, /export function pinnedFooterEdge/);
  assert.match(footer, /borderTopWidth: 1\.5/);
  assert.match(footer, /borderLeftWidth: 1\.5/);
  assert.match(footer, /borderRightWidth: 1\.5/);
  assert.match(footer, /borderTopLeftRadius: 18/);
  assert.match(footer, /borderTopRightRadius: 18/);
  assert.match(footer, /\.\.\.pinnedFooterEdge\(colors\)/);
  assert.match(footer, /paddingBottom: insets\.bottom \+ spacing\.md/);
});

test("the bars that do not use PinnedFooter draw the same line", () => {
  for (const file of [
    "src/features/discovery/components/property-filter-modal.tsx",
    "src/features/discovery/metro/metro-line-screen.tsx",
    "app/owner-tenant-bills.tsx",
  ]) {
    assert.match(read(file), /\.\.\.pinnedFooterEdge\(colors\)/, file);
  }
  assert.match(read("app/owner-tenant-bills.tsx"), /paddingBottom: insets\.bottom \+ spacing\.md/);
});

test("the filter is its own circle beside the search box, which keeps only a grey cross", () => {
  const card = read("src/features/discovery/components/discovery-search-card.tsx");
  const box = card.slice(card.indexOf('accessibilityLabel="Search by area or city"'), card.indexOf('accessibilityLabel="Open property filters"'));
  assert.doesNotMatch(box, /backgroundColor: colors\.border, height: 24, width: 1/);
  assert.match(box, /borderRadius: 999/);
  assert.match(card, /<Funnel\s+color=[^\n]+\s+fill=/);
});

test("the filter cards have no icon, and a sentence-case label", () => {
  const modal = read("src/features/discovery/components/property-filter-modal.tsx");
  for (const section of modal.split("<ChoiceSection").slice(1)) {
    assert.doesNotMatch(section.slice(0, section.indexOf(">")), /icon=/);
  }
  const section = read("src/components/choice-section.tsx");
  assert.match(section, /icon\?: LucideIcon/);
  assert.match(section, /Icon \? \(/);
  assert.match(section, /textTransform: "none"/);
});

test("the search and Listing Results cards draw a shadow phones can see", () => {
  assert.match(read("src/features/discovery/components/discovery-search-card.tsx"), /<Card style=\{softShadow\(colors\.shadow, 4, 12\)\}>/);
  assert.match(read("app/(tabs)/discovery.tsx"), /overflow: "hidden", \.\.\.softShadow\(colors\.shadow, 4, 12\)/);
});

test("filter cards select in faded black, other choice sections keep their fill", () => {
  const section = read("src/components/choice-section.tsx");
  assert.match(section, /FadedSelection\.Provider value=\{!Icon\}/);
  assert.match(section, /selectedFill = faded && !isDark \? FADED_BLACK : colors\.inkSoft/);
});
