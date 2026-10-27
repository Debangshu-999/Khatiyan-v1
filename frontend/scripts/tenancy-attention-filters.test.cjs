const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const element = (type, props) => ({ type, props });
const plain = (value) => JSON.parse(JSON.stringify(value));
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function declaration(file, name) {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = sf.statements.find((node) =>
    ts.isFunctionDeclaration(node) ? node.name?.text === name :
      ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(sf) === name));
  assert.ok(node, `${name} exists in ${file}`);
  return node.getText(sf).replace(/^export (default )?/, "");
}
function compile(source, globals = {}, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, { exports, ...globals, require(name) {
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const theme = { colors: { ink: "ink", inkSoft: "inkSoft", muted: "muted" }, fonts: {} };
const ui = Object.fromEntries([
  "CenterModal", "View", "ModalTitle", "IconButton", "PickerOptionRow", "X", "CheckCircle2",
  "AlertTriangle", "Clock3", "CircleAlert", "CalendarClock", "CalendarX2", "ExitTenancyIcon",
  "UpcomingExitsIcon", "Check", "ScreenScrollView", "ScreenHeader", "EmptyState", "FilterPillRow",
  "OwnerActionCenterSkeleton", "MovingBorder", "ActionRow", "Banknote", "ShieldAlert", "AlertCircle",
  "Repeat2", "KeyRound", "MessageSquare", "Wallet", "HandCoins", "FileSignature", "BedDouble",
  "TrendingUp", "Gauge", "AnimatedPressable", "DoorOpen",
].map((name) => [name, name]));
const shared = { ...ui, useTheme: () => theme, spacing: { xs: 4, sm: 8, md: 12, lg: 18, xl: 24 } };
function hooks() {
  const state = [], deps = [];
  let cursor = 0, effectCursor = 0, pending = [];
  return {
    begin() { cursor = 0; effectCursor = 0; },
    flush() { const effects = pending; pending = []; effects.forEach((effect) => effect()); },
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [state[i], (next) => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
    },
    useEffect(effect, next) {
      const i = effectCursor++;
      if (!deps[i] || next.some((value, index) => value !== deps[i][index])) pending.push(effect);
      deps[i] = next;
    },
  };
}

const tenancyFile = "app/owner-tenancy.tsx";
for (const [file, component, options, selected] of [
  [tenancyFile, "StayStatusFilterDialog", "STAY_STATUS_FILTER_OPTIONS", "ENDS_TODAY"],
  ["app/owner-billing.tsx", "BillingStatusFilterDialog", "BILLING_STATUS_FILTER_OPTIONS", "UNPAID"],
]) {
  const dialog = compile(`${declaration(file, options)}\n${declaration(file, component)}\nexports.render = ${component};`, {
    ...shared, tenancyStatusLabel: (status) => ({ ACTIVE: "Active", ON_NOTICE: "On notice", PENDING_EXIT: "Pending exit", PENDING_ACCEPTANCE: "Pending agreement", SCHEDULED: "Booked" })[status],
  });
  test(`${component}: All status spans the row; six remaining options form two columns`, () => {
    const tree = dialog.render({ value: selected, onClose() {}, onSelect() {} });
    const grid = nodes(tree).find((node) => node.props?.style?.flexWrap === "wrap");
    assert.equal(grid.props.style.flexDirection, "row");
    const cells = grid.props.children;
    assert.equal(cells.length, 7);
    assert.equal(cells[0].props.style.width, "100%");
    assert.equal(cells[0].props.children.props.label, "All status");
    cells.slice(1).forEach((cell) => assert.equal(cell.props.style.width, "50%"));
    assert.equal(nodes(tree).filter((node) => node.type === "PickerOptionRow" && node.props.selected).length, 1);
    if (file === tenancyFile) assert.ok(!nodes(tree).some((node) => node.props?.label === "Booked"));
  });
  test(`${component}: right-aligned close dismisses without selecting; options select then dismiss`, () => {
    const events = [];
    const tree = dialog.render({ value: selected, onClose: () => events.push("close"), onSelect: (value) => events.push(value) });
    const header = nodes(tree).find((node) => Array.isArray(node.props?.children) && node.props.children.some((child) => child?.type === "ModalTitle"));
    assert.equal(header.props.style.justifyContent, "space-between");
    nodes(tree).find((node) => node.type === "IconButton").props.onPress();
    assert.deepEqual(events, ["close"]);
    events.length = 0;
    nodes(tree).find((node) => node.type === "PickerOptionRow" && node.props.selected).props.onPress();
    assert.deepEqual(events, [selected, "close"]);
    events.length = 0;
    nodes(tree).find((node) => node.props?.label === "All status").props.onPress();
    assert.deepEqual(events, ["ALL", "close"]);
  });
}

test("shared close button keeps a fixed accessible circular target in narrow headers", () => {
  const { IconButton } = compile(`${declaration("src/features/owner/owner-ui.tsx", "IconButton")}\nexports.IconButton = IconButton;`, shared);
  let closed = false;
  const tree = IconButton({ accessibilityLabel: "Close", filled: true, icon: "X", onPress: () => { closed = true; } });
  assert.equal(tree.props.accessibilityRole, "button");
  assert.equal(tree.props.style.flexShrink, 0);
  assert.equal(tree.props.style.width, 36);
  assert.equal(tree.props.style.height, 36);
  tree.props.onPress();
  assert.equal(closed, true);
});

function actionHarness(attention) {
  const h = hooks(), routes = [], queries = [], gates = [];
  let allowed = true;
  const file = "app/owner-action-center.tsx";
  const { render, buildActionItems } = compile([
    ...["ACTION_FILTERS", "TONE_RANK", "buildActionItems", "blockedBookingDetail", "countActionItems"].map((name) => declaration("src/features/owner/action-center.ts", name)),
    "const FILTERS = ACTION_FILTERS;",
    declaration(file, "OwnerActionCenterScreen"),
    "exports.render = OwnerActionCenterScreen; exports.buildActionItems = buildActionItems;",
  ].join("\n"), {
    ...shared, ...h, ALL_CAUGHT_UP_ILLUSTRATION: "caught-up", BookingsIcon: "BookingsIcon", BookingTokenAmountIcon: "BookingTokenAmountIcon", EnquiriesIcon: "EnquiriesIcon", PropertyVisitsIcon: "PropertyVisitsIcon", useMemo: (fn) => fn(), useCallback: (fn) => fn, useFocusEffect() {},
    useGuardedRouter: () => ({ push: (route) => routes.push(route) }),
    useAppSelector: (selector) => selector({ ownerWorkspace: { selectedPropertyId: "property-1" } }),
    useRouteGate: (propertyId) => ({ dialog: null, gate: (route, action) => { gates.push({ propertyId, route }); if (allowed) action(); } }),
    useGetOwnerDashboardQuery: (...args) => { queries.push(args); return { currentData: { attention, blockedBookings: [] }, refetch() {} }; },
  });
  return { routes, queries, gates, buildActionItems, deny: () => { allowed = false; }, render: () => { h.begin(); return render(); } };
}
test("due-today action appears in All and Tenancy, refreshes property data and preserves gated navigation", () => {
  const h = actionHarness({ exitsDueToday: 2, paymentsOverdue: 3 });
  let tree = h.render();
  assert.equal(nodes(tree).filter((node) => node.type === "ActionRow").length, 2);
  assert.deepEqual(plain(h.queries[0]), ["property-1", { skip: false, refetchOnMountOrArgChange: true,
    refetchOnFocus: true, refetchOnReconnect: true, pollingInterval: 60_000, skipPollingIfUnfocused: true }]);
  nodes(tree).find((node) => node.type === "FilterPillRow").props.onChange("tenancy");
  tree = h.render();
  const rows = nodes(tree).filter((node) => node.type === "ActionRow");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].props.item.key, "due-today-exits");
  assert.equal(rows[0].props.item.badge, "2");
  rows[0].props.onPress();
  assert.deepEqual(h.routes, ["/owner-tenancy?ending=TODAY"]);
  assert.deepEqual(h.gates, [{ propertyId: "property-1", route: "/owner-tenancy?ending=TODAY" }]);
  h.deny(); rows[0].props.onPress();
  assert.equal(h.routes.length, 1);
});
test("old and zero-count dashboards omit due today without disturbing upcoming or overdue queues", () => {
  const h = actionHarness({});
  for (const count of [undefined, 0]) {
    const items = h.buildActionItems({ attention: { exitsDueToday: count, upcomingExits: 1, exitsPastDue: 2 } });
    assert.ok(!items.some((item) => item.key === "due-today-exits"));
    assert.equal(items.find((item) => item.key === "upcoming").route, "/owner-tenancy?open=upcoming-exits");
    assert.equal(items.find((item) => item.key === "past-due-exits").badge, "2");
  }
});

function tenancyHarness(initialParams) {
  const h = hooks(), queries = [];
  let params = initialParams;
  const source = read(tenancyFile);
  const sf = ts.createSourceFile(tenancyFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screen = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "OwnerTenancyWorkspaceScreen");
  const stop = screen.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => decl.name.getText(sf) === "pastTenanciesQuery"));
  const prefix = source.slice(screen.body.getStart(sf) + 1, stop.getStart(sf));
  const { render } = compile(`${declaration(tenancyFile, "resolveSelectedProperty")}\nfunction render() {${prefix}\nreturn {statusFilter, upcomingOpen, activePage, searchDraft, committedQuery, setStatusFilter, setActivePage, setSearchDraft, setCommittedQuery}; }\nexports.render = render;`, {
    ...shared, ...h, TENANCY_PAGE_SIZE: 10, setTimeout: () => 1, clearTimeout() {},
    useGuardedRouter: () => ({}), useLocalSearchParams: () => params,
    useAppSelector: (fn) => fn({ ownerWorkspace: { selectedPropertyId: "property-1" } }),
    useListMyPropertiesQuery: () => ({ data: [{ id: "property-1", name: "Test" }] }),
    useGetPendingAgreementDeadlinesQuery: () => ({ data: [] }), useCancelPendingTenancyMutation: () => [() => {}],
    useFormErrors: () => ({}), useToast: () => ({}), useListPropertyRoomsQuery: () => ({}),
    usePropertyPermissions: () => ({ canManage: () => true, canView: () => true }),
    useScreenAccessGuard: () => ({ dialog: null, guard() {} }), useGetOwnerDashboardQuery: () => ({}),
    useListActivePropertyTenanciesQuery: (args) => { queries.push(plain(args)); return {}; },
  });
  return { queries, flush: h.flush, params: (next) => { params = next; }, render: () => { h.begin(); return render(); } };
}
test("Ends today deep link filters the first server query, while manual choices still work", () => {
  const h = tenancyHarness({ ending: "TODAY" });
  h.render();
  assert.deepEqual(h.queries[0], { page: 0, propertyId: "property-1", query: "", size: 10, ending: "TODAY" });
  h.flush();
  h.render().setStatusFilter("ACTIVE");
  h.render();
  assert.equal(h.queries.at(-1).status, "ACTIVE");
  assert.equal(h.queries.at(-1).ending, undefined);
  h.render().setStatusFilter("ENDS_SOON");
  h.render();
  assert.equal(h.queries.at(-1).ending, "SOON");
});
test("changing the deep link clears stale search/page; ordinary entry and upcoming exits remain intact", () => {
  const h = tenancyHarness({});
  let state = h.render(); h.flush(); state = h.render();
  state.setStatusFilter("ACTIVE"); state.setActivePage(4); state.setSearchDraft("old"); state.setCommittedQuery("old");
  h.params({ ending: "TODAY" }); h.render(); h.flush(); state = h.render();
  assert.equal(state.statusFilter, "ENDS_TODAY");
  assert.equal(state.activePage, 0); assert.equal(state.searchDraft, ""); assert.equal(state.committedQuery, "");
  h.params({}); h.render(); h.flush(); state = h.render();
  assert.equal(state.statusFilter, "ALL");
  assert.equal(h.queries.at(-1).ending, undefined);
  assert.equal(tenancyHarness({ open: "upcoming-exits" }).render().upcomingOpen, true);
});
test("tenancy API forwards the existing TODAY filter to the property-scoped endpoint", () => {
  let endpoints;
  compile(read("src/store/services/tenancy-api.ts"), { __DEV__: false }, {
    "@/store/api": { api: { injectEndpoints: (options) => { endpoints = options.endpoints({ query: (def) => def, mutation: (def) => def }); return {}; } }, ifMatch() {} },
  });
  const request = endpoints.listActivePropertyTenancies.query({ propertyId: "property-1", ending: "TODAY", page: 0, size: 10 });
  assert.equal(request.url, "/api/v1/tenancies/properties/property-1/active");
  assert.equal(request.params.ending, "TODAY");
});
