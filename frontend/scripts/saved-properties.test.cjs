const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// Saved properties (user, 2026-11-14).
test("the profile's bookmark saves and removes, filled blue when saved", () => {
  const profile = read("src/features/discovery/components/property-profile.tsx");
  assert.match(profile, /useListSavedPropertyIdsQuery\(\)\.data \?\? \[\]\)\.includes\(property\.propertyId\)/);
  assert.match(profile, /icon=\{saved \? "bookmark" : "bookmark-outline"\}/);
  assert.match(profile, /setSaved\(\{ propertyId: property\.propertyId, saved: next \}\)/);
  assert.doesNotMatch(profile, /showDummyAction\("Save"\)/);
  // A refusal in the alert modal, as every refusal is.
  assert.match(profile, /setRefusal\(errorMessage\(caught\)\)/);
});

test("saving is optimistic and talks to the saved-properties endpoints", () => {
  const api = read("src/store/services/discovery-api.ts");
  assert.match(api, /url: "\/api\/v1\/discovery\/me\/saved-properties\/ids"/);
  assert.match(api, /url: "\/api\/v1\/discovery\/me\/saved-properties"/);
  assert.match(api, /method: saved \? "PUT" : "DELETE"/);
  assert.match(api, /updateQueryData\("listSavedPropertyIds"[\s\S]{0,300}patch\.undo\(\)/);
});

test("Discover has View saved beside its title, opening Saved properties", () => {
  const discovery = read("app/(tabs)/discovery.tsx");
  assert.match(discovery, /trailing=\{viewSaved\}/);
  assert.match(discovery, /useMemo\(\(\) => <ViewSavedButton onPress=\{\(\) => router\.push\("\/saved-properties"\)\} \/>, \[router\]\)/);
  assert.match(discovery, />\s*View saved\s*<\/Text>/);
  // Nothing in it wraps: on web a wrapping label measured narrow and spilled off the screen.
  assert.match(discovery, /<Text numberOfLines=\{1\} style=\{\{ color: "#FFFFFF", flexShrink: 0/);
  // A gradient that is not blue, and no shadow (user, 2026-11-14).
  assert.match(discovery, /<LinearGradient\s+colors=\{\["#EA580C", "#DB2777"\]\}/);
  assert.doesNotMatch(discovery.slice(discovery.indexOf("function ViewSavedButton")), /softShadow|cardShadow/);
  assert.match(read("app/_layout.tsx"), /<Stack\.Screen name="saved-properties" options=\{\{ headerShown: false \}\} \/>/);
});

test("Saved properties lists the search's cards, opens the profile over itself, and removes by the bookmark", () => {
  const screen = read("app/saved-properties.tsx");
  assert.match(screen, /<ScreenHeader\s+alignLeft[\s\S]{0,120}title="Saved properties"/);
  assert.doesNotMatch(screen, /italicTail/);
  assert.match(screen, /<PropertyListingCard[\s\S]{0,200}onRemove=\{\(\) => void remove\(property\.propertyId\)\}/);
  assert.match(screen, /profileLayer\.current\?\.open\(property\.propertyId, "OTHER"\)/);
  assert.match(screen, /<PropertyProfileLayer ref=\{profileLayer\} \/>/);
  assert.match(screen, /title="No saved properties yet"/);
  assert.match(screen, /<LoadFailed error=\{savedQuery\.error\}/);
  assert.match(read("src/features/discovery/components/property-listing-card.tsx"), /\{onRemove \? \([\s\S]{0,600}<SavedBookmarkIcon size=\{22\} \/>/);
});
