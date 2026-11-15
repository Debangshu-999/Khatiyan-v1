const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// The notification cards (user, 2026-10-31).
const row = fs.readFileSync(path.join(__dirname, "..", "src/features/notifications/notification-row.tsx"), "utf8");

test("the card uses the card radius and lifts off the page", () => {
  assert.match(row, /borderRadius: radii\.card,/);
  assert.match(row, /cardShadow\(colors\.shadow\)/);
  // A tab's own shadow is one a phone does not draw.
  assert.match(row, /import \{[^}]*cardShadow[^}]*\} from "@\/theme\/shadows"/);
  assert.doesNotMatch(row, /useSoftShadow\(\)/);
});

test("the card has no icon", () => {
  assert.doesNotMatch(row, /CategoryArt|categoryArt|notification-art/);
});

test("details sit on a grey panel, label and value apart", () => {
  assert.match(row, /backgroundColor: isUnread \? colors\.surface : colors\.surfaceSunken/);
  assert.match(row, /textAlign: "right"/);
  assert.doesNotMatch(row, /\{detail\.label\}: /);
});

test("unread is a pale blue fill with a blue border", () => {
  assert.match(row, /backgroundColor: isUnread \? colors\.primarySoft : colors\.surface/);
  assert.match(row, /borderColor: isUnread \? colors\.primary : colors\.borderStrong/);
});

test("the property sits left and the time right of one row, both bold", () => {
  assert.match(row, /justifyContent: "space-between" \}\}>\s+\{place \? \(\s+<Text numberOfLines=\{1\} style=\{\{[^}]*fontFamily: fonts\.sansBold/);
  assert.match(row, /fontFamily: fonts\.sansBold, fontSize: 12 \}\}>\s+\{when\}/);
  assert.match(row, /allDetails\.filter\(\(detail\) => detail\.label !== "Property"\)/);
});

test("urgency outranks New, and only one pill shows", () => {
  assert.match(row, /urgency \? <UrgencyPill signal=\{urgency\} \/> : isUnread \? <NewPill \/> : null/);
});

test("the filter row stops short of the screen edge and still lines up with the cards", () => {
  const filters = fs.readFileSync(path.join(__dirname, "..", "src/features/notifications/alert-filters.tsx"), "utf8");
  assert.match(filters, /const ROW_BLEED = spacing\.lg - spacing\.xs/);
  assert.match(filters, /paddingHorizontal: ROW_BLEED/);
  assert.match(filters, /marginHorizontal: -ROW_BLEED/);
});

test("filter bubbles are pale blue, blue-bordered only when chosen, no icons, counts in an inner bubble", () => {
  const filters = fs.readFileSync(path.join(__dirname, "..", "src/features/notifications/alert-filters.tsx"), "utf8");
  assert.match(filters, /backgroundColor: active \? colors\.primary : colors\.primarySoft/);
  assert.match(filters, /borderColor: active \? colors\.primary : "transparent"/);
  assert.doesNotMatch(filters, /lucide-react-native|ALERT_ICONS/);
  assert.match(filters, /backgroundColor: colors\.surface,\s+borderRadius: 6,\s+height: 20/);
});

// The rest of the food notices (P1.5.h, 2026-11-08).
test("the new food notices show their meal, dish, plan or new times", () => {
  for (const subtype of ["FOOD_DISH_UNAVAILABLE", "FOOD_DISH_AVAILABLE", "FOOD_MENU_CHANGED", "FOOD_MEAL_TIMINGS_CHANGED"]) {
    assert.match(row, new RegExp(`case "${subtype}":`), subtype);
  }
  assert.match(row, /add\(details, "Dish", data\.itemName\)/);
  assert.match(row, /add\(details, "Plan", data\.profileName\)/);
  // New times read in the order of the day, not the label map's.
  assert.match(row, /for \(const meal of MEAL_ORDER\) \{\s+const \[start, end\] = \(data\[`time_\$\{meal\}`\] \?\? ""\)\.split\("-"\)/);
});
