const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
const spacing = { xs: 6, sm: 10, md: 14, lg: 18 };
const theme = { colors: {}, fonts: { mono: "Mono" }, type: {} };
const dependencies = {
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "react-native": { Image: "Image", ScrollView: "ScrollView", Text: "Text", View: "View" },
  "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
  "lucide-react-native": { FileDown: "Download", Mail: "Mail", MapPin: "MapPin", Phone: "Phone" },
  "@/components/modal-title-rule": { ModalTitleRule: "Rule" },
  "@/components/modal-title": { ModalTitle: "Title" },
  "@/components/bottom-sheet-modal": { BottomSheetModal: "Sheet" },
  "@/components/help-modal-header": { SheetCloseButton: "SheetCloseButton" },
  "@/components/fit-text": { FitText: "FitText" },
  "@/features/owner/bill-views": { formatDate: () => "29 Oct" },
  "@/features/owner/owner-ui": { humanizeToken: (text) => text, ActionButton: "Button" },
  "@/features/owner/phone-display": { formatIndianPhone: (text) => text },
  "@/store/services/billing-api": { billTitle: (cycle) => cycle.cycleNumber != null ? `Rent cycle #${cycle.cycleNumber}` : cycle.lineItems[0]?.label ?? "One-off bill", bookingTokenPaise: () => 0 },
  "@/theme/spacing": { spacing },
  "@/theme/use-theme": { useTheme: () => theme },
  "../../../assets/icons/brand/logo-light-no-tagline.png": "logo",
};
const exportsForTest = {};
const code = ts.transpileModule(read("src/features/billing/bill-receipt-sheet.tsx") + "\nexports.chargeLabel = receiptChargeLabel;", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
vm.runInNewContext(code, { exports: exportsForTest, require(name) {
  assert.ok(name in dependencies, name); return dependencies[name];
} });

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(typeof tree.type === "function" ? tree.type(tree.props) : tree.props?.children)];
}
const extra = (label, more = {}) => ({ id: label, type: "EXTRA_CHARGE", label, amountPaise: 150000, settlementAction: "ADDED_TO_BILL", ...more });
const base = { category: "ONE_OFF", baseAmountPaise: 0, extraChargePaise: 150000, lateFeeAmountPaise: 0, discountAmountPaise: 0,
  totalAmountPaise: 150000, status: "UNPAID", tenantNameSnapshot: "Tenant", lineItems: [extra("Damage DMG-2026-000278: AC (D2)")] };
const document = (cycle = base, contact = { phone: null, email: null }) => exportsForTest.BillReceiptDocument({ cycle, contact, property: { name: "Property" } });
const rows = (cycle) => nodes(document(cycle)).filter((node) => node.type?.name === "DocRow");

test("one-off receipts omit base rent; rent cycles still show it even when zero", () => {
  assert.ok(!rows(base).some((node) => node.props.label === "Base Rent"));
  assert.ok(rows({ ...base, category: "RENT_CYCLE" }).some((node) => node.props.label === "Base Rent"));
  const summary = rows(base).filter((node) => ["Subtotal", "Total Amount Due"].includes(node.props.label));
  assert.equal(summary.length, 2);
  assert.ok(summary.every((node) => node.props.amount === "₹1,500.00"), "Display changes must not change the totals");
});

test("damage charges show the item and level above a smaller reference line", () => {
  const row = rows(base).find((node) => node.props.label === "Damage: AC - D2");
  assert.equal(row.props.reference, "(DMG-2026-000278)");
  const rendered = row.type(row.props);
  const [label, reference] = rendered.props.children[0].props.children;
  assert.equal(label.props.children, "Damage: AC - D2");
  assert.equal(reference.props.children, "(DMG-2026-000278)");
  assert.ok(reference.props.style.fontSize < label.props.style.fontSize);
  assert.equal(reference.props.style.fontFamily, "Mono");
});

test("only canonical damage labels are split; punctuation and ordinary charges stay intact", () => {
  const format = exportsForTest.chargeLabel;
  assert.equal(format("Damage DMG-2026-000123: AC (split), <large> & fan (D3)").label, "Damage: AC (split), <large> & fan - D3");
  // A damage recorded with levels off has no level and is still split (2026-11-07).
  assert.equal(format("Damage DMG-2026-000124: Kettle").label, "Damage: Kettle");
  assert.equal(format("Damage DMG-2026-000124: Kettle").reference, "(DMG-2026-000124)");
  for (const label of ["Cleaning fee", "Damage assessment", "Damage for the AC"]) {
    assert.equal(format(label).label, label);
    assert.equal(format(label).reference, undefined);
  }
});

