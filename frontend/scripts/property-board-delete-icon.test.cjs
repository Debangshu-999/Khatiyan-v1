const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
function declaration(file, name) {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(sf);
}
function compile(source, globals = {}, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, ...globals, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, name);
    return dependencies[name];
  } });
  return exports;
}
for (const [theme, danger] of [["light", "#DC2626"], ["dark", "#F87171"]]) {
  const colors = { danger, muted: "#888888", neutralSoft: "#EEEEEE", borderStrong: "#CCCCCC" };
  const useTheme = () => ({ colors, fonts: {} });
  const { DeleteIcon } = compile(read("src/components/delete-icon.tsx"), {}, {
    "@/theme/use-theme": { useTheme },
    "react-native-svg": { __esModule: true, default: "Svg", Path: "Path" },
  });
  const { CategoryDeleteIcon, ActionButton } = compile([
    declaration("app/owner-board.tsx", "CategoryDeleteIcon"),
    declaration("src/features/owner/owner-ui.tsx", "ActionButton"),
    "exports.CategoryDeleteIcon = CategoryDeleteIcon;",
  ].join("\n"), {
    Trash2: DeleteIcon, useTheme, useIsSkeleton: () => false, AnimatedPressable: "Button", Text: "Text",
    spacing: { xs: 4, sm: 8, md: 12 }, radii: { md: 12 }, tapHaptic() {},
  });
  test(`${theme}: every category Delete button has a white icon and text on its red fill`, () => {
    const button = ActionButton({ icon: CategoryDeleteIcon, label: "Delete", variant: "dangerFilled", onPress() {} });
    const [icon, text] = button.props.children;
    const wrapped = icon.type(icon.props);
    const svg = wrapped.type(wrapped.props);
    assert.equal(button.props.style.backgroundColor, danger);
    assert.equal(text.props.style.color, "#FFFFFF");
    assert.equal(svg.type, "Svg");
    assert.equal(svg.props.fill, "#FFFFFF");
    assert.equal(svg.props.stroke, "none");
  });
  test(`${theme}: standalone delete icons stay red and disabled category icons stay muted`, () => {
    assert.equal(DeleteIcon({ color: "#222222" }).props.fill, danger);
    const button = ActionButton({ disabled: true, icon: CategoryDeleteIcon, label: "Delete", variant: "dangerFilled", onPress() {} });
    const icon = button.props.children[0];
    const wrapped = icon.type(icon.props);
    assert.equal(wrapped.type(wrapped.props).props.fill, colors.muted);
  });
}
test("the colour override is scoped to category buttons, not the standalone item delete controls", () => {
  const board = read("app/owner-board.tsx");
  assert.match(board, /icon=\{CategoryDeleteIcon\}\s+label="Delete"/);
  assert.match(board, /accessibilityLabel="Delete item" icon=\{Trash2\}/);
});
