const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const jsx = (type, props) => { assert.ok(type, "Missing rendered component"); return { type, props }; };
function load(source, dependencies = {}, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(outputText, { ...globals, exports, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Missing dependency ${name}`); return dependencies[name];
  } });
  return exports;
}
function component(file, name, globals) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const definition = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(definition, `Missing ${name}`);
  return load(`${definition.getText(source)}\nexports.Component = ${name};`, {}, globals).Component;
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
const { themes } = load(read("src/theme/colors.ts"));
const { spacing, radii } = load(read("src/theme/spacing.ts"));
const theme = { colors: themes.light, fonts: { sansBold: "bold", sansMedium: "medium", display: "display" }, type: { caption: {} }, isDark: false };
function hooks() {
  let cursor = 0;
  const values = [], effects = [], writes = [];
  const react = {
    useState: (initial) => { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], (next) => { writes.push(next); values[index] = next; }]; },
    useEffect: (fn) => effects.push(fn),
  };
  return { react, values, writes, render: (fn, props) => { cursor = 0; effects.length = 0; return fn(props); }, effects: () => effects.splice(0).map((fn) => fn()) };
}
function tabHarness() {
  const h = hooks(); const transitions = [];
  class Value {
    constructor(value) { this.value = value; this.stops = 0; }
    interpolate(spec) { return { value: this, ...spec }; }
    stopAnimation() { this.stops++; }
    setValue(value) { this.value = value; }
  }
  const native = { Animated: { Value, View: "AnimatedView", timing: (value, spec) => {
    const transition = { value, spec, start() { this.started = true; }, stop() { this.stopped = true; } };
    transitions.push(transition); return transition;
  } }, Easing: { cubic: "cubic", out: (curve) => curve }, Pressable: "Pressable", Text: "Text", View: "View" };
  const { BottomNavigationTab } = load(read("src/components/bottom-navigation-tab.tsx"), {
    react: h.react, "react-native": native, "@/theme/use-theme": { useTheme: () => theme },
  });
  return { ...h, transitions, Component: BottomNavigationTab };
}
const tabProps = { focused: true, disabled: false, label: "MANAGE", reduceMotion: false, onPress() {}, renderIcon: ({ focused, color }) => jsx(focused ? "SolidIcon" : "OutlineIcon", { color }) };

test("bottom tab selection cross-fades icons and labels without changing button geometry", () => {
  const h = tabHarness(); const tree = h.render(h.Component, tabProps);
  assert.equal(tree.props.accessibilityLabel, "MANAGE");
  assert.equal(tree.props.accessibilityState.selected, true);
  const style = tree.props.style({ pressed: false });
  assert.equal(style.flex, 1); assert.equal(style.height, "100%");
  assert.equal(nodes(tree, "OutlineIcon")[0].props.color, themes.light.kicker);
  assert.equal(nodes(tree, "SolidIcon")[0].props.color, themes.light.ink);
  assert.equal(nodes(tree, "Text").length, 2);
  assert.equal(h.values[0].value, 1, "The first paint must already match the active route");
  h.effects();
  assert.equal(h.transitions[0].spec.useNativeDriver, true);
  assert.equal(h.transitions[0].spec.duration, 180);
  assert.equal(tree.props.style({ pressed: true }).opacity, 0.75);
});

test("rapid tab changes stop the old transition and reuse the current animated value", () => {
  const h = tabHarness(); h.render(h.Component, tabProps); const cleanup = h.effects()[0];
  const value = h.values[0]; cleanup();
  h.render(h.Component, { ...tabProps, focused: false }); const cleanup2 = h.effects()[0]; cleanup2();
  h.render(h.Component, tabProps); h.effects();
  assert.equal(h.values[0], value);
  assert.deepEqual(h.transitions.map((step) => step.spec.toValue), [1, 0, 1]);
  assert.equal(h.transitions[0].stopped, true); assert.equal(h.transitions[1].stopped, true);
});

test("reduced motion selects immediately and disabled tabs retain their disabled state", () => {
  const h = tabHarness(); const tree = h.render(h.Component, { ...tabProps, focused: false, disabled: true, reduceMotion: true });
  h.effects();
  assert.equal(h.transitions.length, 0); assert.equal(h.values[0].value, 0);
  assert.equal(tree.props.disabled, true); assert.equal(tree.props.accessibilityState.disabled, true);
  assert.equal(tree.props.style({ pressed: false }).opacity, 0.35);
});

function barHarness({ prevented = false } = {}) {
  const h = hooks(); const calls = [], subscriptions = [];
  const Component = component("app/(tabs)/_layout.tsx", "BottomTabBar", {
    ...h.react, useTheme: () => theme, useSafeAreaInsets: () => ({ bottom: 20 }), View: "View", BottomNavigationTab: "BottomNavigationTab",
    AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(true), addEventListener: (event, listener) => {
      const subscription = { event, listener, removed: false, remove() { this.removed = true; } }; subscriptions.push(subscription); return subscription;
    } }, selectHaptic: () => calls.push("haptic"),
  });
  const props = { state: { index: 0, routes: [{ key: "home", name: "index" }, { key: "manage", name: "owner" }, { key: "hidden", name: "notifications" }] },
    descriptors: { home: { options: { title: "Home" } }, manage: { options: { tabBarLabel: "MANAGE" } }, hidden: { options: { tabBarButton() {} } } },
    navigation: { emit: (event) => { calls.push(event); return { defaultPrevented: prevented }; }, navigate: (name) => calls.push(name) },
  };
  return { ...h, Component, props, calls, subscriptions };
}

test("animated bottom tabs preserve hidden routes, prevention, haptics and property access gates", () => {
  const h = barHarness(); const tree = h.render(h.Component, h.props);
  const tabs = nodes(tree, "BottomNavigationTab"); assert.equal(tabs.length, 2);
  tabs[1].props.onPress(); assert.equal(h.calls.at(-1), "owner"); assert.equal(h.calls[1], "haptic");
  assert.equal(tree.props.style.paddingBottom, 20);
  const blocked = barHarness(); const disabled = nodes(blocked.render(blocked.Component, { ...blocked.props, blockedRoutes: ["owner"] }), "BottomNavigationTab")[1];
  assert.equal(disabled.props.disabled, true); disabled.props.onPress(); assert.equal(blocked.calls.length, 0);
  const prevented = barHarness({ prevented: true }); nodes(prevented.render(prevented.Component, prevented.props), "BottomNavigationTab")[1].props.onPress();
  assert.equal(prevented.calls.length, 1);
  nodes(h.render(h.Component, h.props), "BottomNavigationTab")[0].props.onPress();
  assert.equal(h.calls.filter((call) => call === "owner").length, 1);
});

test("reduced-motion preference checks cannot update an unmounted tab bar", async () => {
  const h = barHarness(); h.render(h.Component, h.props); const cleanup = h.effects()[0]; cleanup();
  await Promise.resolve(); await Promise.resolve();
  h.subscriptions[0].listener(false);
  assert.equal(h.writes.length, 0); assert.equal(h.subscriptions[0].removed, true);
});

const picker = component("app/(tabs)/index.tsx", "OwnerPropertyPicker", {
  useTheme: () => theme, spacing, radii, tabShadow: () => ({}), PROPERTY_CARD_ART: "property-art",
  AnimatedPressable: "AnimatedPressable", FitText: "Text", Text: "Text", View: "View", Image: "Image", PropertyArtwork: "PropertyArtwork", Ionicons: "Ionicons", ChevronUp: "ChevronUp", ChevronDown: "ChevronDown",
});
const property = { id: "p1", name: "Sample property", address: "A very long street and building address that should stay clear of the disclosure button", city: "Kolkata", state: "West Bengal", pincode: "700091" };
const pickerProps = { properties: [property, { ...property, id: "p2" }], selectedProperty: property, workspaceRole: "Owner", renderOptions: false, open: false, onToggle() {}, onSelect() {} };

test("Home property selector reserves a glassy right-side chevron slot with constrained address text", () => {
  const tree = picker(pickerProps);
  const card = nodes(tree, "AnimatedPressable")[0]; const address = nodes(card, "Text").find((node) => String(node.props.children).includes(property.address));
  assert.equal(address.props.numberOfLines, 2); assert.equal(address.props.ellipsizeMode, "tail");
  assert.equal(address.props.style[1].maxWidth, "100%");
  const column = nodes(card, "View").find((node) => node.props.children?.includes?.(address));
  assert.equal(column.props.style.flex, 1); assert.equal(column.props.style.minWidth, 0);
  const circle = nodes(card, "View").find((node) => node.props.style?.width === 36 && node.props.style?.height === 36);
  assert.equal(circle.props.style.alignSelf, "center"); assert.equal(circle.props.style.flexShrink, 0);
  assert.equal(circle.props.style.backgroundColor, "rgba(255, 255, 255, 0.5)");
  assert.equal(nodes(circle, "ChevronDown").length, 1);
  assert.equal(card.props.accessibilityState.expanded, false);
  const opened = picker({ ...pickerProps, open: true });
  assert.equal(nodes(opened, "ChevronUp").length, 1); assert.equal(nodes(opened, "AnimatedPressable")[0].props.accessibilityState.expanded, true);
});

test("Home keeps its property-toggle action and avoids a misleading dropdown for a single property", () => {
  let toggled = 0;
  const tree = picker({ ...pickerProps, onToggle: () => toggled++ }); nodes(tree, "AnimatedPressable")[0].props.onPress(); assert.equal(toggled, 1);
  const single = picker({ ...pickerProps, properties: [property] });
  assert.equal(nodes(single, "ChevronDown").length, 0); assert.equal(nodes(single, "ChevronUp").length, 0);
  assert.equal(nodes(single, "AnimatedPressable")[0].props.disabled, true);
});

test("Manage removes only the property summary, retaining four metric cards, loading and empty states", () => {
  const source = read("app/(tabs)/owner.tsx");
  assert.doesNotMatch(source, /PROPERTY_CARD_ART|PropertyArtwork|OwnerManagePropertySkeleton|selectedProperty\.name/);
  assert.equal((source.match(/<MetricTile /g) ?? []).length, 4);
  assert.match(source, /propertiesQuery\.isFetching && properties\.length === 0[\s\S]*?<OwnerManageMetricsSkeleton/);
  assert.match(source, /selectedProperty && tilesLoading \? <OwnerManageMetricsSkeleton/);
  assert.match(source, /Select a property from Home/); assert.match(source, /Create a property first/);
});