test("a single charge and a split's charge both read as a Damage bill, and the split keeps its number", () => {
  for (const suffix of ["", ", split 2"]) {
    const cycle = { ...base, lineItems: [extra(`Damage DMG-2026-000279: Cupboard (D3)${suffix}`)] };
    const result = document(cycle);
    assert.equal(result.props.children[2].props.children[0].props.rows[1].value, "Damage bill");
    const charge = rows(cycle).find((node) => node.props.label === `Damage: Cupboard - D3${suffix}`);
    assert.ok(charge);
    assert.equal(charge.props.reference, "(DMG-2026-000279)");
    assert.equal(charge.props.amount, "₹1,500.00");
    assert.ok(!JSON.stringify(nodes(result).filter((node) => typeof node.type === "string")).includes("your share"));
  }
});

test("bill details stack above Bill To, with Bill name for one-offs and Bill Cycle for rent", () => {
  const oneOff = document();
  const tables = oneOff.props.children[2];
  assert.equal(tables.props.style.flexDirection, "column");
  assert.deepEqual(Array.from(tables.props.children, (node) => node.props.title), ["Bill Details", "Bill To"]);
  for (const table of tables.props.children) {
    const result = table.type(table.props);
    assert.equal(result.props.style.flex, undefined, "A stacked table must retain its natural height");
    assert.equal(result.props.style.alignSelf, "stretch");
  }
  const details = tables.props.children[0].props.rows;
  assert.equal(details[1].label, "Bill name");
  assert.equal(details[1].value, "Damage bill");
  const rent = document({ ...base, category: "RENT_CYCLE", cycleNumber: 2 });
  assert.equal(rent.props.children[2].props.children[0].props.rows[1].label, "Bill Cycle");
  assert.equal(rent.props.children[2].props.children[0].props.rows[1].value, "Rent cycle #2");
});

test("waived charges stay off the receipt but deposit-settled zero lines remain", () => {
  const result = rows({ ...base, lineItems: [...base.lineItems,
    extra("Undone charge", { amountPaise: 0, settlementAction: "WAIVED" }),
    extra("Settled from deposit", { amountPaise: 0, settlementAction: "ADJUSTED_FROM_DEPOSIT" }),
  ] });
  assert.ok(!result.some((node) => node.props.label === "Undone charge"));
  assert.ok(result.some((node) => node.props.label === "Settled from deposit"));
});

test("the letterhead starts near the top and renders available owner phone and email", () => {
  const result = document(base, { phone: "9000000000", email: "owner@example.com" });
  assert.equal(result.props.style.paddingTop, spacing.xs);
  assert.equal(result.props.children[0].props.style.alignItems, "flex-start");
  const contents = nodes(result);
  assert.ok(contents.some((node) => node.props?.children === "9000000000"));
  assert.ok(contents.some((node) => node.props?.children === "owner@example.com"));
  const sheet = exportsForTest.BillReceiptSheet({ cycle: base, contact: {}, property: null, onClose() {} });
  const rendered = sheet.props.children(() => {});
  assert.equal(nodes(rendered).find((node) => node.type === "Rule").props.flush, true, "The receipt already spaces its title rule");
});

test("damage bill letterheads use the owner's contacts, never a manager's", () => {
  const source = ts.createSourceFile("detail.tsx", read("src/features/damage/damage-record-detail-sheet.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "DamageBillSheet");
  const compiled = ts.transpileModule(fn.getText(source) + "\nexports.render = DamageBillSheet;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const owner of [true, false]) {
    const exports = {};
    vm.runInNewContext(compiled, { exports,
      require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx }; },
      useAppSelector: (select) => select({ auth: { user: { id: owner ? "owner" : "manager", phone: "9000000000", email: "owner@example.com" } } }),
      useListManagedTenancyBillingCyclesQuery: () => ({ data: [{ id: "bill" }] }),
      useListMyPropertiesQuery: () => ({ data: [{ id: "property", ownerId: "owner" }] }),
      BillReceiptSheet: "Receipt",
    });
    const result = exports.render({ propertyId: "property", share: { tenancyId: "tenancy", billId: "bill" } });
    assert.equal(result.props.contact.phone, owner ? "9000000000" : null);
    assert.equal(result.props.contact.email, owner ? "owner@example.com" : null);
    assert.equal(result.props.cycle.id, "bill");
  }
});
