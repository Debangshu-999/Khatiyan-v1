const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const text = fs.readFileSync(path.join(__dirname, "../app/owner-property.tsx"), "utf8");
const source = ts.createSourceFile("property.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let overview;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Card"
    && node.getText(source).includes("selectedProperty.referenceCode")) overview = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(overview);
const jsx = (type, props) => ({ type, props });
const exported = {};
const colors = { neutralSoft: "grey", warningSoft: "yellow", ink: "black", inkSoft: "soft-black", accent: "amber", muted: "muted" };
const fonts = { sansMedium: "Inter_500Medium" };
const selectedProperty = { referenceCode: "PROP-2026-000001", type: "PG", name: "Sky Luxury PG", address: "453 Mushroom Rock Road", city: "Hyderabad" };
vm.runInNewContext(ts.transpileModule(`exports.card = (${overview.getText(source)});`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports: exported, colors, fonts, selectedProperty, type: {}, spacing: { xs: 6, sm: 10, md: 14 },
  Card: "Card", View: "View", Text: "Text", PropertyArtwork: "Artwork", Svg: "Svg", Path: "Path", Circle: "Circle", ActionButton: "Button", Pencil: "Pencil",
  canManageSettings: true, router: { push: () => {} }, humanizeToken: (value) => value,
  require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
});
const card = exported.card;
const details = card.props.children[0];
const pills = details.props.children[0];

test("property ID stays left and property type stays right in a single row without a dot", () => {
  assert.equal(pills.props.style.flexDirection, "row");
  assert.equal(pills.props.style.justifyContent, "space-between");
  assert.equal(pills.props.style.flexWrap, undefined);
  assert.equal(pills.props.children.length, 2);
  assert.equal(pills.props.children[0].props.children.props.children, selectedProperty.referenceCode);
  assert.equal(pills.props.children[1].props.children.props.children, "PG");
});

test("existing grey and yellow pill colours are preserved", () => {
  assert.equal(pills.props.children[0].props.style.backgroundColor, colors.neutralSoft);
  assert.equal(pills.props.children[1].props.style.backgroundColor, colors.warningSoft);
  for (const pill of pills.props.children) assert.equal(pill.props.style.borderRadius, 999);
});

test("only the overview card has tighter top clearance and padding", () => {
  assert.equal(card.props.style.marginTop, -6);
  assert.equal(card.props.style.paddingTop, 14);
  assert.equal(details.props.children[1].props.children[1].props.children, selectedProperty.name);
  const edit = card.props.children[1].props.children;
  assert.equal(edit.props.label, "Edit property");
  assert.equal(edit.props.variant, "neutral");
  assert.equal(edit.props.borderColor, colors.ink);
});

test("the property address is smaller and medium weight without changing its colour or truncating it", () => {
  const address = details.props.children[2].props.children[1];
  const style = Object.assign({}, ...address.props.style);
  assert.equal(style.fontSize, 13);
  assert.equal(style.lineHeight, 18);
  assert.equal(style.fontFamily, fonts.sansMedium);
  assert.equal(style.color, colors.muted);
  assert.equal(style.flex, 1);
  assert.equal(address.props.numberOfLines, undefined);
  assert.equal(address.props.children, "453 Mushroom Rock Road, Hyderabad");
});
