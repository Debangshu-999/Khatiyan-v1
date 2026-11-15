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
  assert.match(policies, /The same four levels for every item\.\n/);
  assert.match(policies, /Each item can be charged at one or more damage levels\./);
  // No levels toggle and no lifecycle sheet: levels are only price tiers (user, 2026-11-07).
  assert.doesNotMatch(policies, /damageLevelsEnabled|IconSwitch|ITEM_LIFECYCLE/);
  // Fixed for the whole system, shown as boxes in each level's colour, nothing to edit (user, 2026-11-07).
  assert.match(policies, /<DamageLevelBoxes \/>/);
  assert.doesNotMatch(policies, /damageLevels:|DamageLevelsEditor/);
  const levels = read("src/features/tenancy/damage-level.tsx");
  for (const level of ["NA", "D1", "D2", "D3"]) assert.match(levels, new RegExp(`level: "${level}",`));
  assert.doesNotMatch(levels, /levels: DamageLevelWords/);
  // NA and D1 are pale like their boxes, so on a box their chip turns white with the box's edge.
  assert.match(levels, /<DamageLevelPill level=\{entry\.level\} onTint=\{box\(entry\.level\)\.border\} \/>/);
  // By category, every room amenity on it by itself, Add per category, levels deleted down.
  assert.match(policies, /roomItems=\{roomDamageItems\(roomsQuery\.data \?\? \[\], bathroomType\)\}/);
  assert.match(policies, /onAdd=\{readOnly \? undefined : \(\) => setSheet\(\{ category, name: null \}\)\}/);
  assert.match(policies, /levels\.splice\(deleting\.index, 1\);/);
  // One message for the prices; a worse level never costs less, D3 never without D2.
  assert.match(policies, /setPriceError\("Price D2 before D3\."\)/);
  assert.match(policies, /setPriceError\("Each level costs at least the one before\."\)/);
});

test("the checklist is a required step between Verify and Review, never for a daily guest", () => {
  assert.match(wizard, /const STEP_ORDER: Step\[\] = \["type", "tenant", "details", "verify", "handover", "review", "agreement"\];/);
  assert.match(wizard, /const DAILY_STEP_ORDER: Step\[\] = \["type", "tenant", "details", "verify", "review", "agreement"\];/);
  assert.match(wizard, /setStep\(isDaily \? "review" : "handover"\);/);
  // Required now: no Skip (user, 2026-10-29). Continue stays blocked until it is complete.
  assert.doesNotMatch(wizard, /Skip move-in/);
  assert.doesNotMatch(wizard, /moveInSkipped/);
  // Every item a photo, every damage described, and at least 1 key (user, 2026-10-29).
  // Every item a photo, no damage note: the step curates items (user, 2026-11-07).
  // Every item a condition and a photo (user, 2026-11-07).
  assert.match(wizard, /moveInItems\.every\(\(item\) => item\.condition !== null && item\.photoUrls\.length > 0\)/);
  assert.match(wizard, /Number\(keysHandedOver\) >= 1/);
  assert.match(wizard, /<Field error=\{Number\(keysHandedOver\) >= 1 \? undefined : "Provide at least 1 key\."\} label="Keys handed over" required>/);
  assert.match(wizard, /useState\("1"\)/);
  assert.doesNotMatch(wizard, /What is damaged/);
  assert.match(wizard, /disabled=\{!moveInReady\}\s+label="Continue"/);
  assert.match(wizard, /moveInChecklist: moveInPayload,/);
});

test("each move-in sets every item's condition fresh, nothing carried from an earlier tenant", () => {
  // Working, Damaged or Broken, from "Select an option" (user, 2026-11-07).
  assert.doesNotMatch(wizard, /useGetRoomItemConditionsQuery\(/);
  assert.match(wizard, /condition: null,\s+custom: false,/);
  assert.match(wizard, /<ItemConditionDropdown onChange=\{\(condition\) => update\(\{ condition \}\)\} value=\{item\.condition\} \/>/);
  // A taller note for every condition, Working included, no "optional" in the label (user, 2026-11-07).
  assert.match(wizard, /<Field label="Note">\s*<Input\s+maxLength=\{200\}\s+multiline/);
  // A nudge for an item with an open damage record.
  assert.match(wizard, /is still open\. If it has not been repaired or replaced, set the condition to match\./);
  const dropdown = read("src/features/tenancy/item-condition.tsx");
  assert.match(dropdown, /"Select an option"/);
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
  assert.match(wizard, /<SheetShell size="short" onClose=\{\(\) => setAddingTo\(null\)\}/);
  assert.match(wizard, /needPhotos > 0 \? `\$\{needPhotos\} need/);
  // 1 to 3 photos on each item, and its level from a dropdown with an ⓘ.
  assert.match(wizard, /<MultiImageField\s+label=\{`Photos \(\$\{item\.photoUrls\.length\} of 3\)`\}\s+max=\{3\}/);
  // No damage level at move-in, only the condition (user, 2026-11-07).
  assert.doesNotMatch(wizard, /<DamageLevelDropdown/);
});

test("room types pick their things from the damage list, in a Room and a Bathroom section", () => {
  const picker = read("src/features/property/amenity-picker.tsx");
  assert.match(picker, />Amenities</);
  assert.match(picker, /const bathroomCategory = bathroomType === "COMMON" \? "COMMON_TOILET" : "BATHROOM";/);
  assert.match(picker, /bathroomType === "COMMON" \? "Common washroom" : "Attached washroom"/);
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
