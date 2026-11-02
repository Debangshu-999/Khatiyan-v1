const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const compile = (text) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const sort = {};
vm.runInNewContext(compile(read("src/features/owner/workspace-sort.ts")), {
  exports: sort, require: (name) => { assert.equal(name, "@/features/owner/action-center"); return { buildActionItems: () => [] }; },
});
const modules = [
  ["tenancy", "Tenancy"], ["billing", "Billing"], ["property", "Property"], ["food", "Meals"],
  ["notice", "Notice"], ["concern", "Concern"], ["staff", "Staff"],
].map(([key, title]) => ({ key, title }));
const keys = (groups) => Array.from(groups, (group) => Array.from(group.modules, (module) => module.key));
const custom = ["staff", "notice", "tenancy", "concern", "property", "food", "billing"];
const marks = {
  "p:billing": { at: 10, count: 1 }, "p:food": { at: 20, count: 2 },
  "p:staff": { at: 30, count: 1 }, "p:tenancy": { at: 40, count: 1 },
};
for (const [mode, expected] of [
  ["AZ", [["billing", "concern", "food", "notice"], ["property", "staff", "tenancy"]]],
  ["ZA", [["notice", "food", "concern", "billing"], ["tenancy", "staff", "property"]]],
  ["DYNAMIC", [["food", "billing", "concern", "notice"], ["tenancy", "staff", "property"]]],
  ["CUSTOM", [["notice", "concern", "food", "billing"], ["staff", "tenancy", "property"]]],
]) {
  test(`${mode} sorts within each category without moving category positions`, () => {
    const before = JSON.stringify(modules);
    const grouped = sort.groupWorkspaceModules(modules, mode, custom, marks, "p");
    assert.deepEqual(Array.from(grouped, (group) => group.title), ["Daily operations", "Property & people"]);
    assert.deepEqual(keys(grouped), expected);
    assert.equal(JSON.stringify(modules), before);
  });
}

test("permission-filtered modules are never added back and empty categories disappear", () => {
  const grouped = sort.groupWorkspaceModules(modules.filter((module) => module.key === "property"), "AZ", [], {}, "p");
  assert.deepEqual(keys(grouped), [["property"]]);
  assert.equal(grouped[0].title, "Property & people");
  assert.equal(sort.groupWorkspaceModules([], "AZ", [], {}, null).length, 0);
});

test("category reordering preserves the other category, hidden modules and newly visible modules", () => {
  const shown = ["billing", "concern", "food", "notice", "property", "tenancy"];
  const saved = ["staff", "notice", "tenancy", "concern", "property", "billing"];
  const before = saved.slice();
  const merged = sort.mergeWorkspaceCategoryOrder(saved, shown, ["food", "billing", "concern", "notice"]);
  assert.deepEqual(Array.from(merged), ["staff", "food", "tenancy", "billing", "property", "concern", "notice"]);
  assert.deepEqual(saved, before);
  assert.equal(merged.filter((key) => key === "staff").length, 1);
  assert.deepEqual(keys(sort.groupWorkspaceModules(modules, "CUSTOM", merged, {}, "p")), [
    ["food", "billing", "concern", "notice"], ["staff", "tenancy", "property"],
  ]);
});

const screenText = read("app/(tabs)/owner.tsx");
const source = ts.createSourceFile("owner.tsx", screenText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const definition = (name) => source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source);
const jsx = (type, props) => ({ type, props });
const ui = {};
const colors = { surface: "white", surfaceSunken: "grey", border: "border", borderStrong: "strong", primary: "blue", ink: "black", danger: "red", muted: "muted" };
vm.runInNewContext(compile(`${["WorkspaceViewToggle", "WorkspaceServiceGrid", "ServiceCard"].map(definition).join("\n")}\nexports.Toggle = WorkspaceViewToggle; exports.Grid = WorkspaceServiceGrid; exports.Card = ServiceCard;`), {
  exports: ui, colors, PIN_TILT: {}, spacing: { xxs: 4, xs: 6, sm: 10, md: 14 },
  useTheme: () => ({ colors, fonts: { display: "Display", sansMedium: "Medium" }, type: {} }), softShadow: () => ({}),
  View: "View", Text: "Text", Image: "Image", AnimatedPressable: "Button", LayoutGrid: "GridIcon", List: "ListIcon", ChevronRight: "Chevron", Pin: "Pin", Menu: "Menu",
  require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
});
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return tree && typeof tree === "object" ? [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)] : [];
}
for (const count of [1, 2, 3, 4, 5, 7]) {
  test(`${count} grid services retain equal half-width columns and an empty odd right slot`, () => {
    const items = modules.slice(0, count);
    const grid = ui.Grid({ modules: items, renderItem: (module) => jsx("Service", { module }) });
    const rows = grid.props.children;
    assert.equal(rows.length, Math.ceil(count / 2));
    assert.equal(nodes(grid, "Service").length, count);
    for (const row of rows) {
      assert.equal(row.props.style.flexDirection, "row");
      for (const column of row.props.children) {
        assert.equal(column.props.style.flex, 1);
        assert.equal(column.props.style.minWidth, 0);
      }
    }
    if (count % 2) {
      const empty = rows.at(-1).props.children[1];
      assert.equal(empty.props.accessible, false);
      assert.equal(empty.props.pointerEvents, "none");
      assert.equal(empty.props.children, undefined);
    }
  });
}

