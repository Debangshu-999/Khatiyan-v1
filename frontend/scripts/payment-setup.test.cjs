const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
const settle = () => new Promise((resolve) => setImmediate(resolve));
function load(source, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(outputText, { exports, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, "Unexpected import " + name);
    return dependencies[name];
  } });
  return exports;
}
function nodes(tree, type) {
  const found = [];
  function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== "object") return; if (node.type === type || node.type?.name === type) found.push(node); walk(node.props?.children); }
  walk(tree); return found;
}
const one = (tree, type, predicate = () => true) => { const found = nodes(tree, type).find(predicate); assert.ok(found, "Missing " + type); return found; };
const button = (tree, label) => one(tree, "ActionButton", (node) => node.props.label === label);
const { spacing, radii } = load(read("src/theme/spacing.ts"));
const { themes } = load(read("src/theme/colors.ts"));
const methods = load(read("src/features/billing/payment-methods.ts"));
const QR = "https://img/qr.png";
const held = (overrides = {}) => ({
  upiVpa: "owner@okbank", payeeName: "Asha Roy", upiPhone: "9876543210", upiQrImageUrl: QR,
  bankAccountNumber: null, bankIfsc: null, bankAccountHolder: null, acceptsUpi: true,
  acceptedMethods: ["CASH", "UPI"], cashOtpRequired: false, tokenUsesBillDetails: true,
  tokenUpiVpa: null, tokenPayeeName: null, tokenUpiPhone: null, tokenUpiQrImageUrl: null,
  tokenBankAccountNumber: null, tokenBankIfsc: null, tokenBankAccountHolder: null, version: 7, ...overrides,
});
function harness(options = {}) {
  let cursor = 0; const values = []; const effects = []; const writes = []; const reads = []; const routes = [];
  let server = options.held ?? held();
  const scope = { owner: true, property: { id: "property-1", name: "Sample PG" }, loading: false, retry() {}, ...options.scope };
  const form = { errors: {}, serverError: null };
  const theme = { useTheme: () => ({ colors: themes.light, fonts: { display: "display", sansBold: "bold" }, type: { description: { fontSize: 12 }, caption: { fontSize: 12 }, bodyStrong: { fontSize: 15 } } }) };
  const dependencies = {
    react: {
      useState: (initial) => { const at = cursor++; if (!(at in values)) values[at] = typeof initial === "function" ? initial() : initial; return [values[at], (next) => { values[at] = typeof next === "function" ? next(values[at]) : next; }]; },
      useRef: (initial) => { const at = cursor++; if (!(at in values)) values[at] = { current: initial }; return values[at]; },
      useEffect: (fn) => effects.push(fn),
    },
    "react-native": { Switch: "Switch", Text: "Text", View: "View", Image: "Image", ActivityIndicator: "ActivityIndicator" },
    "lucide-react-native": new Proxy({}, { get: (_, name) => name, has: () => true }),
    "@/features/forms/server-error": { errorMessage: () => "Please try again." },
    "@/features/forms/use-form-errors": { useFormErrors: () => ({
      errors: form.errors, blocked: Object.keys(form.errors).length > 0, serverError: form.serverError,
      validate: (found) => { form.errors = { ...found }; return Object.keys(found).length === 0; },
      clearAll: () => { form.errors = {}; },
      clearField: (field) => { const next = { ...form.errors }; delete next[field]; form.errors = next; },
      failFromServer: (message) => { form.serverError = message; }, dismissServerError: () => { form.serverError = null; },
    }) },
    "@/features/owner/owner-ui": { ActionButton: "ActionButton", FormInput: "FormInput", NoticeBar: "NoticeBar", RequiredMark: "RequiredMark" },
    "@/features/billing/upi-qr-field": { UpiQrField: "UpiQrField" },
    "@/features/billing/payment-method-toggle": { PaymentMethodToggle: "PaymentMethodToggle", PaymentMethodIcon: "PaymentMethodIcon", PaymentMethodBand: "PaymentMethodBand" },
    "@/features/billing/payment-methods": methods,
    "@/components/skeletons/owner": { OwnerPaymentDetailsSkeleton: "OwnerPaymentDetailsSkeleton" },
    "@/components/toast": { useToast: () => ({ success() {} }) },
    "@/store/hooks": { useAppSelector: (selector) => selector({ ownerWorkspace: { selectedPropertyId: scope.property?.id ?? null }, auth: { hydrated: true } }) },
    "@/features/booking/use-booking-property": { useBookingProperty: () => scope },
    "@/navigation/use-guarded-router": { useGuardedRouter: () => ({ push: (route) => routes.push(route) }) },
    "@/store/services/payment-intent-api": {
      useGetPropertyPaymentDetailsQuery: (_id, config) => { reads.push(config); return {
        data: server, currentData: config?.skip || options.loading ? undefined : server,
        isLoading: options.loading ?? false, isError: options.readError ?? false, error: "Read failed",
        refetch: () => ({ unwrap: async () => server }),
      }; },
      useLookupIfscQuery: (_code, config) => config?.skip ? { isFetching: false, data: undefined } : {
        isFetching: false, data: { status: options.ifsc ?? "FOUND", bank: "ICICI Bank", branch: "Park Street", city: "Kolkata" },
      },
      useUpdatePropertyPaymentDetailsMutation: () => [(payload) => ({ unwrap: async () => {
        if (options.writeError) throw options.writeError;
        writes.push(payload); server = { ...server, ...payload, version: server.version + 1 }; return server;
      } }), { isLoading: false }],
    },
    "@/theme/spacing": { spacing, radii }, "@/theme/use-theme": theme,
  };
  for (const [file, name] of [["alert-modal", "AlertModal"], ["animated-pressable", "AnimatedPressable"], ["card", "Card"], ["empty-state", "EmptyState"], ["screen-header", "ScreenHeader"], ["screen-scroll-view", "ScreenScrollView"]]) dependencies["@/components/" + file] = { [name]: name };
  const fields = load(read("src/features/billing/payout-fields.tsx"), dependencies);
  dependencies["@/features/billing/payout-fields"] = fields;
  const rules = load(read("src/features/booking/booking-payment-setup.ts"), dependencies);
  dependencies["@/features/booking/booking-payment-setup"] = rules;
  const bill = load(read("app/owner-payment-details.tsx"), dependencies);
  const booking = load(read("app/owner-booking-payment-setup.tsx") + "\nexports.Editor = BookingPaymentSetupEditor;", dependencies);
  function draw() {
    cursor = 0; effects.length = 0;
    if (options.booking) { const tree = booking.default(); const editor = nodes(tree, "BookingPaymentSetupEditor")[0]; return editor ? booking.Editor(editor.props) : tree; }
    return bill.default();
  }
  const open = () => { draw(); effects.splice(0).forEach((fn) => fn()); return draw(); };
  return { fields, rules, dependencies, writes, reads, routes, form, draw, open, theme, setServer: (next) => { server = next; } };
}

