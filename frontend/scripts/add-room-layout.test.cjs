const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => { assert.ok(type); return { type, props }; };
function load(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    assert.ok(name in dependencies, name); return dependencies[name];
  } });
  return exports;
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((item) => nodes(item, type));
  return tree && typeof tree === "object" ? [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)] : [];
}

for (const count of [0, 1, 4, 40]) {
  test(`room-type picker with ${count} types opts into content sizing and retains selection`, () => {
    const changes = [];
    const module = load("src/features/property/mold-picker.tsx", {
      react: { useState: () => [true, (open) => changes.push(open)] },
      "react-native": { Text: "Text", View: "View" },
      "lucide-react-native": { AirVent: "AirVent", ChevronDown: "Down", Fan: "Fan", X: "X" },
      "@/components/animated-pressable": { AnimatedPressable: "Button" },
      "@/components/field-error": { FieldError: "FieldError" },
      "@/features/owner/owner-ui": { RequiredMark: "RequiredMark", formatMoneyPaise: String, humanizeToken: String },
      "@/components/picker-option-row": { PickerOptionRow: "Option" }, "@/components/sheet-shell": { SheetShell: "Sheet" },
      "@/store/services/property-api": { ROOM_TYPES: ["SINGLE", "DOUBLE", "TRIPLE"] },
      "@/theme/spacing": { spacing: { xs: 4, sm: 8, md: 12, xl: 24 } },
      "@/theme/use-theme": { useTheme: () => ({ colors: {}, fonts: {}, type: {} }) },
      "@/components/fit-text": { FitText: "FitText" },
    });
    const molds = Array.from({ length: count }, (_, i) => ({ id: `type-${i}`, sharingType: "DOUBLE", conditioning: "AC", bedCount: 2, baseRentPaise: 900000 }));
    const tree = module.MoldPicker({ molds, onChange: (id) => changes.push(id), value: count ? molds[0].id : null, radius: 8 });
    const sheet = nodes(tree, "Sheet")[0];
    assert.equal(sheet.props.size, "content");
    assert.equal(sheet.props.title, "Room type");
    const options = nodes(sheet, "Option"); assert.equal(options.length, count);
    if (count) {
      assert.equal(options[0].props.selected, true);
      options.at(-1).props.onPress();
      assert.equal(changes[0], molds.at(-1).id);
      assert.equal(changes[1], false);
    }
    assert.ok(nodes(tree, "Button").some((button) => button.props.style.borderRadius === 8));
  });
}

const shellSource = read("src/components/sheet-shell.tsx");
const shell = ts.createSourceFile("sheet.tsx", shellSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let panel, body;
function visit(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(shell) === "Animated.View") {
    const style = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(shell) === "style");
    if (style?.initializer?.expression && ts.isObjectLiteralExpression(style.initializer.expression)
      && style.initializer.expression.properties.some((item) => item.name?.getText(shell) === "maxHeight")) panel = style.initializer.expression;
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(shell) === "GestureScrollView") {
    body = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(shell) === "style").initializer.expression;
  }
  ts.forEachChild(node, visit);
}
visit(shell);
function evaluate(expression, extra) { return vm.runInNewContext(`(${expression.getText(shell)})`, { SHEET_HEIGHTS: { short: 0.45, medium: 0.7, tall: 0.9 }, Math, ...extra }); }
const property = (name) => panel.properties.find((item) => item.name?.getText(shell) === name).initializer;

for (const [platform, cap] of [["android", 736], ["ios", "92%"], ["web", "92%"]]) {
  test(`${platform}: compact sheets have no fixed height or flex-growth gap and scroll at their height cap`, () => {
    const values = { size: "content", travel: 800, maxSheetHeight: cap, fullBleed: false };
    assert.equal(evaluate(property("height"), values), undefined);
    assert.equal(evaluate(property("maxHeight"), values), typeof cap === "number" ? 560 : "70%");
    const style = evaluate(body, values)[0];
    assert.equal(style.flex, undefined);
    assert.equal(style.flexGrow, 0);
    assert.equal(style.flexShrink, 1);
    assert.match(shellSource, /<GestureScrollView/);
    assert.match(shellSource, /contentContainerStyle=\{\{ gap: spacing\.md, paddingBottom: spacing\.xs/);
  });
}

test("all existing fixed sheet sizes and the keyboard height limit remain unchanged", () => {
  for (const [size, fraction] of [["short", 0.45], ["medium", 0.7], ["tall", 0.9]]) {
    assert.equal(evaluate(property("height"), { size, travel: 800, maxSheetHeight: 736 }), 800 * fraction);
    assert.equal(evaluate(property("height"), { size, travel: 800, maxSheetHeight: "92%" }), `${Math.round(fraction * 100)}%`);
    assert.equal(evaluate(body, { size, fullBleed: false })[0].flex, 1);
  }
  assert.equal(evaluate(property("maxHeight"), { size: "content", travel: 800, maxSheetHeight: 320 }), 320);
});

test("room status removes the general description but retains occupied-room safety checks", () => {
  const source = read("app/owner-rooms.tsx");
  assert.equal(source.includes("Occupied / partially occupied is set automatically from tenancies."), false);
  assert.match(source, /Room is occupied/);
  assert.match(source, /fieldErrors\.validate\(\{ reason:/);
  assert.match(source, /<FormInput[\s\S]*?label="Maintenance reason"/);
});

test("Add room reserves scroll clearance for the pinned footer after separating the Amenities card", () => {
  assert.match(read("app/owner-add-rooms.tsx"), /bottomPaddingCovered=\{live\.length > 0 && !choosing\}/);
  // The full clearance and the nav bar inset: the amenities card sat clipped behind the button (user, 2026-10-29).
  assert.match(read("app/owner-add-rooms.tsx"), /paddingBottom: PINNED_FOOTER_CLEARANCE \+ insets\.bottom/);
});
