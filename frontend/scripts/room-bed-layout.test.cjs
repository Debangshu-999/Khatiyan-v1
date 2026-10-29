const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../app/owner-rooms.tsx"), "utf8");
const parsed = ts.createSourceFile("rooms.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const definitions = ["BedTile", "RoomBedGrid", "shortDate"].map((name) =>
  parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(parsed),
);
const jsx = (type, props) => ({ type, props });
const exported = {};
const colors = { accent: "#995500", ink: "#111111", muted: "#777777", surfaceSunken: "#F1F2F6" };
vm.runInNewContext(ts.transpileModule(`${definitions.join("\n")}\nexports.BedTile = BedTile; exports.RoomBedGrid = RoomBedGrid;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports: exported, View: "View", Text: "Text", FitText: "FitText", Bed: "Bed", Clock: "Clock",
  useTheme: () => ({ colors, fonts: {}, type: {} }), spacing: { sm: 8 },
  require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx, Fragment: "Fragment" }; },
});
const { BedTile, RoomBedGrid } = exported;
function nodes(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}

for (const count of [1, 2, 3, 4, 5, 10]) {
  test(`${count} beds keep equal half-row widths, including the final odd bed`, () => {
    const beds = Array.from({ length: count }, (_, index) => index === 0 ? { tenantName: "John Smith" } : null);
    const grid = RoomBedGrid({ beds });
    const rows = grid.props.children;
    assert.equal(rows.length, Math.ceil(count / 2));
    const tiles = nodes(grid, BedTile);
    assert.equal(tiles.length, count);
    assert.deepEqual(Array.from(tiles, (tile) => tile.props.index), Array.from({ length: count }, (_, index) => index));
    assert.equal(tiles[0].props.occupant, beds[0]);
    const last = rows[rows.length - 1].props.children.filter(Boolean);
    assert.equal(last.length, 2);
    for (const row of rows) {
      for (const column of row.props.children) {
        assert.equal(column.type, "View");
        assert.equal(column.props.style.flex, 1);
        assert.equal(column.props.style.minWidth, 0);
        assert.equal(column.props.style.paddingHorizontal, undefined, "equal-width columns cannot have different internal padding");
      }
    }
    if (count % 2) {
      assert.equal(last[1].type, "View");
      assert.equal(last[1].props.style.flex, 1);
      assert.equal(last[1].props.accessible, false);
      assert.equal(last[1].props.pointerEvents, "none");
    } else {
      assert.ok(last.every((column) => column.props.children.type === BedTile));
    }
  });
}

test("bed tiles use a compact icon-and-details row that can fill the available width", () => {
  const tile = BedTile({ index: 0, occupant: null });
  assert.equal(tile.props.style.flexDirection, "row");
  assert.equal(tile.props.style.alignItems, "center");
  assert.equal(tile.props.style.flex, 1);
  assert.equal(tile.props.style.backgroundColor, colors.surfaceSunken);
  const [icon, details] = tile.props.children;
  assert.equal(icon.props.style.flexShrink, 0);
  assert.equal(details.props.style.flex, 1);
  assert.equal(details.props.style.minWidth, 0);
  assert.equal(nodes(tile, "Text")[0].props.children, "Vacant");
});

test("occupied and daily beds retain their tenant, amber tint, clock and checkout date", () => {
  const tile = BedTile({ index: 1, occupant: { tenantName: "Jane Smith", billingType: "DAILY", plannedEndDate: "2026-11-02" } });
  assert.equal(tile.props.style.backgroundColor, "#FFFAE9");
  assert.equal(tile.props.style.borderStyle, "dashed");
  assert.equal(nodes(tile, "Clock").length, 1);
  assert.ok(nodes(tile, "FitText").some((node) => node.props.children === "Jane"));
  assert.deepEqual(Array.from(nodes(tile, "Text")[0].props.children), ["Until ", "2/11"]);
});
