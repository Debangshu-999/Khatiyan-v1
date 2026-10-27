const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const jsx = (type, props) => ({ type, props });
function load(file, dependencies) {
  const exported = {};
  const { outputText } = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(outputText, { exports: exported, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected import ${name}`);
    return dependencies[name];
  } });
  return exported;
}
function nodes(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
function expand(tree) {
  if (!tree || typeof tree !== "object") return tree;
  if (Array.isArray(tree)) return tree.map(expand);
  if (typeof tree.type === "function") return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: expand(tree.props?.children) } };
}

const icons = load("src/components/tenancy-line-icons.tsx", {
  react: { forwardRef: (render) => render, useId: () => "digest-icon" },
  "lucide-react-native": { ArrowLeftRight: "ArrowLeftRight" },
  "react-native-svg": { __esModule: true, default: "Svg", ClipPath: "ClipPath", Defs: "Defs", Path: "Path" },
  "./tenancy-vector-data.json": JSON.parse(read("src/components/tenancy-vector-data.json")),
});
const screens = [
  ["owner-payments-today", "DigestPayments", "No payments today"],
  ["owner-concerns-today", "DigestConcerns", "No concerns raised today"],
  ["owner-move-ins-today", "DigestMoveIns", "Nobody moved in today"],
  ["owner-exits-today", "DigestMoveOuts", "Nobody moving out today"],
];

test("Dashboard Billing uses the same theme-coloured vector icon treatment as the other insights rows", () => {
  const source = read("app/(tabs)/index.tsx");
  const sf = ts.createSourceFile("index.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rows = [];
  function scan(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sf) === "AnalyticsRowCard") {
      const props = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map((prop) => [prop.name.getText(sf), prop.initializer]));
      rows.push({ label: props.label?.text, icon: props.icon?.expression?.getText(sf) });
    }
    ts.forEachChild(node, scan);
  }
  scan(sf);
  assert.deepEqual(rows, [
    { label: "Billing", icon: "RupeeBanknoteIcon" }, { label: "Finance", icon: "ChartPie" },
    { label: "Tenancy", icon: "Users" }, { label: "Leads", icon: "LeadsInsightsIcon" }, { label: "Concerns", icon: "MessageSquareWarning" },
  ]);
});

test("Leads has a person-and-magnifier vector and the requested Dashboard description", () => {
  const { LeadsInsightsIcon } = load("src/components/leads-insights-icon.tsx", {
    "react-native-svg": { __esModule: true, default: "Svg", Circle: "Circle", Path: "Path" },
  });
  const tree = LeadsInsightsIcon({ color: "#3F6ED8", size: 34, strokeWidth: 2 });
  assert.equal(tree.type, "Svg");
  assert.equal(tree.props.stroke, "#3F6ED8");
  assert.equal(tree.props.strokeWidth, 2);
  assert.equal(tree.props.width, 34);
  assert.equal(tree.props.height, 34);
  assert.equal(tree.props.viewBox, "0 0 24 24");
  assert.equal(nodes(tree, "Circle").length, 2);
  assert.equal(nodes(tree, "Path").length, 2);
  assert.equal(nodes(tree, "Image").length, 0);
  assert.equal(nodes(tree, "Text").length, 0);
  assert.match(read("app/(tabs)/index.tsx"), /caption="Moved in from listing views this month"\s+icon=\{LeadsInsightsIcon\}\s+label="Leads"/);
});

test("Billing's banknote contains a vector rupee and inherits the Dashboard icon colour and size", () => {
  const { RupeeBanknoteIcon } = load("src/components/rupee-banknote-icon.tsx", {
    "react-native-svg": { __esModule: true, default: "Svg", Path: "Path", Rect: "Rect" },
  });
  const tree = RupeeBanknoteIcon({ color: "#3F6ED8", size: 34, strokeWidth: 2 });
  assert.equal(tree.type, "Svg");
  assert.equal(tree.props.stroke, "#3F6ED8");
  assert.equal(tree.props.width, 34);
  assert.equal(tree.props.height, 34);
  assert.equal(tree.props.viewBox, "0 0 24 24");
  assert.equal(nodes(tree, "Rect").length, 1);
  assert.ok(nodes(tree, "Path").some((path) => path.props.d === "M9 8h6M9 10.5h6M10 8c5 0 5 5.5 0 5.5H9l5 3.5"));
  assert.equal(nodes(tree, "Image").length, 0);
  assert.equal(nodes(tree, "Text").length, 0);
});

test("the Home Move-outs card says Ending today (user, 2026-10-18)", () => {
  const source = read("app/(tabs)/index.tsx");
  const sf = ts.createSourceFile("index.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const cards = [];
  function scan(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sf) === "DigestTile") {
      const props = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map((prop) => [prop.name.getText(sf), prop.initializer?.text]));
      if (props.label === "Move-outs") cards.push(props);
    }
    ts.forEachChild(node, scan);
  }
  scan(sf);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].hint, "Ending today");
});

for (const [screen, iconName, title] of screens) {
  test(`${screen} reuses its Home card's exact vector geometry in blue`, () => {
    const home = expand(icons[`${iconName}Icon`]({ size: 64 }));
    const empty = expand(icons[`${iconName}EmptyIcon`]({ size: 64 }));
    assert.equal(empty.type, "Svg");
    assert.equal(empty.props.width, 64);
    assert.equal(empty.props.height, 64);
    assert.equal(empty.props.viewBox, home.props.viewBox);
    const homePaths = nodes(home, "Path"), bluePaths = nodes(empty, "Path");
    assert.ok(bluePaths.length > 0);
    assert.deepEqual(bluePaths.map((node) => node.props.d), homePaths.map((node) => node.props.d));
    assert.ok(homePaths.some((node) => node.props.fill === "#000000"));
    assert.ok(bluePaths.some((node) => node.props.fill === "#3F6ED8"));
    assert.ok(bluePaths.every((node) => node.props.fill !== "#000000" && node.props.stroke !== "#000000"));
    assert.equal(nodes(empty, "Image").length, 0);
    assert.ok(read("app/(tabs)/index.tsx").includes(`icon={${iconName}Icon}`));
  });

  test(`${screen} renders the centered title-only artwork only after an empty result`, () => {
    function render({ loading = false, rows = [] } = {}) {
      const state = { auth: { user: { id: "owner-1" } }, ownerWorkspace: { selectedPropertyId: "property-1" } };
      const query = () => ({ data: rows, isLoading: loading });
      const dependencies = {
        react: { useMemo: (fn) => fn(), useState: (initial) => [initial, () => {}] },
        "react-native": { Text: "Text", View: "View" },
        "lucide-react-native": { DoorOpen: "DoorOpen", LogOut: "LogOut" },
        "@/components/tenancy-line-icons": icons,
        "@/components/artwork-icon": { ExitTenancyIcon: "ExitTenancyIcon" },
        "@/components/card": { Card: "Card" },
        "@/components/empty-state": { EmptyState: "EmptyState" },
        "@/components/pinned-footer": { PINNED_FOOTER_CLEARANCE: 100, PinnedFooter: "PinnedFooter" },
        "@/components/screen-header": { ScreenHeader: "ScreenHeader" },
        "@/components/screen-scroll-view": { ScreenScrollView: "ScreenScrollView" },
        "@/components/skeletons/owner": { OwnerDataListSkeleton: "Skeleton", OwnerConcernQueueSkeleton: "Skeleton" },
        "@/components/status-pill": { StatusPill: "StatusPill" },
        "@/features/enquiry/enquiry-tags": { CountPill: "CountPill" },
        "@/features/owner/owner-ui": { ActionButton: "ActionButton", formatMoneyPaise: (amount) => String(amount) },
        "@/features/owner/use-property-permissions": { usePropertyPermissions: () => ({ canManage: () => true }) },
        "@/navigation/use-guarded-router": { useGuardedRouter: () => ({ push: () => assert.fail("Rendering an empty screen must not navigate") }) },
        "@/store/hooks": { useAppSelector: (select) => select(state) },
        "@/store/services/billing-api": { billTitle: () => "Rent", useListPropertyCyclesPaidTodayQuery: query },
        "@/store/services/concern-api": { useListPropertyConcernsRaisedTodayQuery: query },
        "@/store/services/property-api": { useListMyPropertiesQuery: () => ({ data: [{ id: "property-1", name: "Test property" }] }), useListPropertyRoomsQuery: () => ({ data: [] }) },
        "@/store/services/tenancy-api": { useListPropertyTenanciesQuery: query, useListPropertyExitRequestsQuery: query },
        "@/theme/spacing": { spacing: { lg: 18 } },
        "@/theme/use-theme": { useTheme: () => ({ colors: {}, fonts: {}, type: {} }) },
        "./owner-concerns": { ConcernCard: "ConcernCard" },
      };
      return load(`app/${screen}.tsx`, dependencies).default();
    }
    const [empty] = nodes(render(), "EmptyState");
    assert.ok(empty);
    assert.equal(empty.props.title, title);
    assert.equal(empty.props.artworkNode.type, icons[`${iconName}EmptyIcon`]);
    assert.equal(empty.props.artworkNode.props.size, 64);
    assert.equal(empty.props.description, undefined);
    assert.equal(empty.props.icon, undefined);
    assert.equal(empty.props.artwork, undefined);
    assert.notEqual(empty.props.compact, true);
    const pending = render({ loading: true });
    assert.equal(nodes(pending, "EmptyState").length, 0);
    assert.equal(nodes(pending, "Skeleton").length, 1);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const row = { id: "row-1", status: "ACTIVE", startDate: today, checkoutDate: today, approvedCheckoutDate: today, totalAmountPaise: 10000 };
    assert.equal(nodes(render({ rows: [row] }), "EmptyState").length, 0);
  });
}

// Move-outs is every stay due to end today, ended or not (user, 2026-10-18).
test("Move-outs lists fixed terms ending today and keeps stays already ended today", () => {
  const screen = read("app/owner-exits-today.tsx");
  assert.match(screen, /tenancy\.checkoutDate === today \|\| approvedToday\.has\(tenancy\.id\)/);
  assert.match(screen, /ENDED\.includes\(tenancy\.status\) && tenancy\.endDate === today/);
  assert.match(screen, /includePast: true/);
  assert.match(screen, /canEnd && !ended \?/);
});
