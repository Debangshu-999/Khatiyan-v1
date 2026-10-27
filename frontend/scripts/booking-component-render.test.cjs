const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
// Real React rendering, not JSX objects or a proxy that invents missing icon exports.
// Only native host views/SVGs are replaced, since Node cannot run the Android renderer.
const host = (name) => React.forwardRef(function NativeHost({ children }, ref) {
  return React.createElement(name, { ref }, children);
});
const svg = { __esModule: true, default: host("svg") };
for (const name of ["Svg", "Circle", "ClipPath", "Defs", "Ellipse", "G", "Image", "Line", "LinearGradient", "Mask", "Path", "Pattern", "Polygon", "Polyline", "RadialGradient", "Rect", "Stop", "Symbol", "Text", "TextPath", "TSpan", "Use"]) {
  svg[name] = name === "Svg" ? svg.default : host(name.toLowerCase());
}
const native = { Image: host("image"), Text: host("span"), View: host("div") };
const nativeIconCache = new Map();
const nativeIconContext = vm.createContext({});
function loadNativeIconModule(file) {
  if (nativeIconCache.has(file)) return nativeIconCache.get(file).exports;
  const module = { exports: {} };
  nativeIconCache.set(file, module);
  const run = vm.runInContext(`(function (exports, require, module) {\n${fs.readFileSync(file, "utf8")}\n})`, nativeIconContext, { filename: file });
  run(module.exports, (name) => {
    if (name === "react") return React;
    if (name === "react-native-svg") return svg;
    if (name.startsWith(".")) return loadNativeIconModule(path.resolve(path.dirname(file), name));
    throw new Error(`Unexpected icon dependency: ${name}`);
  }, module);
  return module.exports;
}
const icons = loadNativeIconModule(require.resolve("lucide-react-native"));

function loader(overrides = {}) {
  const cache = new Map();
  const dependencies = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": native,
    "react-native-svg": svg,
    "lucide-react-native": icons,
    ...overrides,
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const { outputText } = ts.transpileModule(read(file), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    vm.runInNewContext(outputText, { exports, require: (name) => {
      if (name in dependencies) return dependencies[name];
      assert.ok(name.startsWith("@/"), `Unexpected dependency: ${name}`);
      const target = `src/${name.slice(2)}`;
      for (const suffix of [".ts", ".tsx"]) {
        if (fs.existsSync(path.join(root, `${target}${suffix}`))) return load(`${target}${suffix}`);
      }
      throw new Error(`Cannot resolve ${name}`);
    } }, { filename: file });
    return exports;
  }
  return load;
}
const config = loader();
const { themes } = config("src/theme/colors.ts");
const theme = { colors: themes.light, fonts: { sansBold: "bold", sansSemiBold: "semibold", sansMedium: "medium", display: "display" }, type: { description: { fontSize: 12 }, modalDescription: { fontSize: 14 } } };
const load = loader({
  "@/theme/use-theme": { useTheme: () => theme },
  "@/features/owner/owner-ui": { formatMoneyPaise: (paise) => `Rs ${paise / 100}` },
  "@/features/booking/booking-form-parts": { RoomAmenityRow: host("div") },
});
const owner = load("src/features/booking/owner-booking-status.tsx");
const tenant = load("src/features/booking/tenant-booking-parts.tsx");
const confirm = load("src/features/booking/booking-confirm-body.tsx");
const statuses = ["AWAITING_HANDLER", "AWAITING_TENANT", "AWAITING_TOKEN", "TOKEN_RECEIVED", "CONFIRMED", "CANCELLED", "EXPIRED", "MOVED_IN"];
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("every owner and tenant booking status renders real icon exports", () => {
  for (const status of statuses) {
    assert.match(render(owner.OwnerBookingStatus, { status }), /<svg/);
    assert.match(render(tenant.TenantBookingStatus, { status }), /<svg/);
  }
  assert.match(render(owner.OwnerBookingStatus, { status: "TOKEN_RECEIVED" }), /Token received/);
  assert.match(render(tenant.TenantBookingStatus, { status: "TOKEN_RECEIVED" }), /Token received/);
});

test("a newer backend status cannot render an undefined icon during a module refresh", () => {
  for (const Component of [owner.OwnerBookingStatus, tenant.TenantBookingStatus]) {
    assert.match(render(Component, { status: "NEW_SERVER_STATUS" }), /Booking updated/);
    assert.match(render(Component, { status: "NEW_SERVER_STATUS" }), /<svg/);
  }
});

test("the shared acceptance and final-confirmation body renders its real component tree", () => {
  const html = render(confirm.BookingConfirmBody, {
    agreementMonths: 2, moveInDate: "2026-10-30", notice: "Token received; confirm the agreed terms.",
    place: "Sample PG · Room 204", rentPaise: 1000000,
  });
  assert.match(html, /Confirm booking\?/);
  assert.match(html, /2 months/);
  assert.match(html, /Rs 10000/);
  assert.match(html, /<svg/);
});

test("all booking-detail Lucide imports exist in both native ESM and CommonJS entries", () => {
  const esm = read("node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs");
  for (const file of ["app/owner-booking-detail.tsx", "src/features/booking/owner-booking-status.tsx", "src/features/booking/booking-confirm-body.tsx", "src/features/booking/booking-payment-claims.tsx", "src/features/booking/tenant-booking-parts.tsx"]) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "lucide-react-native") continue;
      for (const imported of statement.importClause.namedBindings.elements) {
        if (imported.isTypeOnly) continue;
        const name = (imported.propertyName ?? imported.name).text;
        assert.ok(icons[name], `${file}: missing CommonJS icon ${name}`);
        assert.match(esm, new RegExp(`\\bas ${name}\\b`), `${file}: missing native ESM icon ${name}`);
      }
    }
  }
});
