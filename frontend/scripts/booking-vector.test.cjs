const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

let primary = "#3F6ED8";
const svg = {
  __esModule: true,
  default: ({ accessible, ...props }) => React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", ...props }),
  Circle: "circle", Ellipse: "ellipse", G: "g", Path: "path", Rect: "rect",
};
const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, "../src/features/property/property-control-icons.tsx"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
vm.runInNewContext(outputText, {
  exports: exportsObject,
  require: (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react-native-svg") return svg;
    if (name === "@/theme/use-theme") return { useTheme: () => ({ colors: { primary } }) };
    assert.fail(`Unexpected vector dependency: ${name}`);
  },
});
const draw = (name, size = 64) => renderToStaticMarkup(React.createElement(exportsObject[name], { size }));

const metricExports = {};
const metricSource = fs.readFileSync(path.join(__dirname, "../src/components/booking-vector-icons.tsx"), "utf8");
const metricCompiled = ts.transpileModule(metricSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
vm.runInNewContext(metricCompiled.outputText, {
  exports: metricExports,
  require: (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react-native-svg") return svg;
    assert.fail(`Unexpected status-vector dependency: ${name}`);
  },
});
const metricMarks = [["BookingAwaitingHandlerIcon", "Handler"], ["BookingAwaitingTenantIcon", "Tenant"], ["BookingTokenDueIcon", "Token due"], ["BookingConfirmedIcon", "Confirmed"]];
const drawMetric = (name) => renderToStaticMarkup(React.createElement(metricExports[name], { size: 64, color: "#3F6ED8" }));

test("booking property uses the reference's sloped two-building vector in the supplied blue", () => {
  const xml = drawMetric("BookingPropertyIcon");
  assert.match(xml, /stroke="#3F6ED8"/);
  assert.match(xml, /M11 56V13/);
  assert.match(xml, /M37 29l12 4/);
  assert.match(xml, /M6 56h51/);
  assert.equal((xml.match(/<rect/g) ?? []).length, 4);
  assert.doesNotMatch(xml, /<image|data:image/);
});

test("all four status icons are distinct black SVG drawings even when a tile passes blue", () => {
  const rendered = metricMarks.map(([name]) => drawMetric(name));
  assert.equal(new Set(rendered).size, 4);
  for (const xml of rendered) {
    assert.match(xml, /stroke="#000000"/);
    assert.match(xml, /viewBox="0 0 64 64"/);
    assert.doesNotMatch(xml, /#3F6ED8|<image|data:image/);
  }
});

test("confirmed retains the original calendar with an inside check, with no extra badge", () => {
  const xml = drawMetric("BookingConfirmedIcon");
  assert.match(xml, /x="10" y="12" width="44" height="44"/);
  assert.match(xml, /d="m21 39 8 8 14-15"/);
  assert.doesNotMatch(xml, /<circle|M14 31|x="18" y="30"/);
});

test("booking history is a blue calendar/clock vector matching payment setup's line style", () => {
  const xml = renderToStaticMarkup(React.createElement(metricExports.BookingHistoryIcon, { size: 56 }));
  assert.match(xml, /viewBox="0 0 64 64"/);
  assert.match(xml, /width="56" height="56"/);
  assert.match(xml, /stroke="#4775C5"/);
  assert.match(xml, /stroke-width="3.8"/);
  assert.match(xml, /stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(xml, /cx="45" cy="44" r="15"/);
  assert.match(xml, /M45 35v10l7 4/);
  assert.doesNotMatch(xml, /<image|data:image|<text/);
  assert.match(readBillingVectors(), /blue \? "#4775C5"/);
});

function readBillingVectors() {
  return fs.readFileSync(path.join(__dirname, "../src/components/billing-vector-icons.tsx"), "utf8");
}

test("token amount has its own bounded minted-rupee vector, distinct from the token-due slip", () => {
  const xml = renderToStaticMarkup(React.createElement(metricExports.BookingTokenAmountIcon, { size: 64, color: "#13795B" }));
  assert.match(xml, /viewBox="0 0 64 64"/);
  assert.match(xml, /cx="32" cy="32" r="26"/);
  assert.match(xml, /M23 22h18/);
  assert.match(xml, /stroke="#13795B"/);
  assert.match(renderToStaticMarkup(React.createElement(metricExports.BookingTokenAmountIcon)), /stroke="#000000"/);
  assert.doesNotMatch(xml, /<image|data:image|<rect/);
  assert.notEqual(xml, drawMetric("BookingTokenDueIcon"));
});

test("bookings is a true, bounded SVG in the same filled family as enquiries and visits", () => {
  for (const name of ["BookingsIcon", "EnquiriesIcon", "PropertyVisitsIcon", "PropertyLeadsIcon"]) {
    const xml = draw(name);
    assert.match(xml, /viewBox="0 0 64 64"/);
    assert.match(xml, /width="64" height="64"/);
    assert.match(xml, /fill="#3F6ED8"/);
    assert.match(xml, /#FFFFFF/);
    assert.doesNotMatch(xml, /<image|data:image|<filter|<text/);
  }
});

test("Property Leads redraws the approved profile clipboard and magnifier as a blue vector", () => {
  const xml = draw("PropertyLeadsIcon");
  assert.match(xml, /x="5" y="12" width="42" height="47"/);
  assert.match(xml, /x="18" y="4" width="17" height="13"/);
  assert.match(xml, /cx="25" cy="28" r="5\.5"/);
  assert.match(xml, /cx="44" cy="43" r="13"/);
  assert.match(xml, /d="m52 52 7 7"/);
  assert.doesNotMatch(xml, /#000000|<image|data:image|<text/);
  primary = "#7CA3F4";
  try {
    const themed = draw("PropertyLeadsIcon", 64);
    assert.match(themed, /fill="#7CA3F4" color="#7CA3F4"/);
  } finally {
    primary = "#3F6ED8";
  }
});

test("booking artwork scales to glyph size and follows the shared theme", () => {
  primary = "#7CA3F4";
  const xml = draw("BookingsIcon", 24);
  assert.match(xml, /width="24" height="24"/);
  assert.match(xml, /fill="#7CA3F4"/);
  primary = "#3F6ED8";
});

test("Property's Bookings card uses the shared blue artwork at the same size as its workspace neighbours", () => {
  const propertySource = fs.readFileSync(path.join(__dirname, "../app/owner-property.tsx"), "utf8");
  const file = ts.createSourceFile("owner-property.tsx", propertySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const cards = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "ActionCard") cards.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  const attribute = (card, name) => card.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name)?.initializer;
  const booking = cards.find((card) => attribute(card, "title")?.text === "Bookings");
  assert.ok(booking, "Property workspace must retain its Bookings card");
  assert.equal(attribute(booking, "icon").expression.getText(file), "BookingsIcon");
  assert.equal(attribute(booking, "showArrow").expression.kind, ts.SyntaxKind.FalseKeyword);
  for (const title of ["Manage listing", "Enquiries", "Rooms & beds"]) {
    const neighbour = cards.find((card) => attribute(card, "title")?.text === title);
    assert.equal(attribute(booking, "iconSize").expression.text, attribute(neighbour, "iconSize").expression.text);
  }
  assert.match(attribute(booking, "onPress").expression.getText(file), /open\(router, "\/owner-bookings"\)/);
  const imports = file.statements.filter(ts.isImportDeclaration);
  const artworkImport = imports.find((node) => node.moduleSpecifier.text === "@/features/property/property-control-icons");
  assert.ok(artworkImport.importClause.namedBindings.elements.some((node) => node.name.text === "BookingsIcon"));
  assert.doesNotMatch(draw("BookingsIcon", 58), /<image|data:image/);
});

test("booking artwork matches the approved clear bed/key drawing, with no crossing rail", () => {
  const xml = draw("BookingsIcon");
  assert.match(xml, /d="M11 29a2 2 0 0 1 4 0v8h10v-6h7a6 6 0 0 1 6 6v7h-4v-3H15v3h-4Z"/);
  assert.match(xml, /cx="20" cy="33" r="3"/);
  assert.match(xml, /cx="51" cy="44" r="3\.5"/);
  assert.doesNotMatch(xml, /M12 42h29M14 42v5M38 42v5/);
});

// Optional build artifact, rendered from the actual app component, not a second drawing.
if (process.argv.includes("--preview")) {
  const directory = path.resolve(__dirname, "../../tmp/booking-vector");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "bookings.svg"), draw("BookingsIcon"));
  fs.writeFileSync(path.join(directory, "property-leads.svg"), draw("PropertyLeadsIcon"));
  const marks = [["EnquiriesIcon", "Enquiries"], ["PropertyVisitsIcon", "Visits"], ["BookingsIcon", "Bookings"]];
  const content = marks.map(([name, label], index) =>
    `<g transform="translate(${index * 120 + 28},16)">${draw(name)}<text x="32" y="91" text-anchor="middle" fill="#0F172A" font-family="Arial" font-size="14">${label}</text></g>`,
  ).join("");
  fs.writeFileSync(path.join(directory, "comparison.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="124" viewBox="0 0 360 124"><rect width="360" height="124" fill="white"/>${content}</svg>`);
  const statuses = metricMarks.map(([name, label], index) =>
    `<g transform="translate(${index * 120 + 28},16)">${drawMetric(name)}<text x="32" y="91" text-anchor="middle" fill="#0F172A" font-family="Arial" font-size="14">${label}</text></g>`,
  ).join("");
  fs.writeFileSync(path.join(directory, "status-icons.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="124" viewBox="0 0 480 124"><rect width="480" height="124" fill="white"/>${statuses}</svg>`);
  console.log(`Vector previews: ${directory}`);
}