test("Billing returns to its original five method sections and a billing save leaves token settings untouched", async () => {
  const h = harness({ held: held({ tokenUsesBillDetails: false, tokenBankAccountNumber: "998877665544", tokenBankIfsc: "ICIC0000123" }) });
  let tree = h.open();
  assert.deepEqual(nodes(tree, "MethodBlock").map((node) => node.props.method), ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE"]);
  assert.equal(nodes(tree, "SetupSection").length, 0);
  assert.equal(read("app/owner-payment-details.tsx").includes("Booking token payments"), false);
  assert.equal(read("app/owner-payment-details.tsx").includes("LinearGradient"), false);
  one(tree, "FormInput", (node) => node.props.label === "Receiver name").props.onChangeText("Updated receiver");
  tree = h.draw(); button(tree, "Save payment setup").props.onPress(); await settle();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].version, 7);
  assert.equal("tokenUsesBillDetails" in h.writes[0], false);
  assert.equal("tokenBankAccountNumber" in h.writes[0], false);
  assert.equal(h.writes[0].payeeName, "Updated receiver");
});

test("Booking shows billing UPI and bank values in the same fields, read-only, with a link to Billing", () => {
  const h = harness({ booking: true, held: held({ bankAccountNumber: "123456789012", bankIfsc: "HDFC0001234", bankAccountHolder: "Asha Roy" }) });
  let tree = h.open();
  assert.equal(one(tree, "Switch").props.value, true);
  assert.equal(one(tree, "Switch").props.accessibilityLabel, "Use billing payment details");
  const upi = one(tree, "UpiDetailsFields").props; const bank = one(tree, "BankDetailsFields").props;
  assert.equal(upi.readOnly, true); assert.equal(bank.readOnly, true);
  assert.equal(upi.value.upiVpa, "owner@okbank"); assert.equal(upi.value.upiQrImageUrl, QR);
  assert.equal(bank.value.account, "123456789012"); assert.equal(bank.value.confirm, "123456789012");
  upi.onChange({ ...upi.value, upiVpa: "wrong@bank" }); bank.onChange({ ...bank.value, account: "000" });
  tree = h.draw(); assert.equal(one(tree, "UpiDetailsFields").props.value.upiVpa, "owner@okbank");
  button(tree, "Edit billing payment details").props.onPress(); assert.deepEqual(h.routes, ["/owner-payment-details"]);
  assert.equal(nodes(tree, "ActionButton").some((node) => node.props.label === "Save payment setup"), false);
});

