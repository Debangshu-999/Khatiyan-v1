const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function declaration(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, name); return fn.getText(source);
}
const code = ts.transpileModule([
  declaration("src/store/services/billing-api.ts", "billTitle"),
  declaration("src/features/owner/bill-views.tsx", "BillCancellationReason"),
  declaration("src/features/owner/bill-views.tsx", "BillCard"),
  declaration("src/features/billing/tenant-bill-card.tsx", "TenantBillCard"),
  declaration("app/owner-billing.tsx", "BillingCycleCard"),
  "exports.Card = BillingCycleCard; exports.Reason = BillCancellationReason; exports.TenancyCard = BillCard; exports.TenantCard = TenantBillCard;",
].join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exportsForTest = {};
const jsx = (type, props) => ({ type, props });
const descriptionStyle = { fontFamily: "Inter", fontSize: 12, lineHeight: 16 };
vm.runInNewContext(code, {
  exports: exportsForTest,
  require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  useState: () => [false, () => {}],
  NAME_UNDER_STATUS: true, CARD_STATUS_ROW: {}, CardNameRow: "View", CardStatus: "View", cardText: (size) => size, smallerCardText: (style) => style,
  useTheme: () => ({ colors: { muted: "muted" }, fonts: {}, type: { description: descriptionStyle } }),
  useOwnsProperty: () => false, isOwnerAction: () => false,
  View: "View", Text: "Text", FitText: "FitText", ReceiptText: "ReceiptIcon", CircleHelp: "HelpIcon",
  AnimatedPressable: "Button", BillStatusPill: "Status", CalendarDays: "CalendarIcon", BillTotal: "BillTotal",
  PaymentStatusBadge: "PaymentStatus", RefreshCw: "CycleIcon", LinearGradient: "Gradient", TenantBillStatusBadge: "TenantStatus",
  TenantBillAction: "Action", History: "History", Banknote: "Banknote", useSoftShadow: () => () => ({}), softShadow: () => ({}),
  ActionButton: "ActionButton", OverflowDotsButton: "Overflow", BILL_ACTION_ROW_HEIGHT: 48, markPaidLabel: () => "Mark paid",
  payButtonLabel: () => "Pay now", tenantDiscountBreakdown: () => null, bookingTokenPaise: () => 0,
  formatTenantMoney: (paise) => `₹${paise / 100}`, formatTenantDate: () => "29 Oct",
  cardName: (name) => name, formatDate: () => "29 Oct",
  spacing: { xs: 6, sm: 10, md: 14 }, radii: { card: 10 },
});

test("owner tenant-bill cards place Total payable directly below the name, beside rather than below the due date", () => {
  const card = exportsForTest.TenancyCard({ cycle: damage });
  const column = card.props.children[0].props.children[1];
  const header = column.props.children;
  const nameAndAmount = header.props.children[0];
  const amount = nameAndAmount.props.children[2];
  assert.equal(nameAndAmount.props.children[1].props.children, "Jane Smith");
  assert.equal(amount.props.children.type, "BillTotal");
  assert.equal(amount.props.children.props.cycle, damage);
  assert.equal(amount.props.style.marginTop, 6);
  assert.equal(column.props.children.length, undefined, "The amount no longer waits below the whole header row");
  assert.equal(header.props.children[1].props.children[1].props.children[0].props.children, "Due date");
});

test("tenant-facing bill cards raise the payment section while leaving room below the heading", () => {
  const card = exportsForTest.TenantCard({ cycle: { ...damage, totalAmountPaise: 150000 }, openAttempt: null, onPay: null });
  const payment = card.props.children[1];
  assert.ok(card.props.style.gap + payment.props.style.marginTop > 0, "Keep a visible gap under the heading");
  assert.equal(payment.props.style.marginTop, -6);
  assert.equal(payment.props.style.paddingTop, 6);
  assert.equal(payment.props.children[0].props.children[0].props.children, "Total payable");
  assert.equal(payment.props.children[0].props.children[1].props.children[0].props.children, "₹1500");
});

test("cancelled bills show a boundary-labelled Reason box, without the old Cancelled prefix", () => {
  const reason = "The duplicate bill was cancelled.\nNo payment is due.";
  const card = exportsForTest.Card({ cycle: { ...damage, status: "CANCELLED", cancellationReason: reason }, readOnly: false });
  const note = card.props.children.find((node) => node?.type === exportsForTest.Reason);
  assert.equal(note.type, exportsForTest.Reason);
  assert.equal(note.props.reason, reason);
  const result = note.type(note.props);
  assert.equal(result.props.style.borderWidth, 1.5);
  const [label, text] = result.props.children;
  assert.equal(label.props.style.position, "absolute");
  assert.equal(label.props.style.top, -9);
  assert.equal(label.props.children[2].props.children, "Reason");
  assert.equal(text.props.children, reason);
  assert.equal(text.props.selectable, true);
  assert.equal(text.props.style[0], descriptionStyle, "Use the same description typography as tenant Property Board items");
  assert.equal(text.props.style[1].color, "muted");
  for (const cycle of [{ ...damage, cancellationReason: reason }, { ...damage, status: "CANCELLED", cancellationReason: null }]) {
    assert.ok(!exportsForTest.Card({ cycle, readOnly: false }).props.children.some((node) => node?.type === exportsForTest.Reason));
  }
});

const damage = { cycleNumber: null, category: "ONE_OFF", tenantNameSnapshot: "Jane Smith", referenceCode: "BIL-2026-000286",
  status: "UNPAID", lineItems: [{ label: "Damage DMG-2026-000278: AC (D2)" }] };

test("one-off bill names match the receipt without exposing damage charge metadata", () => {
  assert.equal(exportsForTest.billTitle(damage), "Damage bill");
  assert.equal(exportsForTest.billTitle({ ...damage, lineItems: [{ label: "Damage DMG-2026-000279: Cupboard (D3), split 2" }] }), "Damage bill");
  assert.equal(exportsForTest.billTitle({ ...damage, lineItems: [{ label: "Early-exit penalty" }] }), "Early-exit penalty");
  assert.equal(exportsForTest.billTitle({ ...damage, lineItems: [] }), "One-off bill");
  assert.equal(exportsForTest.billTitle({ ...damage, cycleNumber: 2 }), "Cycle 2");
});

test("billing module cards match Tenant bills: raised amount, divider, bill name and restored dates", () => {
  for (const [cycle, expected] of [[damage, "Damage bill"], [{ ...damage, cycleNumber: 2, category: "RENT_CYCLE" }, "Cycle 2"]]) {
    const card = exportsForTest.Card({ cycle, readOnly: false });
    const column = card.props.children[0].props.children[1];
    const row = column.props.children;
    const amount = row.props.children[0].props.children[2];
    assert.equal(amount.props.children.type, "BillTotal");
    assert.equal(amount.props.children.props.size, 30);
    assert.equal(row.props.children[0].props.style.gap, 3);
    assert.equal(card.props.children[1].props.style.height, 1);
    const period = card.props.children[2];
    // The status ends the period's row, so the contents start level with the icon (user, 2026-11-01).
    assert.equal(period.props.children[2].type, "Status");
    assert.equal(period.props.children[0].type, cycle.category === "RENT_CYCLE" ? "CycleIcon" : "ReceiptIcon");
    // The bill's name alone, no dates beside it (user, 2026-11-01).
    assert.equal(period.props.children[1].props.children, expected);
    const statusAndDue = row.props.children[1];
    const due = statusAndDue.props.children[1];
    assert.equal(due.props.children[0].props.children, "Due date");
    assert.equal(due.props.children[1].props.children[1].props.children, "29 Oct");
  }
});

test("matching the billing layout preserves payment and overflow actions", () => {
  const actions = [];
  const card = exportsForTest.Card({ cycle: damage, readOnly: false, onAction: (...args) => actions.push(args) });
  const buttons = card.props.children.find((node) => node?.props?.style?.height === 48).props.children;
  assert.equal(buttons[0].props.label, "Mark paid");
  assert.equal(buttons[0].props.disabled, false);
  assert.equal(buttons[1].props.accessibilityLabel, "More bill actions");
  buttons[0].props.onPress();
  buttons[1].props.onPress();
  assert.equal(actions[0][0], damage);
  assert.equal(actions[0][1], "manual-payment");
  assert.equal(actions[1][1], "menu");
});
