const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// External visits and bookings (user, 2026-10-19): people who reached the
// property outside the app, recorded by it, just a record with no account.
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const visitScreen = read("app/owner-external-visit.tsx");
const bookingScreen = read("app/owner-external-booking.tsx");
const bedSheet = read("src/features/booking/bed-picker-sheet.tsx");
const select = read("src/components/select-field.tsx");
const api = read("src/store/services/lead-api.ts");
const layout = read("app/_layout.tsx");
const visits = read("app/owner-visits.tsx");
const bookings = read("app/owner-bookings.tsx");
const leadCard = read("src/features/lead/lead-card.tsx");

test("both screens are registered and reached from their own screens", () => {
  assert.match(layout, /name="owner-external-visit"/);
  assert.match(layout, /name="owner-external-booking"/);
  assert.match(visits, /label="Record external visit"/);
  assert.match(visits, /"\/owner-external-visit"/);
  assert.match(bookings, /<AddRecordCard icon=\{CalendarPlus\} label="Create external booking"/);
  assert.match(bookings, /"\/owner-external-booking"/);
});

// "How it went and Interested fields should be dropdowns with Select an option placeholder shown and no defaults".
test("a choice starts empty and says Select an option", () => {
  assert.match(select, /placeholder = "Select an option"/);
  assert.match(select, /value: Value \| null;/);
  for (const name of ["impression", "interest"]) {
    assert.match(visitScreen, new RegExp(`useState<Visit\\w+ \\| null>\\(null\\)[\\s\\S]*${name}`));
  }
  assert.match(visitScreen, /<SelectField error=\{form\.errors\.impression\} label="Did they like the property\?"/);
  assert.match(visitScreen, /<SelectField error=\{form\.errors\.interest\} label="Interested\?"/);
  for (const name of ["gender", "reachedVia", "tokenMethod"]) {
    assert.match(bookingScreen, new RegExp(`const \\[${name}, set\\w+\\] = useState<[^>]+ \\| null>\\(null\\);`));
  }
});

// "The external visit will only be recorded when they come ... so phone call is not needed there".
test("a visit is only one that happened, today, in a visiting slot", () => {
  assert.match(visitScreen, /visitedOn: istToday\(\),/);
  assert.doesNotMatch(visitScreen, /PHONE_CALL|Phone call/);
  // The slot the button was pressed under to start with, any of the day's from the dropdown.
  assert.match(visitScreen, /useState<string \| null>\(params\.slot \?\? null\)/);
  assert.match(visitScreen, /label="Visiting slot"/);
  assert.match(visitScreen, /errors\.slot = "Choose the slot they came in\.";/);
  assert.match(bookingScreen, /\{ label: "Walked in", value: "WALKED_IN" \}/);
  assert.match(bookingScreen, /\{ label: "Phone call", value: "PHONE_CALL" \}/);
});