for (const value of ["list", "grid"]) {
  test(`${value} toggle switches views and is disabled during custom arrangement`, () => {
    const changes = [];
    const toggle = ui.Toggle({ value, onChange: (view) => changes.push(view) });
    assert.equal(toggle.props.accessibilityLabel, value === "list" ? "Switch to grid view" : "Switch to list view");
    toggle.props.onPress();
    assert.deepEqual(changes, [value === "list" ? "grid" : "list"]);
    assert.equal(ui.Toggle({ value, disabled: true, onChange: () => {} }).props.disabled, true);
  });
  test(`${value} service keeps navigation separate from pinning, artwork and attention dots`, () => {
    let opened = 0;
    let pinned = 0;
    const props = { layout: value, title: "Property", description: "Rooms, listing & facilities", artwork: "original.png", icon: "Fallback", onPress: () => opened++, onTogglePin: () => pinned++, pending: true, pinned: false, divider: true };
    const tree = ui.Card(props);
    const buttons = nodes(tree, "Button");
    assert.equal(buttons.length, 2);
    assert.equal(nodes(buttons[0], "Button").length, 1, "pin is a sibling, never nested in the navigation button");
    buttons[1].props.onPress();
    assert.equal(pinned, 1); assert.equal(opened, 0);
    buttons[0].props.onPress(); assert.equal(opened, 1);
    assert.equal(nodes(tree, "Image")[0].props.source, "original.png");
    const description = nodes(tree, "Text").find((node) => node.props.children === props.description);
    const descriptionStyle = Object.assign({}, ...description.props.style);
    assert.equal(descriptionStyle.color, colors.muted);
    assert.equal(descriptionStyle.fontFamily, "Medium");
    assert.equal(nodes(tree, "View").filter((node) => node.props.accessibilityLabel === "Something is waiting here").length, 1);
    assert.equal(nodes(tree, "Chevron").length, value === "list" ? 1 : 0);
    assert.equal(buttons[0].props.style.borderWidth, value === "grid" ? 1 : 0);
    assert.equal(buttons[1].props.style.marginTop, value === "grid" ? 0 : -22);
    const pinnedTree = ui.Card({ ...props, pinned: true, pending: false });
    assert.equal(nodes(pinnedTree, "Pin")[0].props.fill, colors.primary);
    assert.equal(nodes(pinnedTree, "View").filter((node) => node.props.accessibilityLabel === "Something is waiting here").length, 0);
  });
}

test("grid hides sorting, list retains the existing section heading and all four sort options", () => {
  assert.match(screenText, /title="Open workspace"/);
  assert.match(screenText, /options=\{sortOptions\}/);
  assert.match(screenText, /replacement=\{grid\s*\? <WorkspaceViewToggle/);
  assert.match(screenText, /grid \? "AZ" : workspaceSort\.mode/);
  assert.match(screenText, /beforeFilter=\{!grid \? <WorkspaceViewToggle disabled=\{arranging\}/);
  assert.match(screenText, /Pin a service to keep it on Home\./);
  assert.match(screenText, /<Lightbulb color=\{colors\.kicker\}/);
  assert.deepEqual(Array.from(sort.WORKSPACE_SORT_OPTIONS, (option) => option.label), ["A to Z", "Z to A", "Dynamic", "Custom"]);
});

for (const storedView of [undefined, "list", "grid", "invalid"]) {
  test(`view preference ${String(storedView)} loads safely per user and preserves their sort`, async () => {
    const states = [], refs = [], effects = [], saves = [];
    const module = {};
    let stateIndex = 0, refIndex = 0;
    vm.runInNewContext(compile(read("src/features/owner/use-workspace-sort.ts")), {
      exports: module, require(name) {
        if (name === "react") return {
          useState: (initial) => { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], (update) => { states[index] = typeof update === "function" ? update(states[index]) : update; }]; },
          useRef: (initial) => { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
          useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn),
        };
        if (name === "@/config/app-settings-storage") return {
          loadWorkspaceSortForUser: async (user) => { assert.equal(user, "owner"); return { customOrder: custom, marks, mode: "ZA", view: storedView }; },
          saveWorkspaceSortForUser: async (user, value) => saves.push({ user, value }),
        };
        if (name === "@/features/owner/workspace-sort") return sort;
        assert.fail(name);
      },
    });
    const render = () => { stateIndex = 0; refIndex = 0; effects.length = 0; return module.useWorkspaceSort("owner", "p", null); };
    assert.equal(render().view, "list", "legacy default stays list");
    effects[0](); await Promise.resolve();
    let controls = render();
    assert.equal(controls.view, storedView === "grid" ? "grid" : "list");
    controls.setView(controls.view === "grid" ? "list" : "grid");
    controls = render(); effects[1]();
    assert.equal(saves.length, 1);
    assert.equal(saves[0].user, "owner");
    assert.equal(saves[0].value.mode, "ZA");
    assert.deepEqual(Array.from(saves[0].value.customOrder), custom);
    assert.equal(saves[0].value.marks, marks);
    assert.equal(saves[0].value.view, controls.view);
  });
}
