const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => { assert.ok(type); return { type, props }; };
function load(source, dependencies = {}, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(outputText, { exports, ...globals, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    assert.ok(name in dependencies, `Missing dependency ${name}`); return dependencies[name];
  } }); return exports;
}
const source = ts.createSourceFile("home.tsx", read("app/(tabs)/index.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function component(name, globals) {
  const node = source.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node); return load(`${node.getText(source)}\nexports.Component = ${name};`, {}, globals).Component;
}
function nodes(tree, type) {
  const found = [];
  function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== "object") return; if (node.type === type) found.push(node); walk(node.props?.children); }
  walk(tree); return found;
}
const { themes } = load(read("src/theme/colors.ts"));
const { spacing } = load(read("src/theme/spacing.ts"));
const fonts = { display: "Jakarta-extra-bold", displaySoft: "Jakarta-bold", sans: "Inter-regular", sansBold: "Inter-bold", sansMedium: "Inter-medium" };
const flat = (style) => Object.assign({}, ...[].concat(style));
const viewGlobals = { View: "View", FitText: "Text", Text: "Text", AnimatedPressable: "AnimatedPressable", StyleSheet: { hairlineWidth: 1 } };

for (const [mode, colors] of Object.entries(themes)) {
  const useTheme = () => ({ colors, fonts, isDark: mode === "dark", type: { caption: {} } });
  test(`${mode}: the owner header is the location with the bell and action centre in one row, no greeting`, () => {
    // No greeting or description (user, 2026-11-14): the property card rises into their space.
    const Header = component("WorkspaceHomeHeader", { ...viewGlobals, useTheme, spacing, HomeLocationBar: "HomeLocationBar" });
    const children = [jsx("Notifications", {}), jsx("ActionCenter", {})];
    const location = { status: "ready", city: "Kolkata" };
    const onRefreshLocation = () => {};
    const tree = Header({ children, firstName: "Debangshu", greeting: "Good morning", location, onRefreshLocation, subtitle: "Manage your property.", topInset: 32 });
    assert.equal(tree.props.style.backgroundColor, colors.primary);
    assert.equal(tree.props.style.paddingTop, 32 + spacing.sm);
    assert.equal(tree.props.style.flexDirection, "row");
    assert.equal(nodes(tree, "Text").length, 0, "No greeting or description");
    const locationBar = nodes(tree, "HomeLocationBar")[0];
    assert.equal(locationBar.props.compact, true);
    assert.equal(locationBar.props.location, location);
    assert.equal(locationBar.props.onRefresh, onRefreshLocation);
    const actionRow = nodes(tree, "View").find((node) => node.props.children === children);
    assert.equal(actionRow.props.style.flexDirection, "row");
    assert.equal(actionRow.props.style.alignItems, "center");
    children.forEach((child) => assert.equal(nodes(tree, child.type).length, 1));
  });
  test(`${mode}: original icon tabs meet the page with one curved fill, without a grey pill or underline`, () => {
    const Tabs = component("OwnerTabBar", { ...viewGlobals, useTheme, spacing, Svg: "Svg", Rect: "Rect", Path: "Path", LayoutGrid: "Grid", DashboardGlyph: "Chart",
      useWindowDimensions: () => ({ width: 390 }), useState: (initial) => [initial(), () => {}] });
    for (const selected of ["workspace", "dashboard"]) {
      const changes = [];
      const tree = Tabs({ tab: selected, onChange: (value) => changes.push(value) });
      assert.equal(tree.props.accessibilityRole, "tablist");
      assert.equal(tree.props.style.overflow, "visible");
      const svg = nodes(tree, "Svg")[0];
      assert.equal(svg.props.width, 396, "Bleed across the full screen to prevent edge seams");
      assert.equal(svg.props.height, 56);
      assert.equal(nodes(svg, "Rect")[0].props.fill, colors.primary);
      assert.equal(nodes(svg, "Path")[0].props.fill, colors.background);
      assert.ok(nodes(svg, "Path")[0].props.d.includes("C "), "Restore the curved contour");
      const buttons = nodes(tree, "AnimatedPressable"); assert.equal(buttons.length, 2);
      buttons.forEach((button, index) => {
        const value = index === 0 ? "workspace" : "dashboard";
        assert.equal(button.props.style.flex, 1);
        assert.equal(button.props.style.minHeight, 56);
        assert.equal(button.props.style.borderBottomWidth, undefined);
        assert.equal(button.props.style.backgroundColor, "transparent");
        assert.equal(button.props.accessibilityState.selected, value === selected);
        const text = nodes(button, "Text")[0];
        assert.equal(text.props.style.color, value === selected ? colors.ink : colors.onPrimary);
        assert.equal(text.props.style.fontFamily, value === selected ? fonts.sansBold : fonts.sans);
        const icon = nodes(button, index === 0 ? "Grid" : "Chart")[0];
        assert.equal(icon.props.color, value === selected ? colors.primary : colors.onPrimary);
        assert.equal(icon.props.size, 20);
        button.props.onPress();
      });
      assert.deepEqual(changes, ["workspace", "dashboard"]);
      assert.equal(nodes(tree, "Svg").length, 1);
    }
  });
  test(`${mode}: the three Home digest cards use compact outer padding and matching header spacing`, () => {
    const globals = { ...viewGlobals, useTheme, spacing, Card: "Card", StaffMetricBox: "Metric", ChevronRight: "ChevronRight",
      PaymentClaimsIcon: "ClaimsIcon", NoticeIcon: "NoticeIcon", ExpenseIcon: "ExpenseIcon",
      useListUpcomingNoticesQuery: () => ({ data: [] }), useGetBudgetOverviewQuery: () => ({ data: { spentPaise: 100, effectiveBudgetPaise: 200 } }),
      istMonthStart: () => "2026-10-01", compactMoneyPaise: (value) => String(value), formatMoneyPaise: (value) => String(value) };
    for (const name of ["PaymentClaimsCard", "UpcomingNoticesCard", "ExpenseTrackerCard"]) {
      const Component = component(name, globals);
      const tree = Component({ onOpen() {}, propertyId: "p1", digest: { awaitingReview: 1, awaitingAmountPaise: 100, resolvedThisMonth: 2 } });
      const card = nodes(tree, "Card")[0];
      assert.equal(card.props.style.padding, spacing.sm, name);
      const body = card.props.children;
      assert.equal(body.props.style.gap, spacing.sm, name);
      const header = body.props.children[0];
      assert.equal(header.props.style.gap, spacing.sm, name);
      assert.equal(header.props.children[0].props.style.width, 36, name);
      assert.equal(header.props.children[0].props.style.height, 36, name);
      assert.equal(nodes(tree, "Metric").length, 3, "Keep all three figures");
    }
  });
}

