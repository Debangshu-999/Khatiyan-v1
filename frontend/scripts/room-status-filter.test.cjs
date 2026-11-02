const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = read("app/owner-rooms.tsx");
const parsed = ts.createSourceFile("rooms.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = (file, name) => file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(file);
const exported = {};
vm.runInNewContext(ts.transpileModule(`${declaration(parsed, "matchesRoomFilter")}\n${declaration(parsed, "roomUseNotice")}\nexports.matches = matchesRoomFilter; exports.notice = roomUseNotice;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exported });

const rooms = [
  { id: "vacant", active: true, status: "VACANT" },
  { id: "partial", active: true, status: "PARTIALLY_OCCUPIED" },
  { id: "occupied", active: true, status: "OCCUPIED" },
  { id: "maintenance", active: true, status: "MAINTENANCE" },
  { id: "off", active: false, status: "VACANT" },
  { id: "off-maintenance", active: false, status: "MAINTENANCE" },
];
for (const [filter, expected] of [
  ["all", rooms.map((room) => room.id)],
  ["active", ["vacant", "partial", "occupied"]],
  ["maintenance", ["maintenance"]],
  ["deactivated", ["off", "off-maintenance"]],
]) {
  test(`${filter} includes the correct room statuses`, () => {
    assert.deepEqual(rooms.filter((room) => exported.matches(room, filter)).map((room) => room.id), expected);
  });
}

test("room status defaults to All and uses the shared dropdown with counts", () => {
  assert.match(source, /useState<RoomFilter>\("all"\)/);
  assert.doesNotMatch(source, /CountTabPills|FloorInServiceIcon|FloorOccupiedIcon/);
  assert.match(source, /<SectionWithDropdown[\s\S]*?onChange=\{setRoomFilter\}/);
  for (const label of ["All", "Active", "Maintenance", "Off"]) {
    assert.match(source, new RegExp(`count: [^,]+, label: "${label}"`));
  }
  assert.match(source, /\[activeFloor, roomFilter, selectedProperty\?\.id\]/, "changing filter still resets infinite scroll");
  assert.match(source, /roomFilter === "all"\s*\? "No rooms on this floor"/);
});

for (const occupiedCount of [0, 1, 2]) {
  for (const reservedCount of [0, 1, 2]) {
    test(`${occupiedCount} occupied and ${reservedCount} reserved beds have definite, separate messages`, () => {
      const notice = exported.notice({ occupiedCount, reservedCount });
      if (!occupiedCount && !reservedCount) {
        assert.equal(notice, null);
        return;
      }
      assert.equal(notice.title, occupiedCount > 0 ? "Room in use" : "Room is reserved");
      assert.doesNotMatch(notice.message, /occupied or reserved|in use\/reserved/);
      assert.doesNotMatch(notice.message, /\n/, "count and guidance stay in the same paragraph");
      assert.match(notice.message, /\. Room status can't be edited or changed /);
      assert.doesNotMatch(notice.message, /Release|Move|check out/);
      if (!occupiedCount) assert.ok(notice.message.endsWith("Room status can't be edited or changed during an active reservation."));
      if (!reservedCount) assert.ok(notice.message.endsWith("Room status can't be edited or changed while the room is in use."));
      if (occupiedCount && reservedCount) assert.ok(notice.message.endsWith("Room status can't be edited or changed while the room is in use or has an active reservation."));
      if (occupiedCount) assert.ok(notice.message.includes(`${occupiedCount} ${occupiedCount === 1 ? "bed is" : "beds are"} in use.`));
      if (reservedCount) assert.ok(notice.message.includes(`${reservedCount} ${reservedCount === 1 ? "bed is" : "beds are"} reserved.`));
      if (!occupiedCount) assert.doesNotMatch(notice.message, /tenants|check out/);
    });
  }
}

test("Add room matches Bulk add's outlined secondary button", () => {
  const buttons = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === "ActionButton"
      && node.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(parsed) === "label"
        && ["Add room", "Bulk add"].includes(prop.initializer?.text))) buttons.push(node.getText(parsed));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(buttons.length, 2);
  for (const button of buttons) assert.match(button, /variant="secondary"/);
});

test("Edit and Status keep blue content but match the Delete button's neutral border", () => {
  const card = declaration(parsed, "RoomCard");
  for (const label of ["Edit", "Status"]) {
    const button = card.match(new RegExp(`<ActionButton[^>]*label="${label}"[^>]*>`))?.[0];
    assert.ok(button, `${label} action is present`);
    assert.match(button, /borderColor=\{colors\.border\}/);
    assert.match(button, /variant="secondary"/);
  }
});

test("all In service and Occupied tiles use the theme's blue icons", () => {
  const tiles = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === "MetricTile"
      && node.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(parsed) === "label"
        && ["In service", "Occupied"].includes(prop.initializer?.text))) tiles.push(node.getText(parsed));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(tiles.length, 4);
  for (const tile of tiles) assert.match(tile, /iconTone="primary"/);
});

const queueSource = read("src/components/filtered-queue.tsx");
const queueParsed = ts.createSourceFile("queue.tsx", queueSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const jsx = (type, props) => ({ type, props });
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return tree && typeof tree === "object" ? [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)] : [];
}

for (const count of [1, 3, 40]) {
  test(`Choose floor uses the compact bottom-sheet picker for ${count} floors`, () => {
    const changes = [];
    const selected = [];
    const module = {};
    vm.runInNewContext(ts.transpileModule(`${declaration(parsed, "FloorSelector")}\nexports.FloorSelector = FloorSelector;`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports: module, useTheme: () => ({ colors: {}, fonts: {}, type: {} }),
      useState: () => [true, (value) => changes.push(value)],
      floorLabel: (floor) => `Floor ${floor}`, softShadow: () => ({}),
      View: "View", Text: "Text", Pressable: "Button", FitText: "FitText", PropertyArtwork: "Artwork", ChevronDown: "Down",
      SheetShell: "Sheet", PickerOptionRow: "Option", spacing: { xs: 4, sm: 8, md: 12 }, radii: { card: 10 },
      require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx, Fragment: "Fragment" }; },
    });
    const floors = Array.from({ length: count }, (_, index) => String(index + 1));
    const tree = module.FloorSelector({ active: "1", floors, onSelect: (floor) => selected.push(floor) });
    const sheet = nodes(tree, "Sheet")[0];
    assert.equal(sheet.props.title, "Choose floor");
    assert.equal(sheet.props.size, "content", "short lists hug their content; long lists scroll in the shared shell");
    assert.equal(sheet.props.showClose, true);
    assert.equal(sheet.props.closeButtonVariant, "circle", "shared close button uses the grey circular background");
    assert.equal(sheet.props.fullBleed, true, "the scrolling viewport reaches the sheet edges");
    const rows = nodes(sheet, "Option");
    assert.equal(rows.length, count);
    assert.equal(rows[0].props.selected, true);
    assert.ok(rows.every((row) => row.props.fullBleed === true), "selected floors fill the full sheet width");
    rows.at(-1).props.onPress();
    assert.deepEqual(selected, [floors.at(-1)]);
    assert.deepEqual(changes, [false]);
    sheet.props.onClose();
    assert.deepEqual(changes, [false, false]);
  });
}

test("full-width picker rows remove rounded insets but keep labels aligned with the sheet gutter", () => {
  const pickerSource = read("src/components/picker-option-row.tsx");
  const pickerParsed = ts.createSourceFile("picker.tsx", pickerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const module = {};
  vm.runInNewContext(ts.transpileModule(`${declaration(pickerParsed, "PickerOptionRow")}\nexports.Row = PickerOptionRow;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports: module, useTheme: () => ({ colors: { primarySoft: "blue" }, fonts: {}, type: {} }),
    AnimatedPressable: "Button", View: "View", Text: "Text", FitText: "FitText", spacing: { sm: 8, lg: 18 },
    require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx, Fragment: "Fragment" }; },
  });
  const wide = module.Row({ label: "Floor 1", selected: true, fullBleed: true });
  assert.equal(wide.props.style.backgroundColor, "blue");
  assert.equal(wide.props.style.marginHorizontal, -18);
  assert.equal(wide.props.style.paddingHorizontal, 18);
  assert.equal(wide.props.style.borderRadius, 0);
  const standard = module.Row({ label: "Unchanged picker", selected: true });
  assert.equal(standard.props.style.marginHorizontal, undefined);
  assert.equal(standard.props.style.paddingHorizontal, 8);
  assert.equal(standard.props.style.borderRadius, 10);
});

