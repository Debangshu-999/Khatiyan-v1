const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
function load(source, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const settle = () => new Promise((resolve) => setImmediate(resolve));
const form = load(read("src/features/booking/booking-settings-form.ts"));
const { isUnchanged } = load(read("src/features/forms/unchanged.ts"));
const { spacing, radii } = load(read("src/theme/spacing.ts"));
const { themes } = load(read("src/theme/colors.ts"));
const settings = (overrides = {}) => ({ propertyId: "property-1", configured: true, tokenRequired: true, tokenAmountPaise: 250000, tokenRefundable: false, maximumAdvanceDays: 21, showFutureVacancies: true, assignmentMode: "FIRST_VIEW", includeOwnerInTurns: false, minimumAdvanceDays: 3, datePushMaximumDays: 7, version: 4, ...overrides });

test("settings round-trip includes all current API settings and exact paise", () => {
  const loaded = settings({ tokenAmountPaise: 123456, includeOwnerInTurns: true, assignmentMode: "SYSTEM_TURNS" });
  const result = form.validateBookingSettings(form.bookingSettingsDraft(loaded), loaded);
  assert.equal(result.valid, true);
  assert.deepEqual(clone(result.body), { tokenRequired: true, tokenAmountPaise: 123456, tokenRefundable: false, showFutureVacancies: true, assignmentMode: "SYSTEM_TURNS", includeOwnerInTurns: true });
});

test("token on requires positive money and an explicit refund answer", () => {
  const loaded = settings({ configured: false, tokenAmountPaise: null, tokenRefundable: null, version: null });
  const draft = form.bookingSettingsDraft(loaded);
  const result = form.validateBookingSettings(draft, loaded);
  assert.equal(result.valid, false);
  assert.ok(result.errors.tokenAmount);
  assert.ok(result.errors.tokenRefundable);
  assert.equal(form.validateBookingSettings({ ...draft, tokenAmount: "0.01", tokenRefundable: false }, loaded).valid, true);
});

test("money rejects exponent notation, rounding, and invalid input", () => {
  const loaded = settings();
  for (const amount of ["0", "-1", "1.001", "1e3", "1,000", "12x", "Infinity", "9007199254740992"]) {
    assert.ok(form.validateBookingSettings({ ...form.bookingSettingsDraft(loaded), tokenAmount: amount }, loaded).errors.tokenAmount, amount);
  }
});

test("turning token off sends null financial settings, without losing the form's draft", () => {
  const loaded = settings();
  const draft = { ...form.bookingSettingsDraft(loaded), tokenRequired: false, tokenAmount: "invalid", tokenRefundable: null };
  const result = form.validateBookingSettings(draft, loaded);
  assert.equal(result.valid, true);
  assert.equal(result.body.tokenAmountPaise, null);
  assert.equal(result.body.tokenRefundable, null);
  assert.equal(draft.tokenAmount, "invalid");
});

// User, 2026-10-10: 3 to 21 days is the window at every property, and a week's push makes 28.
test("how far ahead a tenant may book is said to the owner, never asked of them, and never sent", async () => {
  const loaded = settings();
  const draft = form.bookingSettingsDraft(loaded);
  assert.equal("maximumAdvanceDays" in draft, false);
  assert.equal("maximumAdvanceDays" in form.validateBookingSettings(draft).body, false);
  const h = harness();
  const props = editorProps(loaded);
  let tree = h.render(h.Editor, props);
  assert.equal(nodes(tree, "FormInput").some((node) => /advance|days/i.test(node.props.label)), false);
  // Two rules, each under its own heading, each a plain sentence or two (user, 2026-10-10).
  // The charge for bookings 28+ days ahead was dropped for v1 (user, 2026-10-18).
  const policies = nodes(card(tree, "Move-in policies"), "Policy");
  assert.deepEqual(Array.from(policies.map((node) => node.props.heading)), ["Move-in date", "Date change"]);
  const [moveIn, change] = policies.map((node) => node.props.text);
  assert.ok(moveIn.includes("3 to 21 days after sending the request"), moveIn);
  assert.ok(change.includes("one time, by up to 7 days") && change.includes("past 28 days"), change);
  for (const text of [moveIn, change]) assert.ok(text.split(". ").length <= 2, text);
  // The numbers shown are the server's own, not typed into the screen.
  const source = read("app/owner-booking-settings.tsx");
  for (const typed of ["21 days", "7 days", "28 "]) assert.equal(source.includes(typed), false, typed);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  tree = h.render(h.Editor, props);
  button(tree, "Save changes").props.onPress();
  await settle();
  assert.equal("maximumAdvanceDays" in h.writes[0].body, false);
});

test("booking access changes only BOOKINGS and keeps the actual loaded version", () => {
  const permissions = { propertyId: "property-1", managerUserId: "manager-1", owner: false, version: 17, levels: { BOOKINGS: "NONE", CHATS: "MANAGE", ROOMS: "VIEW", TENANCY_CREATE: "NONE" } };
  const before = clone(permissions);
  const grant = form.bookingAccessReplacement(permissions, true);
  assert.equal(grant.version, 17);
  assert.equal(grant.levels.BOOKINGS, "MANAGE");
  assert.equal(grant.levels.CHATS, "MANAGE");
  assert.equal(grant.levels.ROOMS, "VIEW");
  assert.deepEqual(clone(permissions), before);
  assert.equal(form.bookingAccessReplacement(permissions, false).levels.BOOKINGS, "NONE");
});

function harness(options = {}) {
  let cursor = 0;
  const values = [];
  const effects = [];
  const writes = [];
  const queryOptions = [];
  const closeCalls = [];
  const warnings = [];
  const guarded = [];
  const letThrough = [];
  const appState = { ownerWorkspace: { selectedPropertyId: "property-1" }, auth: { hydrated: true }, ...options.appState };
  const queries = {
    properties: { currentData: [{ id: "property-1", name: "Sample PG", active: true }], refetch() {}, ...options.properties },
    permissions: { currentData: { owner: true }, refetch() {}, ...options.permissions },
    settings: { currentData: settings(), refetch: () => ({ unwrap: async () => settings({ version: 9 }) }), ...options.settingsQuery },
  };
  const dependencies = {
    react: {
      useState: (initial) => { const at = cursor++; if (!(at in values)) values[at] = typeof initial === "function" ? initial() : initial; return [values[at], (next) => { values[at] = typeof next === "function" ? next(values[at]) : next; }]; },
      useRef: (initial) => { const at = cursor++; if (!(at in values)) values[at] = { current: initial }; return values[at]; },
      useEffect: (callback) => effects.push(callback),
    },
    "react-native": { View: "View", Text: "Text", Switch: "Switch" },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" },
    "../../../assets/empty-states/No-Person_512x512.png": "no-person.png",
    // Any icon is its own name. The screens choose the glyphs.
    "lucide-react-native": new Proxy({}, { get: (_, name) => name, has: () => true }),
    "@/theme/use-theme": { useTheme: () => ({ colors: themes.light, type: {}, fonts: { sansBold: "bold" } }) },
    "@/theme/spacing": { spacing, radii },
    "@/store/hooks": { useAppSelector: (fn) => fn(appState) },
    "@/features/forms/unchanged": { isUnchanged },
    "@/features/forms/server-error": { errorMessage: () => options.errorText ?? "Save refused. Refresh and try again." },
    "@/features/enquiry/enquiry-tags": { InitialsAvatar: "InitialsAvatar" },
    "@/store/stale-refusal": { isStaleRefusal: (message) => /changed since you opened it/.test(message) },
    // The guard is the navigator's business. Here it only records what it was told.
    "@/components/use-unsaved-changes": { useUnsavedChanges: (dirty) => { guarded.push(dirty); return { dialog: null, guard: (close) => close(), markSaved: () => letThrough.push(true) }; } },
    "@/features/booking/booking-settings-form": form,
    // The very rows the Enquiries screen's handler setting is made of.
    "@/features/enquiry/handler-mode-sheet": { CircleCheckbox: "CircleCheckbox", ModeRow: "ModeRow" },
    "@/features/owner/owner-ui": { ActionButton: "ActionButton", FormInput: "FormInput", IconButton: "IconButton", NoticeBar: "NoticeBar" },
    "@/components/how-it-works-sheet": { HowItWorksSheet: "HowItWorksSheet" },
    "@/components/pinned-footer": { PinnedFooter: "PinnedFooter", PINNED_FOOTER_CLEARANCE: 104 },
    "@/components/toast": { useToast: () => ({ success() {}, warning: (message) => warnings.push(message) }) },
    "@/store/services/property-api": {
      useListMyPropertiesQuery: () => queries.properties,
      useGetMyPropertyPermissionsQuery: () => queries.permissions,
      useListPropertyManagersQuery: () => options.managersQuery ?? { currentData: [], isSuccess: true },
      useReplaceManagerPermissionsMutation: () => [(payload) => ({ unwrap: async () => { writes.push({ kind: "grant", ...payload }); if (payload.managerUserId === options.failManager) throw { status: 409 }; return payload; } })],
    },
    "@/features/owner/phone-display": { formatIndianPhone: (phone) => phone },
    "@/components/skeletons/primitives": { Skeleton: "Skeleton" },
    "@/store/services/booking-api": {
      useGetBookingSettingsQuery: (id, config) => { queryOptions.push({ id, ...config }); return queries.settings; },
      useCreateBookingSettingsMutation: () => [(payload) => ({ unwrap: async () => { writes.push({ kind: "create", ...payload }); if (options.saveError) throw options.saveError; return settings({ ...payload.body, version: 0 }); } })],
      useSaveBookingSettingsMutation: () => [(payload) => ({ unwrap: async () => { writes.push({ kind: "save", ...payload }); if (options.saveError) throw options.saveError; return settings({ ...payload.body, version: payload.version + 1 }); } })],
    },
  };
  for (const [module, name] of [["alert-modal", "AlertModal"], ["animated-pressable", "AnimatedPressable"], ["card", "Card"], ["empty-state", "EmptyState"], ["field-error", "FieldError"], ["screen-header", "ScreenHeader"], ["screen-scroll-view", "ScreenScrollView"], ["segmented-choice", "SegmentedChoice"], ["sheet-shell", "SheetShell"]]) dependencies[`@/components/${module}`] = { [name]: name };
  dependencies["@/components/skeletons/booking/settings"] = { BookingSettingsSkeleton: "BookingSettingsSkeleton", BookingAccessSkeleton: "BookingAccessSkeleton" };
  const list = load(read("src/features/booking/booking-access-list.tsx"), dependencies);
  dependencies["@/features/booking/booking-access-list"] = list;
  const module = load(`${read("app/owner-booking-settings.tsx")}\nexports.Editor = BookingSettingsEditor;`, dependencies);
  return { ...module, ...list, writes, queryOptions, closeCalls, warnings, guarded, letThrough, values, render: (component, props) => { cursor = 0; const tree = component(props); for (const effect of effects.splice(0)) effect(); return tree; } };
}

function nodes(tree, type) {
  const result = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (node.type === type || node.type?.name === type) result.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return result;
}
const one = (tree, type, predicate = () => true) => { const result = nodes(tree, type).find(predicate); assert.ok(result, `Missing ${type}`); return result; };
const button = (tree, label) => one(tree, "ActionButton", (node) => node.props.label === label);
const editorProps = (loaded = settings()) => ({ propertyName: "Sample PG", settings: loaded, readError: null, onReload: async () => settings({ version: 9 }) });

test("settings gate skips owner-only reads for managers and unresolved permissions", () => {
  for (const permissions of [{ currentData: { owner: false } }, { currentData: undefined }]) {
    const h = harness({ permissions });
    const tree = h.render(h.default);
    assert.equal(h.queryOptions.at(-1).skip, true);
    assert.equal(nodes(tree, "BookingSettingsEditor").length, 0);
    assert.ok(nodes(tree, "EmptyState").length || nodes(tree, "BookingSettingsSkeleton").length);
  }
});

test("load failure is a retry, never a no-property empty state", () => {
  const h = harness({ properties: { currentData: undefined, isError: true, error: { status: 500 } } });
  const tree = h.render(h.default);
  button(tree, "Try again");
  assert.equal(nodes(tree, "EmptyState").length, 0);
});

test("missing selected property cannot edit a different property's settings", () => {
  const h = harness({ appState: { ownerWorkspace: { selectedPropertyId: "removed-property" }, auth: { hydrated: true } } });
  const tree = h.render(h.default);
  assert.equal(h.queryOptions.at(-1).skip, true);
  one(tree, "EmptyState", (node) => node.props.title === "No active property selected");
});

test("first setup validates then uses create without an invented version", async () => {
  const initial = settings({ configured: false, version: null, tokenAmountPaise: null, tokenRefundable: null });
  const h = harness();
  const props = editorProps(initial);
  let tree = h.render(h.Editor, props);
  await button(tree, "Set up bookings").props.onPress();
  assert.equal(h.writes.length, 0);
  // Each problem is said under its own field, and Save waits until both are answered.
  tree = h.render(h.Editor, props);
  assert.ok(one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.error);
  assert.ok(one(tree, "FieldError").props.message);
  assert.equal(button(tree, "Set up bookings").props.disabled, true);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("1500.01");
  tree = h.render(h.Editor, props);
  assert.equal(button(tree, "Set up bookings").props.disabled, true, "the refund answer is still missing");
  const refund = nodes(one(tree, "SettingCard", (node) => node.props.title === "Token refund policy"), "ModeRow");
  assert.deepEqual(Array.from(refund.map((row) => row.props.label)), ["Yes, refund the token", "No, keep the token"]);
  assert.equal(refund.some((row) => row.props.selected), false, "no answer is chosen for the owner");
  refund[0].props.onPress();
  tree = h.render(h.Editor, props);
  assert.equal(button(tree, "Set up bookings").props.disabled, false);
  await button(tree, "Set up bookings").props.onPress();
  // onPress deliberately dispatches void; let the async unwrap finish.
  await settle();
  assert.equal(h.writes[0].kind, "create");
  assert.equal(h.writes[0].body.tokenAmountPaise, 150001);
  assert.equal(h.writes[0].body.tokenRefundable, true);
  assert.equal("version" in h.writes[0], false);
});

test("existing settings save the loaded version; duplicate presses do not double write", async () => {
  const h = harness();
  const props = editorProps();
  let tree = h.render(h.Editor, props);
  // Saved untouched, it writes nothing and says so. The button is not a dead grey box.
  assert.equal(button(tree, "Save changes").props.disabled, false);
  button(tree, "Save changes").props.onPress();
  await settle();
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.warnings, ["No changes have been made."]);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  tree = h.render(h.Editor, props);
  button(tree, "Save changes").props.onPress();
  button(tree, "Save changes").props.onPress();
  await settle();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].version, 4);
  assert.equal(h.writes[0].kind, "save");
  h.render(h.Editor, props); // stale pre-invalidation query is still version 4
  assert.equal(h.values[0].version, 5, "must not roll a saved baseline back to old query data");
});

