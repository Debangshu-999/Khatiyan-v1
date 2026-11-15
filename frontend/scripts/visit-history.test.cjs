const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const screen = read("app/owner-visits.tsx");

// Manage Visits (user, 2026-11-14).
test("History is a card beside Record external visit, not a tab", () => {
  assert.doesNotMatch(screen, /label: "History", value: "history"/);
  assert.match(screen, /<View style=\{\{ flexDirection: "row", gap: spacing\.sm \}\}>\s*<RecordExternalVisitCard[\s\S]{0,300}<VisitHistoryCard onPress=\{\(\) => router\.push\("\/owner-visits-history"\)\} \/>/);
  assert.match(read("app/owner-visits-history.tsx"), /<VisitsScreen view="history" \/>/);
  assert.match(read("app/_layout.tsx"), /<Stack\.Screen name="owner-visits-history" options=\{\{ headerShown: false \}\} \/>/);
});

test("Visit history shows the skeleton until its first page is in", () => {
  assert.match(screen, /if \(view === "history"\) \{[\s\S]{0,6000}\{cards\}/);
  assert.match(screen, /!historyQuery\.isError && historyItems\.length === 0 && \(!history \|\| historyQuery\.isFetching\)/);
});

test("an empty Today does not scroll: no spacer under the empty state, which centres above the fixed cards", () => {
  assert.match(screen, /\{showEarlierCard && !loading && !todayEmpty \? \(/);
  assert.match(screen, /footerHeight=\{showEarlierCard && tab === "today" \? stripHeight : undefined\}/);
});

test("Visit history has a sticky search by name or visit ID beside the status menu", () => {
  assert.match(screen, /stickyHeaderIndices=\{property \? \[1\] : \[\]\}/);
  assert.match(screen, /<SearchField onChangeText=\{setHistorySearch\} placeholder="Search by name or visit ID" value=\{historySearch\} \/>/);
  assert.match(screen, /search: historySearched, status: historyStatus/);
  assert.match(read("src/store/services/enquiry-chat-api.ts"), /params: \{ page, size: 12, status, \.\.\.\(search \? \{ search \} : \{\}\) \}/);
});

test("the bottom cards are white with coloured drawings, Record external has the short name, History has no count", () => {
  assert.match(screen, /<RecordExternalArt size=\{38\} \/>/);
  assert.match(screen, /<VisitHistoryArt size=\{38\} \/>/);
  assert.match(screen, /<EarlierTodayArt size=\{40\} \/>/);
  assert.match(screen, />Record external<\/Text>/);
  assert.doesNotMatch(screen, /historyCountQuery|historyTotal/);
});

test("an empty Upcoming or Missed has no filter pill", () => {
  assert.match(screen, /hideHeader=\{!loading && upcoming\.length === 0\}/);
  assert.match(screen, /hideHeader=\{!loading && missed\.length === 0\}/);
});
