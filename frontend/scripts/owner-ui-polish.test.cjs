const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function source(relative) {
  const text = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  return ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
const vacancy = source("app/owner-vacancy-finder.tsx");
const expenses = source("app/owner-expenses.tsx");
const notice = source("app/owner-notice-detail.tsx");
const jsx = (type, props) => ({ type, props });
const colors = { ink: "ink", inkSoft: "soft-ink", muted: "muted", kicker: "kicker", primary: "blue", onPrimary: "white", surface: "surface", border: "border", borderStrong: "strong-border", jade: "green", danger: "red", warningText: "yellow", shadow: "shadow" };
const type = { label: { fontFamily: "Label", fontSize: 14 }, caption: {}, body: {}, bodyStrong: {}, description: {}, eyebrow: {} };
const spacing = { xs: 6, sm: 10, md: 14, lg: 18 };
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function find(root, predicate) {
  const result = [];
  function visit(node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
  visit(root);
  return result;
}
function evaluate(code, extras = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, colors, type, spacing,
    View: "View", Text: "Text", FitText: "FitText", AnimatedPressable: "Button", Pressable: "Pressable", Check: "Check", ChevronDown: "ChevronDown", Filter: "Filter", SheetShell: "SheetShell",
    Card: "Card", MoneyText: "MoneyText", ProgressBar: "ProgressBar", ActionButton: "ActionButton", Plus: "Plus", Wallet: "Wallet", StatusValueTile: "StatusValueTile", MetricTile: "MetricTile", NotchedInput: "NotchedInput", FieldPencil: "FieldPencil",
    fonts: { sansBold: "Bold", sansMedium: "Medium", display: "Display" },
    useTheme: () => ({ colors, type, fonts: { sansBold: "Bold", sansMedium: "Medium", display: "Display" } }),
    useState: (initial) => [initial, () => {}],
    humanizeToken: (value) => value, formatMoneyPaise: (value) => `INR ${value / 100}`,
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
    ...extras,
  });
  return exports;
}
function component(file, name, extras = {}, helpers = []) {
  const functions = [name, ...helpers].map((name) => file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(file));
  return evaluate(`${functions.join("\n")}\nexports.render = ${name};`, extras).render;
}

test("vacancy filters share the Min free beds label style, including upcoming vacancies", () => {
  const conditioning = find(vacancy, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(vacancy) === "Text" && node.children.some((child) => ts.isJsxText(child) && child.text.trim() === "Conditioning"))[0];
  assert.match(conditioning.openingElement.getText(vacancy), /type.label/);
  assert.match(conditioning.openingElement.getText(vacancy), /colors.muted/);
  const pickers = find(vacancy, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(vacancy) === "OptionPicker");
  assert.equal(pickers.length, 2);
  assert.ok(pickers.every((node) => node.attributes.properties.some((attribute) => attribute.name?.text === "labelOutside")));
  const Picker = component(vacancy, "OptionPicker");
  const all = nodes(Picker({ label: "Floor", labelOutside: true, value: "", options: ["", "1"], onChange() {} }));
  const label = all.find((node) => node.type === "Text" && node.props.children === "Floor");
  assert.equal(label.props.style[0], type.label);
  assert.equal(label.props.style[1].color, colors.muted);
  const Toggle = component(vacancy, "UpcomingVacanciesToggle");
  let toggled = 0;
  const toggle = Toggle({ checked: true, onToggle: () => toggled++ });
  const caption = nodes(toggle).find((node) => node.type === "Text");
  assert.equal(caption.props.style[0], type.label);
  assert.equal(caption.props.style[1].color, colors.muted);
  assert.equal(caption.props.style[1].flexShrink, 1, "The label can wrap on a narrow phone");
  toggle.props.onPress();
  assert.equal(toggled, 1);
  assert.equal(toggle.props.accessibilityState.checked, true);
});

test("room and floor sheets fit their lists and still commit the selected filter", () => {
  let selected;
  let open;
  const Picker = component(vacancy, "OptionPicker", { useState: () => [true, (value) => open = value] });
  for (const label of ["Room type", "Floor"]) {
    const all = nodes(Picker({ label, labelOutside: true, value: "ANY", options: ["ANY", "SINGLE", "DOUBLE"], onChange: (value) => selected = value }));
    const sheet = all.find((node) => node.type === "SheetShell");
    assert.equal(sheet.props.size, "content");
    const options = nodes(sheet).filter((node) => node.type === "Button");
    assert.equal(options.length, 3);
    assert.equal(options[0].props.accessibilityState.selected, true);
    options[2].props.onPress();
    assert.equal(selected, "DOUBLE");
    assert.equal(open, false);
  }
});

test("conditioning options have rounded corners without changing other segmented choices", () => {
  const Segments = component(source("src/components/segmented-choice.tsx"), "SegmentedChoice");
  let selected;
  const props = { options: ["ANY", "AC", "NON_AC"].map((value) => ({ label: value, value })), value: "AC", onChange: (value) => selected = value };
  for (const radius of [undefined, 8]) {
    const buttons = nodes(Segments({ ...props, radius })).filter((node) => node.type === "Button");
    assert.equal(buttons.length, 3);
    assert.ok(buttons.every((node) => node.props.style.borderRadius === (radius ?? 0)));
    assert.equal(buttons[1].props.accessibilityState.selected, true);
    buttons[0].props.onPress();
    assert.equal(selected, "ANY");
  }
  const caller = find(vacancy, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(vacancy) === "SegmentedChoice")[0];
  assert.match(caller.getText(vacancy), /radius=\{8\}/);
});