test("newer server response does not erase dirty edits and requires reload", () => {
  const h = harness();
  let props = editorProps();
  let tree = h.render(h.Editor, props);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  props = editorProps(settings({ version: 5, tokenAmountPaise: 900000 }));
  tree = h.render(h.Editor, props);
  assert.equal(one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.value, "3000");
  assert.equal(button(tree, "Save changes").props.disabled, true);
  button(tree, "Reload latest settings (discards edits)");
});

test("a refused save is acknowledged in a dialog, keeps what was typed, and can be tried again", async () => {
  const h = harness({ saveError: { status: 400 } });
  const props = editorProps();
  let tree = h.render(h.Editor, props);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  tree = h.render(h.Editor, props);
  button(tree, "Save changes").props.onPress();
  await settle();
  tree = h.render(h.Editor, props);
  assert.equal(one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.value, "3000");
  assert.equal(one(tree, "AlertModal").props.message, "Save refused. Refresh and try again.");
  assert.equal(nodes(tree, "NoticeBar").filter((node) => node.props.tone === "danger").length, 0);
  one(tree, "AlertModal").props.onClose();
  tree = h.render(h.Editor, props);
  assert.equal(nodes(tree, "AlertModal").length, 0);
  assert.equal(button(tree, "Save changes").props.disabled, false);
  assert.equal(h.letThrough.length, 0, "an ordinary refusal does not stand the unsaved-changes guard down");
});

