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
  // Onboard opens the monthly wizard on this booking (user, 2026-10-28).
  assert.match(screen, /router\.push\(\{ params: \{ bookingId: item\.id, propertyId \}, pathname: "\/owner-onboard-tenant" \}\)/);
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

// "Terms agreed during booking cannot be altered, except for room which can only be changed when agreed
// room is not vacant on move in date" (user, 2026-10-28).
test("the wizard onboards a booking with its agreed terms locked, through the booking's own convert", () => {
  const wizard = read("app/owner-onboard-tenant.tsx");
  // It starts at the tenant, the kind being monthly, and skips the kind step.
  assert.match(wizard, /useState<Step>\(fromBooking \? "tenant" : "type"\)/);
  assert.match(wizard, /const BOOKING_STEP_ORDER: Step\[\] = \["tenant", "details", "verify", "handover", "review", "agreement"\];/);
  // The booking's person, room, rent, deposit and start, poured in once and shown locked.
  assert.match(wizard, /setRoomId\(booking\.roomId\);/);
  assert.match(wizard, /setStartDate\(startOfToday\(\)\);/);
  assert.match(wizard, /nameLockedTo=\{fromBooking \? booking\?\.tenantName \?\? null : null\}/);
  for (const label of ["Room", "Rent / month", "Deposit", "Start date"]) {
    assert.ok(new RegExp(`<Field label="${label}">\\s+<LockedValue`).test(wizard), label);
  }
  // No room picker and no rent or deposit inputs from a booking.
  assert.match(wizard, /\{selectedProperty && !fromBooking \? \(/);
  assert.match(wizard, /\{roomId && !fromBooking \? \(/);
  // The term is the booking's and locked. The clauses are not agreed in a booking: edited here as on any
  // onboarding, and sent with the convert (user, 2026-10-28).
  assert.match(wizard, /setTermMonths\(booking\.agreementMonths\);/);
  assert.match(wizard, /const clausesReadOnly = !canManageResource\("TENANCY_RULES"\);/);
  assert.match(wizard, /\/\/ The clauses as edited here, the same as any onboarding sends them\.\s+template,/);
  assert.match(wizard, /The term was agreed in the booking\. It cannot be changed here\./);
  // Submitted through the booking, with only what it does not hold.
  assert.match(wizard, /: fromBooking \? handleConvertBooking\(\) : handleConfirmWithAgreement\(\)\)\}/);
  assert.match(wizard, /requestId: booking\.id,\s+version: booking\.version,/);
  assert.doesNotMatch(wizard.slice(wizard.indexOf("async function handleConvertBooking"), wizard.indexOf("async function handleOnboardExisting")), /rentAmountPaise|roomId:/);
});

// Onboarded on another device while this one had the wizard open (user, 2026-10-28): the refusal's OK
// leaves, since the booking cannot be onboarded any more, and the list behind drops it.
test("a refusal for a booking no longer convertible closes the wizard on OK", () => {
  assert.match(onboard, /if \(fresh && !fresh\.allowedMoveInActions\.includes\("CONVERT"\)\) \{\s+setBookingGone\(true\);\s+\/\/ [^\n]+\s+dispatch\(api\.util\.invalidateTags\(\["Booking"\]\)\);/);
  assert.match(onboard, /opErrors\.dismissServerError\(\);\s+if \(bookingGone\) router\.back\(\);/);
});

// "The bottom The stay starts today.... message is cut out" (user, 2026-10-28): the clearance under
// the pinned footer hides content, so a step only locks scrolling when it fits whole.
test("a wizard step with a pinned footer still scrolls when its last line is behind the footer", () => {
  assert.match(onboard, /bottomPaddingCovered=\{hasStandardFooter\}/);
  assert.match(read("src/components/screen-scroll-view.tsx"), /contentFitsWithoutScroll\(contentHeight, bottomPaddingCovered \? 0 : callerPaddingBottom, viewportHeight\)/);
});


// P1.8.c (user, 2026-10-28): the token taken off a booked tenant's first bill shows on the bill itself,
// owner's and tenant's, on the line items and on both receipts, as money received, not a discount.
test("the booking token on the first bill is named wherever the bill is shown", () => {
  const api = read("src/store/services/billing-api.ts");
  assert.match(api, /export function bookingTokenPaise\(cycle: Pick<BillingCycle, "lineItems">\): number \{/);
  assert.match(api, /if \(item\.type === "BOOKING_TOKEN"\) \{\s+return "Booking token";/);
  assert.match(read("src/features/billing/booking-token-note.tsx"), /\{formatRupees\(paise\)\} booking token received/);
  for (const file of ["src/features/owner/bill-views.tsx", "src/features/billing/tenant-bill-card.tsx"]) {
    const view = read(file);
    assert.match(view, /\{token > 0 \? <BookingTokenNote paise=\{token\} \/> : null\}/, file);
    assert.match(view, /cycle\.totalAmountPaise \+ cycle\.discountAmountPaise \+ bookingTokenPaise\(cycle\)/, file);
  }
  const lines = read("app/tenancy-billing-cycle.tsx");
  assert.match(lines, /value=\{`\$\{token \? "− " : ""\}\$\{formatMoney\(item\.amountPaise\)\}`\}/);
  assert.match(lines, /token \? "Taken off the bill"/);
  assert.match(read("src/features/billing/bill-receipt-sheet.tsx"), /label="Booking token received"/);
});
