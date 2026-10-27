const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const element = (type, props, key) => ({ type, props, key });
const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
function descendants(tree) {
  if (Array.isArray(tree)) return tree.flatMap(descendants);
  return tree && typeof tree === "object" ? [tree, ...descendants(tree.props?.children)] : [];
}
function load(source, dependencies = {}, globals = {}) {
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
const layout = load(read("src/components/header-scroll-layout.ts"));
const spacing = { sm: 10, lg: 18, xl: 24, xxl: 32 };
const defaultInsets = { top: 44, bottom: 34, left: 0, right: 0 };
function ScreenHeader() {}
const header = element(ScreenHeader, { title: "Screen", subtitle: "Description" }, "header");

function harness({ os = "android", insets = defaultInsets, segments = ["owner-action-center"] } = {}) {
  const state = [], refs = [], effects = [], keyboard = {}, scrolledTo = [];
  let stateIndex = 0, refIndex = 0, currentInsets = insets;
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
  }
  const { ScreenScrollView } = load(read("src/components/screen-scroll-view.tsx"), {
    react: {
      Children: { toArray: (children) => [children].flat(Infinity).filter((child) => child != null && typeof child !== "boolean") },
      Fragment: "Fragment", isValidElement: (child) => Boolean(child && typeof child === "object" && "type" in child),
      cloneElement: (child, props) => ({ ...child, key: props.key ?? child.key, props: { ...child.props, ...props } }),
      useState: (initial) => {
        const i = stateIndex++;
        if (!(i in state)) state[i] = initial;
        return [state[i], (next) => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
      },
      useRef: (initial) => { const i = refIndex++; return refs[i] ??= { current: initial }; },
      useEffect: (callback) => effects.push(callback),
    },
    "react-native": {
      Animated: { Value }, Dimensions: { get: () => ({ height: 800, width: 390 }) },
      Keyboard: { addListener: (name, callback) => { keyboard[name] = callback; return { remove() {} }; } },
      Platform: { OS: os }, RefreshControl: "RefreshControl", ScrollView: "ScrollView",
      StyleSheet: { flatten }, TextInput: { State: { currentlyFocusedInput: () => null } }, View: "View",
    },
    "react-native-safe-area-context": { useSafeAreaInsets: () => currentInsets },
    "expo-router": { useSegments: () => segments },
    "@/components/app-background": { AppBackground: "AppBackground" },
    "@/components/header-scroll-layout": layout,
    "@/components/screen-header": { ScreenHeader, ScreenHeaderScrollContext: { Provider: "HeaderContext" } },
    "@/store/api": { API_TAGS: [], api: { util: { invalidateTags() {} } } },
    "@/store/hooks": { useAppDispatch: () => () => {} },
    "@/store/slices/location-slice": { fetchCurrentLocation() {} },
    "@/theme/spacing": { spacing },
    "@/theme/use-theme": { useTheme: () => ({ colors: { background: "background", surface: "surface" } }) },
  }, { setTimeout: () => 1 });
  return {
    keyboard, scrolledTo,
    setInsets: (next) => { currentInsets = next; },
    flush: () => effects.splice(0).forEach((effect) => effect()),
    render(props = {}) {
      stateIndex = 0; refIndex = 0; effects.length = 0;
      const tree = ScreenScrollView({ children: [header, element("Skeleton", {})], ...props });
      const scroll = descendants(tree).find((node) => node.type === "ScrollView");
      scroll.props.ref.current = { scrollTo: (position) => scrolledTo.push(position) };
      const context = descendants(tree).find((node) => node.type === "HeaderContext");
      return { tree, scroll, context, contentStyle: flatten(scroll.props.contentContainerStyle) };
    },
  };
}

function assertSafeFrame(render, expected) {
  const { tree } = render;
  assert.equal(tree.type, "View");
  assert.equal(tree.props.style.paddingTop, expected.top);
  assert.equal(tree.props.style.paddingBottom, expected.bottom);
  assert.equal(tree.props.style.paddingLeft, expected.left);
  assert.equal(tree.props.style.paddingRight, expected.right);
  const clip = [tree.props.children].flat().find((child) => child?.type === "View");
  assert.equal(clip.props.style.flex, 1);
  assert.equal(clip.props.style.overflow, "hidden", "sticky content is clipped inside the reserved safe area");
  assert.ok(descendants(clip).includes(render.scroll));
  assert.ok(!descendants(tree).some((node) => node.type === "SafeAreaView"));
}

test("each native screen reserves the real status-bar inset on its first render, including repeated opens", () => {
  for (const os of ["android", "ios"]) {
    for (let open = 0; open < 3; open++) {
      const h = harness({ os });
      const page = h.render();
      assertSafeFrame(page, defaultInsets);
      assert.equal(page.context.props.value.sticky, true);
      assert.deepEqual(Array.from(page.scroll.props.stickyHeaderIndices), [0]);
      assert.equal(page.contentStyle.paddingTop, spacing.sm, "no duplicated inset inside scrolling content");
      assert.equal(page.scroll.props.contentInsetAdjustmentBehavior, "never");
    }
  }
});

test("skeleton-to-data, empty and error renders cannot move the header's safe frame", () => {
  const h = harness();
  let driver;
  for (const content of ["Skeleton", "Data", "EmptyState", "ErrorState", "Skeleton", "Data"]) {
    const page = h.render({ children: [header, element(content, {})] });
    assertSafeFrame(page, defaultInsets);
    driver ??= page.context.props.value.scrollY;
    assert.equal(page.context.props.value.scrollY, driver);
    page.scroll.props.onLayout({ nativeEvent: { layout: { height: 600 } } });
    page.scroll.props.onContentSizeChange(390, content === "Data" ? 1000 : 300);
  }
});

test("scrolling and the fit-to-content reset retain the same safe frame and shared header driver", () => {
  const h = harness();
  let observed;
  let page = h.render({ onScroll: (event) => { observed = event; } });
  const event = { nativeEvent: { contentOffset: { y: 120 } } };
  page.scroll.props.onScroll(event);
  assert.equal(page.context.props.value.scrollY.value, 120);
  assert.equal(observed, event, "the caller's pagination handler is preserved");
  assertSafeFrame(page, defaultInsets);
  page.scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
  page.scroll.props.onLayout({ nativeEvent: { layout: { height: 600 } } });
  const marker = descendants(page.scroll).find((node) => node.key === "screen/natural-bottom");
  marker.props.onLayout({ nativeEvent: { layout: { y: 200 } } });
  page = h.render(); h.flush();
  assert.equal(page.scroll.props.scrollEnabled, false);
  assert.equal(page.context.props.value.scrollY.value, 0);
  assertSafeFrame(page, defaultInsets);
});

test("per-screen edge choices and fullscreen/auth layouts retain their existing padding", () => {
  const insets = { top: 44, bottom: 34, left: 12, right: 16 };
  const h = harness({ insets });
  assertSafeFrame(h.render({ safeAreaEdges: [] }), { top: 0, bottom: 0, left: 0, right: 0 });
  assertSafeFrame(h.render({ safeAreaEdges: ["bottom"] }), { top: 0, bottom: 34, left: 0, right: 0 });
  assertSafeFrame(h.render({ safeAreaEdges: ["top", "left", "right"] }), { top: 44, bottom: 0, left: 12, right: 16 });
  const surface = h.render({ surface: "chat-background" });
  assert.equal(surface.tree.props.style.backgroundColor, "chat-background");
  assert.equal(surface.context.props.value.surface, "chat-background");
});

test("web defaults stay edge-to-edge, while explicit web safe-area edges still work", () => {
  const h = harness({ os: "web" });
  assertSafeFrame(h.render(), { top: 0, bottom: 0, left: 0, right: 0 });
  assertSafeFrame(h.render({ safeAreaEdges: ["top", "bottom"] }), defaultInsets);
});

test("rotation updates the reserved frame without caching the previous orientation's inset", () => {
  const h = harness();
  assertSafeFrame(h.render({ safeAreaEdges: ["top", "bottom", "left", "right"] }), defaultInsets);
  const landscape = { top: 0, bottom: 21, left: 59, right: 59 };
  h.setInsets(landscape);
  assertSafeFrame(h.render({ safeAreaEdges: ["top", "bottom", "left", "right"] }), landscape);
});

test("keyboard clearance still subtracts the bottom safe area once, and tab-bar clearance is retained", () => {
  const h = harness({ segments: ["(tabs)", "discovery"] });
  let page = h.render(); h.flush();
  assert.equal(page.contentStyle.paddingBottom, 96);
  h.keyboard.keyboardDidShow({ endCoordinates: { height: 300 } });
  page = h.render();
  assert.equal(page.contentStyle.paddingBottom, 96 + 300 - defaultInsets.bottom);
  assertSafeFrame(page, defaultInsets);
  h.keyboard.keyboardDidHide();
  assert.equal(h.render().contentStyle.paddingBottom, 96);
});

test("the app's stable root provider seeds native window metrics before navigation renders", () => {
  const file = "app/_layout.tsx", source = read(file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rootLayout = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "RootLayout");
  const metrics = { insets: defaultInsets, frame: { x: 0, y: 0, width: 390, height: 844 } };
  const { render } = load(`${rootLayout.getText(sf)}\nexports.render = RootLayout;`, {}, {
    Provider: "ReduxProvider", store: {}, GestureHandlerRootView: "GestureHandlerRootView", SafeAreaProvider: "SafeAreaProvider",
    ToastProvider: "ToastProvider", ThemedRootStack: "ThemedRootStack", initialWindowMetrics: metrics,
  });
  const provider = descendants(render()).find((node) => node.type === "SafeAreaProvider");
  assert.equal(provider.props.initialMetrics, metrics);
  assert.equal(descendants(provider).filter((node) => node.type === "ThemedRootStack").length, 1);
});