test("a booking keeps every booking's rules: 3 to 21 days, an adult, a bed", () => {
  assert.match(bookingScreen, /maximum=\{options\.latestMoveInDate \?\? istToday\(21\)\} minimum=\{options\.earliestMoveInDate \?\? istToday\(3\)\}/);
  assert.match(bookingScreen, /return `\$\{Number\(year\) - 18\}-\$\{month\}-\$\{day\}`;/);
  assert.match(bookingScreen, /if \(!room\) errors\.room = "Choose a bed\.";/);
  assert.match(bookingScreen, /errors\.token = "A token cannot be more than one month's rent\.";/);
  // The token is asked only where the property takes one.
  assert.match(bookingScreen, /\{options\.tokenRequired \? \(\s+<Card>/);
});

// "For booking, bed selection should show a bottom up modal with floors expandable to show rooms".
test("the bed is chosen in a sheet of floors that open to their rooms, and its rent fills in", () => {
  assert.match(bedSheet, /<SheetShell onClose=\{onClose\} title="Choose a bed">/);
  assert.match(bedSheet, /\.sort\(\(\[left\], \[right\]\) => compareFloors\(left, right\)\)/);
  assert.match(bedSheet, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(bedSheet, /\{open\s+\? inFloor\.map/);
  assert.match(bookingScreen, /setRent\(rupees\(picked\.rentPaise\)\);/);
});

test("the endpoints, and External on the lead and visit cards", () => {
  assert.match(api, /url: `\/api\/v1\/properties\/\$\{propertyId\}\/external-visits`/);
  assert.match(api, /`\/api\/v1\/properties\/\$\{propertyId\}\/external-bookings\/options`/);
  assert.match(api, /url: `\/api\/v1\/properties\/\$\{propertyId\}\/external-bookings`/);
  assert.match(leadCard, /\{lead\.external \? <ExternalChip \/> : null\}/);
  assert.match(visits, /\{visit\.external \? <StateChip icon=\{UserPlus\} label="External visit" tone="neutral" \/> : null\}/);
  // No enquiry behind an external visit, so no View enquiry.
  assert.match(visits, /const hasActions = !visit\.external && /);
});

// "Sharing wanted and Budget should only be stored if Interested is selected as yes".
test("sharing and budget are asked, and sent, only when interested", () => {
  assert.match(visitScreen, /\{interest === "YES" \? \(\s+<>\s+<SelectField error=\{form\.errors\.sharing\} label="Sharing wanted"/);
  assert.match(visitScreen, /label="Budget a month"/);
  assert.doesNotMatch(visitScreen, /(Sharing wanted|Budget a month) \(optional\)/);
  assert.match(visitScreen, /wantedSharing: interested \? sharing : null,/);
  assert.match(visitScreen, /const budgetPaise = interested \? rupeesToPaise\(budget\) : null;/);
});

// "For Today tab ... show the slots using the month picker UI ... always opens on the current active slot".
test("Today shows one slot at a time, opening on the first left, with Record external visit above Earlier today", () => {
  assert.match(visits, /<SlotStepper/);
  assert.match(visits, /const slotIndex = Math\.max\(0, slots\.findIndex\(\(slot\) => slot\.key === slotKey\)\);/);
  assert.match(visits, /\{ params: \{ slot: shownSlot\.key \}, pathname: "\/owner-external-visit" \}/);
  const button = visits.indexOf("<RecordExternalVisitCard");
  assert.ok(button > 0 && button < visits.indexOf("<EarlierTodayCard", button), "card above Earlier today");
  assert.equal(visits.split("<RecordExternalVisitCard").length, 2, "one Record external visit card");
  // No day count and no slots-completed chip on Today (user, 2026-10-19).
  assert.doesNotMatch(visits, /SlotsCompletedPill|"visits today"/);
  assert.match(visits, /\/\/ Today carries no count: the slot bar says who is coming/);
  // An empty slot's state sits in the measured space between the slot bar and the strip, so nothing is stretched to scroll.
  assert.match(visits, /<EmptySlot \/>/);
  assert.doesNotMatch(visits, /flexGrow: 1/);
  // History filters by status, All first and by default.
  assert.match(visits, /useState<VisitHistoryStatus>\("ALL"\)/);
  assert.match(visits, /\{ label: "All", value: "ALL" \},\s+\{ label: "Visited", value: "VISITED" \},\s+\{ label: "No visit", value: "NO_VISIT" \},\s+\{ label: "Cancelled", value: "CANCELLED" \},/);
  assert.match(read("src/store/services/enquiry-chat-api.ts"), /visits\/history\?page=\$\{page\}&size=12&status=\$\{status\}/);
  assert.match(visits, /> - by owner<\/Text>/);
  const stepper = read("src/features/visits/slot-stepper.tsx");
  assert.match(stepper, /label="Previous slot"/);
  assert.match(stepper, /label="Next slot"/);
  // "9:00 am - 11:00 am", and no "1 of 3" (user, 2026-10-19).
  assert.match(stepper, /\.replace\(" to ", " - "\)/);
  assert.doesNotMatch(stepper, /visitors`\} · \$\{index/);
  // An up chevron while a dropdown is open.
  assert.match(select, /\{open \? <ChevronUp /);
});

// "Fix these How it went and The Person titles ... If Disliked it is recorded an additional reason must be noted".
test("bold section titles, a ? on How it went, and a reason for a dislike", () => {
  assert.match(visitScreen, /<FormSectionTitle title="Visitor details" \/>/);
  assert.match(visitScreen, /<FormSectionTitle help=\{HOW_IT_WENT_HELP\} title="How it went" \/>/);
  assert.match(visitScreen, /\{impression === "DISLIKED" \? \(\s+<FormInput error=\{form\.errors\.dislikedReason\} label="Why not\?"/);
  assert.match(visitScreen, /dislikedReason: impression === "DISLIKED" \? dislikedReason\.trim\(\) : null,/);
  assert.match(visitScreen, /label="Note" /);
  assert.match(bookingScreen, /<FormSectionTitle title="Tenant details" \/>/);
  assert.match(bookingScreen, /<FormSectionTitle help=\{BED_HELP\} title="Booking details" \/>/);
  assert.match(bookingScreen, /<FormSectionTitle help=\{TOKEN_HELP\} title="Token collected" \/>/);
  assert.match(bookingScreen, /label="Reference" /);
});

test("app copy has no semicolons", () => {
  for (const source of [visitScreen, bookingScreen, bedSheet]) {
    for (const [, copy] of source.matchAll(/(?:label|title|subtitle|placeholder|message)="([^"]*)"/g)) {
      assert.ok(!copy.includes(";"), `Semicolon in "${copy}"`);
    }
  }
});