test("Separate booking details validate, save their own destinations and preserve every billing field", async () => {
  const original = held(); const h = harness({ booking: true, held: original }); let tree = h.open();
  one(tree, "Switch").props.onValueChange(false); tree = h.draw();
  assert.equal(one(tree, "UpiDetailsFields").props.readOnly, false);
  assert.equal(one(tree, "BankDetailsFields").props.readOnly, false);
  assert.equal(one(tree, "UpiDetailsFields").props.value.upiVpa, "");
  button(tree, "Save payment setup").props.onPress(); await settle();
  assert.equal(h.writes.length, 0); assert.ok(h.form.errors.details);
  one(h.draw(), "BankDetailsFields").props.onChange({ account: "998877665544", confirm: "998877665544", holder: " Asha Tokens ", ifsc: "ICIC0000123" });
  tree = h.draw(); button(tree, "Save payment setup").props.onPress(); await settle();
  const sent = h.writes[0]; assert.equal(sent.tokenUsesBillDetails, false);
  assert.equal(sent.tokenBankAccountNumber, "998877665544"); assert.equal(sent.tokenBankAccountHolder, "Asha Tokens");
  assert.equal(sent.tokenUpiVpa, null); assert.equal(sent.version, 7);
  for (const key of ["upiVpa", "payeeName", "upiPhone", "upiQrImageUrl", "bankAccountNumber", "bankIfsc", "bankAccountHolder", "cashOtpRequired"]) assert.equal(sent[key], original[key], key);
  assert.deepEqual([...sent.acceptedMethods], original.acceptedMethods);
  assert.equal(button(h.draw(), "Save payment setup").props.disabled, true);
});

test("Switching a saved custom setup to billing applies it immediately with no save button", async () => {
  const own = held({ tokenUsesBillDetails: false, tokenUpiVpa: "tokens@okbank", tokenPayeeName: "Asha Tokens", tokenUpiPhone: "9123456780", tokenUpiQrImageUrl: QR });
  const h = harness({ booking: true, held: own }); let tree = h.open();
  assert.equal(one(tree, "UpiDetailsFields").props.value.upiVpa, "tokens@okbank");
  one(tree, "Switch").props.onValueChange(true); tree = h.draw();
  assert.equal(one(tree, "UpiDetailsFields").props.value.upiVpa, "owner@okbank");
  assert.equal(one(tree, "UpiDetailsFields").props.readOnly, true);
  assert.equal(nodes(tree, "ActionButton").some((node) => node.props.label === "Save payment setup"), false);
  // A second switch event cannot race the save, even before mutation state re-renders.
  one(tree, "Switch").props.onValueChange(false);
  await settle();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].tokenUsesBillDetails, true);
  assert.equal(h.writes[0].version, 7);
  assert.equal(h.writes[0].upiVpa, own.upiVpa);
  for (const key of ["tokenUpiVpa", "tokenPayeeName", "tokenUpiPhone", "tokenUpiQrImageUrl", "tokenBankAccountNumber", "tokenBankIfsc", "tokenBankAccountHolder"]) assert.equal(h.writes[0][key], null, key);
  tree = h.draw();
  assert.equal(one(tree, "Switch").props.value, true);
  assert.equal(nodes(tree, "ActionButton").some((node) => node.props.label === "Save payment setup"), false);
});

test("Switching back to already-saved billing needs no write and preserves unsaved separate fields", async () => {
  const h = harness({ booking: true }); let tree = h.open();
  one(tree, "Switch").props.onValueChange(false); tree = h.draw();
  one(tree, "UpiDetailsFields").props.onChange({ upiVpa: "draft@bank", payeeName: "Draft", upiPhone: "9123456780", upiQrImageUrl: QR });
  tree = h.draw(); one(tree, "Switch").props.onValueChange(true); await settle();
  tree = h.draw();
  assert.equal(h.writes.length, 0);
  assert.equal(nodes(tree, "ActionButton").some((node) => node.props.label === "Save payment setup"), false);
  one(tree, "Switch").props.onValueChange(false); tree = h.draw();
  assert.equal(one(tree, "UpiDetailsFields").props.value.upiVpa, "draft@bank");
  button(tree, "Save payment setup");
});

