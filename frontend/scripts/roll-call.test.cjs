const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const card = read("src/features/roll-call/roll-call-home-card.tsx");
const probe = read("src/features/roll-call/presence-probe.ts");
const api = read("src/store/services/roll-call-api.ts");
const roll = read("app/owner-roll-call.tsx");
const settings = read("app/owner-roll-call-settings.tsx");

// The nightly roll call (user, 2026-11-09 and 2026-11-15).
test("the tenant's card shows only while the window is open, with each state's words", () => {
  assert.match(card, /const showing = Boolean\(today\?\.available && today\.open\);/);
  assert.match(card, /if \(!today \|\| !showing\) return null;/);
  for (const words of ["Attendance marked at", "Marked present at", "You are away tonight", "Are you present today\\?"]) {
    assert.match(card, new RegExp(words));
  }
  assert.match(card, /label=\{markState\.isLoading \? "Marking" : "Mark present"\}/);
});

test("the automatic check runs once a night, only when it is on and nothing is marked", () => {
  assert.match(card, /!today\.autoCheckIn \|\| today\.state !== "NOT_MARKED" \|\| tried\.current === today\.night/);
  assert.match(card, /probePresence\(\)\s*\.then\(\(seen\) => checkIn\(seen\)\.unwrap\(\)\)/);
});

test("the card sits directly under the first card on the tenant's Home", () => {
  const home = read("app/(tabs)/index.tsx");
  assert.match(home, /<TenancyToolsHomeCard \/>\s*\{\/\* Tonight's roll call[^}]*\*\/\}\s*\{awaitingSignature \? null : <RollCallHomeCard \/>\}/);
});

test("the probe reads the router, never the blank Android one, then the position with its fake-location flag", () => {
  assert.match(probe, /NetInfo\.configure\(\{ shouldFetchWiFiSSID: true \}\)/);
  assert.match(probe, /"02:00:00:00:00:00"/);
  assert.match(probe, /mocked: position\.mocked === true/);
  assert.match(probe, /Platform\.OS === "web"/);
});

test("the app talks to the roll-call endpoints", () => {
  for (const url of [
    '"/api/v1/tenancies/me/roll-call"',
    '"/api/v1/tenancies/me/roll-call/check-in"',
    '"/api/v1/tenancies/me/roll-call/mark-present"',
    "`/api/v1/properties/${propertyId}/roll-call`",
    "`/api/v1/properties/${propertyId}/roll-call/marks/${tenancyId}`",
    "`/api/v1/properties/${propertyId}/roll-call/settings`",
    "`/api/v1/properties/${propertyId}/roll-call/wifi`",
    "`/api/v1/properties/${propertyId}/roll-call/wifi/${wifiId}`",
  ]) {
    assert.ok(api.includes(url), url);
  }
});

test("Roll call: a night stepper that stops at tonight, four counts, a sticky search and the warden's sheet", () => {
  assert.match(roll, /<RoundIconButton disabled=\{isTonight \|\| !shownNight\} icon=\{ChevronRight\}/);
  for (const label of ['label="Present"', 'label="Staying out"', 'label="Not marked"', 'label="Absent"']) assert.ok(roll.includes(label), label);
  assert.match(roll, /stickyHeaderIndices=\{roll\?\.enabled \? \[3\] : \[\]\}/);
  assert.match(roll, /placeholder="Search name or room"/);
  assert.match(roll, /label="Clear warden's mark"/);
  assert.match(roll, /router\.push\("\/owner-roll-call-settings"\)/);
});

test("Settings: roll call, Automatic check-in under it, the window once it is on, and Save in the footer", () => {
  // The order (user, 2026-11-15): the roll call switch, Automatic check-in, then the window.
  assert.ok(settings.indexOf('accessibilityLabel="Take roll call"') < settings.indexOf('accessibilityLabel="Automatic check-in"'));
  assert.ok(settings.indexOf('accessibilityLabel="Automatic check-in"') < settings.indexOf('<SectionHeading title="Attendance window" />'));
  assert.match(settings, /\{view!\.enabled \? \(\s*<View style=\{\{ gap: spacing\.sm \}\}>\s*\{\/\*[^*]*\*\/\}\s*<SectionHeading title="Attendance window" \/>/);
  // Nothing saves until Save; Save waits for the window while roll call is on, and for a change.
  assert.match(settings, /const canSave = Boolean\(view\) && dirty && \(!view\?\.enabled \|\| hasWindow\) && !saveState\.isLoading;/);
  assert.match(settings, /<PinnedFooter>[\s\S]{0,200}<ActionButton disabled=\{!canSave\} label=\{saveState\.isLoading \? "Saving" : "Save"\}/);
  assert.match(settings, /\{view!\.autoCheckIn \? \(/);
  assert.match(settings, /label=\{addState\.isLoading \? "Adding" : "Use this WiFi"\}/);
  assert.match(settings, /Within \$\{settings\.radiusMeters\} m of the property's pin/);
  assert.match(settings, /"Connect to the property's WiFi first\."/);
});

test("Tenancy tools open Roll call at PGs and hostels, and both screens are registered", () => {
  const tenancy = read("app/owner-tenancy.tsx");
  assert.match(tenancy, /key: "roll-call",\s+label: "Attendance",/);
  assert.match(tenancy, /selectedProperty\?\.type === "PG" \|\| selectedProperty\?\.type === "HOSTEL"/);
  const layout = read("app/_layout.tsx");
  assert.match(layout, /name="owner-roll-call"/);
  assert.match(layout, /name="owner-roll-call-settings"/);
});

// Save writes the saved settings straight in (user, 2026-11-15): the switch no longer flicks off and back on.
test("a save, an added or a removed WiFi lands in the screen at once", () => {
  assert.equal((api.match(/upsertQueryData\("getRollCallSettings", arg\.propertyId, data\)/g) || []).length, 3);
});
