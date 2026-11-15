const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => { assert.ok(type, "A rendered component must be defined"); return { type, props }; };
function load(source, dependencies = {}, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(outputText, { exports, ...globals, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
function nodes(tree, type) {
  const result = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (node.type === type) result.push(node);
    walk(node.props?.children);
  }
  walk(tree); return result;
}
const source = ts.createSourceFile("owner-property.tsx", read("app/owner-property.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result;
  function walk(node) { if (predicate(node)) result = node; else ts.forEachChild(node, walk); }
  walk(source); assert.ok(result); return result;
}
const attr = (node, name) => node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
const workspace = find((node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Section" && attr(node.openingElement, "title")?.text === "Property workspace");
const icons = Object.fromEntries(["ManageListingIcon", "RoomsAndBedsIcon", "ItemCatalogueIcon", "DamagesIcon", "PropertyBoardIcon", "NearbyLocationsIcon", "BookingsIcon", "EnquiriesIcon", "PropertyVisitsIcon"].map((name) => [name, name]));

test("Property workspace follows the requested order with unchanged destinations and enquiry count", () => {
  const routes = [];
  const { render } = load(`exports.render = () => (${workspace.getText(source)});`, {}, {
    Section: "Section", ActionCard: "ActionCard", ...icons, permissionsReady: true, isPropertyOwner: true, openEnquiryCount: 36,
    router: {}, open: (_, route) => routes.push(route),
  });
  const cards = nodes(render(), "ActionCard");
  assert.deepEqual(cards.map((node) => node.props.title), ["Manage listing", "Rooms & beds", "Item catalogue & Damages", "Damages & Repairs", "Property board", "Nearby locations", "Bookings", "Enquiries", "Visiting Hours"]);
  cards.forEach((node) => node.props.onPress());
  assert.deepEqual(routes, ["/owner-manage-listing", "/owner-rooms", "/owner-exit-policies", "/owner-damages", "/owner-board", "/owner-nearby-places", "/owner-bookings", "/owner-enquiries", "/owner-property-visits"]);
  assert.equal(cards[7].props.badge, 36);
});

test("moving Bookings preserves its owner and ready-permissions gate", () => {
  for (const [permissionsReady, isPropertyOwner] of [[false, true], [true, false]]) {
    const { render } = load(`exports.render = () => (${workspace.getText(source)});`, {}, {
      Section: "Section", ActionCard: "ActionCard", ...icons, permissionsReady, isPropertyOwner, openEnquiryCount: 0, router: {}, open() {},
    });
    assert.equal(nodes(render(), "ActionCard").some((node) => node.props.title === "Bookings"), false);
  }
});

test("Facilities heading centers its own 80-percent slot in the modal", () => {
  const title = find((node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "ModalTitle" && node.children.some((child) => ts.isJsxText(child) && child.text === "Facilities"));
  const { render } = load(`exports.render = () => (${title.getText(source)});`, {}, { ModalTitle: "ModalTitle", type: { display: {} }, colors: { ink: "black" } });
  // Centred by a wrapper that keeps it from shrinking (2026-11-07: it was cut in half).
  assert.equal(render().props.style[1].textAlign, "center");
  assert.match(read("app/owner-property.tsx"), /<View style=\{\{ alignItems: "center", flexShrink: 0 \}\}>\s*<ModalTitle/);
});

test("View facilities uses the new services vector and still opens the sheet", () => {
  const trigger = find((node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "AnimatedPressable" && attr(node.openingElement, "accessibilityLabel")?.text === "View facilities");
  let opened = false;
  const { render } = load(`exports.render = () => (${trigger.getText(source)});`, {}, {
    AnimatedPressable: "AnimatedPressable", Card: "Card", View: "View", Text: "Text", FacilitiesIcon: "FacilitiesIcon", ChevronRight: "ChevronRight",
    colors: {}, spacing: { md: 12 }, type: { display: {} }, setFacilitiesOpen: (value) => { opened = value; },
  });
  const tree = render();
  assert.equal(nodes(tree, "FacilitiesIcon")[0].props.size, 36);
  tree.props.onPress(); assert.equal(opened, true);
});

const { themes } = load(read("src/theme/colors.ts"));
const theme = { colors: themes.light, fonts: { sansSemiBold: "semibold" } };
const { FacilityOverviewGrid } = load(read("src/features/property/facility-overview-grid.tsx"), {
  react: { useState: () => [false, () => {}], useMemo: (fn) => fn() },
  "react-native": { Pressable: "Pressable", Text: "Text", View: "View" },
  "expo-blur": { BlurView: "BlurView" }, "@expo/vector-icons/MaterialCommunityIcons": { __esModule: true, default: "MaterialIcon" },
  "lucide-react-native": { AirVent: "AirVent" },
  "@/features/owner/owner-ui": { humanizeToken: (value) => value.toLowerCase().replaceAll("_", " ") },
  "@/theme/shadows": { useSoftShadow: () => () => ({}), cardShadow: () => ({}) }, "@/theme/spacing": { spacing: { sm: 8, md: 12 } },
  "@/theme/use-theme": { useTheme: () => theme }, "@/components/fit-text": { FitText: "FitText" }, "@/components/wrap-title": { WrapTitle: "WrapTitle" },
});

test("modal facility labels fit their text slot without changing the grid's inline layout", () => {
  for (const variant of ["cards", "grid"]) {
    const tree = FacilityOverviewGrid({ variant, facilities: ["COMMON_KITCHEN", "AIR_CONDITIONING", "A very long custom facility"], collapsible: false });
    const frame = tree.props.children[0];
    assert.equal(frame.props.style.borderWidth, variant === "cards" ? 0 : 1);
    assert.equal(frame.props.style.backgroundColor, undefined);
    const cells = nodes(tree, "View").flatMap((row) => (Array.isArray(row.props.children) ? row.props.children : []).flat()).filter((node) => typeof node?.type === "function" && node.type.name === "FacilityOverviewCell");
    assert.equal(cells.length, 3);
    for (const entry of cells) {
      const cell = entry.type(entry.props);
      assert.equal(cell.props.style.flexDirection, "row");
      assert.equal(cell.props.style.paddingHorizontal, variant === "cards" ? 8 : 12);
      const icon = cell.props.children[0];
      assert.equal(icon.props.size, variant === "cards" ? 30 : 25);
      assert.equal(icon.props.style.flexShrink, 0);
      // The whole name, wrapping at full size (user, 2026-11-07), then "Available".
      const label = nodes(cell, "WrapTitle")[0];
      assert.equal(label.props.numberOfLines, undefined);
      assert.equal(label.props.style.width, "100%");
      assert.equal(nodes(cell, "FitText")[0].props.children, "Available");
    }
  }
});

test("native facility text uses real fit-to-width, and browser text refits on narrow and wide cards", async () => {
  const { FitText: NativeFitText } = load(read("src/components/fit-text.tsx"), { "react-native": { Text: "Text" } });
  const native = NativeFitText({ children: "Common kitchen", minimumFontScale: 0.7, style: { fontSize: 15 } });
  assert.equal(native.props.adjustsFontSizeToFit, true);
  assert.equal(native.props.numberOfLines, 1);
  assert.equal(native.props.minimumFontScale, 0.7);
  const flatten = (style) => Object.assign({}, ...[].concat(style));
  const sizing = load(read("src/components/modal-title-size.ts"));
  const node = { textContent: "Common kitchen", clientWidth: 100 };
  let fontSize, effect, resize, cleanup;
  const { FitText } = load(read("src/components/fit-text.web.tsx"), {
    react: { useRef: () => ({ current: node }), useLayoutEffect: (fn) => { effect = fn; }, useState: (initial) => {
      fontSize ??= initial; return [fontSize, (next) => { fontSize = typeof next === "function" ? next(fontSize) : next; }];
    } },
    "react-native": { Text: "Text", StyleSheet: { flatten } }, "./modal-title-size": sizing,
  }, {
    document: { createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 120 }) }) }), fonts: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} } },
    window: { getComputedStyle: () => ({ fontStyle: "normal", fontWeight: "600", fontFamily: "Inter", letterSpacing: "0", paddingLeft: "0", paddingRight: "0" }) },
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() {} },
  });
  const props = { children: node.textContent, numberOfLines: 1, minimumFontScale: 0.7, style: { fontSize: 15, width: "100%" } };
  FitText(props); cleanup = effect();
  assert.ok(flatten(FitText(props).props.style).fontSize < 15);
  node.clientWidth = 160; resize();
  assert.equal(flatten(FitText(props).props.style).fontSize, 15);
  cleanup(); await Promise.resolve();
});