test("A failed billing-source switch restores separate mode and its save button without losing the custom draft", async () => {
  const own = held({ tokenUsesBillDetails: false, tokenUpiVpa: "tokens@bank", tokenPayeeName: "Tokens", tokenUpiPhone: "9123456780", tokenUpiQrImageUrl: QR });
  const h = harness({ booking: true, held: own, writeError: new Error("Save failed") }); let tree = h.open();
  one(tree, "Switch").props.onValueChange(true); await settle(); tree = h.draw();
  assert.equal(h.writes.length, 0);
  assert.equal(one(tree, "Switch").props.value, false);
  assert.equal(one(tree, "UpiDetailsFields").props.value.upiVpa, "tokens@bank");
  button(tree, "Save payment setup"); one(tree, "AlertModal");
});

test("Custom booking validation keeps UPI complete, confirms bank numbers and blocks only a definite missing IFSC", () => {
  const h = harness(); const empty = h.rules.bookingPaymentDraft(held());
  assert.deepEqual(Object.keys(h.rules.bookingPaymentErrors(empty, false)), []);
  const draft = { ...empty, useBilling: false };
  assert.ok(h.rules.bookingPaymentErrors(draft, false).details);
  const partial = { ...draft, upi: { ...draft.upi, upiVpa: "tokens@bank" } };
  const errors = h.rules.bookingPaymentErrors(partial, false);
  for (const key of ["upiQr", "upiPhone", "payeeName"]) assert.ok(errors[key]);
  const bank = { ...draft, bank: { account: "998877665544", confirm: "99", holder: "", ifsc: "ICIC0000123" } };
  assert.ok(h.rules.bookingPaymentErrors(bank, false).confirm);
  bank.bank.confirm = bank.bank.account;
  assert.deepEqual(Object.keys(h.rules.bookingPaymentErrors(bank, false)), []);
  assert.equal(h.rules.bookingPaymentErrors(bank, true).ifsc, h.fields.IFSC_NOT_FOUND);
  assert.ok(h.rules.bookingPaymentErrors({ ...bank, bank: { ...bank.bank, ifsc: "BAD" } }, false).ifsc);
});

test("A booking payout page never reads owner payment destinations for managers or unknown permissions", () => {
  for (const scope of [{ owner: false, loading: false }, { owner: false, loading: true }]) {
    const h = harness({ booking: true, scope }); const tree = h.open();
    assert.ok(h.reads.every((read) => read.skip));
    assert.equal(nodes(tree, "UpiDetailsFields").length, 0);
    if (scope.loading) one(tree, "OwnerPaymentDetailsSkeleton"); else assert.equal(one(tree, "EmptyState").props.title, "Owner only");
  }
});

test("Newer payment details block stale saves and can be reloaded before editing", async () => {
  const h = harness({ booking: true }); let tree = h.open();
  one(tree, "Switch").props.onValueChange(false); tree = h.draw();
  h.setServer(held({ version: 8, upiVpa: "new@okbank" })); tree = h.draw();
  assert.equal(button(tree, "Save payment setup").props.disabled, true);
  button(tree, "Save payment setup").props.onPress(); await settle(); assert.equal(h.writes.length, 0);
  button(tree, "Reload details").props.onPress(); await settle(); tree = h.draw();
  assert.equal(one(tree, "UpiDetailsFields").props.value.upiVpa, "new@okbank");
  assert.equal(one(tree, "UpiDetailsFields").props.readOnly, true);
});

test("Inherited fields refuse edits including QR removal, while ordinary editable fields still work", () => {
  const h = harness(); const changes = [];
  const upiValue = { payeeName: "Asha", upiPhone: "9876543210", upiQrImageUrl: QR, upiVpa: "owner@bank" };
  const upi = h.fields.UpiDetailsFields({ errors: {}, readOnly: true, onChange: (next) => changes.push(next), value: upiValue });
  assert.equal(one(upi, "UpiQrField").props.readOnly, true);
  one(upi, "UpiQrField").props.onChange("");
  for (const field of nodes(upi, "FormInput")) { assert.equal(field.props.disabled, true); field.props.onChangeText("wrong"); }
  const bank = h.fields.BankDetailsFields({ errors: {}, readOnly: true, ifscFetching: false, onChange: (next) => changes.push(next), value: { account: "1234", confirm: "1234", holder: "Asha", ifsc: "" } });
  for (const field of nodes(bank, "FormInput")) { assert.equal(field.props.disabled, true); field.props.onChangeText("wrong"); }
  assert.equal(changes.length, 0);
  const qr = load(read("src/features/billing/upi-qr-field.tsx"), { ...h.dependencies,
    "expo-image-picker": {}, "@/components/delete-icon": { DeleteIcon: "DeleteIcon" },
    "@/components/field-error": { FieldError: "FieldError" },
    "@/features/uploads/upload-asset": { uploadAsset() {}, UploadError: class extends Error {} },
  });
  for (const url of [QR, ""]) {
    const tree = qr.UpiQrField({ url, readOnly: true, onChange: () => changes.push("bad") });
    assert.equal(nodes(tree, "ActionButton").length, 0);
    assert.equal(nodes(tree, "AnimatedPressable").length, 0);
  }
});

