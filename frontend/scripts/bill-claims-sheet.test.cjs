const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

let query = { data: [] };
let queriedBill;
const jsx = (type, props) => ({ type, props });
const deps = {
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "react-native": { ActivityIndicator: "Loading", Text: "Text", View: "View" },
  "@/components/empty-state": { EmptyState: "Empty" },
  "@/components/load-failed": { LoadFailedCard: "LoadFailedCard" },
  "@/components/sheet-shell": { SheetShell: "Sheet" },
  "@/features/billing/payment-claim-card": { ClaimCard: "Claim", isOwnerVisible: (claim) => !claim.hidden },
  "@/store/services/payment-intent-api": { useListBillPaymentClaimsQuery: (id) => { queriedBill = id; return query; } },
  "@/theme/spacing": { spacing: { sm: 10, xl: 24 } },
  "@/theme/use-theme": { useTheme: () => ({ colors: {}, type: {} }) },
  "../../../assets/images/workspace/payment_claims1254.png": "claims-artwork",
};
const exportsForTest = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/features/billing/bill-claims-sheet.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
vm.runInNewContext(code, { exports: exportsForTest, require(name) { assert.ok(name in deps, name); return deps[name]; } });
const render = () => exportsForTest.BillClaimsSheet({ cycle: { id: "bill-1", referenceCode: "BIL-1" }, onClose() {}, readOnly: true });

test("an empty bill-claims modal hugs its content without helper copy or a viewport-sized empty state", () => {
  query = { data: [] };
  const sheet = render();
  assert.equal(sheet.props.size, "content");
  assert.equal(sheet.props.title, "Payment claims");
  assert.equal(sheet.props.children.type, "Empty");
  assert.equal(sheet.props.children.props.compact, true);
  assert.equal(sheet.props.children.props.description, undefined);
  assert.equal(sheet.props.children.props.title, "No claims yet");
  assert.equal(queriedBill, "bill-1");
});

test("bill claims retain their cards and read-only permissions in the compact scrollable sheet", () => {
  query = { data: [{ id: "claim-1" }, { id: "hidden", hidden: true }] };
  const sheet = render();
  const claims = sheet.props.children.props.children;
  assert.equal(claims.length, 1);
  assert.equal(claims[0].type, "Claim");
  assert.equal(claims[0].props.claim.id, "claim-1");
  assert.equal(claims[0].props.readOnly, true);
});

test("compact bill-claims sheets still show loading and error states", () => {
  query = { isLoading: true };
  assert.equal(render().props.children.props.children.type, "Loading");
  query = { isError: true };
  assert.equal(render().props.children.type, "LoadFailedCard");
});