test("settings changed elsewhere leave the form once the refusal is closed, without asking about unsaved edits", async () => {
  const h = harness({ saveError: { status: 409 }, errorText: "The data has changed since you opened it." });
  const props = editorProps();
  let tree = h.render(h.Editor, props);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  tree = h.render(h.Editor, props);
  button(tree, "Save changes").props.onPress();
  await settle();
  one(h.render(h.Editor, props), "AlertModal").props.onClose();
  assert.equal(h.letThrough.length, 1);
  // The dialog itself goes back a screen for a form route, and this screen is one.
  assert.ok(read("src/components/leave-on-stale.ts").includes('"/owner-booking-settings"'));
});

const card = (tree, title) => one(tree, "SettingCard", (node) => node.props.title === title);
const grants = (managerUserId, overrides = {}) => ({ propertyId: "property-1", managerUserId, owner: false, version: 10, levels: { BOOKINGS: "NONE", CHATS: "MANAGE", ROOMS: "VIEW" }, ...overrides });
const tick = (tree, managerUserId, enabled = true, overrides = {}) => one(tree, "BookingAccessList").props.onChange(grants(managerUserId, overrides), enabled);

test("leaving with anything unsaved is guarded, a tick on the access list included, and only then", () => {
  let h = harness();
  const props = editorProps();
  let tree = h.render(h.Editor, props);
  assert.equal(h.guarded.at(-1), false);
  card(tree, "Beds being vacated").props.trailing.props.onChange(false);
  h.render(h.Editor, props);
  assert.equal(h.guarded.at(-1), true);
  h = harness();
  tick(h.render(h.Editor, props), "manager-1");
  h.render(h.Editor, props);
  assert.equal(h.guarded.at(-1), true);
});

