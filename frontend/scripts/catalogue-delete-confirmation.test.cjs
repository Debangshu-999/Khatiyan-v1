const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../app/owner-exit-policies.tsx"), "utf8");
const parsed = ts.createSourceFile("catalogue.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const definitions = ["levelsOf", "withLevels", "catalogueDeletionMessage", "DamageChargesEditor"].map((name) =>
  parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(parsed),
).join("\n");
const jsx = (type, props) => ({ type, props });
function nodes(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
const charge = (name, category = "ROOM", levels = [10000, 20000, 30000]) => ({
  name, category, chargePaise: levels.at(-1) ?? 0,
  d1Paise: levels[0] ?? null, d2Paise: levels[1] ?? null, d3Paise: levels[2] ?? null,
});
function harness({ charges = [charge("Mattress")], roomItems = [], attached = false } = {}) {
  const state = [], changes = [], exports = {};
  let cursor = 0, current = charges, readOnly = false;
  vm.runInNewContext(ts.transpileModule(`${definitions}\nexports.Editor = DamageChargesEditor;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, useTheme: () => ({ colors: {}, fonts: {}, type: {} }),
    useState: (initial) => {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], (next) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
    },
    View: "View", Text: "Text", CategoryCard: "CategoryCard", DamageItemRow: "DamageItemRow",
    ItemIcon: "ItemIcon", Info: "Info", AnimatedPressable: "Button", Trash2: "Trash", ConfirmDialog: "ConfirmDialog", PriceSheet: "PriceSheet",
    spacing: {}, CATEGORY_HEADINGS: { ROOM: { title: "Room", tail: "items" }, BATHROOM: { title: "Attached", tail: "bathroom" }, COMMON_TOILET: { title: "Common", tail: "toilet" } },
    require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  });
  const render = () => { cursor = 0; return exports.Editor({ attached, charges: current, onChange: (next) => { changes.push(next); current = next; }, readOnly, roomItems }); };
  return { render, changes, setReadOnly: (next) => { readOnly = next; },
    dialog: () => nodes(render(), "ConfirmDialog")[0],
    row: (name) => nodes(render(), "DamageItemRow").find((row) => row.props.name === name),
  };
}

for (const category of ["ROOM", "BATHROOM", "COMMON_TOILET"]) {
  test(`${category}: whole-item deletion asks first, Cancel preserves it, and Confirm removes only that item`, () => {
    const h = harness({ charges: [charge("Target", category, category === "COMMON_TOILET" ? [] : [10000]), charge("Keep")], attached: category === "BATHROOM" });
    const request = () => category === "COMMON_TOILET"
      ? nodes(h.render(), "Button").find((button) => button.props.accessibilityLabel === "Delete Target").props.onPress()
      : h.row("Target").props.onDelete();
    request();
    assert.equal(h.changes.length, 0);
    let dialog = h.dialog();
    assert.equal(dialog.props.title, "Delete this item?");
    assert.equal(dialog.props.confirmLabel, "Delete item");
    assert.equal(dialog.props.destructive, true);
    assert.ok(dialog.props.message.includes("Target"));
    assert.ok(dialog.props.footnote.includes("save the item catalogue"));
    if (category === "COMMON_TOILET") assert.ok(!dialog.props.message.includes("damage prices"));
    dialog.props.onCancel();
    assert.equal(h.dialog(), undefined);
    assert.equal(h.changes.length, 0);
    request(); h.dialog().props.onConfirm();
    assert.deepEqual(Array.from(h.changes[0], (item) => item.name), ["Keep"]);
  });
}

for (const index of [0, 1, 2]) {
  test(`D${index + 1}: deletion waits for confirmation and shifts higher levels down only after Confirm`, () => {
    const h = harness();
    h.row("Mattress").props.onDeleteLevel(index);
    assert.equal(h.changes.length, 0);
    const dialog = h.dialog();
    assert.equal(dialog.props.title, "Delete damage level?");
    assert.equal(dialog.props.confirmLabel, `Delete D${index + 1}`);
    assert.ok(dialog.props.message.includes(`D${index + 1} price for Mattress`));
    assert.equal(dialog.props.message.includes("move down"), index < 2);
    dialog.props.onCancel();
    assert.equal(h.changes.length, 0);
    h.row("Mattress").props.onDeleteLevel(index); h.dialog().props.onConfirm();
    const expected = [10000, 20000, 30000].filter((_, at) => at !== index);
    const updated = h.changes[0][0];
    assert.deepEqual([updated.d1Paise, updated.d2Paise, updated.d3Paise], [...expected, null]);
    assert.equal(updated.chargePaise, expected.at(-1));
  });
}

test("deleting the last price keeps the item, including an amenity supplied by existing rooms", () => {
  for (const roomItems of [[], [{ name: "TV", category: "ROOM" }]]) {
    const h = harness({ charges: [charge("TV", "ROOM", [10000])], roomItems });
    h.row("TV").props.onDeleteLevel(0);
    assert.ok(h.dialog().props.message.includes("without damage prices"));
    h.dialog().props.onConfirm();
    const row = h.row("TV");
    assert.ok(row, "removing the final price does not delete the item");
    assert.equal(row.props.charge?.d1Paise ?? null, null);
    if (roomItems.length) assert.equal(row.props.onDelete, undefined);
  }
});

test("a change to view-only permission while the confirmation is open cannot delete anything", () => {
  const h = harness();
  h.row("Mattress").props.onDeleteLevel(1);
  h.setReadOnly(true); h.dialog().props.onConfirm();
  assert.equal(h.changes.length, 0);
});

test("the catalogue's fit check reserves its pinned footer and device bottom inset", () => {
  assert.ok(source.includes("bottomPaddingCovered={ready}"));
  assert.ok(source.includes("paddingBottom: PINNED_FOOTER_CLEARANCE + insets.bottom"));
});