test("section dropdown preserves zero counts, marks the selected option and closes on selection", () => {
  const updates = [];
  const selection = [];
  const module = {};
  let hook = 0;
  vm.runInNewContext(ts.transpileModule(`${declaration(queueParsed, "SectionWithDropdown")}\nexports.Section = SectionWithDropdown;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports: module,
    useSoftShadow: () => () => ({}),
    useTheme: () => ({ colors: { muted: "grey" }, fonts: {} }),
    useState: () => [hook++ === 0 ? true : 0, (value) => updates.push(value)],
    useCallback: (fn) => fn, useHardwareBack: () => {},
    View: "View", Text: "Text", Pressable: "Pressable", AnimatedPressable: "Button",
    SectionHeading: "Heading", FilterBubble: "Filter", PickerOptionRow: "Option",
    StyleSheet: { absoluteFill: {} }, spacing: { xs: 4, sm: 8, md: 12 }, radii: { card: 10 },
    require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx, Fragment: "Fragment" }; },
  });
  const tree = module.Section({
    title: "Floor 1", purpose: "Filter", value: "all", onChange: (value) => selection.push(value),
    options: [
      { label: "All", value: "all", count: 5 },
      { label: "Maintenance", value: "maintenance", count: 0 },
    ],
    children: "rooms",
  });
  const rows = nodes(tree, "Option");
  assert.equal(rows[0].props.selected, true);
  assert.equal(rows[0].props.trailing.props.children, 5);
  assert.equal(rows[1].props.trailing.props.children, 0);
  assert.equal(nodes(tree, "Heading")[0].props.trailing.props.label, "All");
  rows[1].props.onPress();
  assert.deepEqual(selection, ["maintenance"]);
  assert.deepEqual(updates, [false]);
});