// User, 2026-10-10: "each thing should be a separate card".
test("each decision is a card of its own, and the property is named once, in the header", () => {
  const h = harness();
  let tree = h.render(h.Editor, editorProps());
  assert.deepEqual(Array.from(nodes(tree, "SettingCard").map((node) => node.props.title)),
    ["Take a token", "Token amount", "Token refund policy", "Move-in policies", "Beds being vacated", "Booking access", "How requests are assigned"]);
  assert.equal(nodes(tree, "Card").length, 0);
  assert.ok(one(tree, "ScreenHeader").props.subtitle.includes("Sample PG"));
  // A yes or no carries its switch beside the title.
  assert.equal(card(tree, "Take a token").props.trailing.props.value, true);
  assert.equal(card(tree, "Beds being vacated").props.trailing.props.value, true);
  // With the token off, its amount and refund policy have nothing to decide.
  card(tree, "Take a token").props.trailing.props.onChange(false);
  tree = h.render(h.Editor, editorProps());
  assert.deepEqual(Array.from(nodes(tree, "SettingCard").map((node) => node.props.title)),
    ["Take a token", "Move-in policies", "Beds being vacated", "Booking access", "How requests are assigned"]);
  one(card(tree, "Take a token"), "NoticeBar", (node) => node.props.title === "Bookings without a token");
  // The rate for a long booking is chosen beside the token, so with the token off the rule says where to go.
  const source = read("app/owner-booking-settings.tsx");
  assert.equal(source.includes("status-pill") || source.includes("SegmentedChoice") || source.includes("SheetShell"), false);
  // No instruction runs past two sentences.
  for (const [, text] of source.matchAll(/(?:description|message)="([^"]*)"/g)) {
    assert.ok(text.split(". ").length <= 2, text);
  }
});

