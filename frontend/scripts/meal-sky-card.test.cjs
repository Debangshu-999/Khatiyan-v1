const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
const labels = { BREAKFAST: "Breakfast", LUNCH: "Lunch", EVENING_SNACKS: "Evening snacks", DINNER: "Dinner" };
const meal = { mealType: "DINNER", startTime: "20:30", endTime: "22:30" };
const theme = { colors: { shadow: "shadow", ink: "ink", border: "border", accent: "accent", surface: "surface", danger: "danger" }, fonts: { display: "Display", sansMedium: "Medium", sansBold: "Bold" }, type: {} };
function loadFunctions(file, names, bindings = {}) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const definitions = names.map((name) => source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source));
  const code = ts.transpileModule(`${definitions.join("\n")}\n${names.map((name) => `exports.${name} = ${name};`).join("\n")}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    View: "View", Text: "Text", FitText: "FitText", LinearGradient: "Gradient", MealGlyph: "MealGlyph",
    Svg: "Svg", Circle: "Circle", Path: "Path", AnimatedPressable: "Button", QrCode: "QrCode", ChevronRight: "Chevron",
    StyleSheet: { absoluteFill: { position: "absolute", inset: 0 } },
    useTheme: () => theme, softShadow: () => ({}), radii: { card: 10, md: 10 },
    spacing: { xs: 6, sm: 10, md: 14, lg: 18 }, MEAL_LABEL: labels,
    formatMealWindow: (start, end) => `${start} - ${end}`,
    require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx, Fragment: "Fragment" }; },
    ...bindings,
  });
  return exports;
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return tree && typeof tree === "object" ? [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)] : [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" ? text(tree.props?.children) : typeof tree === "string" ? tree : "";
}
const sky = loadFunctions("src/features/food/serving-meal-card.tsx", ["ServingMealCard", "MealSkyBackdrop", "MealSkyBackground", "MealGlassPanel"]);
for (const [mealType, label] of Object.entries(labels)) {
  test(`${label} uses the shared sky, its own icon and inline serving title`, () => {
    const card = sky.ServingMealCard({ meal: { ...meal, mealType }, children: "Action" });
    assert.equal(nodes(card, "Text").length, 1); // No separate Serving now chip.
    assert.equal(text(nodes(card, "Text")[0]), `${label}, serving now`);
    assert.equal(nodes(card, "Text")[0].props.numberOfLines, undefined); // Long meal names can wrap on a phone.
    assert.equal(nodes(card, "MealGlyph")[0].props.meal, mealType);
    assert.equal(text(nodes(card, "FitText")[0]), "20:30 - 22:30");
    const gradient = nodes(card, "Gradient")[0];
    assert.deepEqual(Array.from(gradient.props.colors), ["#101B3E", "#24366A", "#4A4278"]);
    assert.equal(gradient.props.children.at(-1), "Action");
    assert.equal(gradient.props.style.overflow, "hidden");
  });
}

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test("sky text and scan button have readable contrast", () => {
  for (const background of ["#101B3E", "#24366A", "#4A4278"]) {
    for (const foreground of ["#FFFFFF", "#D9E2FF", "#FFE4AA", "#FFBEC8"]) assert.ok(contrast(foreground, background) >= 4.5);
  }
});
test("vector stars stay decorative and never intercept a scan button", () => {
  const backdrop = sky.MealSkyBackdrop();
  assert.equal(backdrop.props.pointerEvents, "none");
  assert.equal(backdrop.props.accessible, false);
  assert.equal(backdrop.props.accessibilityElementsHidden, true);
  assert.equal(backdrop.props.importantForAccessibility, "no-hide-descendants");
  assert.ok(nodes(backdrop, "Circle").length >= 12);
});

let openMeal = meal;
const navigated = [];
const queries = [];
const home = loadFunctions("src/features/food/meal-attendance-ui.tsx", ["MealScanHomeCard"], {
  ServingMealCard: "ServingMealCard",
  useRouter: () => ({ push: (route) => navigated.push(route) }),
  useGetMealAttendanceLiveQuery: (...args) => { queries.push(args); return { data: { openMeal } }; },
});
test("Home only shows a live meal and still opens the scanner with no attendance count", () => {
  openMeal = null;
  assert.equal(home.MealScanHomeCard({ propertyId: "p" }), null);
  openMeal = meal;
  const card = home.MealScanHomeCard({ propertyId: "p" });
  assert.equal(card.type, "ServingMealCard");
  assert.equal(card.props.meal, meal);
  const button = nodes(card, "Button")[0];
  assert.equal(button.props.accessibilityLabel, "Scan meal passes");
  assert.ok(button.props.style.minHeight >= 44);
  button.props.onPress();
  assert.deepEqual(navigated, ["/owner-meal-scan"]);
  assert.equal(queries.at(-1)[1].pollingInterval, 30000);
  assert.equal(queries.at(-1)[1].skip, false);
  home.MealScanHomeCard({ propertyId: "" });
  assert.equal(queries.at(-1)[1].skip, true);
});

function scannerHarness(options = {}) {
  let permission = options.permission ?? { granted: true, canAskAgain: true };
  let loading = false;
  let permissionRequests = 0;
  let onBlur = () => {};
  let stateIndex = 0;
  let refIndex = 0;
  const states = [];
  const refs = [];
  const requests = [];
  let resolveScan;
  let rejectScan;
  const screen = loadFunctions("app/owner-meal-scan.tsx", ["OwnerMealScanScreen", "ScanGuide"], {
    ServingMealCard: "ServingMealCard", ScreenHeader: "ScreenHeader", ScreenScrollView: "ScrollView",
    SkeletonCard: "Skeleton", EmptyState: "Empty", FormInput: "Input", CameraView: "CameraView", Camera: "CameraIcon", X: "CloseIcon",
    MealGlassPanel: "GlassPanel", MealSkyBackground: "SkyBackground", StatusBar: "StatusBar", ActivityIndicator: "Spinner", ClipboardCheck: "AttendanceIcon",
    LastScan: "LastScan", AlertModal: "Alert", CODE_LENGTH: 6, SAME_PASS_MS: 4000,
    useRef: (value) => { const index = refIndex++; return refs[index] ??= { current: value }; },
    useState: (initial) => { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], (value) => { states[index] = value; }]; },
    useCallback: (callback) => callback, useFocusEffect: (callback) => { onBlur = callback(); },
    useRouter: () => ({ push: (route) => { scannerRoutes.push(route); } }),
    useRouteGate: () => ({ dialog: null, gate: (route, open) => { gatedRoutes.push(route); if (options.allowAttendance !== false) open(); } }),
    useAppSelector: () => "p", loadFailure: () => null, foodIcon: () => "FoodIcon",
    errorMessage: (error) => error.message,
    useGetMealAttendanceLiveQuery: () => ({ data: { openMeal }, isLoading: loading }),
    useCameraPermissions: () => [permission, async () => { permissionRequests++; permission = { granted: true, canAskAgain: true }; return permission; }],
    useScanMealPassMutation: () => [(payload) => { requests.push(payload); return { unwrap: () => new Promise((resolve, reject) => { resolveScan = resolve; rejectScan = reject; }) }; }, { isLoading: false }],
  });
  const render = () => { stateIndex = 0; refIndex = 0; return screen.OwnerMealScanScreen(); };
  const scannerRoutes = [];
  const gatedRoutes = [];
  return { render, requests, scannerRoutes, gatedRoutes, guide: screen.ScanGuide, allow: () => { permission = { granted: false, canAskAgain: false }; }, permissionRequests: () => permissionRequests,
    setLoading: (value) => { loading = value; }, blur: () => onBlur(), resolve: (value) => resolveScan(value), reject: (error) => rejectScan(error) };
}
test("scanner has a full-screen sky, distinct glass cards and no submit footer", () => {
  openMeal = meal;
  const scanner = scannerHarness();
  const tree = scanner.render();
  const card = nodes(tree, "ServingMealCard")[0];
  assert.equal(card.props.meal, meal);
  assert.equal(card.props.glass, true);
  assert.equal(card.props.children, undefined);
  assert.equal(nodes(tree, "GlassPanel").length, 3); // Open camera, code entry, attendance link.
  assert.equal(nodes(tree, "ScrollView")[0].props.surface, "#101B3E");
  assert.equal(nodes(tree, "ScrollView")[0].props.background.type, "SkyBackground");
  assert.equal(nodes(tree, "ScreenHeader")[0].props.onDark, true);
  assert.equal(nodes(tree, "StatusBar")[0].props.style, "light");
  assert.equal(nodes(tree, "CameraView").length, 0); // Permission alone never starts a camera.
  nodes(tree, "Button")[0].props.onPress();
  const camera = nodes(scanner.render(), "CameraView")[0];
  assert.equal(camera.props.facing, "back");
  assert.deepEqual(Array.from(camera.props.barcodeScannerSettings.barcodeTypes), ["qr"]);
  assert.equal(typeof camera.props.onBarcodeScanned, "function");
  assert.doesNotMatch(read("app/owner-meal-scan.tsx"), /PinnedFooter|Record attendance/);
});
test("camera opens only on a tap and can be closed, with leaving the screen resetting it", () => {
  const scanner = scannerHarness();
  nodes(scanner.render(), "Button")[0].props.onPress();
  assert.equal(nodes(scanner.render(), "CameraView").length, 1);
  const close = nodes(scanner.render(), "Button").find((button) => button.props.accessibilityLabel === "Close camera");
  close.props.onPress();
  assert.equal(nodes(scanner.render(), "CameraView").length, 0);
  nodes(scanner.render(), "Button")[0].props.onPress();
  scanner.blur();
  assert.equal(nodes(scanner.render(), "CameraView").length, 0);
});
test("camera denial keeps code entry usable and requests permission only on a tap", () => {
  const scanner = scannerHarness({ permission: { granted: false, canAskAgain: true } });
  const tree = scanner.render();
  assert.equal(nodes(tree, "CameraView").length, 0);
  assert.equal(nodes(tree, "Input")[0].props.maxLength, 6);
  assert.equal(scanner.permissionRequests(), 0);
  nodes(tree, "Button")[0].props.onPress();
  assert.equal(scanner.permissionRequests(), 1);
  scanner.allow();
  const denied = scanner.render();
  assert.doesNotMatch(text(denied), /Open camera/);
  assert.equal(nodes(denied, "CameraView").length, 0);
  assert.match(text(denied), /Enter the code on their pass instead/);
});
test("no-meal and loading states never expose the scanner or record button", () => {
  openMeal = null;
  const scanner = scannerHarness();
  let tree = scanner.render();
  assert.equal(nodes(tree, "Empty").length, 1);
  assert.equal(nodes(tree, "CameraView").length, 0);
  scanner.setLoading(true);
  tree = scanner.render();
  assert.equal(nodes(tree, "Skeleton").length, 1);
  openMeal = meal;
});
test("QR guide is non-interactive with four distinct corners", () => {
  const guide = scannerHarness().guide();
  assert.equal(guide.props.pointerEvents, "none");
  assert.equal(guide.props.importantForAccessibility, "no-hide-descendants");
  const corners = nodes(guide, "View").filter((node) => node.props.style?.position === "absolute");
  assert.equal(corners.length, 4);
  assert.equal(corners.filter((node) => node.props.style.top === 0).length, 2);
  assert.equal(corners.filter((node) => node.props.style.left === 0).length, 2);
});

const flush = () => new Promise(setImmediate);
const result = { ...meal, tenantName: "Tenant", roomNumber: "101", profileName: "Standard", attendedAt: "2026-11-02T15:00:00Z", alreadyRecorded: false };
test("six digits auto-verify once, block overlapping reads, and put the result between code entry and attendance", async () => {
  const scanner = scannerHarness();
  let tree = scanner.render();
  nodes(tree, "Button")[0].props.onPress();
  tree = scanner.render();
  const input = nodes(tree, "Input")[0];
  input.props.onChangeText("12345");
  assert.equal(scanner.requests.length, 0);
  input.props.onChangeText("12x3456");
  assert.equal(scanner.requests.length, 1);
  assert.equal(scanner.requests[0].code, "123456");
  input.props.onChangeText("123456");
  nodes(tree, "CameraView")[0].props.onBarcodeScanned({ data: "overlap" });
  assert.equal(scanner.requests.length, 1);
  tree = scanner.render();
  assert.equal(nodes(tree, "Input")[0].props.disabled, true);
  assert.match(text(tree), /Verifying code/);
  scanner.resolve(result);
  await flush();
  tree = scanner.render();
  assert.equal(nodes(tree, "Input")[0].props.value, "");
  assert.equal(nodes(tree, "Input")[0].props.disabled, false);
  assert.equal(nodes(tree, "LastScan")[0].props.scan, result);
  const group = nodes(tree, "View").find((node) => Array.isArray(node.props.children) && node.props.children.some((child) => child?.type === "ServingMealCard"));
  assert.equal(group.props.children[0].type, "ServingMealCard");
  const detailsIndex = group.props.children.findIndex((child) => child?.type === "LastScan");
  assert.equal(group.props.children[detailsIndex - 1].type, "GlassPanel");
  assert.equal(nodes(group.props.children[detailsIndex - 1], "Input").length, 1);
  assert.equal(group.props.children[detailsIndex + 1].props.accessibilityLabel, "View meal attendance");
});
test("a bad manual code shows an inline error without looping, and an edited code can retry", async () => {
  const scanner = scannerHarness();
  const input = () => nodes(scanner.render(), "Input")[0];
  input().props.onChangeText("111111");
  scanner.reject(new Error("Invalid meal pass code"));
  await flush();
  assert.equal(input().props.error, "Invalid meal pass code");
  assert.equal(input().props.value, "111111");
  assert.equal(input().props.disabled, false);
  input().props.onChangeText("111111");
  assert.equal(scanner.requests.length, 1);
  assert.equal(input().props.error, "Invalid meal pass code");
  assert.equal(nodes(scanner.render(), "Alert").length, 0);
  input().props.onChangeText("222222");
  assert.equal(scanner.requests.length, 2);
  scanner.resolve(result);
  await flush();
  assert.equal(input().props.error, undefined);
});
test("QR errors still show a dismissible alert, then scanning continues", async () => {
  const scanner = scannerHarness();
  nodes(scanner.render(), "Button")[0].props.onPress();
  const readQr = () => nodes(scanner.render(), "CameraView")[0].props.onBarcodeScanned;
  readQr()({ data: "bad-qr" });
  scanner.reject(new Error("Invalid QR"));
  await flush();
  const alert = nodes(scanner.render(), "Alert")[0];
  assert.equal(alert.props.message, "Invalid QR");
  readQr()({ data: "new-qr" });
  assert.equal(scanner.requests.length, 1);
  alert.props.onClose();
  readQr()({ data: "new-qr" });
  assert.equal(scanner.requests.length, 2);
  scanner.resolve(result);
  await flush();
});
test("control panel matches the translucent meal card without another meal title", () => {
  const card = sky.ServingMealCard({ glass: true, meal });
  const panel = sky.MealGlassPanel({ children: "Input" });
  const glass = nodes(card, "Gradient")[0];
  assert.deepEqual(Array.from(glass.props.colors), Array.from(panel.props.colors));
  assert.equal(glass.props.style.borderColor, panel.props.style.borderColor);
  assert.equal(text(panel), "Input");
});
test("Open camera is a compact version of the same glass panel with a generous hit area", () => {
  const tree = scannerHarness().render();
  const button = nodes(tree, "Button").find((node) => text(node) === "Open camera");
  assert.equal(button.props.hitSlop, 8);
  const panel = nodes(button, "GlassPanel")[0];
  assert.equal(panel.props.compact, true);
  const compact = sky.MealGlassPanel({ compact: true, children: "Open camera" });
  const normal = sky.MealGlassPanel({ children: "Input" });
  assert.deepEqual(Array.from(compact.props.colors), Array.from(normal.props.colors));
  assert.equal(compact.props.style.minHeight, 36);
  assert.ok(compact.props.style.paddingVertical < normal.props.style.paddingVertical);
});
for (const alreadyRecorded of [false, true]) {
  test(`scan details use a glass card and labelled room, meal and recorded time (${alreadyRecorded ? "duplicate" : "new"})`, () => {
    const details = loadFunctions("app/owner-meal-scan.tsx", ["LastScan"], {
      MealGlassPanel: "GlassPanel", MaterialCommunityIcons: "StatusIcon", formatMealMoment: () => "10:07 PM",
    }).LastScan({ scan: { ...result, alreadyRecorded } });
    assert.equal(details.props.accessibilityLiveRegion, "polite");
    assert.equal(nodes(details, "GlassPanel").length, 1);
    assert.match(text(details), /Tenant/);
    assert.match(text(details), /Standard/);
    for (const value of ["Room", "101", "Meal", "Dinner", "Recorded", "10:07 PM"]) assert.ok(nodes(details, "Text").some((node) => text(node) === value));
    const columns = nodes(details, "View").filter((node) => node.props.style?.flex === 1 && node.props.style?.gap === 4);
    assert.equal(columns.length, 3);
    if (alreadyRecorded) assert.match(text(details), /Already recorded/);
    else assert.doesNotMatch(text(details), /Already recorded/);
  });
}
test("View meal attendance opens the module's attendance screen through the existing permission gate", () => {
  const scanner = scannerHarness();
  const link = nodes(scanner.render(), "Button").find((node) => node.props.accessibilityLabel === "View meal attendance");
  link.props.onPress();
  assert.deepEqual(scanner.gatedRoutes, ["/owner-meal-attendance"]);
  assert.deepEqual(scanner.scannerRoutes, ["/owner-meal-attendance"]);
  const restricted = scannerHarness({ allowAttendance: false });
  nodes(restricted.render(), "Button").find((node) => node.props.accessibilityLabel === "View meal attendance").props.onPress();
  assert.deepEqual(restricted.gatedRoutes, ["/owner-meal-attendance"]);
  assert.deepEqual(restricted.scannerRoutes, []);
});
test("on-dark header contrast is opt-in, leaving normal screen titles and back buttons unchanged", () => {
  const header = loadFunctions("src/components/compact-screen-header.tsx", ["CompactHeaderBar"], {
    BACK_SIZE: 36, COMPACT_HEADER_BACK_BUTTON: true, ArrowLeft: "BackIcon",
    useGuardedRouter: () => ({ canGoBack: () => true, back: () => {} }), useSegments: () => ["owner-meal-scan"], useState: (value) => [value, () => {}],
  });
  const normal = header.CompactHeaderBar({ content: { title: "Scan", italicTail: "meal passes." } });
  const dark = header.CompactHeaderBar({ content: { title: "Scan", italicTail: "meal passes.", onDark: true }, surface: "#101B3E" });
  assert.equal(nodes(normal, "FitText")[0].props.style[1].color, "ink");
  assert.equal(nodes(normal, "BackIcon")[0].props.color, "#000000");
  assert.equal(nodes(dark, "FitText")[0].props.style[1].color, "#FFFFFF");
  assert.equal(nodes(dark, "BackIcon")[0].props.color, "#FFFFFF");
});