test("Payment saves retain If-Match and refresh token instructions as well as billing details", () => {
  const source = read("src/store/services/payment-intent-api.ts");
  assert.match(source, /tokenUsesBillDetails\?: boolean/);
  assert.match(source, /headers: ifMatch\(version\)/);
  assert.match(source, /invalidatesTags: \["PaymentDetails", "PaymentIntent", "Booking"\]/);
});

test("the shared UPI and bank fields: all four UPI details together, and an account number typed twice", () => {
  const h = harness(); const { fields } = h;
  assert.deepEqual({ ...fields.upiFilled(fields.EMPTY_UPI) }, { payeeName: false, upiPhone: false, upiQr: false, upiVpa: false, any: false, complete: false });
  const some = fields.upiFilled({ payeeName: " ", upiPhone: "", upiQrImageUrl: QR, upiVpa: "a@b" });
  assert.equal(some.any, true); assert.equal(some.complete, false); assert.equal(some.payeeName, false);
  assert.equal(fields.upiFilled({ payeeName: "A", upiPhone: "9", upiQrImageUrl: QR, upiVpa: "a@b" }).complete, true);

  // Nothing is asked for until one of the four is filled. The phone keeps its digits only.
  const changes = [];
  let tree = fields.UpiDetailsFields({ errors: {}, onChange: (next) => changes.push(next), value: fields.EMPTY_UPI });
  assert.equal(one(tree, "UpiQrField").props.required, false);
  assert.deepEqual(nodes(tree, "FormInput").map((node) => node.props.label), ["UPI address", "UPI phone number", "Receiver name"]);
  one(tree, "FormInput", (node) => node.props.label === "UPI phone number").props.onChangeText("98-76 5");
  assert.equal(changes[0].upiPhone, "98765");
  tree = fields.UpiDetailsFields({ errors: { upiQr: "Add this too" }, onChange() {}, value: { ...fields.EMPTY_UPI, upiVpa: "a@b" } });
  assert.equal(one(tree, "UpiQrField").props.required, true); assert.equal(one(tree, "UpiQrField").props.error, "Add this too");

  // A changed account number is typed again from scratch, and a second entry that differs is said under it.
  const bank = [];
  const value = { account: "1234567", confirm: "1234567", holder: "", ifsc: "" };
  tree = fields.BankDetailsFields({ errors: {}, ifscFetching: false, ifscLookup: undefined, onChange: (next) => bank.push(next), value });
  const input = (label, from = tree) => one(from, "FormInput", (node) => node.props.label === label);
  input("Account number").props.onChangeText("12345678a");
  assert.deepEqual({ ...bank[0] }, { account: "12345678", confirm: "", holder: "", ifsc: "" });
  assert.equal(input("Re-enter account number").props.noPaste, true); assert.equal(input("Re-enter account number").props.error, undefined);
  input("IFSC").props.onChangeText("icic0000123"); assert.equal(bank[1].ifsc, "ICIC0000123");
  tree = fields.BankDetailsFields({ errors: {}, ifscFetching: false, ifscLookup: { status: "NOT_FOUND" }, onChange() {}, value: { account: "1234567", confirm: "123", holder: "", ifsc: "ICIC0000123" } });
  assert.equal(input("Re-enter account number").props.error, "Account numbers do not match.");
  assert.equal(input("IFSC").props.error, "No bank branch uses this IFSC. Check your cheque book or passbook.");
  one(tree, "IfscBranchNote");
});

test("every payment setup and pay sheet file parses: one the bundler would refuse fails here, not on the phone", () => {
  for (const file of ["app/owner-payment-details.tsx", "app/owner-booking-payment-setup.tsx", "src/features/booking/booking-payment-setup.ts", "src/features/billing/payout-fields.tsx", "src/features/billing/pay-bill-sheet.tsx", "src/features/billing/raise-claim-modal.tsx", "src/features/billing/payment-methods.ts", "src/store/services/payment-intent-api.ts"]) {
    const { diagnostics } = ts.transpileModule(read(file), { fileName: file, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    assert.deepEqual(diagnostics.map((found) => ts.flattenDiagnosticMessageText(found.messageText, " ")), [], file);
  }
});