// User, 2026-10-10: the two notes go "in an i icon that opens a bottom up how it works modal".
test("the token's limit sits behind a question mark that opens How it works", () => {
  const h = harness();
  const props = editorProps();
  let tree = h.render(h.Editor, props);
  const amount = card(tree, "Token amount");
  one(amount, "FormInput", (node) => node.props.label === "Fixed token amount");
  // Neither line is on the card any more, and nothing is open until it is asked for.
  assert.equal(nodes(amount, "Text").some((node) => String(node.props.children).startsWith("Never more than")), false);
  assert.equal(nodes(tree, "HowItWorksSheet").length, 0);
  const help = amount.props.trailing;
  assert.equal(help.type, "IconButton");
  assert.equal(help.props.icon, "CircleHelp");
  assert.equal(help.props.accessibilityLabel, "How the token works");
  help.props.onPress();
  tree = h.render(h.Editor, props);
  const sheet = one(tree, "HowItWorksSheet");
  assert.equal(sheet.props.title, "How the token works");
  assert.deepEqual(Array.from(sheet.props.steps.map((step) => step.title)), ["Bookings 3 to 21 days in advance"]);
  assert.equal(sheet.props.steps[0].body, "For an advance booking between 3 and 21 days, never more than one month of the agreed rent can be charged as the token amount. It is adjusted from the tenant's first cycle bill.");
  sheet.props.onClose();
  assert.equal(nodes(h.render(h.Editor, props), "HowItWorksSheet").length, 0);
  // Reading the notes changes nothing: the form is as it was.
  assert.equal(h.guarded.at(-1), false);
});

// Dropped for v1 (user, 2026-10-18): the 28 days a booking can reach is enough, so nothing is charged for further ahead.
test("the settings neither ask nor send how a booking 28 or more days ahead is charged", () => {
  const h = harness();
  const tree = h.render(h.Editor, editorProps());
  assert.equal(nodes(card(tree, "Token amount"), "ModeRow").length, 0);
  assert.equal(nodes(tree, "FormInput").some((node) => /monthly rate/i.test(node.props.label)), false);
  assert.doesNotMatch(read("app/owner-booking-settings.tsx"), /longAdvance|28\+ days/);
  const body = clone(form.validateBookingSettings(form.bookingSettingsDraft(settings())).body);
  assert.equal("longAdvanceCharge" in body || "longAdvanceMonthlyPaise" in body, false);
});

// User, 2026-10-10: a question mark on the refund policy, opening the same sheet, titled Token refund rules.
test("the refund rules sit behind a question mark that opens How it works, titled Token refund rules", () => {
  const h = harness();
  const props = editorProps();
  let tree = h.render(h.Editor, props);
  const policy = card(tree, "Token refund policy");
  // The card keeps only the choice. The rule about the property cancelling is no longer a line on it.
  assert.equal(nodes(policy, "ModeRow").length, 2);
  assert.equal(nodes(policy, "Text").some((node) => String(node.props.children).includes("property cancels")), false);
  assert.equal(nodes(tree, "HowItWorksSheet").length, 0);
  const help = policy.props.trailing;
  assert.equal(help.type, "IconButton");
  assert.equal(help.props.icon, "CircleHelp");
  assert.equal(help.props.accessibilityLabel, "Token refund rules");
  help.props.onPress();
  tree = h.render(h.Editor, props);
  const sheet = one(tree, "HowItWorksSheet");
  assert.equal(sheet.props.title, "Token refund rules");
  const steps = Array.from(sheet.props.steps);
  assert.deepEqual(steps.map((step) => step.title), ["Refunding is your responsibility", "When the property cancels", "Khatiyan's role"]);
  assert.ok(steps[0].body.includes("you refund it to the tenant yourself"));
  assert.equal(steps[1].body, "It is mandatory to refund a token in case of a booking cancellation from the Property's end.");
  assert.ok(steps[2].body.startsWith("Khatiyan does not collect, hold or transfer the token.") && steps[2].body.includes("only keeps a record"));
  for (const step of steps) assert.equal(step.body.includes(";"), false);
  sheet.props.onClose();
  tree = h.render(h.Editor, props);
  assert.equal(nodes(tree, "HowItWorksSheet").length, 0);
  // The two question marks open two different sheets, one at a time.
  card(tree, "Token amount").props.trailing.props.onPress();
  assert.equal(one(h.render(h.Editor, props), "HowItWorksSheet").props.title, "How the token works");
  // Reading the rules changes nothing: the form is as it was.
  assert.equal(h.guarded.at(-1), false);
});