test("workspace location restores the address, original location label and refresh action", () => {
  const useTheme = () => ({ colors: themes.light, fonts, type: { caption: {} } });
  const Location = component("HomeLocationBar", {
    ...viewGlobals, useTheme, spacing, Ionicons: "Ionicons", Navigation: "Navigation", ActivityIndicator: "ActivityIndicator", ChevronDown: "ChevronDown", RefreshCw: "RefreshCw",
    locationTitle: (location) => location.city, locationAddress: (location) => location.displayAddress,
  });
  let refreshed = 0;
  const props = { inverse: true, compact: true, location: { status: "ready", city: "Kolkata", displayAddress: "A local address" }, onRefresh: () => refreshed++ };
  const original = Location(props);
  original.props.onPress(); assert.equal(refreshed, 1);
  assert.equal(nodes(original, "Text").length, 2);
  assert.equal(nodes(original, "Text")[0].props.style.fontSize, 16);
  assert.equal(nodes(original, "Text")[1].props.children, "A local address");
  assert.equal(nodes(original, "RefreshCw").length, 1);
});

test("only owner/manager Home opts into the new banner, and its actions retain their destinations", () => {
  const file = read("app/(tabs)/index.tsx");
  assert.match(file, /\{isWorkspace \? \(\s*<WorkspaceHomeHeader/);
  const header = file.slice(file.indexOf("<WorkspaceHomeHeader"), file.indexOf("</WorkspaceHomeHeader>"));
  // The yellow 3D bell and the 3D action centre, no recent activity (user, 2026-11-14).
  assert.match(header, /HomeAlertsButton[^]*?router\.push\("\/notifications"\)\} yellow/);
  assert.doesNotMatch(header, /LatestEventsButton/);
  assert.match(header, /HomeAttentionButton colored count=\{headerAttentionCount\}[^]*?router\.push\("\/owner-action-center"\)/);
  assert.doesNotMatch(header, /Quick actions|owner-quick-actions/);
});
