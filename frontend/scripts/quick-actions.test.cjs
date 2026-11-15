const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const element = (type, props) => { assert.ok(type, "Undefined component"); return { type, props }; };
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, console, Date, Set, Map, URLSearchParams, ...globals, require(name) {
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element, Fragment: "Fragment" };
    if (/\.png$/.test(name)) {
      const asset = path.resolve(path.dirname(path.join(root, file)), name);
      assert.ok(fs.existsSync(asset), `Missing image asset ${asset}`);
      return asset;
    }
    if (name === "@/components/load-failed") return require("./shared-text-mocks.cjs")[name]; if (name === "@/theme/shadows") return { softShadow: () => ({}), cardShadow: () => ({}) };
    assert.ok(name in dependencies, `Missing dependency ${name}`); return dependencies[name];
  } });
  return exports;
}
const lucide = read("node_modules/lucide-react-native/dist/cjs/lucide-react-native.js");
const iconCache = new Map();
const icons = new Proxy({}, { get(_, name) {
  assert.match(lucide, new RegExp(`exports\\.${String(name)} =`), `Icon ${String(name)} must exist in the installed library`);
  if (!iconCache.has(name)) iconCache.set(name, function Icon() {});
  return iconCache.get(name);
} });
const rupeeIcons = load("src/components/rupee-banknote-icon.tsx", { "react-native-svg": { __esModule: true, default: "Svg", Path: "Path", Rect: "Rect" } });
const calendarIcons = load("src/components/calendar-arrow-right-icon.tsx", { "react-native-svg": { __esModule: true, default: "Svg", Path: "Path" } });
const catalogue = load("src/features/quick-actions/catalogue.ts", { "lucide-react-native": icons, "@/components/rupee-banknote-icon": rupeeIcons, "@/components/calendar-arrow-right-icon": calendarIcons });
const actionColors = load("src/features/quick-actions/action-colors.ts");
const { QUICK_ACTIONS: actions, QUICK_ACTION_CATEGORIES: categories, permittedQuickActions, searchQuickActions, suggestedQuickActions, quickActionRoute } = catalogue;
const action = (id) => actions.find((item) => item.id === id);
const permissions = (levels = {}, owner = false) => ({ propertyId: "p1", owner, levels });

test("every action has a short unique label, real icon, valid category and existing destination", () => {
  assert.equal(categories.length, 12);
  assert.ok(actions.length >= 60);
  assert.equal(new Set(actions.map((item) => item.id)).size, actions.length);
  assert.equal(new Set(actions.map((item) => item.label)).size, actions.length);
  for (const item of actions) {
    assert.ok(item.label.length <= 20, item.label);
    assert.equal(typeof item.icon, "function", item.id);
    assert.ok(categories.some((category) => category.id === item.category));
    assert.ok(fs.existsSync(path.join(root, "app", `${item.pathname.slice(1)}.tsx`)), item.pathname);
    assert.ok(item.aliases.length > 3);
    assert.ok(!/\?/.test(item.pathname));
  }
  categories.forEach((category) => assert.ok(actions.some((item) => item.category === category.id)));
});

test("unknown permissions fail closed; managers never see owner-only shortcuts", () => {
  assert.equal(permittedQuickActions(undefined, false).length, 0);
  const manager = permittedQuickActions(permissions({ BOOKING: "MANAGE", BOOKINGS: "MANAGE", BILLING_CYCLES: "MANAGE" }), false);
  assert.ok(manager.some((item) => item.id === "new-booking"));
  for (const item of manager) assert.equal(Boolean(item.ownerOnly), false);
  assert.ok(!manager.some((item) => item.id === "verify-payment"));
  assert.ok(!permittedQuickActions(permissions({ CONCERNS: "MANAGE" }), false).some((item) => item.id === "assign-concern"));
  assert.ok(!manager.some((item) => item.category === "team"));
  assert.equal(permittedQuickActions(permissions({}, true), true).length, actions.length);
});

test("VIEW grants show only read-only tools; management actions need their exact resource", () => {
  const visible = permittedQuickActions(permissions({ VACANCY_FINDER: "VIEW", BOOKINGS: "VIEW", BILLING_CYCLES: "VIEW", TENANCY_RULES: "MANAGE" }), false);
  assert.ok(visible.some((item) => item.id === "find-vacancy"));
  assert.ok(visible.some((item) => item.id === "catalogue-item"));
  assert.ok(visible.some((item) => item.id === "repair-item"));
  assert.ok(!visible.some((item) => item.category === "booking" || item.category === "billing"));
  assert.ok(visible.some((item) => item.category === "enquiry"));
  assert.ok(!permittedQuickActions(permissions({ BOOKINGS: "MANAGE" }), false).some((item) => item.id === "booking-onboarding"));
  assert.ok(permittedQuickActions(permissions({ BOOKINGS: "VIEW", TENANCY_CREATE: "MANAGE" }), false).some((item) => item.id === "booking-onboarding"));
  assert.ok(permittedQuickActions(permissions({ ROOMS: "MANAGE" }), false).some((item) => item.id === "new-room-type"));
});

test("search understands full old names, aliases, categories and normalized punctuation", () => {
  for (const [query, id] of [["create tenancy", "new-tenancy"], ["one-off bill", "new-bill"], ["walk in", "new-booking"], ["payment proof", "verify-token"], ["employee", "add-staff"], ["AC non AC", "new-room-type"]]) {
    assert.ok(searchQuickActions(actions, query).matches.some((item) => item.id === id), query);
  }
  assert.equal(searchQuickActions(actions, "ADD EXPENSE").matches[0].id, "add-expense");
  assert.equal(searchQuickActions(actions, "   ").matches.length, 0);
  assert.equal(searchQuickActions(actions, "unfindablething").matches.length, 0);
  const result = searchQuickActions(actions, "new booking");
  assert.ok(result.related.length);
  assert.ok(result.related.every((item) => item.category === "booking"));
  assert.ok(result.related.every((item) => !result.matches.some((match) => match.id === item.id)));
});

test("search only ever returns actions in the permission-filtered catalogue", () => {
  const visible = permittedQuickActions(permissions({ BILLING_CYCLES: "VIEW" }), false);
  assert.equal(searchQuickActions(visible, "record payment").matches.length, 0);
  assert.equal(searchQuickActions(visible, "salary").matches.length, 0);
});

test("suggestions preserve unresolved queue routes, priority, counts and a four-item limit", () => {
  const items = [
    { key: "due-today-exits", count: 2, route: "/owner-tenancy?ending=TODAY" },
    { key: "past-due-exits", count: 1, route: "/owner-tenancy" },
    { key: "booking-confirmation", count: 3, route: "/owner-bookings?attention=CONFIRMATION" },
    { key: "payment-claims", count: 1, route: "/owner-payment-claims" },
    { key: "visits-today", count: 7, route: "/owner-visits" },
    { key: "booking-response", count: 5, route: "/owner-bookings?attention=RESPONSE" },
  ];
  const result = suggestedQuickActions(actions, items);
  assert.equal(result.length, 4);
  assert.deepEqual(Array.from(result, (item) => item.action.id), ["end-tenancy", "confirm-booking", "verify-payment", "attendance"]);
  assert.equal(result[0].route, "/owner-tenancy?ending=TODAY");
  assert.match(result[1].detail, /3 actions/);
  assert.equal(result[1].count, 3);
});

