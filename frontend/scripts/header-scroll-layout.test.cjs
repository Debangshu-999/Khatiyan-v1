const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

const source = fs.readFileSync(path.join(__dirname, "../src/components/header-scroll-layout.ts"), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exported = {};
vm.runInNewContext(outputText, { exports: exported });
const { SCREEN_HEADER_COLLAPSE_DISTANCE, getHeaderScrollMinHeight } = exported;

test("short pages retain the full transition range as their header shrinks", () => {
  const viewport = 800;
  const minimum = getHeaderScrollMinHeight(viewport);
  for (const expandedOverflow of [0, 1, 24, 60, 72, 100]) {
    for (const headerShrink of [0, 20, 40, 80, 120]) {
      const contentHeight = Math.max(minimum, viewport + expandedOverflow - headerShrink);
      assert.ok(contentHeight - viewport >= SCREEN_HEADER_COLLAPSE_DISTANCE);
    }
  }
});

test("long content and larger caller minimum heights are preserved", () => {
  const viewport = 600;
  assert.equal(Math.max(1600, getHeaderScrollMinHeight(viewport)), 1600);
  assert.equal(getHeaderScrollMinHeight(viewport, 1000), 1000);
});

test("minimum range follows viewport changes and waits for measurement", () => {
  assert.equal(getHeaderScrollMinHeight(0), undefined);
  for (const viewport of [320, 600, 900]) {
    assert.equal(getHeaderScrollMinHeight(viewport) - viewport, SCREEN_HEADER_COLLAPSE_DISTANCE);
  }
});

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
function discoveryHeaderProps() {
  const file = "app/(tabs)/discovery.tsx";
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let scroll;
  function find(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === "ScreenScrollView") scroll = node;
    ts.forEachChild(node, find);
  }
  find(sf);
  assert.ok(scroll, "Discovery uses the shared scroll container");
  const header = scroll.children.find((child) => ts.isJsxSelfClosingElement(child) || ts.isJsxElement(child));
  assert.equal(header.tagName?.getText(sf) ?? header.openingElement.tagName.getText(sf), "ScreenHeader",
    "native sticky headers must receive ScreenHeader directly, not a wrapper which drops the injected style");
  const exports = {};
  const { outputText } = ts.transpileModule(`exports.header = ${header.getText(sf)};`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  });
  vm.runInNewContext(outputText, {
    exports, ScreenHeader: "ScreenHeader", spacing: { xs: 6 },
    require: () => ({ jsx: (type, props) => ({ type, props }) }),
  });
  return exports.header.props;
}

test("Discovery hands the sticky container its real header with the same unmodified spacing as Billing and Tenancy", () => {
  const props = discoveryHeaderProps();
  assert.equal(props.title, "Discover");
  assert.equal(props.italicTail, "places.");
  assert.equal(props.subtitle, "Properties and local services around your selected location.");
  assert.equal(props.style, undefined);
  assert.ok(!read("app/(tabs)/discovery.tsx").includes("function DiscoveryHeader("));
});

test("Discovery copies Billing and Tenancy's scroll surface and frame cadence without an extra inner wrapper", () => {
  for (const file of ["app/(tabs)/discovery.tsx", "app/owner-billing.tsx", "app/owner-tenancy.tsx"]) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let scroll;
    function find(node) {
      if (!scroll && ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === "ScreenScrollView") scroll = node;
      ts.forEachChild(node, find);
    }
    find(sf);
    const attributes = scroll.openingElement.attributes.properties;
    const prop = (name) => attributes.find((attr) => attr.name?.getText(sf) === name)?.initializer?.expression?.getText(sf);
    assert.equal(prop("surface"), "colors.surface", file);
    assert.equal(prop("scrollEventThrottle"), "16", file);
    assert.equal(prop("safeAreaEdges"), '["top", "bottom"]', file);
    const header = scroll.children.find((child) => ts.isJsxSelfClosingElement(child));
    assert.equal(header.tagName.getText(sf), "ScreenHeader", file);
    assert.ok(!header.attributes.properties.some((attr) => attr.name?.getText(sf) === "style"), file);
  }
  const discovery = read("app/(tabs)/discovery.tsx");
  assert.ok(!discovery.includes('<View style={{ flex: 1 }}>\n    <View style={{ flex: 1 }}>'));
});

