const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");

const source = fs.readFileSync(path.join(__dirname, "..", "src/components/sheet-footer-split.ts"), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const exports_ = {};
new Function("exports", "require", outputText)(exports_, require);
const { splitSheetFooter } = exports_;

const ActionButton = () => null;
const View = () => null;
const Input = () => null;
const ConfirmDialog = () => null;
const AlertModal = () => null;
const el = (type, props, ...children) => React.createElement(type, props, ...children);
const parts = { ActionButton, View };
const row = () => el(View, { style: { flexDirection: "row" } }, el(ActionButton, { label: "Save" }));

test("a row holding a button at the end of a sheet moves to the footer", () => {
  const { body, footer } = splitSheetFooter([el(Input, {}), row()], parts);
  assert.equal(body.length, 1);
  assert.equal(footer.length, 1);
});

test("a bare button moves too, and a run of them keeps its order", () => {
  const { footer } = splitSheetFooter([el(Input, {}), el(ActionButton, { label: "One" }), el(ActionButton, { label: "Two" })], parts);
  assert.deepEqual(footer.map((item) => item.props.label), ["One", "Two"]);
});

test("dialogs drawn over the sheet are stepped over and stay in the body", () => {
  const { body, footer } = splitSheetFooter([el(Input, {}), row(), el(ConfirmDialog, {}), null, el(AlertModal, {})], parts);
  assert.equal(footer.length, 1);
  assert.equal(body.length, 3);
});

test("a button in the middle of a form stays there", () => {
  const { body, footer } = splitSheetFooter([row(), el(Input, {})], parts);
  assert.equal(footer.length, 0);
  assert.equal(body.length, 2);
});

test("a row with anything besides buttons stays in the body", () => {
  const mixed = el(View, {}, el(ActionButton, { label: "Save" }), el(Input, {}));
  assert.equal(splitSheetFooter([el(Input, {}), mixed], parts).footer.length, 0);
});

test("a sheet with no button has no footer, and fragments are opened out with unique keys", () => {
  assert.equal(splitSheetFooter([el(Input, {})], parts).footer.length, 0);
  const { body, footer } = splitSheetFooter(
    [el(Input, { key: "a" }), el(React.Fragment, { key: "f" }, el(Input, {}), row())],
    parts,
  );
  assert.equal(footer.length, 1);
  assert.equal(new Set(body.map((item) => item.key)).size, body.length);
});

test("a form in one wrapper has its buttons lifted out, as the leads filter does", () => {
  const form = el(View, { style: { gap: 8 } }, el(Input, {}), el(View, { style: { flexDirection: "row" } }, el(ActionButton, { label: "Clear" }), el(ActionButton, { label: "Show leads" })));
  const { body, footer } = splitSheetFooter([form, el(AlertModal, {})], parts);
  assert.equal(footer.length, 1);
  assert.equal(body.length, 2);
  assert.equal(React.Children.count(body[0].props.children), 1);
});

test("nothing but buttons is a list of choices, so it stays", () => {
  const { body, footer } = splitSheetFooter([row(), row()], parts);
  assert.equal(footer.length, 0);
  assert.equal(body.length, 2);
});

test("a button in a row beside a field, or at the end of the last of several cards, stays", () => {
  const inline = el(View, { style: { flexDirection: "row" } }, el(Input, {}), el(ActionButton, { label: "Add" }));
  assert.equal(splitSheetFooter([inline], parts).footer.length, 0);
  const card = () => el(View, {}, el(Input, {}), el(ActionButton, { label: "Open" }));
  assert.equal(splitSheetFooter([card(), card()], parts).footer.length, 0);
});