test("resolved actions vanish from suggestions; safe defaults respect permissions", () => {
  const result = suggestedQuickActions(actions, [{ key: "booking-confirmation", count: 0 }]);
  assert.deepEqual(Array.from(result, (item) => item.action.id), ["new-tenancy", "new-booking", "add-expense", "walk-in-visit"]);
  const visible = actions.filter((item) => item.id === "add-expense");
  assert.deepEqual(Array.from(suggestedQuickActions(visible, [{ key: "due-today-exits", count: 1 }]), (item) => item.action.id), ["add-expense"]);
});

test("four suggestions are filled without duplicates, even when preferred defaults are not permitted", () => {
  const visible = actions.filter((item) => item.category === "booking" && item.id !== "new-booking");
  const result = suggestedQuickActions(visible, [{ key: "booking-confirmation", count: 2 }]);
  assert.equal(result.length, 4);
  assert.equal(result[0].action.id, "confirm-booking");
  assert.equal(new Set(result.map((item) => item.action.id)).size, 4);
  assert.ok(result.every((item) => visible.includes(item.action)));
  assert.equal(suggestedQuickActions([], []).length, 0);
});

test("corrected icons represent booking stages, board items, move-ins and rupee payments", () => {
  for (const [id, icon] of [
    ["new-booking", icons.CalendarPlus], ["review-booking", icons.CalendarSearch],
    ["confirm-booking", icons.CalendarCheck], ["cancel-booking", icons.CalendarX],
    ["board-item", icons.ClipboardPlus], ["existing-tenancy", icons.UserRoundCheck],
    ["booking-onboarding", calendarIcons.CalendarArrowRightIcon], ["walk-in-visit", icons.DoorOpen],
    ["record-payment", rupeeIcons.RupeeBanknoteIcon], ["pay-salary", icons.Banknote],
  ]) assert.equal(action(id).icon, icon, id);
  // No two shortcuts share an icon (user, 2026-10-29).
  const byIcon = new Map();
  for (const item of actions) byIcon.set(item.icon, [...(byIcon.get(item.icon) ?? []), item.id]);
  assert.deepEqual([...byIcon.values()].filter((ids) => ids.length > 1), []);
});

test("Move in booking draws an upright calendar with a right-pointing arrow and inherits the tile colour and size", () => {
  const icon = calendarIcons.CalendarArrowRightIcon({ color: "#235DB8", size: 22, strokeWidth: 1.9 });
  assert.equal(icon.type, "Svg");
  assert.equal(icon.props.width, 22);
  assert.equal(icon.props.height, 22);
  assert.equal(icon.props.viewBox, "0 0 24 24");
  assert.equal(icon.props.stroke, "#235DB8");
  assert.equal(icon.props.strokeWidth, 1.9);
  assert.equal(icon.props.fill, "none");
  assert.equal(icon.props.transform, undefined, "The calendar must not rotate with its arrow");
  assert.ok(icon.props.children.some((node) => node.props.d === "M8 2v4M16 2v4M3 10h18"));
  assert.ok(icon.props.children.some((node) => node.props.d === "M12 17h10M18 13l4 4-4 4"));
});

