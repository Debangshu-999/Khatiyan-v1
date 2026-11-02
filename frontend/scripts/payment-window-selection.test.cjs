const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const source = (file) => ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const ui = source("src/features/owner/owner-ui.tsx");
const notice = ui.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "NoticeBar");
const code = ts.transpileModule(notice.getText(ui), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exportsForTest = {};
vm.runInNewContext(code, { exports: exportsForTest,
  require(name) { assert.equal(name, "react/jsx-runtime"); const jsx = (type, props) => ({ type, props }); return { jsx, jsxs: jsx }; },
  View: "View", Text: "Text", CircleAlert: "Alert", CircleCheck: "Check", Info: "Info",
  useTheme: () => ({ colors: { warningSoft: "yellow" }, fonts: {}, type: {} }),
  statusTonePalette: () => ({ fill: "#B78000" }), spacing: { sm: 10, md: 14 }, radii: { card: 10 },
});

test("notices can disable native selection without changing their warning surface or copy", () => {
  for (const selectable of [false, true, undefined]) {
    const result = exportsForTest.NoticeBar({ title: "IF PAID LATE?", message: "₹150 per day", tone: "warning", selectable });
    assert.equal(result.props.style.backgroundColor, "yellow");
    const text = result.props.children[1].props.children[1];
    assert.equal(text.props.selectable, selectable ?? true, "Other notices retain their existing selectable behavior");
    assert.equal(text.props.children, "₹150 per day");
  }
});

for (const file of ["app/owner-billing.tsx", "src/features/billing/payment-window-modal.tsx"]) {
  test(`${file}: the late-payment explanation does not become selected native text`, () => {
    const parsed = source(file);
    assert.doesNotMatch(parsed.text, /This bill has already accrued/, "Do not repeat the accrued late-fee paragraph below the notice");
    let found = 0;
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === "NoticeBar") {
        const attrs = node.attributes.properties;
        if (attrs.some((attr) => attr.name?.text === "title" && attr.initializer?.text === "IF PAID LATE?")) {
          const selectable = attrs.find((attr) => attr.name?.text === "selectable");
          assert.equal(selectable?.initializer?.expression?.kind, ts.SyntaxKind.FalseKeyword);
          found++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
    assert.equal(found, 1);
  });
}
