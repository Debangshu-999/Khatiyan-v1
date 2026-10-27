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
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(outputText, {
    exports,
    Date,
    require: (name) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const { spacing, radii } = load(read("src/theme/spacing.ts"));
const { themes } = load(read("src/theme/colors.ts"));
const { errorMessage } = load(read("src/features/forms/server-error.ts"));
const stay = { tenancy: { id: "tenancy-1", startDate: "2026-01-01", agreementValidityMonths: null }, property: { name: "Sample PG" }, room: { roomNumber: "101", floor: "1" } };
const checkoutWindow = { noticePeriod: "FIFTEEN_DAYS", noticeAnchorDate: "2026-10-07", earliestPossibleDate: "2026-10-17", earliestCheckoutDate: "2026-10-22", latestCheckoutDate: "2026-10-31", prematureExitAllowed: true, minimumLeadDays: 10, restrictionMessage: null, fixed: false, reRaise: false };

function harness(options = {}) {
  const values = [];
  let cursor = 0;
  const submitted = [];
  const navigated = [];
  const serverErrors = [];
  const activeQuery = { data: stay, isFetching: false, refetch() {}, ...options.activeQuery };
  const exitQuery = { data: [], isLoading: false, refetch() {}, ...options.exitQuery };
  const roomQuery = { data: [], isLoading: false, refetch() {}, ...options.roomQuery };
  const windowQuery = { data: checkoutWindow, isLoading: false, refetch() {}, ...options.windowQuery };
  const state = { isLoading: false, ...options.mutationState };
  const dependencies = {
    react: { useState: (initial) => { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], (next) => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; } },
    "react-native": { Platform: { OS: options.platform ?? "web" }, Text: "Text", View: "View" },
    "@react-native-community/datetimepicker": { default: "DateTimePicker" },
    "expo-router": { useRouter: () => ({ replace() {}, push: (route) => navigated.push(route) }), useLocalSearchParams: () => options.params ?? {} },
    "lucide-react-native": Object.fromEntries(["BedDouble", "CalendarClock", "CalendarDays", "ChevronRight", "FileText", "MessageSquare", "TriangleAlert"].map((name) => [name, name])),
    "@/features/forms/server-error": { errorMessage },
    "@/features/forms/use-form-errors": { useFormErrors: () => ({ serverError: null, failFromServer: (message) => serverErrors.push(message) }) },
    "@/features/tenancy/request-blocked-modal": { exitRequestBlock: () => options.requestBlock ?? null },
    "@/features/tenancy/starts-soon-bubble": { tenancyNotStarted: () => options.notStarted ?? false, REQUESTS_NOT_STARTED: { exit: "Wait for your tenancy to start." } },
    "@/store/services/tenancy-api": {
      useGetMyActiveTenancyQuery: () => activeQuery,
      useListMyExitRequestsQuery: () => exitQuery,
      useListMyRoomChangeRequestsQuery: () => roomQuery,
      useGetExitCheckoutWindowQuery: () => windowQuery,
      useCreateExitRequestMutation: () => [(payload) => { submitted.push(payload); return { unwrap: async () => { if (options.submitError) throw options.submitError; } }; }, state],
    },
    "@/store/services/property-api": { NOTICE_PERIOD_LABELS: { FIFTEEN_DAYS: "15 days", ONE_MONTH: "1 month" } },
    "@/theme/spacing": { spacing, radii },
    "@/theme/use-theme": { useTheme: () => ({ colors: themes[options.mode ?? "light"], fonts: { sans: "Inter_400Regular", sansBold: "Inter_700Bold" }, type: {} }) },
    "@/components/pinned-footer": { PinnedFooter: "PinnedFooter", PINNED_FOOTER_CLEARANCE: 104 },
    "@/components/artwork-icon": { ExitTenancyIcon: "ExitTenancyIcon" },
    "@/features/owner/owner-ui": { ActionButton: "ActionButton", NoticeBar: "NoticeBar" },
  };
  for (const [module, name] of [["animated-pressable", "AnimatedPressable"], ["app-text-input", "AppTextInput"], ["card", "Card"], ["empty-state", "EmptyState"], ["screen-header", "ScreenHeader"], ["screen-scroll-view", "ScreenScrollView"], ["sheet-shell", "SheetShell"], ["status-pill", "StatusPill"], ["alert-modal", "AlertModal"], ["skeletons/tenancy/exit-request", "TenantExitRequestSkeleton"]]) dependencies[`@/components/${module}`] = { [name]: name };
  const exported = load(`${read("app/tenancy-exit-request.tsx")}\nexports.helpers = { ExitRequestPage, ExitRequestGate, ServeNoticeForm, NoticeWindowForm, PrematureWarning, FormField, CheckoutDatePicker, parseISODate, toISODate };`, dependencies);
  return { ...exported.helpers, screen: exported.default, submitted, navigated, serverErrors, state, render: (component, props) => { cursor = 0; return component(props); } };
}

function findAll(tree, type) {
  const found = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (node.type === type) found.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return found;
}
const find = (tree, type) => { const found = findAll(tree, type); assert.ok(found.length, `Missing ${String(type)}`); return found[0]; };
const formProps = (overrides = {}) => ({ checkoutWindow, stay, onDone() {}, ...overrides });

test("fixed action sits outside scrolling content and clears its measured height", () => {
  const h = harness();
  let page = h.render(h.ExitRequestPage, { children: "content", footer: "action" });
  assert.equal(find(page, "PinnedFooter").props.children, "action");
  assert.equal(findAll(find(page, "ScreenScrollView"), "PinnedFooter").length, 0);
  find(page, "PinnedFooter").props.onLayout({ nativeEvent: { layout: { height: 150 } } });
  page = h.render(h.ExitRequestPage, { children: "content", footer: "action" });
  assert.equal(find(page, "ScreenScrollView").props.contentContainerStyle.paddingBottom, 150 + spacing.lg);
  const header = find(page, "ScreenHeader");
  assert.equal(header.props.title, "Exit");
  assert.equal(header.props.italicTail, "request.");
  assert.equal(header.props.trailing, undefined);
});

test("all three initial loading stages show the matching skeleton without a live action", () => {
  for (const [options, component, props] of [[{ activeQuery: { data: undefined, isFetching: true } }, "screen"], [{ exitQuery: { isLoading: true } }, "ExitRequestGate", { stay }], [{ windowQuery: { isLoading: true } }, "ServeNoticeForm", { stay }]]) {
    const h = harness(options);
    const page = h.render(h[component], props);
    assert.equal(page.type, h.ExitRequestPage);
    find(page, "TenantExitRequestSkeleton");
    assert.equal(page.props.footer, undefined);
  }
});

test("no-stay, not-started and one-month agreement remain blocked", () => {
  for (const [options, title] of [[{ activeQuery: { data: undefined } }, "No current stay"], [{ notStarted: true }, "Your tenancy has not started"], [{ activeQuery: { data: { ...stay, tenancy: { ...stay.tenancy, agreementValidityMonths: 1 } } } }, "Early exit unavailable"]]) {
    const h = harness(options);
    const page = h.render(h.screen);
    assert.equal(find(page, "EmptyState").props.title, title);
    assert.equal(page.props.footer, undefined);
  }
});

test("live request blocking and re-raise eligibility survive the redesign", () => {
  const blocked = harness({ requestBlock: { title: "Already requested", referenceCode: "EXT-1", message: "Review your existing request." } });
  assert.equal(find(blocked.render(blocked.ExitRequestGate, { stay }), "EmptyState").props.title, "Already requested");
  const h = harness({ exitQuery: { data: [{ id: "expired-1", reRaiseAllowed: true }] } });
  const props = { stay, reRaiseRequestId: "expired-1", initialReason: "A correction", initialRequestedCheckoutDate: "2026-10-25" };
  const form = h.render(h.ExitRequestGate, props);
  assert.equal(form.type, h.ServeNoticeForm);
  assert.equal(form.props.initialReason, props.initialReason);
  assert.equal(form.props.initialRequestedCheckoutDate, props.initialRequestedCheckoutDate);
  const closed = h.render(h.ExitRequestGate, { stay, reRaiseRequestId: "not-eligible" });
  assert.equal(find(closed, "EmptyState").props.title, "Correction window closed");
});

test("normal submission defaults to full notice and retains the original API payload", async () => {
  const h = harness();
  let completed = 0;
  const page = h.render(h.NoticeWindowForm, formProps({ initialReason: "  Moving home  ", onDone: () => completed++ }));
  assert.equal(page.type, h.ExitRequestPage);
  assert.equal(find(page, "StatusPill").props.tone, "success");
  assert.equal(findAll(page, h.PrematureWarning).length, 0);
  find(page.props.footer, "ActionButton").props.onPress();
  await new Promise(setImmediate);
  assert.equal(JSON.stringify(h.submitted[0]), JSON.stringify({ chosenCheckoutDate: "2026-10-22", reason: "Moving home" }));
  assert.equal(completed, 1);
});

test("early exit stays a warning, with a one-tap return to full notice", () => {
  const h = harness();
  const props = formProps({ initialRequestedCheckoutDate: "2026-10-17" });
  const page = h.render(h.NoticeWindowForm, props);
  assert.equal(find(page, "StatusPill").props.tone, "warning");
  assert.equal(find(page.props.footer, "ActionButton").props.label, "Request early exit");
  const warning = find(page, h.PrematureWarning);
  const notice = h.PrematureWarning(warning.props).props.children[0];
  assert.equal(notice.props.tone, "warning");
  assert.ok(notice.props.message.includes("the early exit policy as per your agreement"));
  warning.props.onServeFullNotice();
  const reset = h.render(h.NoticeWindowForm, props);
  assert.equal(find(reset, "StatusPill").props.tone, "success");
  assert.equal(findAll(reset, h.PrematureWarning).length, 0);
});

test("both notice chips use the bold face, with agreement navigation only beside early exit", () => {
  for (const early of [false, true]) {
    const h = harness();
    const page = h.render(h.NoticeWindowForm, formProps(early ? { initialRequestedCheckoutDate: "2026-10-17" } : {}));
    const chip = find(page, "StatusPill");
    assert.equal(chip.props.label, early ? "Early exit" : "Full notice");
    assert.equal(chip.props.textStyle.fontFamily, "Inter_700Bold");
    const buttons = findAll(page, "ActionButton").filter((node) => node.props.label === "View agreement");
    assert.equal(buttons.length, early ? 1 : 0);
    if (early) {
      assert.equal(buttons[0].props.compact, true);
      assert.equal(buttons[0].props.disabled, false);
      const row = findAll(page, "View").find((node) => node.props.children?.[0] === chip);
      assert.equal(row.props.style.flexDirection, "row");
      assert.equal(row.props.style.flexWrap, "wrap");
      assert.ok(findAll(row, "ActionButton").includes(buttons[0]));
      buttons[0].props.onPress();
      assert.deepEqual(h.navigated, ["/tenancy-agreement-view"]);
      assert.equal(h.submitted.length, 0);
    }
  }
});

test("agreement navigation is disabled while an early-exit submission is pending", () => {
  const h = harness({ mutationState: { isLoading: true } });
  const page = h.render(h.NoticeWindowForm, formProps({ initialRequestedCheckoutDate: "2026-10-17" }));
  const button = findAll(page, "ActionButton").find((node) => node.props.label === "View agreement");
  assert.equal(button.props.disabled, true);
});

test("status pill applies an optional label style without changing other pills", () => {
  const { StatusPill } = load(read("src/components/status-pill.tsx"), {
    "react-native": { View: "View" },
    "@/components/marquee-text": { MarqueeText: "MarqueeText" },
    "@/theme/spacing": { spacing },
    "@/theme/use-theme": { useTheme: () => ({ colors: themes.light, type: { eyebrow: { fontFamily: "Inter_600SemiBold" } } }) },
  });
  const normal = find(StatusPill({ label: "Optional" }), "MarqueeText");
  const bold = find(StatusPill({ label: "Early exit", tone: "warning", textStyle: { fontFamily: "Inter_700Bold" } }), "MarqueeText");
  assert.equal(Object.assign({}, ...normal.props.style).fontFamily, "Inter_600SemiBold");
  assert.equal(Object.assign({}, ...bold.props.style).fontFamily, "Inter_700Bold");
  assert.equal(Object.assign({}, ...bold.props.style).color, themes.light.warningText);
});

test("initial re-raised dates clamp to server bounds, never a client-made window", async () => {
  for (const [initialRequestedCheckoutDate, expected] of [["2026-10-01", "2026-10-17"], ["2026-11-10", "2026-10-31"]]) {
    const h = harness();
    const page = h.render(h.NoticeWindowForm, formProps({ initialRequestedCheckoutDate }));
    find(page.props.footer, "ActionButton").props.onPress();
    await new Promise(setImmediate);
    assert.equal(h.submitted[0].chosenCheckoutDate, expected);
    assert.equal(h.submitted[0].reason, null);
  }
});

test("re-raise and restricted early exit use shared info and warning notice bars", () => {
  const h = harness();
  const page = h.render(h.NoticeWindowForm, formProps({ checkoutWindow: { ...checkoutWindow, reRaise: true, prematureExitAllowed: false, restrictionMessage: "Your lock-in is still active." } }));
  const notices = findAll(page, "NoticeBar");
  assert.equal(notices.find((node) => node.props.title === "Your notice still counts").props.tone, "info");
  assert.equal(notices.find((node) => node.props.title === "Early exit unavailable").props.tone, "warning");
});

test("submission in progress disables action, date and reason, and does not send twice", () => {
  const h = harness({ mutationState: { isLoading: true } });
  const page = h.render(h.NoticeWindowForm, formProps());
  const action = find(page.props.footer, "ActionButton");
  assert.equal(action.props.disabled, true);
  assert.equal(find(page, "AnimatedPressable").props.disabled, true);
  assert.equal(find(page, h.FormField).props.disabled, true);
  action.props.onPress();
  assert.equal(h.submitted.length, 0);
});

test("backend rejection uses the existing error modal channel and never navigates", async () => {
  const h = harness({ submitError: { status: 409, data: { message: "An exit request already exists." } } });
  let completed = false;
  const page = h.render(h.NoticeWindowForm, formProps({ onDone: () => { completed = true; } }));
  find(page.props.footer, "ActionButton").props.onPress();
  await new Promise(setImmediate);
  assert.equal(completed, false);
  assert.deepEqual(h.serverErrors, ["An exit request already exists."]);
});

test("native picker preserves min/max bounds and dismissing does not change the date", () => {
  const h = harness({ platform: "android" });
  const min = h.parseISODate("2026-10-17");
  const max = h.parseISODate("2026-10-31");
  const picked = [];
  let closed = 0;
  const picker = h.render(h.CheckoutDatePicker, { minimumDate: min, maximumDate: max, value: min, onPick: (value) => picked.push(h.toISODate(value)), onClose: () => closed++ });
  assert.equal(picker.props.minimumDate, min);
  assert.equal(picker.props.maximumDate, max);
  picker.props.onChange({ type: "dismissed" });
  assert.equal(picked.length, 0);
  picker.props.onChange({ type: "set" }, h.parseISODate("2026-11-02"));
  assert.deepEqual(picked, ["2026-10-31"]);
  assert.equal(closed, 2);
});

test("web picker keeps the shared sheet and date-use action", () => {
  const h = harness();
  const props = { minimumDate: h.parseISODate("2026-10-17"), maximumDate: h.parseISODate("2026-10-31"), value: h.parseISODate("2026-10-22"), onPick() {}, onClose() {} };
  const picker = h.render(h.CheckoutDatePicker, props);
  assert.equal(picker.type, "SheetShell");
  assert.equal(find(picker, "ActionButton").props.label, "Use this date");
  const input = find(picker, "AppTextInput");
  assert.equal(input.props.defaultValue, "2026-10-22");
});

test("reason stays optional, labelled, multiline and capped at 500 characters", () => {
  const h = harness();
  const field = h.FormField({ disabled: true, maxLength: 500, multiline: true, onChangeText() {}, value: "Reason", placeholder: "Reason" });
  const input = find(field, "AppTextInput");
  assert.equal(input.props.accessibilityLabel, "Reason for leaving, optional");
  assert.equal(input.props.maxLength, 500);
  assert.equal(input.props.multiline, true);
  assert.equal(input.props.editable, false);
});

test("load failures offer retry instead of falsely showing no stay or an available form", () => {
  for (const [options, component, props] of [[{ activeQuery: { data: undefined, error: { status: 503 } } }, "screen"], [{ exitQuery: { error: { status: 503 } } }, "ExitRequestGate", { stay }], [{ windowQuery: { data: undefined, error: { status: 503 } } }, "ServeNoticeForm", { stay }]]) {
    const h = harness(options);
    const page = h.render(h[component], props);
    assert.equal(page.type, h.ExitRequestPage);
    assert.equal(page.props.footer, undefined);
    const error = page.props.children;
    assert.equal(error.props.message, "Something went wrong at our end. Please try again.");
    assert.equal(typeof error.props.onRetry, "function");
  }
});

test("loading layout reserves the same four form sections without real tenant data", () => {
  const { TenantExitRequestSkeleton } = load(read("src/components/skeletons/tenancy/exit-request.tsx"), {
    "react-native": { View: "View" },
    "@/components/card": { Card: "Card" },
    "@/components/skeletons/primitives": { Skeleton: "Skeleton", SkeletonCard: "SkeletonCard" },
    "@/theme/spacing": { spacing },
  });
  const tree = TenantExitRequestSkeleton();
  assert.equal(findAll(tree, "Card").length, 3);
  assert.equal(findAll(tree, "SkeletonCard").length, 1);
  assert.equal(tree.props.accessibilityLabel, "Loading exit request");
});