test("the refund policy is two tick rows, and choosing one answers it", () => {
  const h = harness();
  const props = editorProps(settings({ tokenRefundable: null }));
  let rows = nodes(card(h.render(h.Editor, props), "Token refund policy"), "ModeRow");
  assert.deepEqual(Array.from(rows.map((row) => row.props.selected)), [false, false]);
  rows[1].props.onPress();
  rows = nodes(card(h.render(h.Editor, props), "Token refund policy"), "ModeRow");
  assert.deepEqual(Array.from(rows.map((row) => row.props.selected)), [false, true]);
  rows[0].props.onPress();
  rows = nodes(card(h.render(h.Editor, props), "Token refund policy"), "ModeRow");
  assert.deepEqual(Array.from(rows.map((row) => row.props.selected)), [true, false]);
});

test("how requests are assigned uses the Enquiries handler setting's own rows", () => {
  const h = harness();
  let tree = h.render(h.Editor, editorProps());
  let rows = nodes(card(tree, "How requests are assigned"), "ModeRow");
  // The Enquiries setting's own two names, in its order, with its Suggested mark (user, 2026-10-11).
  assert.deepEqual(Array.from(rows.map((row) => row.props.label)), ["Auto assigned", "First to respond"]);
  assert.deepEqual(Array.from(rows.map((row) => row.props.suggested === true)), [true, false]);
  assert.deepEqual(Array.from(rows.map((row) => row.props.selected)), [false, true]);
  for (const row of rows) assert.ok(row.props.description.length > 20);
  // Auto assigned says the owner takes a turn too. First to respond says who becomes the handler.
  assert.match(rows[0].props.description, /The owner is included in the turns as well\.$/);
  assert.match(rows[1].props.description, /Whoever responds first handles the request/);
  assert.equal(nodes(tree, "ToggleRow").length, 0);
  rows[0].props.onPress();
  tree = h.render(h.Editor, editorProps());
  rows = nodes(card(tree, "How requests are assigned"), "ModeRow");
  assert.deepEqual(Array.from(rows.map((row) => row.props.selected)), [true, false]);
  // No switch for the owner's own turn: the owner is always in them (user, 2026-10-11).
  assert.equal(nodes(tree, "ToggleRow").length, 0);
  assert.doesNotMatch(read("app/owner-booking-settings.tsx"), /Include me in turns|function ToggleRow/);
  // Whatever an older save left behind, what is sent says the owner takes a turn.
  const old = settings({ includeOwnerInTurns: false, assignmentMode: "SYSTEM_TURNS" });
  assert.equal(form.validateBookingSettings(form.bookingSettingsDraft(old), old).body.includeOwnerInTurns, true);
  // The same component, not a copy that can drift from it.
  assert.ok(read("app/owner-booking-settings.tsx").includes('import { ModeRow } from "@/features/enquiry/handler-mode-sheet"'));
  const shared = read("src/features/enquiry/handler-mode-sheet.tsx");
  assert.ok(shared.includes("export function ModeRow(") && shared.includes("<ModeRow"));
});

// User, 2026-10-10.
test("who may act is said beside an information mark in the last card", () => {
  const h = harness();
  const last = nodes(h.render(h.Editor, editorProps()), "SettingCard").at(-1);
  assert.equal(last.props.title, "How requests are assigned");
  assert.ok(one(last, "InfoLine").props.text.startsWith("Only the handler and you can act on a request."));
  assert.ok(read("app/owner-booking-settings.tsx").includes("<Info color={colors.primary}"));
});

