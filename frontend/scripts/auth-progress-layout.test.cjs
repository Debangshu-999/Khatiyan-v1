const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const spacing = loadModule("src/theme/spacing.ts").spacing;

function loadModule(file, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react-native") return { View: "View" };
      if (name === "lucide-react-native") return { ArrowLeft: "ArrowLeft" };
      if (name === "@/theme/spacing") return { spacing };
      if (name === "@/features/auth/auth-ui") return {
        StepProgress: "StepProgress", CodeField: "CodeField", FieldSpacer: "FieldSpacer",
        PrimaryButton: "PrimaryButton", AuthChipLink: "AuthChipLink",
      };
      throw new Error(`Unexpected import: ${name}`);
    },
    ...globals,
  });
  return exports;
}

function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => find(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate)];
}

const screen = fs.readFileSync(path.join(root, "src/features/auth/auth-screen.tsx"), "utf8");
const parsed = ts.createSourceFile("auth-screen.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let headingMargin;
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(parsed) === "marginBottom"
      && node.initializer.getText(parsed).includes('"setupOtp"')) {
    headingMargin = node.initializer.getText(parsed);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(headingMargin, "shared auth heading margin exists");

for (const step of ["setupOtp", "setupPin", "resetOtp", "resetPin"]) {
  test(`${step} leaves the shared description-to-indicator gap intact`, () => {
    assert.equal(vm.runInNewContext(headingMargin, { step, spacing }), 0);
    assert.match(screen, /<View style=\{\{ flexGrow: 1, gap: spacing\.md \}\}>/);
  });
}

test("entry screens retain clearance for their floating field labels", () => {
  for (const step of ["entry", "activate", "resetRequest", "emailLogin"]) {
    assert.equal(vm.runInNewContext(headingMargin, { step, spacing }), spacing.lg);
  }
});

for (const [file, name] of [["setup-pin-step.tsx", "SetupPinStep"], ["reset-pin-step.tsx", "ResetPinStep"]]) {
  test(`${name} balances indicator clearance above the raised PIN label`, () => {
    const Step = loadModule(`src/features/auth/steps/${file}`)[name];
    const tree = Step({});
    const indicator = find(tree, (node) => node.type === "StepProgress")[0];
    assert.equal(indicator.props.step, 2);
    assert.equal(indicator.props.total, 2);
    const fields = find(tree, (node) => node.type === "View"
      && find(node.props.children, (child) => child.type === "CodeField").length === 2)[0];
    assert.equal(fields.props.style.paddingTop, spacing.sm);
    const authUi = fs.readFileSync(path.join(root, "src/features/auth/auth-ui.tsx"), "utf8");
    const notchRise = Number(authUi.match(/const NOTCH_RISE = (\d+);/)[1]);
    assert.ok(Math.abs(spacing.md + fields.props.style.paddingTop - notchRise - spacing.md) <= 1);
    const footer = find(tree, (node) => node.type === "View" && node.props.style.marginTop === "auto")[0];
    assert.ok(footer, "actions remain pinned to the bottom");
  });
}
