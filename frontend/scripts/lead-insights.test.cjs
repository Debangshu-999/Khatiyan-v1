const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// The Leads insights screen (user, 2026-10-18).
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const screen = read("app/owner-leads-insights.tsx");
const home = read("app/(tabs)/index.tsx");
const api = read("src/store/services/lead-api.ts");

test("the biggest drop names the step people did not reach, as people", () => {
  assert.match(screen, /`Biggest drop: \$\{STEP_PEOPLE\[drop\.toStep\]\.toLowerCase\(\)\}`/);
  assert.match(screen, /GOT_IN_TOUCH: "People who got in touch"/);
  assert.match(screen, /OPENED: "People who opened your listing"/);
  assert.match(screen, /GOT_IN_TOUCH: "did not get in touch"/);
});

test("one screen holds the funnel, every lead figure and the graphs", () => {
  for (const section of [
    "What people did after opening",
    "From opening to moving in",
    "Viewed and contacted",
    "Time on your listing",
    "When people look at your listing",
    "Where they found your listing",
    "Enquiries",
    "Visits and bookings",
    "Why leads were lost",
    "Coming back",
  ]) {
    assert.ok(screen.includes(`title="${section}"`), `Missing section ${section}`);
  }
});

// The same pieces as the other Insights screens (user, 2026-10-18): the thin donut, chart cards, stat tiles.
test("it is built from the shared chart kit", () => {
  for (const piece of ["<Donut", "<ChartCard", "<StatTile", "<LineChart", "<BarList", "<SegmentedBar"]) {
    assert.ok(screen.includes(piece), `Missing ${piece}`);
  }
  assert.doesNotMatch(screen, /strokeWidth=\{16\}/);
});

test("the donut counts each person once and the list counts each action", () => {
  assert.match(screen, /actions\.byFurthest\s*\.filter\(\(slice\) => slice\.people > 0\)/);
  assert.match(screen, /\[\.\.\.actions\.individual\]/);
});

test("stat tiles sit two to a row, never three", () => {
  assert.match(screen, /if \(index % 2 === 0\) rows\.push\(\[\]\)/);
  assert.doesNotMatch(screen, /columns=\{3\}/);
});

test("coming back is one card per row", () => {
  const section = screen.slice(screen.indexOf('title="Coming back"'));
  assert.ok(section.indexOf("<TileGrid") === -1 || section.indexOf("<TileGrid") > section.indexOf("</ChartCard>"));
});

test("the period is the pill and picker every Insights screen uses", () => {
  assert.match(screen, /useAnalyticsPeriod\(\)/);
  assert.match(screen, /<PeriodPill/);
  assert.match(screen, /<PeriodPickerSheet/);
  assert.match(api, /export type LeadInsightsPeriod = PeriodPreset;/);
});

test("the Dashboard tab opens it from a Leads row with moved in of opened", () => {
  assert.match(home, /label="Leads"\n\s+onPress=\{\(\) => router\.push\("\/owner-leads-insights"\)\}/);
  assert.match(home, /leadInsights\.steps\[5\]\?\.people \?\? 0\} \/ \$\{leadInsights\.steps\[0\]\?\.people \?\? 0\}/);
  assert.match(api, /url: `\/api\/v1\/properties\/\$\{propertyId\}\/leads\/insights`/);
});

// "4 · 25%" read as 4.25% (user, 2026-10-18): the share goes in brackets.
test("a count and its share never run together", () => {
  assert.doesNotMatch(screen, /\} · \$\{share\(/);
  assert.match(screen, /valueText: `\$\{slice\.people\} \(\$\{share\(slice\.people, actions\.opened\)\}\)`/);
});

// Profiles show no email (user, 2026-10-18): only a call is tracked and counted.
test("email is gone from the dashboard and the profile", () => {
  const profile = read("src/features/discovery/components/property-profile.tsx");
  assert.doesNotMatch(screen, /EMAIL|[Ee]mail/);
  assert.doesNotMatch(api, /"EMAILED"/);
  assert.doesNotMatch(profile, /mailto:|trackContactTap\("EMAIL"\)/);
  assert.match(read("src/features/analytics/use-profile-view.ts"), /trackContactTap\(channel: "CALL"\)/);
});

test("the line's series is a dropdown and the return tile reads Came back later", () => {
  assert.match(screen, /trailing=\{<ChartDropdown accessibilityLabel="Line shows"/);
  assert.doesNotMatch(screen, /ChartToggle/);
  assert.match(screen, /<StatTile label="Came back later" value=/);
  assert.doesNotMatch(screen, /on another day/);
});