test("the blue notice shows on opening, goes once a change is saved, and is back when a setting is actually changed", async () => {
  const h = harness();
  const props = editorProps();
  const notice = (tree) => nodes(tree, "NoticeBar").filter((node) => node.props.title === "Changes apply to new requests");
  let tree = h.render(h.Editor, props);
  assert.equal(notice(tree).length, 1);
  assert.equal(notice(tree)[0].props.tone, "info");
  assert.equal(notice(tree)[0].props.message, "Existing requests keep their terms.");
  // At the top: the first thing under the header, above every card.
  const order = Array.from(one(tree, "ScreenScrollView").props.children.flat(Infinity).filter(Boolean).map((node) => node.type?.name ?? node.type));
  assert.deepEqual(order.slice(0, 2), ["ScreenHeader", "NoticeBar"]);
  assert.equal(one(tree, "ScreenScrollView").props.children.flat(Infinity).filter(Boolean)[1].props.title, "Changes apply to new requests");
  // Saved, with nothing left changed: it has said its piece.
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  tree = h.render(h.Editor, props);
  assert.equal(notice(tree).length, 1);
  button(tree, "Save changes").props.onPress();
  await settle();
  tree = h.render(h.Editor, props);
  assert.equal(notice(tree).length, 0);
  // A setting actually changed brings it back. One typed back to what is saved takes it away again.
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3500");
  tree = h.render(h.Editor, props);
  assert.equal(notice(tree).length, 1);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  assert.equal(notice(h.render(h.Editor, props)).length, 0);
  // A tick on the access list changes nobody's terms, so it does not raise it.
  tick(h.render(h.Editor, props), "manager-1");
  assert.equal(notice(h.render(h.Editor, props)).length, 0);
});

test("Move-in policies is the one tinted card, and its rules are set in the property board's description type", () => {
  const h = harness();
  const tree = h.render(h.Editor, editorProps());
  assert.deepEqual(Array.from(nodes(tree, "SettingCard").filter((node) => node.props.tinted).map((node) => node.props.title)), ["Move-in policies"]);
  const source = read("app/owner-booking-settings.tsx");
  assert.ok(source.includes('<LinearGradient colors={["#EAF2FF", "#FFFFFF"]}'));
  // The same family, size and leading as a description on the tenant's property board.
  const board = read("src/features/property-board/property-board-ui.tsx");
  assert.ok(board.includes("fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted"));
  assert.ok(source.includes("color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16"));
});

test("settings use pinned actions and the booking skeleton", () => {
  const h = harness();
  const tree = h.render(h.Editor, editorProps());
  one(tree, "PinnedFooter");
  assert.equal(one(tree, "ScreenScrollView").props.contentContainerStyle.paddingBottom, 104);
});

// ---- Booking access: a card of managers with a tick each (user, 2026-10-10) ----------

test("the access list is the property's active managers, each a row with a tick", () => {
  const managers = [{ managerUserId: "manager-1", managerFullName: "Asha Rao", active: true }, { managerUserId: "manager-2", managerFullName: "Bina Das", active: true }, { managerUserId: "manager-3", managerFullName: "Gone", active: false }];
  const h = harness({ managersQuery: { currentData: managers, isSuccess: true } });
  const draft = { "manager-2": { permissions: grants("manager-2"), enabled: true } };
  const tree = h.render(h.BookingAccessList, { propertyId: "property-1", draft, disabled: false, onChange() {} });
  const rows = nodes(tree, "ManagerAccessRow");
  assert.deepEqual(Array.from(rows.map((row) => row.props.manager.managerUserId)), ["manager-1", "manager-2"]);
  assert.equal(rows[0].props.override, undefined);
  assert.equal(rows[1].props.override, true);
  // With someone to tick, the list says what a tick does. The card around it says nothing.
  assert.ok(nodes(tree, "Text").some((node) => String(node.props.children).startsWith("Tick the managers who can view and handle bookings.")));
  assert.equal(nodes(tree, "EmptyState").length, 0);
  assert.equal(card(harness().render(harness().Editor, editorProps()), "Booking access").props.description, undefined);
  const source = read("src/features/booking/booking-access-list.tsx");
  assert.ok(source.includes("<CircleCheckbox checked={ticked} />") && source.includes('accessibilityRole="checkbox"'));
  // It is on the screen, in the card, and not behind a sheet.
  assert.equal(fs.existsSync(path.join(__dirname, "..", "src/features/booking/booking-access-list-sheet.tsx")), false);
  one(card(harness().render(harness().Editor, editorProps()), "Booking access"), "BookingAccessList", (node) => node.props.propertyId === "property-1");
});

test("access query error is not mislabelled as an empty list", () => {
  const h = harness({ managersQuery: { currentData: undefined, isError: true, error: { status: 500 }, refetch() {} } });
  const tree = h.render(h.BookingAccessList, { propertyId: "property-1", draft: {}, disabled: false, onChange() {} });
  one(tree, "NoticeBar", (node) => node.props.title === "Could not load managers");
  assert.equal(nodes(tree, "EmptyState").length, 0);
});

// User, 2026-10-10: "an empty state and no description when property does not have a manager".
test("a property with no manager shows an empty state on the access card, and no instruction to tick anyone", () => {
  for (const managers of [[], [{ managerUserId: "manager-3", managerFullName: "Gone", active: false }]]) {
    const h = harness({ managersQuery: { currentData: managers, isSuccess: true } });
    const tree = h.render(h.BookingAccessList, { propertyId: "property-1", draft: {}, disabled: false, onChange() {} });
    const state = one(tree, "EmptyState");
    assert.equal(state.props.title, "No managers yet");
    assert.equal(state.props.compact, true);
    assert.equal(state.props.artwork, "no-person.png");
    assert.equal(nodes(tree, "ManagerAccessRow").length, 0);
    assert.equal(nodes(tree, "Text").some((node) => String(node.props.children).startsWith("Tick the managers")), false);
  }
});

