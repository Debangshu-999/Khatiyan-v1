const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const screen = fs.readFileSync(path.join(__dirname, "..", "app/owner-billing.tsx"), "utf8");

function declaration(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, name);
  return fn.getText(source);
}

const code = ts.transpileModule([
  declaration("src/store/services/billing-api.ts", "isDamageBill"),
  declaration("app/owner-billing.tsx", "filterBillsByType"),
  declaration("app/owner-billing.tsx", "unpaidBillsFirst"),
  "exports.filterBillsByType = filterBillsByType; exports.unpaidBillsFirst = unpaidBillsFirst;",
].join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const list = {};
vm.runInNewContext(code, { exports: list });

const rent = { category: "RENT_CYCLE", cycleNumber: 3, id: "rent", lineItems: [{ label: "Rent" }], status: "PAID" };
const damage = { category: "ONE_OFF", cycleNumber: null, id: "damage", lineItems: [{ label: "Damage DMG-2026-000012: Chair (D2), split 2" }], status: "PAID" };
const other = { category: "ONE_OFF", cycleNumber: null, id: "other", lineItems: [{ label: "Early exit penalty" }], status: "PAID" };
const ids = (cycles) => Array.from(cycles, (cycle) => cycle.id);

test("the type filter splits one-off bills into damage and other, and All keeps everything", () => {
  const bills = [rent, damage, other];
  assert.deepEqual(ids(list.filterBillsByType(bills, "ALL")), ["rent", "damage", "other"]);
  assert.deepEqual(ids(list.filterBillsByType(bills, "RENT")), ["rent"]);
  assert.deepEqual(ids(list.filterBillsByType(bills, "DAMAGE")), ["damage"]);
  assert.deepEqual(ids(list.filterBillsByType(bills, "OTHER")), ["other"]);
});

test("money still owed comes first, and the rest keep their order", () => {
  const bill = (id, status) => ({ id, status });
  const sorted = list.unpaidBillsFirst([
    bill("paid", "PAID"), bill("unpaid", "UNPAID"), bill("upcoming", "UPCOMING"), bill("overdue", "OVERDUE"), bill("awaiting", "CONFIRMATION_PENDING"), bill("unpaid2", "UNPAID"),
  ]);
  assert.deepEqual(ids(sorted), ["overdue", "unpaid", "unpaid2", "paid", "upcoming", "awaiting"]);
});

test("the screen has one list, no tabs, and All as the default type", () => {
  assert.doesNotMatch(screen, /TabSwitcher|SegmentedControl|cycleView/);
  assert.match(screen, /useState<BillTypeFilter>\("ALL"\)/);
  assert.match(screen, /unpaidBillsFirst\(filterBillsByType\(statusFilteredCycles, billType\)\)/);
  // The bubble and floating list the concerns screen uses, with no blue edge while open.
  assert.match(screen, /<FilteredSearch onChange=\{onBillTypeChange\} options=\{BILL_TYPE_OPTIONS\} purpose="Bill type"/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", "src/components/filtered-queue.tsx"), "utf8"), /open \? colors\.primary/);
  // The help icon is in the screen's header, and the count is a pill above the first card.
  assert.match(screen, /title="Billing"\s+trailing=\{\s+<AnimatedPressable\s+accessibilityLabel="How billing cycles work"/);
  assert.match(screen, /alignSelf: "flex-end"[\s\S]{0,300}cycles\.length \+ " " \+ noun[\s\S]{0,200}<CycleListFrame>/);
  // The help modal's chips are a table: a heading row over one bordered row per status.
  assert.match(screen, /<Text style=\{heading\}>Status<\/Text>[\s\S]{0,120}<Text style=\{heading\}>What it means<\/Text>/);
  // Upcoming cycles are rent cycles, so a damage or other list has no link to them.
  assert.match(screen, /footer=\{showsRentCycles \? <UpcomingCyclesLink/);
});

test("unpaid has one icon, and Payment history's three counts wear filled marks with sentence case labels", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const views = read("src/features/owner/bill-views.tsx");
  assert.match(views, /icon: UnpaidBillGlyph, label: "Unpaid"/);
  assert.match(views, /"UPCOMING" \? Clock3 : UnpaidBillGlyph/);
  assert.match(read("src/features/billing/tenant-bill-card.tsx"), /"UPCOMING" \? Clock3 : UnpaidBillGlyph/);
  assert.doesNotMatch(read("src/features/owner/status-filter-marks.tsx"), /case "UNPAID":\s+return <Disc color=\{colors\.warning\} icon=\{Wallet\}/);
  const history = read("app/owner-payment-history.tsx");
  assert.match(history, /<HistoryMetric label="Unpaid" status="UNPAID"/);
  assert.match(history, /<BillStatusMark value=\{status\} \/>/);
  assert.doesNotMatch(history, /type\.eyebrow, \{ color: colors\.kicker, fontSize: 9/);
  assert.match(history, /cardShadow\(colors\.shadow\)/);
});
