const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const text = fs.readFileSync(path.join(__dirname, "../app/owner-property.tsx"), "utf8");
const source = ts.createSourceFile("property.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// The property card (user, 2026-11-15): the name strip joined to a plain details panel, one border round both.
let overview;
let wrapper;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "HighlightPanel"
    && node.getText(source).includes("selectedProperty.referenceCode")) overview = node;
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "View"
    && node.getText(source).includes("<PropertyNameCard joined")) wrapper ??= node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(overview);
assert.ok(wrapper);
const jsx = (type, props) => ({ type, props });
const exported = {};
const colors = { neutralSoft: "grey", warningSoft: "yellow", ink: "black", inkSoft: "soft-black", accent: "amber", muted: "muted", border: "line", borderStrong: "edge", shadow: "shadow" };
const fonts = { sansMedium: "Inter_500Medium" };
const selectedProperty = { referenceCode: "PROP-2026-000001", type: "PG", name: "Sky Luxury PG", address: "453 Mushroom Rock Road", city: "Hyderabad" };
const scope = (extra) => ({
  exports: exported, colors, fonts, selectedProperty, type: {}, spacing: { xs: 6, sm: 10, md: 14, lg: 18 }, radii: { card: 16 },
  View: "View", Text: "Text", Svg: "Svg", Path: "Path", Circle: "Circle", ActionButton: "Button", Pencil: "Pencil",
  HighlightPanel: "HighlightPanel", PropertyNameCard: "PropertyNameCard", cardShadow: () => ({}),
  canManageSettings: true, router: { push: () => {} }, humanizeToken: (value) => value,
  require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  ...extra,
});
vm.runInNewContext(ts.transpileModule(`exports.card = (${overview.getText(source)}); exports.wrapper = (${wrapper.getText(source)});`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, scope({}));
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

test("one card: a single border round the name strip and a plain details panel, the edit button in it", () => {
  const outer = exported.wrapper;
  assert.equal(outer.props.style.borderWidth, 1);
  assert.equal(outer.props.style.borderColor, colors.borderStrong);
  assert.equal(outer.props.style.borderRadius, 16);
  assert.equal(outer.props.style.overflow, "hidden");
  assert.equal(outer.props.style.marginTop, -6);
  assert.equal(outer.props.children[0].type, "PropertyNameCard");
  assert.equal(outer.props.children[0].props.name, selectedProperty.name);
  // The details are a panel with no border or corners of their own.
  assert.equal(card.props.style.borderWidth, 0);
  assert.equal(card.props.style.borderRadius, 0);
  assert.equal(card.props.style.paddingTop, 14);
  const edit = card.props.children[1].props.children;
  assert.equal(edit.props.label, "Edit property");
  assert.equal(edit.props.variant, "neutral");
  assert.equal(edit.props.borderColor, colors.ink);
});

test("the property address is smaller and medium weight without changing its colour or truncating it", () => {
  const address = details.props.children[1].props.children[1];
  const style = Object.assign({}, ...address.props.style);
  assert.equal(style.fontSize, 13);
  assert.equal(style.lineHeight, 18);
  assert.equal(style.fontFamily, fonts.sansMedium);
  assert.equal(style.color, colors.muted);
  assert.equal(style.flex, 1);
  assert.equal(address.props.numberOfLines, undefined);
  assert.equal(address.props.children, "453 Mushroom Rock Road, Hyderabad");
});