test("a tick is only a tick until Save, and ticking back to what is stored leaves nothing to save", () => {
  let draft = form.bookingAccessDraftAfter({}, grants("manager-1"), true);
  assert.equal(draft["manager-1"].enabled, true);
  // The grants first looked at are the ones kept, whatever a later read says.
  draft = form.bookingAccessDraftAfter(draft, grants("manager-1", { version: 99 }), false);
  assert.deepEqual(clone(draft), {});
  draft = form.bookingAccessDraftAfter({ "manager-1": { permissions: grants("manager-1"), enabled: true } }, grants("manager-1", { version: 99 }), true);
  assert.equal(draft["manager-1"].permissions.version, 10);
  assert.deepEqual(clone(form.bookingAccessDraftAfter({}, grants("manager-1", { levels: { BOOKINGS: "MANAGE" } }), true)), {});

  const h = harness();
  const props = editorProps();
  tick(h.render(h.Editor, props), "manager-1");
  const tree = h.render(h.Editor, props);
  assert.equal(one(tree, "BookingAccessList").props.draft["manager-1"].enabled, true);
  assert.equal(h.writes.length, 0);
});

test("one Save writes the settings and then each ticked manager, against the grants the owner was looking at", async () => {
  const h = harness();
  const props = editorProps();
  let tree = h.render(h.Editor, props);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  tick(tree, "manager-1");
  tick(tree, "manager-2", true, { version: 4 });
  tree = h.render(h.Editor, props);
  button(tree, "Save changes").props.onPress();
  button(tree, "Save changes").props.onPress();
  await settle();
  assert.deepEqual(h.writes.map((write) => write.kind), ["save", "grant", "grant"]);
  assert.equal(h.writes[1].levels.BOOKINGS, "MANAGE");
  assert.equal(h.writes[1].levels.CHATS, "MANAGE", "their other grants are sent back as they were");
  assert.equal(h.writes[1].version, 10);
  assert.equal(h.writes[2].version, 4);
  assert.deepEqual(clone(one(h.render(h.Editor, props), "BookingAccessList").props.draft), {});
});

test("ticks alone are saved without writing the settings again", async () => {
  const h = harness();
  const props = editorProps();
  tick(h.render(h.Editor, props), "manager-1");
  button(h.render(h.Editor, props), "Save changes").props.onPress();
  await settle();
  assert.deepEqual(h.writes.map((write) => write.kind), ["grant"]);
  assert.deepEqual(h.warnings, []);
});

test("the first save sets bookings up and then gives the ticked managers access", async () => {
  const h = harness();
  const props = editorProps(settings({ configured: false, version: null }));
  tick(h.render(h.Editor, props), "manager-1");
  button(h.render(h.Editor, props), "Set up bookings").props.onPress();
  await settle();
  assert.deepEqual(h.writes.map((write) => write.kind), ["create", "grant"]);
});

test("a refused grant says what did go through, and the ticks left over are dropped", async () => {
  const h = harness({ failManager: "manager-2" });
  const props = editorProps();
  let tree = h.render(h.Editor, props);
  one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.onChangeText("3000");
  tick(tree, "manager-1");
  tick(tree, "manager-2");
  tick(tree, "manager-3");
  button(h.render(h.Editor, props), "Save changes").props.onPress();
  await settle();
  tree = h.render(h.Editor, props);
  // Nothing after the refusal is attempted, and nothing before it is sent twice.
  assert.deepEqual(h.writes.map((write) => `${write.kind}:${write.managerUserId ?? ""}`), ["save:", "grant:manager-1", "grant:manager-2"]);
  const said = one(tree, "AlertModal").props.message;
  assert.ok(said.startsWith("Your settings were saved. 1 manager was updated. The rest was not saved."), said);
  assert.deepEqual(clone(one(tree, "BookingAccessList").props.draft), {});
  assert.equal(h.values[0].version, 5, "the saved settings are not rolled back");
  assert.equal(one(tree, "FormInput", (node) => node.props.label === "Fixed token amount").props.value, "3000");
});

test("a grant refused before anything was saved keeps the ticks for another try", async () => {
  const h = harness({ failManager: "manager-1" });
  const props = editorProps();
  tick(h.render(h.Editor, props), "manager-1");
  button(h.render(h.Editor, props), "Save changes").props.onPress();
  await settle();
  const tree = h.render(h.Editor, props);
  assert.equal(one(tree, "AlertModal").props.message, "Save refused. Refresh and try again.");
  assert.equal(one(tree, "BookingAccessList").props.draft["manager-1"].enabled, true);
});
