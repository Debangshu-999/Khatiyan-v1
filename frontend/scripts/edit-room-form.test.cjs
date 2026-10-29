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
function nodes(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
const { RoomDraftRow, emptyDraft } = compile(read("src/features/property/room-draft-row.tsx"), {
  "react-native": { Text: "Text", View: "View" },
  "lucide-react-native": { ChevronDown: "Down", ChevronUp: "Up" },
  "@/components/delete-icon": { DeleteIcon: "Delete" },
  "@/components/animated-pressable": { AnimatedPressable: "Button" },
  "@/components/card": { Card: "Card" },
  "@/components/section-heading": { SectionHeading: "SectionHeading" },
  "@/components/fit-text": { FitText: "FitText" },
  "@/features/owner/owner-ui": { FormInput: "FormInput", formatMoneyPaise: String },
  "@/features/property/amenity-picker": { AmenityPicker: "AmenityPicker" },
  "@/features/property/floor": { FLOOR_PLACEHOLDER: "1", MAX_FLOOR_DIGITS: 3, sanitizeFloorInput: String },
  "@/features/property/mold-picker": { MoldPicker: "MoldPicker", moldLabel: () => "AC triple" },
  "@/theme/spacing": { spacing: { sm: 8, md: 12 } },
  "@/theme/use-theme": { useTheme: () => ({ colors: {}, fonts: {}, type: {} }) },
});
const props = {
  draft: emptyDraft({ moldId: "type", roomNumber: "102", floor: "1", rent: "10000" }),
  errors: { amenities: "Pick at least one amenity." }, expanded: true, index: 0,
  molds: [{ id: "type", conditioning: "AC", amenities: [], customAmenities: [] }],
  onChange() {}, onRemove() {}, onToggle() {}, removable: false, standalone: true,
};

test("Edit room uses Room type and Amenities bands, without a duplicate type label or changing its inputs", () => {
  const tree = RoomDraftRow({ ...props, headingBands: true });
  assert.equal(tree.props.children[0].props.title, "Room type");
  assert.equal(tree.props.children[0].props.trailingInline, true);
  assert.equal(tree.props.children[1].type, "Card");
  const amenities = tree.props.children[2];
  assert.equal(amenities.type, "AmenityPicker");
  assert.equal(amenities.props.headingBand, true);
  assert.equal(amenities.props.error, props.errors.amenities);
  assert.equal(nodes(tree, "MoldPicker")[0].props.hideLabel, true);
  assert.deepEqual(nodes(tree, "FormInput").map((input) => input.props.label), ["Prefix", "Room number", "Floor", "Rent per bed"]);
  assert.match(read("app/owner-edit-room.tsx"), /<RoomDraftRow[\s\S]*?expanded\s+headingBands/);
});

test("Add room and bulk room forms retain their existing headings and layout", () => {
  const tree = RoomDraftRow(props);
  assert.equal(tree.type, "Card");
  assert.equal(nodes(tree, "SectionHeading").length, 0);
  assert.equal(nodes(tree, "MoldPicker")[0].props.hideLabel, false);
  assert.equal(nodes(tree, "AmenityPicker")[0].props.headingBand, false);
});

const screen = ts.createSourceFile("edit-room.tsx", read("app/owner-edit-room.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = screen.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "OwnerEditRoomScreen");
const submit = component.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "submit");
for (const [amenities, customAmenities, valid] of [
  [[], [], false], [["ATTACHED_TOILET"], [], false], [["COMMON_TOILET"], [], false],
  [["CUPBOARD"], [], true], [["COMMON_TOILET"], ["Kettle"], true],
]) {
  test(`Edit room requires a non-fixed amenity: ${JSON.stringify({ amenities, customAmenities })}`, async () => {
    let errors;
    const { submit: save } = compile(`${submit.getText(screen)}\nexports.submit = submit;`, {}, {
      propertyId: "property", room: {}, seeded: { ...props.draft, amenities, customAmenities },
      rupeesToPaise: () => 1000000, setErrors: (next) => { errors = next; }, live: [],
    });
    await save();
    assert.equal(errors.amenities, valid ? undefined : "Pick at least one amenity.");
  });
}

test("the missing-item message links directly to Item catalogue & Damages, with consistent screen and workspace names", () => {
  const source = read("src/features/property/amenity-picker.tsx");
  const parsed = ts.createSourceFile("picker.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const picker = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AmenityPicker");
  const destinations = [];
  const { AmenityPicker } = compile(`${picker.getText(parsed)}\nexports.AmenityPicker = AmenityPicker;`, {}, {
    useTheme: () => ({ colors: {}, fonts: {}, type: {} }),
    useRouter: () => ({ push: (route) => destinations.push(route) }),
    useAppSelector: () => "property",
    useListMyPropertiesQuery: () => ({ data: [{ id: "property", bathroomType: "COMMON" }] }),
    useGetPropertyExitPoliciesQuery: () => ({ data: { damageCharges: [] } }),
    AMENITY_LABELS: {}, View: "View", Text: "Text", Info: "Info", AmenityCell: "AmenityCell",
    ItemIcon: "ItemIcon", SectionHeading: "SectionHeading", spacing: {},
  });
  const tree = AmenityPicker({ amenities: [], customAmenities: [], conditioning: "AC", onChangeAmenities() {}, onChangeCustom() {} });
  const link = nodes(tree, "Text").find((node) => node.props.accessibilityRole === "link");
  assert.equal(link.props.children, "Item catalogue & Damages");
  link.props.onPress();
  assert.deepEqual(destinations, ["/owner-exit-policies"]);
  assert.doesNotMatch(source, /Add it under Property/);
  assert.match(read("app/owner-property.tsx"), /title="Item catalogue & Damages"/);
  assert.match(read("app/owner-exit-policies.tsx"), /italicTail="catalogue & Damages\."/);
});

test("the property identity is centered, grey ID and yellow type separated by a dot, with an ink-outline edit button", () => {
  const source = read("app/owner-property.tsx");
  assert.match(source, /justifyContent: "center" \}\}>\s*<View style=\{\{ backgroundColor: colors\.neutralSoft[^]*?selectedProperty\.referenceCode/);
  assert.match(source, /<Text[^>]*>·<\/Text>\s*<View style=\{\{ backgroundColor: colors\.warningSoft[^]*?humanizeToken\(selectedProperty\.type\)/);
  const parsed = ts.createSourceFile("property.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let editButton;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === "ActionButton" && node.attributes.properties.some(
      (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(parsed) === "label" && attribute.initializer?.text === "Edit property",
    )) editButton = node;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const attributes = Object.fromEntries(editButton.attributes.properties.map((attribute) => [attribute.name.getText(parsed), attribute.initializer?.getText(parsed)]));
  assert.equal(attributes.borderColor, "{canManageSettings ? colors.ink : colors.borderStrong}");
  assert.equal(attributes.variant, '"neutral"');
});
