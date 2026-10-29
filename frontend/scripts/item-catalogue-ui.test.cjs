const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
function compile(source, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, ...globals, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    assert.ok(name in dependencies, name);
    return dependencies[name];
  } });
  return exports;
}
const vectors = compile(read("src/features/property/room-amenity-icons.tsx"), {
  "react-native-svg": { __esModule: true, default: "Svg", Circle: "Circle", Ellipse: "Ellipse", Line: "Line", Path: "Path", Rect: "Rect" },
});
const icons = compile(read("src/features/property/item-icon.tsx"), {
  "@expo/vector-icons": { MaterialCommunityIcons: "MaterialIcon" },
  "lucide-react-native": { AirVent: "AirVent", Fan: "Fan" },
  "@/features/property/room-amenity-icons": vectors,
});

test("cupboard names never match a drinking cup and use the existing cupboard vector", () => {
  for (const name of ["Cupboard", "Wooden cupboard", "Wardrobe", "Almirah", "Closet"]) {
    assert.equal(icons.itemIconName(name), "wardrobe-outline");
    assert.equal(icons.ItemIcon({ name, color: "#333", size: 20 }).type, vectors.CupboardIcon);
  }
});

test("bathroom mugs have an open rim and a visible right-hand loop handle", () => {
  const icon = icons.ItemIcon({ name: "Mug", color: "#333", size: 20 });
  assert.equal(icon.type, vectors.MugIcon);
  const drawing = icon.type(icon.props);
  assert.ok(drawing.props.children.some((part) => part.type === "Ellipse"));
  assert.ok(drawing.props.children.some((part) => part.type === "Path" && part.props.d === "M16 8h2a4 4 0 0 1 0 8h-2"));
  assert.equal(icons.ItemIcon({ name: "Glass", color: "#333" }).props.name, "cup-outline");
});

const policies = read("app/owner-exit-policies.tsx");
const parsed = ts.createSourceFile("policies.tsx", policies, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const editor = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "DamageChargesEditor");
const { DamageChargesEditor } = compile(`${editor.getText(parsed)}\nexports.DamageChargesEditor = DamageChargesEditor;`, {}, {
  useTheme: () => ({ colors: { border: "#ddd", muted: "#777" }, fonts: {}, type: { caption: {} } }),
  useState: () => [null, () => {}], spacing: { sm: 8, md: 12 },
  View: "View", Text: "Text", CategoryCard: "CategoryCard", DamageItemRow: "DamageItemRow",
  ItemIcon: "ItemIcon", Info: "Info", AnimatedPressable: "Button", Trash2: "Trash",
  CATEGORY_HEADINGS: { ROOM: { title: "Room", tail: "items" } },
});

for (const count of [0, 2]) {
  test(`common toilet note follows all ${count} items, with a divider only when there are items`, () => {
    const root = DamageChargesEditor({ attached: false, charges: [], onChange() {}, readOnly: true,
      roomItems: ["Bucket", "Mug"].slice(0, count).map((name) => ({ name, category: "COMMON_TOILET" })),
    });
    const common = root.props.children[0].find((card) => card.props.title === "Common");
    const [items, footer] = common.props.children;
    assert.equal(items.length, count);
    const [info, text] = footer.props.children;
    assert.equal(info.type, "Info");
    assert.equal(text.props.children, "Shared by everyone here, so nothing in it is charged to one tenant.");
    assert.equal(footer.props.style.borderTopWidth, count > 0 ? 1 : 0);
    assert.equal(footer.props.style.paddingTop, count > 0 ? 8 : 0);
  });
}

function amenityStrip() {
  let expanded = false;
  return compile(read("src/features/property/room-amenity-strip.tsx"), {
    react: {
      useState: (initial) => typeof initial === "boolean" ? [expanded, (next) => { expanded = next(expanded); }] : [initial, () => {}],
      useRef: () => ({ current: null }), useEffect() {},
    },
    "react-native": { Text: "Text", View: "View", Modal: "Modal", Pressable: "Pressable", useWindowDimensions: () => ({ width: 390, height: 844 }) },
    "@/components/animated-pressable": { AnimatedPressable: "Button" },
    "@/features/property/item-icon": { ItemIcon: "ItemIcon" },
    "@/features/property/room-amenity-icons": { ROOM_AMENITY_ICONS: Object.fromEntries(
      ["CUPBOARD", "ATTACHED_TOILET", "TV", "GEYSER", "BEDDING", "COMMON_TOILET"].map((name) => [name, name]),
    ) },
    "@/store/services/property-api": { ROOM_AMENITIES: ["CUPBOARD", "ATTACHED_TOILET", "TV", "GEYSER", "BEDDING"] },
    "@/theme/spacing": { spacing: { xs: 4, sm: 8 } },
    "@/theme/shadows": { softShadow: () => ({}) },
    "@/theme/use-theme": { useTheme: () => ({ colors: {}, fonts: {}, type: {} }) },
  }).RoomAmenityStrip;
}

