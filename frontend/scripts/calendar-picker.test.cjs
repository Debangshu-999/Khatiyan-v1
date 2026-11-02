const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exports_ = {};
vm.runInNewContext(ts.transpileModule(read("src/components/calendar-month.ts"), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { exports: exports_, Date, Array, Number, String });
const { dateOfIso, dayAllowed, isoOfDate, monthCells, openingMonth, stepMonth } = exports_;

test("a month is always six rows from Sunday, with its days in the right columns", () => {
  const november = monthCells("2026-11"); // 1 November 2026 is a Sunday.
  assert.equal(november.length, 42);
  assert.equal(november[0], "2026-11-01");
  assert.equal(november[29], "2026-11-30");
  assert.equal(november[30], null);

  const february = monthCells("2028-02"); // A leap year, starting on a Tuesday.
  assert.deepEqual(february.slice(0, 3), [null, null, "2028-02-01"]);
  assert.equal(february.filter(Boolean).length, 29);
});

test("the calendar opens on the picked date, else the caller's month, else this month, always in bounds", () => {
  const today = "2026-11-01";
  assert.equal(openingMonth({ today }), "2026-11");
  assert.equal(openingMonth({ initialMonth: "2000-01", today }), "2000-01");
  assert.equal(openingMonth({ initialMonth: "2000-01", today, value: "1995-04-17" }), "1995-04");
  assert.equal(openingMonth({ minimum: "2027-03-10", today }), "2027-03");
  assert.equal(openingMonth({ maximum: "2026-08-31", today }), "2026-08");
});

test("months step across a year, and a bound includes its own day", () => {
  assert.equal(stepMonth("2026-12", 1), "2027-01");
  assert.equal(stepMonth("2027-01", -1), "2026-12");
  assert.equal(stepMonth("2026-11", -12), "2025-11");
  assert.equal(dayAllowed("2026-11-10", "2026-11-10", "2026-11-10"), true);
  assert.equal(dayAllowed("2026-11-09", "2026-11-10"), false);
  assert.equal(dayAllowed("2026-11-11", undefined, "2026-11-10"), false);
  assert.equal(dayAllowed("2026-11-11"), true);
});

test("a picked day comes back as the same day", () => {
  assert.equal(isoOfDate(dateOfIso("2026-11-01")), "2026-11-01");
  assert.equal(dateOfIso("2026-11-01").getHours(), 12);
});

test("no date field opens the system dialog any more, and only the clock stays native", () => {
  const dateFields = [
    "app/owner-expenses.tsx", "app/owner-onboard-tenant.tsx", "app/owner-pnl.tsx", "app/owner-rooms.tsx", "app/tenancy-exit-request.tsx",
    "src/features/account/date-of-birth-field.tsx", "src/features/analytics/period-picker-sheet.tsx", "src/features/booking/booking-date-field.tsx",
    "src/features/owner/staff-workspace.tsx", "src/features/tenancy/request-correction-actions.tsx",
  ];
  for (const file of dateFields) {
    const source = read(file);
    assert.doesNotMatch(source, /datetimepicker/, file);
    assert.match(source, /<CalendarPicker/, file);
  }
  const notice = read("app/owner-notice-create.tsx");
  assert.match(notice, /picker\?\.mode === "time" \? \(\s+<DateTimePicker\s+mode="time"/);
  assert.match(notice, /picker\?\.mode === "date" \? \(\s+<CalendarPicker/);
});