test("monthly budget hero has no redundant status chip", () => {
  const Hero = component(expenses, "BudgetHero");
  const tree = Hero({ budget: { effectiveBudgetPaise: 6500000, spentPaise: 4574000, remainingPaise: 1926000, raisedThisMonthPaise: 0 }, onRaise() {}, onSetBudget() {} });
  assert.ok(!nodes(tree).some((node) => node.type === "StatusPill"));
  assert.equal(nodes(tree).filter((node) => node.type === "MoneyText")[0].props.paise, 6500000);
});

test("Budget status uses the same soft shadow and elevation as the adjacent expense tiles", () => {
  const Tile = component(expenses, "StatusValueTile", {
    radii: { card: 10 },
    useSoftShadow: () => (color, offset, blur) => ({ boxShadow: `${color}:${offset}:${blur}` }),
  });
  const tree = Tile({ color: colors.jade, hint: "INR 19260 remaining", label: "Budget status", value: "On track" });
  assert.equal(tree.props.style.boxShadow, `${colors.shadow}:2:6`);
  assert.equal(tree.props.style.elevation, 2);
  assert.equal(tree.props.style.backgroundColor, colors.surface);
  assert.equal(tree.props.style.padding, spacing.md);
  assert.ok(nodes(tree).some((node) => node.props.children === "INR 19260 remaining"));
});

test("notice cards keep the shared soft shadow across every filter, whether static or pressable", () => {
  const board = source("app/owner-notices.tsx");
  const BoardCard = component(board, "BoardCard", {
    radii: { card: 10 }, LaneBadge: "LaneBadge", ChevronRight: "ChevronRight", FactRow: "FactRow",
    useSoftShadow: () => (color, offset, blur) => ({ boxShadow: `${color}:${offset}:${blur}` }),
  });
  for (const lane of ["LIVE", "SCHEDULED", "RECURRING", "PAUSED", "ARCHIVED", "ENDED"]) {
    for (const interactive of [false, true]) {
      let opened = 0;
      const tree = BoardCard({ lane, title: "Notice title", subtitle: "Notice preview", metaLeft: {}, metaRight: {}, footerLeft: {}, footerRight: {}, onPress: interactive ? () => opened++ : undefined });
      assert.equal(tree.props.style.boxShadow, `${colors.shadow}:4:12`);
      assert.equal(tree.props.style.padding, spacing.md);
      assert.equal(tree.props.style.borderRadius, 10);
      assert.equal(tree.type, interactive ? "Button" : "View");
      assert.equal(nodes(tree).find((node) => node.type === "LaneBadge").props.lane, lane);
      if (interactive) {
        tree.props.onPress();
        assert.equal(opened, 1);
      }
    }
  }
  for (const name of ["NoticeCard", "RecurringNoticeCard"]) {
    const fn = board.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(find(fn, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(board) === "BoardCard").length, 1, `${name} must use the same shadowed card`);
  }
});

test("budget status shows remaining money, clamped to zero at or over budget", () => {
  const Tiles = component(expenses, "BudgetTiles", {}, ["budgetStatusKey", "statusLabel"]);
  for (const [effective, spent, status, hint] of [
    [6500000, 4574000, "On track", "INR 19260 remaining"],
    [6500000, 6000000, "Approaching", "INR 5000 remaining"],
    [6500000, 6500000, "Approaching", "INR 0 remaining"],
    [6500000, 7200000, "Crossed", "INR 0 remaining"],
    [null, 7200000, "No budget", "Set a budget"],
    [0, 0, "No budget", "Set a budget"],
  ]) {
    const tree = Tiles({ budget: { effectiveBudgetPaise: effective, spentPaise: spent, savingsPaise: 0, raisedThisMonthPaise: 0 } });
    const tile = nodes(tree).find((node) => node.type === "StatusValueTile");
    assert.equal(tile.props.value, status);
    assert.equal(tile.props.hint, hint);
  }
});

test("notice edit mode has Edit details heading, no lane chip, and a notched Title next to its pencil", () => {
  const raw = notice.getFullText();
  assert.ok(raw.includes('{editing ? "Edit details" : "Notice details"}'));
  assert.ok(!raw.includes("<LaneBadge"));
  const input = find(notice, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(notice) === "NotchedInput")[0];
  assert.ok(input);
  let row = input.parent;
  while (row && !(ts.isJsxElement(row) && row.openingElement.getText(notice).includes('flexDirection: "row"'))) row = row.parent;
  assert.ok(row);
  let title;
  let field;
  const { render } = evaluate(`exports.render = (field, editing) => (${row.getText(notice)});`, { title: "Dinner ready", form: { errors: { title: "Title error" } }, setTitle: (value) => title = value, setField: (value) => field = value });
  const tree = render("title", true);
  assert.equal(tree.props.style.alignItems, "center");
  const all = nodes(tree);
  const editor = all.find((node) => node.type === "NotchedInput");
  assert.equal(editor.props.label, "Title");
  assert.equal(editor.props.invalid, true);
  assert.equal(editor.props.value, "Dinner ready");
  editor.props.onChangeText("New title");
  assert.equal(title, "New title");
  const pencil = tree.props.children[1];
  assert.equal(pencil.type, "FieldPencil", "Pencil is in the input row, not on a label row above it");
  pencil.props.onPress();
  assert.equal(field, null);
  assert.ok(!nodes(render(null, false)).some((node) => node.type === "FieldPencil" || node.type === "NotchedInput"));
  assert.ok(raw.includes('<FieldError message={field === "title" ? form.errors.title : undefined} />'));
});