test("room cards omit unallotted amenities, including faded no icons", () => {
  const Strip = amenityStrip();
  const tree = Strip({ amenities: ["TV", "CUPBOARD", "COMMON_TOILET"], custom: [], tiles: true });
  const glyphs = tree.props.children[0];
  assert.deepEqual(Array.from(glyphs, (glyph) => glyph.props.label), ["Cupboard", "TV", "Common toilet"]);
  for (const glyph of glyphs) {
    const trigger = glyph.type(glyph.props).props.children[0].props.children[0];
    assert.equal(trigger.props.accessibilityLabel, glyph.props.label);
    assert.equal(trigger.props.accessibilityRole, "button");
    assert.equal(trigger.props.accessibilityHint, "Show amenity name");
  }
  assert.equal(tree.props.children[2], null);
  assert.equal(Strip({ amenities: [], custom: [] }), null);
});

test("+n expands every additional allotted item and can collapse again", () => {
  const Strip = amenityStrip();
  const props = { amenities: ["GEYSER"], custom: ["Study table", "Kettle"], tiles: true };
  let tree = Strip(props);
  assert.equal(tree.props.children[1], null);
  let button = tree.props.children[2];
  assert.equal(button.props.children.props.children, "+2");
  assert.equal(button.props.accessibilityState.expanded, false);
  button.props.onPress();
  tree = Strip(props);
  assert.deepEqual(Array.from(tree.props.children[1], (item) => item.props.label), props.custom);
  for (const item of tree.props.children[1]) {
    assert.equal(item.props.children.type, "ItemIcon");
    assert.equal(item.props.children.props.name, item.props.label);
    assert.equal(item.props.tiles, true);
  }
  button = tree.props.children[2];
  assert.equal(button.props.children.props.children, "Show less");
  assert.equal(button.props.accessibilityState.expanded, true);
  button.props.onPress();
  assert.equal(Strip(props).props.children[1], null);
});

for (const [x, y, label] of [[40, 200, "Geyser"], [330, 20, "Cupboard"], [150, 500, "Attached toilet"]]) {
  test(`${label} has independent tooltip width and stays anchored at ${x},${y}`, () => {
    const source = read("src/features/property/room-amenity-strip.tsx");
    const parsed = ts.createSourceFile("strip.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const glyph = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Glyph");
    const states = [];
    let slot = 0;
    const { Glyph } = compile(`${glyph.getText(parsed)}\nexports.Glyph = Glyph;`, {}, {
      useTheme: () => ({ colors: {}, fonts: {} }), useWindowDimensions: () => ({ width: 390, height: 844 }),
      useRef: () => ({ current: { measureInWindow: (callback) => callback(x, y, 38, 38) } }),
      useEffect() {}, useState: (initial) => {
        const at = slot++;
        if (!(at in states)) states[at] = initial;
        return [states[at], (next) => { states[at] = typeof next === "function" ? next(states[at]) : next; }];
      },
      View: "View", Text: "Text", Modal: "Modal", Pressable: "Backdrop", AnimatedPressable: "Button",
      softShadow: () => ({}), spacing: { md: 12, sm: 8 },
    });
    const render = () => { slot = 0; return Glyph({ children: "icon", label, tiles: true }); };
    render().props.children[0].props.children[0].props.onPress();
    let modal = render().props.children[1];
    assert.equal(modal.type, "Modal");
    render().props.children[0].props.children[1].props.children.props.onLayout({ nativeEvent: { layout: { width: 120, height: 38 } } });
    const tree = render();
    modal = tree.props.children[1];
    const frame = tree.props.children[0].props.children[1];
    const card = frame.props.children;
    assert.equal(card.props.children[0].props.children, label);
    assert.equal(card.props.style.opacity, 1);
    assert.equal(frame.props.style.width, 240, "the layout width must not inherit the 38px icon width");
    assert.equal(frame.props.style.alignItems, "flex-start");
    assert.equal(card.props.style.alignSelf, "flex-start");
    assert.equal(card.props.style.maxWidth, "100%");
    assert.ok(x + frame.props.style.left >= 16 && x + frame.props.style.left + 120 <= 374);
    assert.equal(y === 20 ? frame.props.style.top : frame.props.style.bottom, 48);
    assert.equal(card.props.children[1].props.style.transform[0].rotate, "45deg");
    assert.equal(modal.props.children.type, "Backdrop");
    modal.props.children.props.onPress();
    assert.equal(render().props.children[1], null);
  });
}
