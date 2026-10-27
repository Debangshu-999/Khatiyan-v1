const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Booking onboarding (user, 2026-10-27): a third kind under tenant onboarding,
// Today and Missed, a card per booking with its bed's state and its steps.
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const screen = read("app/owner-booking-onboarding.tsx");
const onboard = read("app/owner-onboard-tenant.tsx");
const api = read("src/store/services/booking-api.ts");

test("From booking sits beside Monthly and Daily, and opens its own screen", () => {
  assert.match(onboard, /title="From booking"/);
  assert.match(onboard, /subtitle="Onboard tenants from confirmed bookings for your property"/);
  assert.match(onboard, /router\.push\("\/owner-booking-onboarding"\)/);
  assert.match(read("app/_layout.tsx"), /name="owner-booking-onboarding"/);
});

test("Today and Missed read the move-ins due today and the ones past their day", () => {
  assert.match(screen, /\{ badge: today\.currentData\?\.totalElements \?\? 0, label: "Today", value: "TODAY" \}/);
  assert.match(screen, /\{ badge: missed\.currentData\?\.totalElements \?\? 0, label: "Missed", value: "MISSED" \}/);
  assert.match(screen, /attention: "MOVE_IN_TODAY"/);
  assert.match(screen, /attention: "MOVE_IN",/);
});

test("a card: name and room on a row with the code under the name, the bed's state, two buttons, then the details", () => {
  // The name shrinks to fit and shows first and last name only (user, 2026-10-28).
  assert.match(screen, /\{cardName\(item\.tenantName\)\}<\/FitText>\s+<Text[^>]*>Room \{item\.roomNumber\}<\/Text>\s+<\/View>\s+<Text selectable[^>]*>\{item\.referenceCode\}<\/Text>/);
  assert.match(screen, /\{free \? "Bed is free" : "Bed is still occupied"\}/);
  assert.match(screen, /<ActionButton label="Did not arrive" onPress=\{onDidNotArrive\} variant="neutral" \/>/);
  // A free bed offers Onboard, an occupied one another room first.
  assert.match(screen, /\{free \? \(\s+<ActionButton label="Onboard" onPress=\{onOnboard\} \/>\s+\) : \(\s+<ActionButton label="Change room" onPress=\{onMove\} \/>/);
  assert.match(screen, /label="View booking details"/);
  // Onboard is a placeholder for now.
  assert.match(screen, /toast\.info\("Onboarding from a booking is coming soon\."\)/);
});

test("Did not arrive opens the day after move-in, frees the bed, and leaves the token action pending", () => {
  assert.match(screen, /const DID_NOT_ARRIVE_AFTER_DAYS = 1;/);
  assert.match(screen, /if \(istToday\(\) < opensOn\)/);
  assert.doesNotMatch(screen, /accessibilityRole="radio"/);
  // The token is no longer decided here: it waits on the Tokens screen (user, 2026-10-28).
  assert.match(screen, /will be marked pending\. Refund it or keep it in the Token records screen\./);
  assert.doesNotMatch(screen, /refundToken/);
  assert.doesNotMatch(api, /body: \{ refundToken \},/);
});

test("Change room shows the same kind first, with a different room type always under them", () => {
  assert.match(screen, /title="Change room"/);
  assert.match(screen, /const similar = all\.filter\(\(option\) => option\.sameKind\);/);
  assert.match(screen, /\{options\.currentData && !otherTypes && others\.length > 0 \? \(/);
  assert.match(screen, /label="Select a different room type"/);
  assert.match(api, /url: `\$\{atProperty\(propertyId, requestId\)\}\/move-bed`,/);
});

// "No bullet points, make it like booking modals with proper text" (user, 2026-10-27).
test("the Did not arrive sheet is laid out as the booking's Cancel booking sheet, in sentences", () => {
  const sheet = screen.slice(screen.indexOf("function DidNotArriveSheet("));
  assert.doesNotMatch(sheet.slice(0, sheet.indexOf("function roomLabel")), /•/);
  assert.match(sheet, /<CircleAlert color=\{colors\.danger\} size=\{36\}/);
  assert.match(sheet, /was due to move in on \{bookingDateLabel\(item\.moveInDate\)\}\. Marking them as not arrived cancels this booking\./);
  assert.match(sheet, /The reserved bed in Room \{item\.roomNumber\} will be released\./);
});