function luminance(hex) {
  const linear = hex.match(/[a-f\d]{2}/gi).map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
test("every action uses the Move in booking blue palette, with readable light/dark text", () => {
  for (const dark of [false, true]) {
    const reference = actionColors.quickActionColors(action("booking-onboarding"), dark);
    for (const item of actions) {
      const palette = actionColors.quickActionColors(item, dark);
      for (const color of Object.values(palette)) assert.match(color, /^#[A-F\d]{6}$/i);
      assert.deepEqual(palette, reference, item.id);
      const values = [luminance(palette.fill), luminance(palette.ink)].sort((a, b) => b - a);
      assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${item.id} in ${dark ? "dark" : "light"}`);
    }
  }
  assert.equal(actionColors.quickActionColors(action("booking-onboarding")).fill, "#EDF4FF");
  assert.notEqual(actionColors.quickActionColors(action("new-booking")).fill, actionColors.quickActionColors(action("new-booking"), true).fill);
});

test("every launch carries explicit property scope and retains existing destination parameters", () => {
  const route = quickActionRoute(action("confirm-booking"), "p42");
  assert.equal(route.pathname, "/owner-bookings");
  assert.equal(route.params.attention, "CONFIRMATION");
  assert.equal(route.params.propertyId, "p42");
  assert.equal(route.params.quickPropertyId, "p42");
  assert.equal(route.params.quickAction, "confirm-booking");
  assert.equal(quickActionRoute(action("bulk-rooms"), "p42").params.mode, "bulk");
  assert.equal(action("edit-menu").pathname, "/owner-food", "Menu must first select a food profile");
});

test("move-in suggestions use Create tenancy > From booking, opening Missed for overdue bookings", () => {
  const suggested = suggestedQuickActions(actions, [{ key: "booking-move-ins", count: 1, route: "/owner-bookings?attention=MOVE_IN" }])[0];
  const route = quickActionRoute(suggested.action, "p42", suggested.route);
  assert.equal(route.pathname, "/owner-booking-onboarding");
  assert.equal(route.params.tab, "MISSED");
  assert.match(read("app/owner-onboard-tenant.tsx"), /title="From booking"[\s\S]*?router\.push\("\/owner-booking-onboarding"\)/);
  assert.equal(quickActionRoute(action("booking-onboarding"), "p42").pathname, route.pathname);
  assert.equal(quickActionRoute(action("booking-onboarding"), "p42", "/owner-bookings?attention=MOVE_IN_TODAY").params.tab, "TODAY");
  const screen = read("app/owner-booking-onboarding.tsx");
  assert.match(screen, /params\.tab === "MISSED" \? "MISSED" : "TODAY"/);
  assert.match(screen, /useState<Tab>\(initialTab\)/);
});

test("Action center links cannot send shortcuts to unrelated workflows or replace their defaults and property scope", () => {
  const settle = quickActionRoute(action("settle-deposit"), "p42", "/owner-deposit-history");
  assert.equal(settle.pathname, "/owner-deposit-manager");
  const confirm = quickActionRoute(action("confirm-booking"), "p42", "/owner-bookings?propertyId=other&quickPropertyId=other&quickAction=cancel-booking");
  assert.equal(confirm.params.attention, "CONFIRMATION");
  assert.equal(confirm.params.propertyId, "p42");
  assert.equal(confirm.params.quickPropertyId, "p42");
  assert.equal(confirm.params.quickAction, "confirm-booking");
  for (const item of actions) {
    assert.equal(quickActionRoute(item, "p42", "/unrelated-screen?attention=wrong").pathname, item.pathname, item.id);
    for (const pathname of item.alternatePaths ?? []) assert.ok(fs.existsSync(path.join(root, "app", `${pathname.slice(1)}.tsx`)), pathname);
  }
});

test("legitimate queue context is preserved, including exits today, earlier attendance and a specific blocking tenancy", () => {
  assert.equal(quickActionRoute(action("end-tenancy"), "p42", "/owner-tenancy?ending=TODAY").params.ending, "TODAY");
  assert.equal(quickActionRoute(action("end-tenancy"), "p42", "/owner-tenancy?open=upcoming-exits").params.open, "upcoming-exits");
  assert.equal(quickActionRoute(action("attendance"), "p42", "/owner-visits-earlier").pathname, "/owner-visits-earlier");
  const specific = quickActionRoute(action("end-tenancy"), "p42", "/owner-end-tenancy?tenancyId=blocking-stay");
  assert.equal(specific.pathname, "/owner-end-tenancy");
  assert.equal(specific.params.tenancyId, "blocking-stay");
  assert.equal(quickActionRoute(action("end-tenancy"), "p42", "/owner-end-tenancy").pathname, "/owner-tenancy");
  assert.equal(action("visit-feedback").pathname, "/owner-visits-earlier");
});

test("the actual launch hook resolves every shortcut through its own workflow and preserves the double-tap guard", () => {
  const routes = [];
  const state = { auth: { user: { id: "owner" }, accessToken: "token" }, account: { activeAccount: "owner" }, ownerWorkspace: { selectedPropertyId: "p1" } };
  const module = load("src/features/quick-actions/use-quick-actions.ts", {
    react: { useMemo: (fn) => fn(), useCallback: (fn) => fn, useRef: (initial) => ({ current: initial }) },
    "expo-router": { useFocusEffect: (callback) => callback() },
    "@/navigation/use-guarded-router": { useGuardedRouter: () => ({ push: (route) => routes.push(route) }) },
    "@/store/hooks": { useAppSelector: (select) => select(state) },
    "@/store/services/property-api": {
      useListMyPropertiesQuery: () => ({ currentData: [{ id: "p1", ownerId: "owner", active: true }] }),
      useGetMyPropertyPermissionsQuery: () => ({ currentData: permissions({}, true) }),
    }, "./catalogue": catalogue, "./recent-actions": { recordQuickActionUse: () => {}, recordSearchPick: () => {}, useRecentQuickActions: () => [], useRecentSearchPicks: () => [] },
  });
  for (const item of actions) {
    const model = module.useQuickActions();
    const context = item.id === "booking-onboarding" ? "/owner-bookings?attention=MOVE_IN" : "/unrelated-screen";
    model.launch(item, context);
    assert.equal(routes.at(-1).pathname, item.pathname, item.id);
    assert.equal(routes.at(-1).params.propertyId, "p1");
    if (item.id === "booking-onboarding") assert.equal(routes.at(-1).params.tab, "MISSED");
    const count = routes.length;
    model.launch(item, context);
    assert.equal(routes.length, count);
  }
  const before = routes.length;
  state.account.activeAccount = "tenant";
  module.useQuickActions().launch(action("new-booking"));
  assert.equal(routes.length, before);
});

test("a booking blocked by a room change suggests the room-change action, with that action's permissions", () => {
  const items = [{ key: "booking-blocked-stay", count: 1, route: "/owner-room-change-requests" }];
  const result = suggestedQuickActions(actions, items)[0];
  assert.equal(result.action.id, "room-changes");
  assert.equal(quickActionRoute(result.action, "p42", result.route).pathname, "/owner-room-change-requests");
  const visible = permittedQuickActions(permissions({ TENANCIES: "MANAGE" }), false);
  assert.ok(!suggestedQuickActions(visible, items).some((item) => item.route === items[0].route));
});

function destinationHandlers(file, context) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = {};
  function walk(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useQuickActionIntent") {
      Object.assign(result, vm.runInNewContext(`(${node.arguments[0].getText(ast)})`, context));
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  return result;
}
test("workflow shortcuts select the correct existing forms and tabs without submitting anything", () => {
  const updates = {};
  const setters = Object.fromEntries(["setQueueTab", "setPropertyTab", "setMyTab", "setScope", "setStatus", "setPage", "setBillingStatusFilter", "setTab", "setMineFilter", "setAllFilter"].map((name) => [name, (value) => { updates[name] = value; }]));
  const concerns = destinationHandlers("app/owner-concerns.tsx", setters);
  concerns["start-concern"]();
  assert.equal(updates.setQueueTab, "mine"); assert.equal(updates.setMyTab, "review");
  concerns["resolve-concern"](); assert.equal(updates.setMyTab, "progress");
  concerns["update-concern"](); assert.equal(updates.setQueueTab, "mine");
  concerns["take-concern"](); assert.equal(updates.setQueueTab, "property");
  const bookings = destinationHandlers("src/features/booking/booking-request-list.tsx", setters);
  bookings["record-token"](); assert.equal(updates.setScope, "MINE"); assert.equal(updates.setStatus, "AWAITING_TOKEN");
  bookings["cancel-booking"](); assert.equal(updates.setScope, "MINE"); assert.equal(updates.setStatus, "ALL");
  destinationHandlers("app/owner-billing.tsx", setters)["remove-late-fee"](); assert.equal(updates.setBillingStatusFilter, "OVERDUE");
  destinationHandlers("app/owner-booking-onboarding.tsx", { ...setters, initialTab: "MISSED" })["booking-onboarding"]();
  assert.equal(updates.setTab, "MISSED"); assert.equal(updates.setPage, 0);
  const enquiries = destinationHandlers("app/owner-enquiries.tsx", setters);
  enquiries["schedule-visit"](); assert.equal(updates.setTab, "mine"); assert.equal(updates.setMineFilter, "OPEN");
  enquiries["reschedule-visit"](); assert.equal(updates.setMineFilter, "SCHEDULED");
  enquiries["cancel-visit"](); assert.equal(updates.setMineFilter, "SCHEDULED");
  enquiries["follow-up"](); assert.equal(updates.setMineFilter, "ALL");
  enquiries["assign-enquiry"](); assert.equal(updates.setTab, "all"); assert.equal(updates.setAllFilter, "OPEN");
  let selected;
  destinationHandlers("app/owner-onboard-tenant.tsx", { chooseBilling: (...values) => { selected = values; } })["existing-tenancy"]();
  assert.deepEqual(selected, ["MONTHLY", true]);
});

function intentHarness() {
  const refs = []; let index = 0; let effects = []; let focused = true;
  const context = { pathname: "/owner-expenses", params: { quickAction: "add-expense", quickPropertyId: "p1" }, model: { property: { id: "p1" }, actions } };
  const module = load("src/features/quick-actions/quick-action-intent.tsx", {
    react: { useRef: (initial) => refs[index++] ?? (refs[index - 1] = { current: initial }), useCallback: (fn) => fn, useState: (initial) => [initial, () => {}] },
    "expo-router": { useLocalSearchParams: () => context.params, usePathname: () => context.pathname, useFocusEffect: (fn) => { if (focused) effects.push(fn); } },
    "react-native": { Text: "Text", View: "View" }, "lucide-react-native": icons,
    "@/components/animated-pressable": { AnimatedPressable: "Button" }, "@/theme/use-theme": {}, "@/theme/spacing": {},
    "@/components/fit-text": { FitText: "FitText" },
    "./catalogue": catalogue, "./use-quick-actions": { useQuickActionsScope: () => context.model }, "./action-colors": actionColors,
  });
  return { context, setFocused: (value) => { focused = value; }, render(handlers, ready = true, recordKey) {
    index = 0; effects = []; module.useQuickActionIntent(handlers, ready, recordKey);
    return () => effects.forEach((fn) => fn());
  } };
}

test("shortcut form opens after commit, once, when ready and focused; never during render", () => {
  const harness = intentHarness(); let opens = 0; const handlers = { "add-expense": () => opens++ };
  harness.render(handlers, false)(); assert.equal(opens, 0);
  const commit = harness.render(handlers); assert.equal(opens, 0); commit(); assert.equal(opens, 1);
  harness.render(handlers)(); assert.equal(opens, 1);
  harness.context.params.quickRun = "another-launch";
  harness.setFocused(false); harness.render(handlers)(); assert.equal(opens, 1);
  harness.setFocused(true); harness.render(handlers)(); assert.equal(opens, 2);
});

test("stale properties, wrong destinations and revoked actions never consume intents", () => {
  for (const mutate of [
    (context) => { context.params.quickPropertyId = "p2"; },
    (context) => { context.pathname = "/owner-billing"; },
    (context) => { context.model.actions = []; },
  ]) {
    const harness = intentHarness(); let opens = 0; mutate(harness.context);
    harness.render({ "add-expense": () => opens++ })(); assert.equal(opens, 0);
  }
});

test("permitted alternate destinations can consume the same action intent", () => {
  const harness = intentHarness();
  harness.context.pathname = "/owner-visits-earlier";
  harness.context.params.quickAction = "attendance";
  let opens = 0;
  harness.render({ attendance: () => opens++ })();
  assert.equal(opens, 1);
  harness.context.pathname = "/owner-bookings";
  harness.context.params.quickRun = "next";
  harness.render({ attendance: () => opens++ })();
  assert.equal(opens, 1);
});

test("record-dependent forms wait for selection and only reopen for a new selection", () => {
  const harness = intentHarness(); harness.context.pathname = "/owner-tenant-bills"; harness.context.params.quickAction = "new-bill";
  let opens = 0; const handlers = { "new-bill": () => opens++ };
  harness.render(handlers, false)(); assert.equal(opens, 0);
  harness.render(handlers, true, "tenant-1")(); harness.render(handlers, true, "tenant-1")(); assert.equal(opens, 1);
  harness.render(handlers, true, "tenant-2")(); assert.equal(opens, 2);
});

test("Home searches on the full screen and fills its tiles with what is waiting, then what is used most", () => {
  const source = read("src/features/quick-actions/home-quick-actions.tsx");
  // No results inside Home: they scrolled inside a scrolling page (user, 2026-10-29).
  assert.doesNotMatch(source, /QuickActionSearchResults|SearchField/);
  assert.match(source, /router\.prefetch\("\/owner-quick-actions"\)/);
  assert.match(source, /onPress=\{\(\) => router\.push\("\/owner-quick-actions"\)\}/);
  assert.doesNotMatch(source, /See more/);
  assert.match(source, /accessibilityLabel="Open quick actions"/);
  assert.match(source, /buildActionItems\(dashboard\)/);
  assert.match(source, /dashboard\.property\?\.propertyId === model\.property\?\.id/);
  assert.match(source, /model\.recent\)/);
  assert.match(read("src/features/quick-actions/use-quick-actions.ts"), /recordQuickActionUse\(model\.scope\.userId, permitted\.id\)/);
  assert.match(read("app/owner-quick-actions.tsx"), /autoFocus=\{search === "1"\}/);
  // Search and filters are one docked block, the second child, with the list sliding under.
  assert.match(read("app/owner-quick-actions.tsx"), /<ScreenScrollView stickyHeaderIndices=\{\[1\]\}/);
  // The gap sits on an inner View: a phone moves a sticky child's own style to an outer wrapper.
  assert.match(read("app/owner-quick-actions.tsx"), /<View style=\{\{ gap: spacing\.lg \}\}>\s+<SearchField[\s\S]*?showFilters \? <FilterPillRow[\s\S]*?<\/View>\s+<\/View>\s+\{model\.loading/);
  assert.doesNotMatch(read("app/owner-quick-actions.tsx"), /backgroundColor: colors\.background, gap:/);
  // The chosen filter is the bigger one.
  // Taller rounded boxes since 2026-11-07, not pills.
  assert.match(read("src/components/filter-bubbles.tsx"), /paddingVertical: active \? 8 : 7/);
  assert.match(read("src/components/filter-bubbles.tsx"), /fontSize: active \? 13 : 12/);
  const results = read("src/features/quick-actions/quick-action-ui.tsx");
  assert.match(results, /results\.other \? "Other quick actions" : "Similar actions"/);
  assert.match(results, /Nothing called “\{query\.trim\(\)\}”/);
});

test("waiting work first, then what this person uses most, then the starters", () => {
  const picked = suggestedQuickActions(actions, [], ["add-room", "post-notice-missing", "new-notice"]).map((item) => item.action.id);
  assert.equal(JSON.stringify(picked), JSON.stringify(["add-room", "new-notice", "new-tenancy", "new-booking"]));
});

test("search offers similar actions when nothing matches, and beside the results when something does", () => {
  const none = searchQuickActions(actions, "deposti");
  assert.equal(none.matches.length, 0);
  assert.ok(none.related.length > 0 && none.related.every((item) => /deposit/i.test(`${item.label} ${item.aliases}`)));
  const some = searchQuickActions(actions, "settle deposit");
  assert.ok(some.matches.length > 0 && some.related.length > 0);
  assert.ok(some.related.every((item) => !some.matches.includes(item)));
  // Nothing near it at all: the everyday actions, never an empty box (user, 2026-10-29).
  assert.equal(JSON.stringify(searchQuickActions(actions, "ghh").related.map((item) => item.id)),
    JSON.stringify(["new-tenancy", "record-payment", "new-booking", "add-expense"]));
  assert.equal(searchQuickActions(actions, "ghh").other, true);
  assert.equal(searchQuickActions(actions, "deposti").other, undefined);
});

test("search forgives one slip in a longer word, never in a short one, and ranks it after exact matches", () => {
  assert.ok(searchQuickActions(actions, "deposite").matches.some((item) => item.id === "settle-deposit"));
  assert.ok(searchQuickActions(actions, "mantenance").matches.some((item) => item.id === "room-maintenance"));
  assert.equal(searchQuickActions(actions, "tent").matches.length, searchQuickActions(actions, "tent").matches.filter((item) => /tent/.test(`${item.label} ${item.aliases}`.toLowerCase())).length);
  const ranked = searchQuickActions(actions, "deposit").matches;
  assert.ok(ranked.length > 0 && ranked.every((item) => /deposit/i.test(`${item.label} ${item.aliases}`)));
});

test("Home places Quick actions immediately after pinned services in both workspace layouts, keyed by property", () => {
  const source = read("app/(tabs)/index.tsx");
  const loaded = source.slice(source.indexOf("function WorkspaceTab("), source.indexOf("function WorkspaceTabLoading("));
  const loading = source.slice(source.indexOf("function WorkspaceTabLoading("), source.indexOf("function HomeToolBox("));
  assert.match(loaded, /<FrequentlyVisited[^>]+\/>\s*<HomeQuickActions key=\{dashboard\.property\.propertyId\} dashboard=\{dashboard\} \/>/);
  assert.match(loading, /<FrequentlyVisited[^>]+\/>\s*<HomeQuickActions key=\{propertyId\} \/>/);
  for (const layout of [loaded, loading]) assert.ok(layout.indexOf("<HomeQuickActions") < layout.indexOf("<ServiceBalanceCard"));
  assert.equal((source.match(/<HomeQuickActions/g) ?? []).length, 2, "No duplicate before Pinned Services or in the Dashboard tab");
  assert.match(source, /stickyHeaderIndices=\{\[\]\}/);
  assert.match(read("app/_layout.tsx"), /name="owner-quick-actions" options=\{\{ headerShown: false \}\}/);
});

test("shortcut destinations contain no guidance cards while focus-scoped form intents stay available", () => {
  for (const file of fs.readdirSync(path.join(root, "app")).filter((name) => /^owner-.*\.tsx$/.test(name))) {
    assert.doesNotMatch(read(`app/${file}`), /QuickActionHint|QuickActionGuideCard/, file);
  }
  assert.doesNotMatch(read("src/features/owner/staff-workspace.tsx"), /QuickActionHint|QuickActionGuideCard/);
  const intent = read("src/features/quick-actions/quick-action-intent.tsx");
  assert.doesNotMatch(intent, /QuickActionHint|QuickActionGuideCard|PermittedHint|react-native|useTheme/);
  assert.match(intent, /export function useQuickActionIntent/);
  assert.match(intent, /useFocusEffect/);
});

test("scope uses only the active account's selected property and never stale property grants", () => {
  const state = { auth: { user: { id: "user" }, accessToken: "token" }, account: { activeAccount: "owner" }, ownerWorkspace: { selectedPropertyId: "p1" } };
  const properties = { currentData: [{ id: "p1", ownerId: "user", active: true }, { id: "p2", ownerId: "other", active: true }] };
  const permissionQuery = { currentData: permissions({}, true) };
  const queries = [];
  const module = load("src/features/quick-actions/use-quick-actions.ts", {
    react: { useMemo: (fn) => fn() }, "expo-router": {},
    "@/navigation/use-guarded-router": {}, "@/store/hooks": { useAppSelector: (select) => select(state) },
    "@/store/services/property-api": {
      useListMyPropertiesQuery: (_, options) => { queries.push(options); return properties; },
      useGetMyPropertyPermissionsQuery: () => permissionQuery,
    }, "./catalogue": catalogue, "./recent-actions": { recordQuickActionUse: () => {}, recordSearchPick: () => {}, useRecentQuickActions: () => [], useRecentSearchPicks: () => [] },
  });
  assert.equal(module.useQuickActionsScope().actions.length, actions.length);
  permissionQuery.currentData = { ...permissions({}, true), propertyId: "p2" };
  assert.equal(module.useQuickActionsScope().actions.length, 0);
  permissionQuery.currentData = undefined;
  assert.equal(module.useQuickActionsScope().loading, true);
  state.ownerWorkspace.selectedPropertyId = null;
  assert.equal(module.useQuickActionsScope().property, undefined, "Never silently chooses the first property");
  state.ownerWorkspace.selectedPropertyId = "p1"; state.account.activeAccount = "manager";
  assert.equal(module.useQuickActionsScope().property, undefined, "Owner property must not leak into manager mode");
  state.ownerWorkspace.selectedPropertyId = "p2";
  permissionQuery.currentData = { ...permissions({ EXPENSES: "MANAGE" }), propertyId: "p2" };
  assert.ok(module.useQuickActionsScope().actions.some((item) => item.id === "add-expense"));
  state.account.activeAccount = "tenant";
  assert.equal(module.useQuickActionsScope().actions.length, 0);
  assert.equal(queries.at(-1).skip, true);
});

function allNodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(allNodes);
  return tree && typeof tree === "object" ? [tree, ...allNodes(tree.props?.children)] : [];
}
const themes = load("src/theme/colors.ts").themes;
const { spacing } = load("src/theme/spacing.ts");
for (const [mode, colors] of Object.entries(themes)) {
  const theme = { colors, isDark: mode === "dark", fonts: { display: "Bold", sansBold: "Bold", sansMedium: "Medium", sans: "Regular" } };
  test(`${mode}: search fields retain their sizes and the grey circular clear button is opt-in`, () => {
    const module = load("src/components/search-field.tsx", {
      react: { useState: () => [false, () => {}] }, "react-native": { View: "View" }, "lucide-react-native": icons,
      "@/components/app-text-input": { AppTextInput: "Input" }, "@/components/animated-pressable": { AnimatedPressable: "Button" },
      "@/theme/spacing": { spacing }, "@/theme/use-theme": { useTheme: () => theme },
    });
    const props = { value: "", placeholder: "Search", onChangeText: () => {} };
    const normal = module.SearchField(props);
    const compact = module.SearchField({ ...props, compact: true });
    // A thin, compact pill (user, 2026-11-13).
    assert.equal(normal.props.style.minHeight, 38);
    assert.equal(normal.props.style.borderRadius, 999);
    assert.equal(compact.props.style.minHeight, 34);
    assert.equal(compact.props.style.borderRadius, 999);
    const changes = [];
    const filled = { ...props, value: "ghh", onChangeText: (value) => changes.push(value) };
    const plain = allNodes(module.SearchField(filled)).find((node) => node.props?.accessibilityLabel === "Clear search");
    assert.equal(plain.props.style.backgroundColor, undefined);
    assert.equal(plain.props.style.padding, 2);
    const circle = allNodes(module.SearchField({ ...filled, clearButtonVariant: "circle" })).find((node) => node.props?.accessibilityLabel === "Clear search");
    assert.equal(circle.props.style.backgroundColor, colors.neutralSoft);
    assert.equal(circle.props.style.borderRadius, 999);
    assert.equal(circle.props.style.width, circle.props.style.height);
    assert.ok(circle.props.style.width + circle.props.hitSlop * 2 >= 44);
    assert.equal(allNodes(circle).find((node) => node.type === icons.X).props.size, 15);
    circle.props.onPress(); assert.deepEqual(changes, [""]);
    assert.ok(!allNodes(module.SearchField({ ...props, clearButtonVariant: "circle" })).some((node) => node.props?.accessibilityLabel === "Clear search"));
  });
  test(`${mode}: Home renders three suggested rows, expands the rest in place, and keeps the grey search arrow`, () => {
    const calls = [];
    const prefetched = [];
    const model = { actions, recent: [], loading: false, error: false, launch: (...args) => calls.push(args) };
    let expanded = false;
    const module = load("src/features/quick-actions/home-quick-actions.tsx", {
      react: { useEffect: (effect) => effect(), useState: () => [expanded, (next) => { expanded = typeof next === "function" ? next(expanded) : next; }] },
      "react-native": { Text: "Text", View: "View" }, "lucide-react-native": icons,
      "@/components/animated-pressable": { AnimatedPressable: "Button" }, "@/components/card": { Card: "Card" },
      "@/components/fit-text": { FitText: "FitText" },
      "@/components/search-field": { SEARCH_BAR_HEIGHT: 38, searchBarFrame: () => ({ borderRadius: 999 }) },
      "@/components/skeleton": { Skeleton: "Skeleton" },
      "@/features/owner/action-center": { buildActionItems: () => [] }, "@/navigation/use-guarded-router": { useGuardedRouter: () => ({ push: (route) => calls.push(route), prefetch: (route) => prefetched.push(route) }) },
      "@/theme/spacing": { radii: { card: 10 }, spacing }, "@/theme/use-theme": { useTheme: () => theme },
      "./catalogue": catalogue, "./quick-action-ui": { QuickActionSuggestionRow: "SuggestionRow" }, "./use-quick-actions": { useQuickActions: () => model }, "./action-colors": actionColors,
    });
    let nodes = allNodes(module.HomeQuickActions({}));
    assert.deepEqual(prefetched, ["/owner-quick-actions"]);
    assert.equal(calls.length, 0, "Preloading must not navigate");
    const tiles = nodes.filter((node) => node.type === "SuggestionRow");
    assert.equal(tiles.length, 3);
    const tileRow = nodes.find((node) => Array.isArray(node.props?.children) && node.props.children.includes(tiles[0]));
    assert.notEqual(tileRow.props.style.flexDirection, "row", "Each suggestion occupies its own full-width row");
    assert.equal(tileRow.props.style.gap, spacing.sm);
    let more = nodes.find((node) => node.props?.accessibilityLabel === "Show 1 more suggested actions");
    assert.ok(more);
    assert.equal(more.props.accessibilityState.expanded, false);
    assert.ok(allNodes(more).some((node) => node.props?.children === "Show 1 more"));
    // Keep the standard top/side padding and the compact bottom inset.
    assert.equal(nodes[0].props.style.padding, undefined);
    assert.equal(nodes[0].props.style.backgroundColor, colors.surface);
    assert.equal(nodes[0].props.style.borderColor, colors.border);
    assert.equal(nodes[0].props.style.paddingBottom, spacing.sm);
    assert.ok(nodes[0].props.style.paddingBottom < spacing.lg);
    const open = nodes.find((node) => node.props?.accessibilityLabel === "Open quick actions");
    assert.equal(open.props.accessibilityRole, "button");
    assert.equal(nodes[0].props.children[0], open);
    assert.equal(allNodes(open).filter((node) => node.type === "Button").length, 1, "The title, gap, search and arrow form one tap target with no nested buttons");
    const header = open.props.children[0];
    assert.equal(header.props.style.alignItems, "center");
    assert.equal(header.props.style.height, undefined, "The title must be able to grow with text size");
    const mark = header.props.children[0];
    assert.equal(mark.type, icons.Zap, "The lightning has no filled wrapper behind it");
    assert.equal(mark.props.color, "#111111");
    assert.equal(mark.props.fill, "#FFD54F");
    assert.equal(mark.props.size, 24);
    const title = header.props.children[1];
    assert.equal(title.props.style.includeFontPadding, false);
    assert.equal(title.props.style.textAlignVertical, "center");
    assert.equal(title.props.style.lineHeight, mark.props.size);
    const searchRow = open.props.children[1];
    const [search, arrow] = searchRow.props.children;
    assert.equal(arrow.props.style.backgroundColor, colors.neutralSoft);
    assert.equal(arrow.props.style.borderRadius, 999);
    assert.equal(arrow.props.style.width, 38); // As tall as the search bar beside it (user, 2026-11-13).
    assert.equal(arrow.props.style.height, 38);
    assert.equal(allNodes(arrow).find((node) => node.type === icons.ArrowRight).props.color, colors.ink);
    assert.ok(!nodes.some((node) => node.props?.children === "See more"));
    assert.equal(arrow.props.onPress, undefined, "The arrow is scenery inside the whole-area button");
    assert.equal(search.props.onPress, undefined);
    open.props.onPress();
    assert.equal(calls.at(-1), "/owner-quick-actions");
    assert.equal(searchRow.props.style.flexDirection, "row");
    assert.ok(searchRow.props.style.marginBottom + nodes[0].props.style.gap > spacing.md);
    assert.equal(Object.assign({}, ...[].concat(search.props.style)).flex, 1);
    assert.equal(Object.assign({}, ...[].concat(search.props.style)).minWidth, 0);
    assert.equal(allNodes(search).find((node) => node.type === "FitText").props.numberOfLines, 1);
    assert.ok(!nodes.some((node) => node.props?.accessibilityRole === "search"), "Home is a screen launcher, not an editable input");
    tiles[0].props.onPress();
    assert.equal(calls.at(-1)[0].id, "new-tenancy");
    more.props.onPress();
    nodes = allNodes(module.HomeQuickActions({}));
    assert.equal(nodes.filter((node) => node.type === "SuggestionRow").length, 4, "Expansion reveals only the remaining suggestions, not the full catalogue");
    more = nodes.find((node) => node.props?.accessibilityLabel === "Show fewer suggested actions");
    assert.equal(more.props.accessibilityState.expanded, true);
    more.props.onPress();
    assert.equal(allNodes(module.HomeQuickActions({})).filter((node) => node.type === "SuggestionRow").length, 3);
    model.recent = ["add-room"];
    nodes = allNodes(module.HomeQuickActions({}));
    assert.equal(nodes.filter((node) => node.type === "SuggestionRow")[0].props.action.id, "add-room");
    model.actions = actions.slice(0, 2);
    nodes = allNodes(module.HomeQuickActions({}));
    assert.equal(nodes.filter((node) => node.type === "SuggestionRow").length, 2);
    assert.ok(!nodes.some((node) => node.props?.accessibilityState?.expanded != null), "No expansion control for shorter permitted lists");
    model.actions = actions;
    model.loading = true;
    nodes = allNodes(module.HomeQuickActions({}));
    assert.equal(nodes.filter((node) => node.type === "Skeleton").length, 3);
    assert.ok(nodes.filter((node) => node.type === "Skeleton").every((node) => node.props.height === 48));
    assert.ok(!nodes.some((node) => node.props?.accessibilityState?.expanded != null));
    model.loading = false; model.error = true;
    nodes = allNodes(module.HomeQuickActions({}));
    assert.equal(nodes.filter((node) => node.type === "SuggestionRow").length, 0);
    assert.ok(!nodes.some((node) => node.props?.accessibilityState?.expanded != null));
  });

  test(`${mode}: Home suggestion rows stretch full width with icons on the left and the pending count on the right`, () => {
    const module = load("src/features/quick-actions/quick-action-ui.tsx", {
      "react-native": { Image: "Image", ScrollView: "ScrollView", Text: "Text", View: "View" }, "lucide-react-native": icons,
      "@/components/animated-pressable": { AnimatedPressable: "Button" }, "@/components/fit-text": { FitText: "FitText" },
      "@/theme/spacing": { spacing }, "@/theme/use-theme": { useTheme: () => theme },
      "./catalogue": catalogue, "./action-colors": actionColors,
    });
    let pressed = 0;
    const props = { action: action("confirm-booking"), count: 125, detail: "125 actions waiting", onPress: () => pressed++ };
    const row = module.QuickActionSuggestionRow(props);
    const palette = actionColors.quickActionColors(props.action, mode === "dark");
    assert.equal(row.props.style.alignSelf, "stretch");
    assert.equal(row.props.style.flex, undefined, "Rows must not stretch vertically in their column");
    assert.equal(row.props.style.flexDirection, "row");
    assert.equal(row.props.style.backgroundColor, palette.fill);
    assert.equal(row.props.style.borderColor, palette.border);
    assert.ok(row.props.style.minHeight >= 44);
    const [icon, label, count] = row.props.children;
    assert.equal(icon.type, props.action.icon);
    assert.equal(icon.props.color, palette.ink);
    assert.equal(label.type, "FitText");
    assert.equal(label.props.style.flex, 1);
    assert.equal(label.props.style.minWidth, 0);
    assert.equal(label.props.numberOfLines, 2);
    assert.equal(count.props.style.position, undefined, "Count is at the trailing edge in normal flow");
    assert.ok(allNodes(count).some((node) => node.props?.children === "99+"));
    assert.equal(row.props.accessibilityLabel, "Confirm booking, 125 actions waiting");
    row.props.onPress(); assert.equal(pressed, 1);
    assert.equal(module.QuickActionSuggestionRow({ ...props, detail: undefined }).props.accessibilityLabel, "Confirm booking, 125 waiting");
    for (const count of [undefined, 0]) {
      assert.equal(module.QuickActionSuggestionRow({ ...props, count, detail: undefined }).props.children[2], null);
    }
  });

  test(`${mode}: compact tiles and catalogue rows share coloured icons and badges retain action counts`, () => {
    const module = load("src/features/quick-actions/quick-action-ui.tsx", {
      "react-native": { Image: "Image", ScrollView: "ScrollView", Text: "Text", View: "View" }, "lucide-react-native": icons,
      "@/components/animated-pressable": { AnimatedPressable: "Button" }, "@/components/fit-text": { FitText: "FitText" },
      "@/theme/spacing": { spacing }, "@/theme/use-theme": { useTheme: () => theme },
      "./catalogue": catalogue, "./action-colors": actionColors,
    });
    let pressed = 0;
    const props = { action: action("confirm-booking"), count: 125, detail: "125 actions waiting", onPress: () => pressed++ };
    const tile = module.QuickActionTile(props);
    const nodes = allNodes(tile);
    const palette = actionColors.quickActionColors(props.action, mode === "dark");
    assert.equal(tile.props.style.backgroundColor, palette.fill);
    assert.equal(tile.props.style.minHeight, 64);
    assert.equal(tile.props.style.flex, 1);
    assert.equal(tile.props.style.minWidth, 0);
    assert.equal(nodes.find((node) => node.type === props.action.icon).props.color, palette.ink);
    assert.equal(nodes.find((node) => node.type === "FitText").props.numberOfLines, 2);
    assert.ok(nodes.some((node) => node.props?.children === "99+"));
    assert.equal(tile.props.accessibilityLabel, "Confirm booking, 125 actions waiting");
    tile.props.onPress(); assert.equal(pressed, 1);
    const row = allNodes(module.QuickActionRow(props));
    assert.equal(row.find((node) => node.type === props.action.icon).props.color, palette.ink);
    assert.ok(row.some((node) => node.props?.style?.backgroundColor === palette.fill));
    assert.equal(module.QuickActionTile({ ...props, square: true }).props.style.aspectRatio, 1);
    for (const item of actions) {
      for (const square of [false, true]) {
        const uniform = module.QuickActionTile({ action: item, square, onPress() {} });
        assert.equal(uniform.props.style.backgroundColor, palette.fill, item.id);
        assert.equal(uniform.props.style.borderColor, palette.border, item.id);
        assert.equal(allNodes(uniform).find((node) => node.type === item.icon).props.color, palette.ink, item.id);
      }
    }
  });

  test(`${mode}: category grids keep three equal square columns, including a partially filled final row`, () => {
    const module = load("src/features/quick-actions/quick-action-ui.tsx", {
      "react-native": { Image: "Image", ScrollView: "ScrollView", Text: "Text", View: "View" }, "lucide-react-native": icons,
      "@/components/animated-pressable": { AnimatedPressable: "Button" }, "@/components/fit-text": { FitText: "FitText" },
      "@/theme/spacing": { spacing }, "@/theme/use-theme": { useTheme: () => theme },
      "./catalogue": catalogue, "./action-colors": actionColors,
    });
    const selected = [];
    const items = actions.slice(0, 5);
    const tree = module.QuickActionGrid({ actions: items, onSelect: (action) => selected.push(action.id) });
    const rows = tree.props.children;
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.props.style.flexDirection, "row");
      assert.equal(row.props.children.length, 3);
    }
    const tiles = allNodes(tree).filter((node) => node.type === module.QuickActionTile);
    assert.equal(tiles.length, 5);
    assert.ok(tiles.every((node) => node.props.square));
    tiles[4].props.onPress(); assert.equal(selected[0], items[4].id);
    const empty = rows[1].props.children[2];
    assert.equal(empty.props.pointerEvents, "none");
    assert.equal(empty.props.style.flex, 1);
  });

  test(`${mode}: empty search uses Discovery's artwork at a smaller size, and matching searches do not show it`, () => {
    const module = load("src/features/quick-actions/quick-action-ui.tsx", {
      "react-native": { Image: "Image", ScrollView: "ScrollView", Text: "Text", View: "View" }, "lucide-react-native": icons,
      "@/components/animated-pressable": { AnimatedPressable: "Button" }, "@/components/fit-text": { FitText: "FitText" },
      "@/theme/spacing": { spacing }, "@/theme/use-theme": { useTheme: () => theme },
      "./catalogue": catalogue, "./action-colors": actionColors,
    });
    const props = { actions, query: "ghh", onSelect() {} };
    const emptyTree = module.QuickActionSearchResults(props);
    assert.equal(emptyTree.props.style.paddingBottom, spacing.sm, "Inset the scroll viewport from the bottom border even when it is mid-scroll");
    const nodes = allNodes(emptyTree);
    const artwork = nodes.filter((node) => node.type === "Image");
    assert.equal(artwork.length, 1);
    assert.equal(artwork[0].props.source, path.join(root, "assets/empty-states/discovery-empty-search.png"));
    assert.equal(artwork[0].props.resizeMode, "contain");
    assert.equal(artwork[0].props.style.width, 96);
    assert.equal(artwork[0].props.style.height, 96);
    assert.ok(artwork[0].props.style.height < 138, "Discovery uses the larger 138px version");
    assert.ok(!nodes.some((node) => node.type === icons.SearchX));
    assert.ok(nodes.some((node) => Array.isArray(node.props?.children) && node.props.children.includes("ghh")));
    const matches = module.QuickActionSearchResults({ ...props, query: "new booking" });
    assert.equal(matches.props.style.paddingBottom, spacing.sm);
    assert.equal(allNodes(matches).filter((node) => node.type === "Image").length, 0);
  });

  test(`${mode}: catalogue narrows by category and heads with recent search picks, not frequently used actions`, () => {
    let query = "";
    let category = "ALL";
    let call = 0;
    let stage = Infinity;
    const launched = [];
    const searched = [];
    const model = { actions, recent: [], searchPicks: [], property: { name: "Test property" }, loading: false, error: false,
      launch: (action) => launched.push(action.id), launchFromSearch: (action) => searched.push(action.id) };
    const module = load("app/owner-quick-actions.tsx", {
      react: { useMemo: (fn) => fn(), useState: () => (call++ % 2 === 0 ? [query, () => {}] : [category, () => {}]) }, "react-native": { Text: "Text", View: "View" }, "lucide-react-native": icons,
      "expo-router": { useLocalSearchParams: () => ({}) }, "@/components/filter-bubbles": { FilterPillRow: "Pills" }, "@/components/section": { Section: "Section" },
      "@/components/empty-state": { EmptyState: "EmptyState" }, "@/components/screen-header": { ScreenHeader: "Header" },
      "@/components/screen-scroll-view": { ScreenScrollView: "Screen" }, "@/components/search-field": { SearchField: "Search" },
      "@/components/skeletons/owner/modules/quick-actions": { QuickActionCategorySkeleton: "CategorySkeleton", QuickActionsScreenSkeleton: "ScreenSkeleton" },
      "@/features/owner/owner-ui": { ActionButton: "ActionButton" }, "@/features/quick-actions/catalogue": catalogue,
      "@/features/quick-actions/quick-action-ui": { QuickActionGrid: "ActionGrid", QuickActionRow: "ActionRow", QuickActionSearchResults: "Results" },
      "@/features/quick-actions/use-quick-actions": { useQuickActions: () => model }, "@/theme/spacing": { spacing }, "@/theme/use-theme": { useTheme: () => theme },
      "@/features/quick-actions/use-staged-categories": { useStagedCategories: (total) => Math.min(stage, total) },
    });
    const render = () => { call = 0; return allNodes(module.default()); };
    stage = 0;
    let opening = render();
    assert.equal(opening.filter((node) => node.type === "ScreenSkeleton").length, 1, "The opening frame stays lightweight even with cached API data");
    assert.equal(opening.filter((node) => node.type === "ActionGrid").length, 0);
    assert.equal(opening.filter((node) => node.type === "Header").length, 1);
    assert.equal(opening.filter((node) => node.type === "Search").length, 1);
    stage = 1;
    opening = render();
    assert.equal(opening.filter((node) => node.type === "ActionGrid").length, 1, "Mount one category, not the full catalogue during entry");
    assert.equal(opening.filter((node) => node.type === "CategorySkeleton").length, 1);
    query = "token"; stage = 0;
    assert.equal(render().filter((node) => node.type === "Results").length, 1, "Search is usable without waiting for category staging");
    query = ""; stage = Infinity;
    let nodes = render();
    const grids = nodes.filter((node) => node.type === "ActionGrid");
    assert.equal(grids.length, categories.length);
    const displayed = grids.flatMap((grid) => Array.from(grid.props.actions));
    assert.equal(displayed.length, actions.length);
    assert.equal(new Set(displayed.map((action) => action.id)).size, actions.length);
    grids.forEach((grid, index) => assert.ok(grid.props.actions.every((action) => action.category === categories[index].id)));
    grids[0].props.onSelect(grids[0].props.actions[0]); assert.equal(launched[0], grids[0].props.actions[0].id);
    assert.equal(nodes.find((node) => node.type === "Pills").props.options[0].value, "ALL");
    assert.equal(nodes.find((node) => node.type === "Search").props.clearButtonVariant, "circle");
    // Frequent actions must not masquerade as search history.
    model.recent = ["room-change"];
    nodes = render();
    assert.equal(nodes.filter((node) => node.type === "ActionGrid").length, categories.length);
    assert.ok(!nodes.some((node) => node.type === "Section" && node.props.title === "Used most"));
    model.searchPicks = ["add-room", "new-notice"];
    nodes = render();
    assert.equal(nodes.find((node) => node.type === "Section").props.title, "Recent searches");
    assert.equal(JSON.stringify(Array.from(nodes.filter((node) => node.type === "ActionGrid")[0].props.actions, (item) => item.id)), JSON.stringify(["add-room", "new-notice"]));
    nodes.filter((node) => node.type === "ActionGrid")[0].props.onSelect(action("new-notice"));
    assert.equal(searched.at(-1), "new-notice", "Opening a recent result refreshes search recency");
    category = "billing";
    nodes = render();
    const narrowed = nodes.filter((node) => node.type === "ActionGrid");
    assert.equal(narrowed.length, 1);
    assert.ok(narrowed[0].props.actions.every((item) => item.category === "billing"));
    category = "ALL";
    model.searchPicks = [];
    query = "token";
    nodes = render();
    assert.equal(nodes.filter((node) => node.type === "ActionGrid").length, 0);
    assert.equal(nodes.find((node) => node.type === "Results").props.query, query);
    // Recent searches sit under the results: chosen results, not typed words (user, 2026-10-29).
    nodes.find((node) => node.type === "Results").props.onSelect(actions[0]);
    assert.equal(searched.at(-1), actions[0].id);
    const recentBlock = (list) => list.find((node) => typeof node.type === "function" && node.type.name === "RecentSearches");
    assert.ok(recentBlock(nodes));
    const recentNodes = (block) => allNodes(block.type({ ...block.props }));
    let recent = recentNodes(recentBlock(nodes));
    assert.ok(recent.some((node) => node.props?.children === "No recent searches"));
    model.searchPicks = ["add-room", "new-notice"];
    nodes = render();
    recent = recentNodes(recentBlock(nodes));
    assert.equal(JSON.stringify(recent.filter((node) => node.type === "ActionRow").map((node) => node.props.action.id)), JSON.stringify(["add-room", "new-notice"]));
    model.loading = true;
    assert.equal(render().filter((node) => node.type === "ScreenSkeleton").length, 1);
  });
}

test("catalogue staging advances one category after each commit, pauses for search and cancels on unmount", () => {
  let visible = 0;
  let cleanup;
  let nextFrame = 0;
  const frames = new Map();
  const module = load("src/features/quick-actions/use-staged-categories.ts", {
    react: { useState: () => [visible, (next) => { visible = next(visible); }], startTransition: (update) => update(),
      useEffect: (effect) => { cleanup?.(); cleanup = effect(); } },
  }, { requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; }, cancelAnimationFrame: (id) => frames.delete(id) });
  const flush = () => { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); };
  assert.equal(module.useStagedCategories(12, true), 0);
  assert.equal(frames.size, 1);
  flush(); assert.equal(visible, 1); assert.equal(frames.size, 0, "Wait for the preceding commit before scheduling the next category");
  assert.equal(module.useStagedCategories(12, true), 1);
  flush(); assert.equal(visible, 2);
  module.useStagedCategories(12, true);
  module.useStagedCategories(12, false);
  assert.equal(frames.size, 0, "Typing in search cancels pending catalogue work");
  assert.equal(module.useStagedCategories(12, true), 2);
  cleanup(); assert.equal(frames.size, 0, "Unmount cancels the frame");
  visible = 12;
  assert.equal(module.useStagedCategories(12, true), 12);
  assert.equal(frames.size, 0, "No recurring work once all categories are mounted");
  assert.equal(module.useStagedCategories(1, true), 1, "A category filter is immediately ready after staging");
});

test("Quick actions skeleton matches the category chips and three-column square tile layout", () => {
  const module = load("src/components/skeletons/owner/modules/quick-actions.tsx", {
    "react-native": { View: "View" }, "@/components/skeleton": { Skeleton: "Skeleton" }, "@/theme/spacing": { spacing },
    "@/theme/use-theme": { useTheme: () => ({ colors: themes.light }) },
  });
  const screen = module.QuickActionsScreenSkeleton();
  assert.equal(screen.props.accessibilityLabel, "Loading quick actions");
  assert.equal(screen.props.accessibilityState.busy, true);
  assert.equal(allNodes(screen).filter((node) => node.type === module.QuickActionCategorySkeleton).length, 2);
  const category = module.QuickActionCategorySkeleton();
  assert.equal(category.props.pointerEvents, "none");
  assert.equal(category.props.accessibilityElementsHidden, true);
  const tiles = allNodes(category).filter((node) => node.props?.style?.aspectRatio === 1);
  assert.equal(tiles.length, 3);
  assert.ok(tiles.every((node) => node.props.style.flex === 1 && node.props.style.minWidth === 0));
});

test("selected-record forms cannot use the previous tenant or salary account snapshot", () => {
  assert.match(read("app/owner-deposit-manager.tsx"), /const deposit = depositQuery\.currentData/);
  assert.match(read("app/owner-tenant-bills.tsx"), /selected\.propertyId === propertyId/);
  assert.match(read("src/features/owner/staff-workspace.tsx"), /<SalaryTracker key=\{property\.id\}/);
  assert.match(read("src/features/owner/staff-workspace.tsx"), /selected\?\.account\.referenceCode/);
});
