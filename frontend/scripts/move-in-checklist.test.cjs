const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Damage levels (P1.9.a) and the move-in checklist (user, 2026-10-29).
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const wizard = read("app/owner-onboard-tenant.tsx");
const screen = read("app/move-in-checklist.tsx");
const policies = read("app/owner-exit-policies.tsx");

test("four damage levels, NA to D3, priced per item on Exit policies", () => {
  assert.match(read("src/store/services/property-api.ts"), /export const DAMAGE_LEVELS: DamageLevel\[\] = \["NA", "D1", "D2", "D3"\];/);
  assert.match(policies, /<Section title="Damage levels">/);
  assert.match(policies, /The same four levels for every item\. D3 means the most damage\./);
  // Each level inside its field like a ₹; NA fixed as no damage (user, 2026-10-29).
  assert.match(policies, /<NotchedInput editable=\{false\} prefix="NA:" value="No damage" \/>/);
  assert.ok(policies.includes('prefix={`${key.toUpperCase()}:`}'));
  // By category, every room amenity on it by itself, Add per category, levels deleted down.
  assert.match(policies, /roomItems=\{roomDamageItems\(roomsQuery\.data \?\? \[\], bathroomType\)\}/);
  assert.match(policies, /onAdd=\{readOnly \? undefined : \(\) => setSheet\(\{ category, name: null \}\)\}/);
  assert.match(policies, /levels\.splice\(deleting\.index, 1\);/);
  // One message for the prices; a worse level never costs less, D3 never without D2.
  assert.match(policies, /setPriceError\("Price D2 before D3\."\)/);
  assert.match(policies, /setPriceError\("Each level costs at least the one before\."\)/);
});

test("the checklist is an optional step between Verify and Review, never for a daily guest", () => {
  assert.match(wizard, /const STEP_ORDER: Step\[\] = \["type", "tenant", "details", "verify", "handover", "review", "agreement"\];/);
  assert.match(wizard, /const DAILY_STEP_ORDER: Step\[\] = \["type", "tenant", "details", "verify", "review", "agreement"\];/);
  assert.match(wizard, /setStep\(isDaily \? "review" : "handover"\);/);
  assert.match(wizard, /label="Skip move-in"/);
  // Continue stays blocked until every item has a photo. Skipped, nothing is sent.
  // Every item a photo, every damage described, and at least 1 key (user, 2026-10-29).
  assert.match(wizard, /moveInItems\.every\(\(item\) => item\.photoUrls\.length > 0 && \(item\.damageLevel === "NA" \|\| item\.note\.trim\(\)\)\)/);
  assert.match(wizard, /Number\(keysHandedOver\) >= 1/);
  assert.match(wizard, /<Field error=\{Number\(keysHandedOver\) >= 1 \? undefined : "Provide at least 1 key\."\} label="Keys handed over" required>/);
  assert.match(wizard, /useState\("1"\)/);
  assert.match(wizard, /<Field label="What is damaged" required>/);
  assert.match(wizard, /disabled=\{!moveInReady\}\s+label="Continue"/);
  assert.match(wizard, /moveInChecklist: moveInPayload,/);
});

test("the checklist shows what the room's type picked, from the damage list, and more can be added", () => {
  // Only the room type's picks, sorted into Room and Bathroom by the damage list (user, 2026-10-29).
  assert.match(wizard, /const categoryOf = new Map\(\(exitPoliciesQuery\.data\?\.damageCharges \?\? \[\]\)/);
  assert.match(wizard, /if \(category === "COMMON_TOILET"\) return;/);
  assert.match(wizard, /if \(amenity === "ATTACHED_TOILET" \|\| amenity === "COMMON_TOILET"\) return;/);
  // AC, or a fan on a non-AC room.
  assert.match(wizard, /if \(selectedRoom\) add\(selectedRoom\.conditioning === "AC" \? "AC" : "Fan"\);/);
  assert.match(wizard, /title="Not on the checklist"/);
  // The room's picks stay; an added one can go, after a confirm. Add sits beside the header.
  assert.match(wizard, /\{item\.fixed \? null : \(/);
  assert.match(wizard, /title="Remove this item\?"/);
  assert.match(wizard, /trailing=\{section === "AMENITY" \? null : \(/);
  assert.match(wizard, /<SheetShell onClose=\{\(\) => setAddingTo\(null\)\}/);
  assert.match(wizard, /needPhotos > 0 \? `\$\{needPhotos\} need/);
  // 1 to 3 photos on each item, and its level from a dropdown with an ⓘ.
  assert.match(wizard, /<MultiImageField\s+label=\{`Photos \(\$\{item\.photoUrls\.length\} of 3\)`\}\s+max=\{3\}/);
  assert.match(wizard, /<DamageLevelDropdown levels=\{levelWords\}/);
});

test("room types pick their things from the damage list, in a Room and a Bathroom section", () => {
  const picker = read("src/features/property/amenity-picker.tsx");
  assert.match(picker, />Amenities</);
  assert.match(picker, /const bathroomCategory = bathroomType === "COMMON" \? "COMMON_TOILET" : "BATHROOM";/);
  assert.match(picker, /bathroomType === "COMMON" \? "Common toilet" : "Attached bathroom"/);
  // AC, or Fan, fixed and ticked; the common toilet is not an item in its own list.
  assert.match(picker, /label=\{conditioning === "AC" \? "AC" : "Fan"\}/);
  assert.match(picker, /bathroomType === "COMMON" \? null : \(/);
  assert.doesNotMatch(picker, /Anything else/);
});

test("the tenant answers within 48 hours, and management reads it", () => {
  assert.match(screen, /label="Looks right"/);
  assert.match(screen, /label="Something is different"/);
  assert.match(screen, /There was no answer within 48 hours, so it counts as accepted\./);
  assert.match(read("app/(tabs)/tenancy.tsx"), /pathname: "\/move-in-checklist", params: \{ role: "tenant"/);
  assert.match(read("app/owner-active-tenancy-detail.tsx"), /pathname: "\/move-in-checklist", params: \{ role: "owner"/);
});