// A small Animated evaluator: values are read live, including chained
// interpolations. This verifies the native layout path without a web/CSS shim.
class AnimatedNode {
  constructor(readValue) { this.readValue = readValue; }
  getValue() { return this.readValue(); }
  interpolate({ inputRange, outputRange }) {
    return new AnimatedNode(() => {
      const value = Math.max(inputRange[0], Math.min(inputRange.at(-1), this.getValue()));
      const i = Math.min(inputRange.length - 2, inputRange.findIndex((next, index) => index > 0 && value <= next) - 1);
      const segment = Math.max(0, i);
      const progress = (value - inputRange[segment]) / (inputRange[segment + 1] - inputRange[segment]);
      return outputRange[segment] + progress * (outputRange[segment + 1] - outputRange[segment]);
    });
  }
}
class AnimatedValue extends AnimatedNode {
  constructor(value) { super(() => this.value); this.value = value; }
  setValue(value) { this.value = value; }
}
function descendants(tree) {
  if (Array.isArray(tree)) return tree.flatMap(descendants);
  return tree && typeof tree === "object" ? [tree, ...descendants(tree.props?.children)] : [];
}
function nativeHeaderHarness() {
  const exports = {}, scrollY = new AnimatedValue(0), refs = [];
  let cursor = 0;
  const element = (type, props) => ({ type, props });
  const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const { outputText } = ts.transpileModule(read("src/components/screen-header.tsx"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  });
  const dependencies = {
    react: {
      createContext: () => ({}), useContext: () => ({ scrollY, sticky: true, surface: "white" }),
      useMemo: (fn) => fn(), useRef: (value) => { const i = cursor++; refs[i] ??= { current: value }; return refs[i]; },
    },
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    "react-native": {
      Animated: { Value: AnimatedValue, Text: "AnimatedText", View: "AnimatedView", multiply: (a, b) => new AnimatedNode(() => a.getValue() * b.getValue()) },
      View: "View", Text: "Text", StyleSheet: { flatten },
    },
    "@/components/header-note": { HeaderNote: "HeaderNote" },
    "@/components/header-scroll-layout": { SCREEN_HEADER_COLLAPSE_DISTANCE },
    "@/theme/spacing": { spacing: { xs: 6, sm: 10, md: 14, lg: 18 } },
    "@/theme/use-theme": { useTheme: () => ({ colors: { background: "white" }, type: {} }) },
  };
  vm.runInNewContext(outputText, { exports, require: (name) => {
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return { scrollY, flatten, render(props) { cursor = 0; return exports.ScreenHeader(props); } };
}

test("native sticky style transfer reaches Discovery and preserves immediate collapse/re-expansion", () => {
  const h = nativeHeaderHarness();
  const original = discoveryHeaderProps();
  // React Native ScrollViewStickyHeader moves the child's original style to
  // its wrapper, then clones the child with {style: {flex: 1}}. Discovery's old
  // wrapper ignored this prop, unlike every direct ScreenHeader consumer.
  const tree = h.render({ ...original, style: { flex: 1 } });
  assert.equal(h.flatten(tree.props.style).flex, 1);
  assert.equal(h.flatten(tree.props.style).marginBottom, undefined);
  const title = descendants(tree).find((node) => node.type === "AnimatedText");
  const viewport = descendants(tree).find((node) => node.type === "AnimatedView" && node.props.style?.overflow === "hidden");
  const measure = viewport.props.children.props.onLayout;
  measure({ nativeEvent: { layout: { height: 40 } } });
  const size = h.flatten(title.props.style).fontSize;
  for (const offset of [72, 200, 36, 0, -12, 100, 0]) {
    h.scrollY.setValue(offset);
    const progress = Math.max(0, Math.min(1, offset / SCREEN_HEADER_COLLAPSE_DISTANCE));
    assert.equal(size.getValue(), 30 - 7 * progress);
    assert.equal(viewport.props.style.height.getValue(), 40 * (1 - progress));
    if (offset <= 0) assert.equal(viewport.props.style.opacity.getValue(), 1);
    if (offset >= 72) assert.equal(viewport.props.style.opacity.getValue(), 0);
  }
  // A rerender must not recreate the scroll driver or leave the description
  // collapsed after a quick return; no timeout or timed animation is used.
  const next = h.render({ ...original, style: { flex: 1 } });
  const restored = descendants(next).find((node) => node.type === "AnimatedView" && node.props.style?.overflow === "hidden");
  assert.equal(restored.props.style.height.getValue(), 40);
  assert.equal(restored.props.style.opacity.getValue(), 1);
});
