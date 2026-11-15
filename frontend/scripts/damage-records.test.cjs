const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const sheet = read("src/features/damage/record-damage-sheet.tsx");
const detail = read("src/features/damage/damage-record-detail-sheet.tsx");
const damages = read("app/owner-damages.tsx");
const tenant = read("src/features/damage/tenant-damage-records.tsx");
const api = read("src/store/services/damage-api.ts");

test("damage cards use the tenancy-style labelled Room, Tenant and Recorded columns without squeezing the metadata into a sentence", () => {
  const exports = {};
  const dependencies = {
    "react-native": { Image: "Image", Text: "Text", View: "View" },
    "@/components/animated-pressable": { AnimatedPressable: "Button" },
    "@/components/fit-text": { FitText: "Text" },
    "@/components/image-carousel": { ImageCarousel: "Carousel" },
    "@/features/owner/owner-ui": { formatMoneyPaise: (value) => `₹${value / 100}` },
    "@/features/property/item-icon": { ItemIcon: "Icon" },
    "@/features/tenancy/damage-level": { DamageLevelPill: "Level" },
    "@/lib/person-name": { cardName: (name) => name },
    "@/store/hooks": { useAppSelector: (select) => select({ auth: { user: { id: "viewer" } } }) },
    "@/theme/spacing": { radii: { card: 10 }, spacing: { xxs: 4, xs: 6, sm: 10, md: 14, lg: 18 } },
    "@/theme/use-theme": { useTheme: () => ({ colors: { border: "grey", muted: "muted", ink: "black" }, fonts: { sansBold: "Bold" }, type: { caption: {} } }) },
    "@/theme/shadows": { useSoftShadow: () => () => ({}), cardShadow: () => ({}) },
    // The card's arrow pill (2026-11-14).
    "lucide-react-native": { ChevronRight: "ChevronRight" },
  };
  const code = ts.transpileModule(read("src/features/damage/damage-record-card.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    assert.ok(name in dependencies, name); return dependencies[name];
  } });
  function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (!tree || typeof tree !== "object") return [];
    if (typeof tree.type === "function") return nodes(tree.type(tree.props));
    return [tree, ...nodes(tree.props?.children)];
  }
  const base = { itemName: "TV", damageLevel: "D2", code: "DMG-1", roomLabel: "204", createdAt: "2026-10-29T10:00:00Z",
    responsibility: "TENANT", shares: [{ tenantName: "A long tenant name", amountPaise: 100 }], charged: false, costPaise: 100 };
  const rendered = (record) => nodes(exports.DamageRecordCard({ record, onPress() {}, children: { type: "Actions", props: {} } }));
  let tree = rendered(base);
  const itemName = tree.find((node) => node.type === "Text" && node.props.children === "TV");
  assert.equal(itemName.props.style.transform[0].translateY, -2, "Raise the item name slightly without moving the record code or icon");
  const metrics = tree.filter((node) => node.type === "View" && node.props.style?.gap === 3 && node.props.style?.minWidth === 0);
  assert.equal(metrics.length, 3);
  assert.deepEqual(metrics.map((node) => node.props.children[0].props.children), ["Room", "Tenant", "Recorded"]);
  assert.deepEqual(metrics.map((node) => node.props.children[1].props.children), ["204", "A long tenant name", "29 Oct"]);
  assert.ok(metrics.every((node) => node.props.children[1].props.numberOfLines === 2 && node.props.children[1].props.style.fontSize === 12));
  assert.equal(tree.filter((node) => node.props?.style?.width === 1).length, 2, "Two vertical dividers, as on tenancy cards");
  const content = tree.find((node) => node.type === "Button").props.children;
  const metadata = content[1];
  assert.equal(metadata.props.children[0].props.style.flexDirection, "row");
  assert.equal(metadata.props.children[1].props.style.height, 1, "The horizontal rule sits below the details row, not above it");
  assert.equal(metadata.props.style.marginBottom, undefined, "Do not double the spacing before the amount");
  assert.equal(tree.filter((node) => node.type === "Actions").length, 1, "Leave repair actions intact");
  assert.ok(tree.some((node) => node.props?.children === "Amount"));
  const amount = tree.find((node) => node.props?.children === "₹1");
  assert.equal(amount.props.style.fontSize, 20);
  assert.equal(amount.props.style.lineHeight, 26);
  assert.deepEqual(Array.from(amount.props.style.fontVariant), ["tabular-nums"]);
  assert.equal(amount.props.numberOfLines, 1);
  assert.equal(amount.props.minimumFontScale, 0.8, "Large amounts can fit beside the billing status");
  assert.ok(!tree.some((node) => typeof node.props?.children === "string" && node.props.children.includes(" | ")));
  // A split is a record per tenant (user, 2026-10-31): it names its number and its one tenant.
  tree = rendered({ ...base, responsibility: "SPLIT", splitNumber: 2 });
  assert.ok(tree.some((node) => typeof node.props?.children === "string" && node.props.children.endsWith(", split 2")));
  assert.ok(tree.some((node) => node.props?.children === "Tenant"));
  assert.ok(!tree.some((node) => typeof node.props?.children === "string" && / each\)$|^Split by /.test(node.props.children)));
  tree = rendered({ ...base, roomLabel: null, responsibility: "NONE", source: "MOVE_IN" });
  assert.ok(tree.some((node) => node.props?.children === "Unavailable"));
  assert.ok(tree.some((node) => node.props?.children === "Responsibility"));
  assert.ok(tree.some((node) => node.props?.children === "Found at move-in"));
  assert.ok(!tree.some((node) => node.props?.children === "Amount"), "Do not introduce a charge for unassigned move-in damage");
});

test("repair history reuses the damage card and preserves its outcome, repairer, note and photos", () => {
  const card = read("src/features/damage/damage-record-card.tsx");
  const source = ts.createSourceFile("card.tsx", card, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "DamageRepairHistoryCard");
  const code = ts.transpileModule(fn.getText(source), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code, { exports,
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
    useTheme: () => ({ colors: {}, fonts: {}, type: {} }), DamageRecordCard: "DamageCard", DamageRecordMetric: "Metric", DamageRecordMetricDivider: "Divider", DamageLevelPill: "Level",
    useAppSelector: (select) => select({ auth: { user: { id: "viewer" } } }),
    View: "View", Text: "Text", ImageCarousel: "Carousel", spacing: { xs: 6, sm: 10, md: 14 }, radii: { card: 10 },
    dayMonth: () => "30 Oct", cardName: (name) => name,
  });
  const base = { id: "d1", itemName: "TV", status: "REPAIRED", damageLevel: "D3", repairedLevel: "D1",
    repairedAt: "2026-10-30T10:00:00Z", repairedByUserId: "other", repairedByName: "Jane Smith", repairNote: "Screen fixed", repairPhotoUrls: ["first", "second"] };
  const render = (record) => exports.DamageRepairHistoryCard({ record });
  const historyCard = render(base);
  assert.equal(historyCard.type, "DamageCard", "Use the same item header, code, metadata, amount and shadow as the open list");
  assert.equal(historyCard.props.record, base);
  assert.equal(historyCard.props.onPress, undefined, "Keep history read-only rather than adding new record actions");
  const footer = historyCard.props.children;
  assert.equal(footer.props.style.borderTopWidth, 1);
  const [evidence, row, doneBy] = footer.props.children;
  assert.equal(evidence.props.style.flexDirection, "row");
  const [photo, note] = evidence.props.children;
  assert.equal(photo.props.style.width, 112);
  assert.equal(photo.props.children.type, "Carousel");
  assert.equal(photo.props.children.props.height, 105);
  assert.deepEqual(Array.from(photo.props.children.props.images), ["first", "second"]);
  assert.equal(note.props.style.minHeight, 105);
  assert.equal(note.props.style.flex, 1);
  assert.equal(note.props.style.minWidth, 0, "Long notes wrap beside the photo instead of pushing it offscreen");
  assert.equal(note.props.children[0].props.style.top, -9);
  assert.equal(note.props.children[0].props.children[2].props.children, "Fix notes");
  assert.equal(note.props.children[1].props.children, "Screen fixed");
  assert.equal(note.props.children[1].props.selectable, false);
  const values = (row) => Array.from(row.props.children).filter((node) => node.type === "Metric").map((node) => [node.props.label, typeof node.props.value === "string" ? node.props.value : node.props.value.props.level]);
  assert.deepEqual(values(row), [["Action", "Repaired"], ["New level", "D1"], ["Date", "30 Oct"]]);
  assert.equal(row.props.children[2].props.value.type, "Level", "Render the shared colored damage-level pill, not plain text");
  assert.equal(Array.from(doneBy.props.children).join(""), "Done by: Jane Smith");
  const self = render({ ...base, repairedByUserId: "viewer", repairedByName: "Jane Smith" }).props.children.props.children[2];
  assert.equal(Array.from(self.props.children).join(""), "Done by: Self", "Use the actual repairer's ID, not a same-name comparison");
  const replaced = render({ ...base, status: "REPLACED", repairedLevel: null, repairedAt: null, repairedByUserId: null, repairedByName: null, repairNote: null, repairPhotoUrls: [] }).props.children.props.children;
  assert.equal(replaced[0], null, "Missing photos and notes do not reserve an empty evidence row");
  assert.deepEqual(values(replaced[1]), [["Action", "Replaced"], ["New level", "NA"], ["Date", "—"]]);
  assert.equal(Array.from(replaced[2].props.children).join(""), "Done by: —");
  assert.match(damages, /history\.map\(\(record\) => \(\s*<DamageRepairHistoryCard key=\{record\.id\} record=\{record\} \/>/);
});

test("recording a damage: four parts, the room by floor, one level label, the cost from the catalogue", () => {
  // Each part titled with lines between, no subheading bands or boxes (user, 2026-11-07).
  for (const band of ["Room & item", "The damage", "Who is responsible", "Photos & notes"]) {
    assert.match(sheet, new RegExp(`<FormCard (first )?title="${band}">`));
  }
  assert.doesNotMatch(sheet, /<SectionHeading/);
  // Floors fold open one at a time, and the level list pushes the form down.
  assert.match(sheet, /const expanded = floor === shownFloor;/);
  assert.match(sheet, /onPress=\{\(\) => setOpenFloor\(expanded \? CLOSED_ALL : floor\)\}/);
  assert.match(sheet, /<DamageLevelDropdown[\s\S]*?\binline\b/);
  // The room by floor, in building order, its rooms in number order.
  assert.match(sheet, /function RoomByFloorField\(/);
  assert.match(sheet, /\.sort\(\(\[left\], \[right\]\) => compareFloors\(left, right\)\)/);
  assert.match(sheet, /localeCompare\(b\.roomNumber, undefined, \{ numeric: true \}\)/);
  // One label on the level, its own, and only D1 to D3 offered.
  assert.match(sheet, /<DamageLevelDropdown\s+label="New damage level"/);
  // D1 to D3, never the level the item is already at on a new record, nothing picked to start (user, 2026-11-07).
  // Levels are price tiers only (user, 2026-11-07): asked only for an item priced at more than one.
  assert.match(sheet, /const asksLevel = Boolean\(record\?\.damageLevel\) \|\| tiers\.length > 1;/);
  assert.match(sheet, /const levelOptions = tiers\.length > 1 \? tiers : DAMAGE_OPTIONS;/);
  assert.match(sheet, /options=\{levelOptions\}/);
  assert.match(sheet, /useState<DamageLevel \| null>\(record\?\.damageLevel \?\? null\)/);
  assert.match(sheet, /level: !asksLevel \|\| level \? undefined : "Pick a level"/);
  assert.match(sheet, /damageLevel: asksLevel \? level : null,/);
  // One open damage per item: the cost locks and Save and Charge now wait for the fix (user, 2026-11-07).
  assert.doesNotMatch(sheet, /blockedReason|"Broken"|graded/);
  assert.match(sheet, /\$\{openOnItem\} is still open for \$\{itemName\}\. Mark it repaired or replaced before recording a new damage\./);
  assert.match(sheet, /const blockedByOpen = openOnItem !== null;/);
  assert.match(sheet, /editable=\{!blockedByOpen\}/);
  assert.match(sheet, /disabled=\{busy \|\| blockedByOpen\} label="Charge now"/);
  // The catalogue fills the cost on every item or level change, still editable.
  assert.match(sheet, /if \(price\) \{\s+setCost\(String\(Math\.round\(price \/ 100\)\)\);/);
  assert.doesNotMatch(sheet, /DamageLevelInfo/);
  assert.match(sheet, /function catalogueCost\(/);
  assert.match(sheet, /prefix="₹"/);
  // A split only where two or more live in the room.
  assert.match(sheet, /tenants\.length >= 2 \? \(/);
  assert.match(sheet, /label=\{`Split equally between \$\{tenants\.length\}`\}/);
  assert.match(sheet, /max=\{3\}/);
  // Charge now records, then charges the record it got back.
  assert.match(sheet, /chargeNow,\s+\};/);
  // Save and Charge now pinned under the form, no line under them (user, 2026-10-29).
  assert.match(sheet, /footer=\{/);
  assert.doesNotMatch(sheet, /<Text[^>]*>Save keeps it for exit/);
});

test("damage details use a non-selectable note and an Amount/status row without repeating the tenant name", () => {
  const source = ts.createSourceFile("detail.tsx", detail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ["billPill", "DamageNote", "DamageShareRow"].map((name) => {
    const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(node, name); return node.getText(source);
  });
  const code = ts.transpileModule(`${functions.join("\n")}\nexports.Note = DamageNote; exports.Row = DamageShareRow;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Text: "Text", View: "View", FitText: "FitText", StatePill: "Pill", AnimatedPressable: "Button", ReceiptText: "Receipt",
    spacing: { xs: 6, sm: 10, md: 14 }, radii: { card: 10 }, cardName: (name) => name, formatMoneyPaise: (amount) => `₹${amount / 100}`,
    useTheme: () => ({ colors: { border: "grey", surface: "white", surfaceSunken: "sunken" }, fonts: {}, type: { description: { fontSize: 12, lineHeight: 16 } } }),
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }; },
  });
  const note = exports.Note({ note: "A long damage note\nwith a second line" });
  assert.equal(note.props.style.borderWidth, 1.5);
  const [label, text] = note.props.children;
  assert.equal(label.props.style.position, "absolute");
  assert.equal(label.props.style.top, -9, "Label straddles the upper box boundary");
  assert.equal(label.props.children[2].props.children, "Damage note");
  assert.equal(text.props.children, "A long damage note\nwith a second line");
  assert.equal(text.props.selectable, false);
  assert.equal(text.props.style[0].fontSize, 12);

  const base = { tenancyId: "t1", tenantName: "Jane Smith", amountPaise: 120000, billId: null, billCode: null, billStatus: null };
  const render = (share) => exports.Row({ share });
  const empty = render(base);
  assert.equal(empty.props.style.borderWidth, 1);
  assert.equal(empty.props.children.props.style.flexDirection, "row");
  const cells = empty.props.children.props.children;
  assert.equal(cells.length, 3);
  assert.equal(cells[0].props.children, "Amount:");
  assert.equal(cells[1].props.children, "₹1200");
  assert.equal(cells[1].props.style.flex, 1);
  assert.equal(cells[1].props.selectable, false);
  assert.equal(cells[2].props.style.alignItems, "flex-end");
  assert.equal(cells[2].props.children.props.label, "No bill");
  assert.ok(!JSON.stringify(cells).includes("Jane Smith"), "The Responsible row already identifies the tenant");
  for (const [billStatus, label] of [["PAID", "Paid"], ["UNPAID", "Unpaid"]]) {
    const row = render({ ...base, billId: "b1", billCode: "BIL-2026-000286", billStatus });
    assert.equal(row.props.children.props.children[2].props.children.props.label, label);
    assert.ok(!JSON.stringify(row).includes("View bill"), "View bill belongs in the footer, not below the amount");
  }
  assert.equal(render({ ...base, billId: "old", billStatus: "CANCELLED" }).props.children.props.children[2].props.children.props.label, "No bill");
});

test("a record's actions follow its money: locked once paid, delete asks first", () => {
  assert.match(detail, /const changeable = canManage && !record\.locked && record\.status === "OPEN";/);
  assert.match(detail, /const chargeable = canManage && record\.responsibility !== "NONE" && !record\.charged;/);
  assert.match(detail, /<ConfirmDialog/);
  assert.match(detail, /title="Delete this damage record\?"/);
  assert.doesNotMatch(detail, /Alert\.alert/);
  assert.match(detail, /headerRight=\{changeable \?/);
  assert.doesNotMatch(detail, /<ActionButton icon=\{Pencil\} label="Edit"/);
});

test("editing billed damage pins a blue notice above the filled blue Save button", () => {
  const source = ts.createSourceFile("record.tsx", sheet, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let footer;
  function locate(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "SheetShell") {
      footer = node.attributes.properties.find((attr) => attr.name?.text === "footer")?.initializer?.expression;
    }
    ts.forEachChild(node, locate);
  }
  locate(source);
  assert.ok(footer);
  const elements = [];
  function collect(node) {
    if (ts.isJsxSelfClosingElement(node)) elements.push(node);
    ts.forEachChild(node, collect);
  }
  collect(footer);
  const attributes = (node) => Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map((attr) => [attr.name.getText(source), attr.initializer]));
  const notice = elements.find((node) => node.tagName.getText(source) === "NoticeBar");
  const info = attributes(notice);
  assert.equal(info.tone.text, "info");
  assert.equal(info.selectable.expression.kind, ts.SyntaxKind.FalseKeyword);
  assert.match(info.message.text, /Changing the cost, level or who is responsible cancels its unpaid bill/);
  const save = elements.find((node) => node.tagName.getText(source) === "ActionButton" && attributes(node).label?.getText(source).includes('"Save"'));
  assert.equal(attributes(save).variant.text, "primary");
  assert.ok(notice.pos < save.pos, "The notice stays above Save in the pinned footer");
  assert.equal((sheet.match(/Changing the cost, level or who is responsible/g) ?? []).length, 1, "Do not repeat the message inside the scrolling form");
});

test("damage Edit sits beside the title; Delete and Charge now share a row and keep their permission guards", () => {
  const source = ts.createSourceFile("detail.tsx", detail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "DamageRecordDetailSheet");
  const compiled = ts.transpileModule(fn.getText(source), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const stateChanges = [];
  vm.runInNewContext(compiled, { exports,
    require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
    useState: (initial) => [initial, (value) => stateChanges.push(value)], useTheme: () => ({ colors: {}, fonts: {}, type: {} }), useToast: () => ({}),
    useAppSelector: (select) => select({ auth: { user: { id: "viewer" } } }), cardName: (name) => name,
    useChargeDamageRecordMutation: () => [() => {}, { isLoading: false }], useDeleteDamageRecordMutation: () => [() => {}, { isLoading: false }],
    damageBillState: () => ({ label: "Not charged", tone: "muted" }), damageResponsible: () => "Jane Smith", damageRecordName: (record) => record.itemName, dayMonth: () => "29 Oct",
    SheetShell: "Sheet", View: "View", Text: "Text", FitText: "Text", AnimatedPressable: "Button", Pencil: "Pencil", Receipt: "Receipt", ReceiptText: "ReceiptText", RemoveIcon: "Remove",
    ActionButton: "Action", ItemIcon: "Item", DamageLevelPill: "Level", StatePill: "Pill", DamageShareRow: "Share", DamageNote: "Note", ImageCarousel: "Carousel",
    spacing: { xs: 6, sm: 10, md: 14 }, radii: { card: 10 },
  });
  const record = { id: "damage", code: "DMG-2026-000001", status: "OPEN", locked: false, responsibility: "TENANT", charged: false,
    shares: [{ tenantName: "Jane Smith" }], photoUrls: [], createdAt: "2026-10-29", itemName: "TV" };
  let edited = 0;
  const render = (more = {}) => exports.DamageRecordDetailSheet({ canManage: true, record, propertyId: "property", onEdit: () => edited++, ...more });
  const sheet = render();
  assert.equal(sheet.props.title, record.code);
  const edit = sheet.props.headerRight;
  assert.equal(edit.props.accessibilityRole, "button");
  assert.equal(edit.props.children[0].type, "Pencil");
  assert.equal(edit.props.children[1].props.children, "Edit");
  assert.equal(edit.props.style.minHeight, 32);
  assert.ok(edit.props.style.minHeight + edit.props.hitSlop * 2 >= 44);
  assert.equal(edit.props.style.borderWidth, 1);
  assert.equal(sheet.props.size, "content", "Do not reserve a fixed-height empty scroll area on native");
  assert.equal(sheet.props.contentMaxSize, "tall", "Still allow enough room to avoid scrolling normal records");
  assert.equal(sheet.props.footerSpacing, 6, "A small gap separates the amount row from the paired footer actions");
  edit.props.onPress();
  assert.equal(edited, 1);
  const body = render({ record: { ...record, createdByUserId: "viewer", createdByName: "Viewer", photoUrls: ["first", "second"], note: "Damage description" } }).props.children[0].props.children;
  const photoAndNote = body[1];
  assert.equal(photoAndNote.props.style.flexDirection, "row");
  const carousel = photoAndNote.props.children[0].props.children;
  assert.equal(carousel.type, "Carousel");
  assert.equal(carousel.props.height, 105);
  assert.deepEqual(Array.from(carousel.props.images), ["first", "second"]);
  assert.equal(photoAndNote.props.children[1].props.children.type, "Note");
  assert.equal(photoAndNote.props.children[1].props.children.props.minHeight, 105);
  assert.equal(body[2].props.children[0].props.children[0].props.children, "Room", "Metadata follows the photo and note row");
  assert.equal(Array.from(body[3].props.children).join(""), "Recorded by: Self");
  const other = render({ record: { ...record, createdByUserId: "other", createdByName: "Someone else" } }).props.children[0].props.children;
  assert.equal(Array.from(other[3].props.children).join(""), "Recorded by: Someone else");
  const footer = sheet.props.footer;
  assert.equal(footer.props.style.flexDirection, "row");
  assert.deepEqual(Array.from(footer.props.children).filter(Boolean).map((button) => button.props.label), ["Delete", "Charge now"]);
  assert.equal(footer.props.children[0].props.variant, "dangerFilled");
  assert.equal(render({ record: { ...record, charged: true } }).props.footer.props.children[1], null, "Never charge an already billed record again");
  const share = { tenancyId: "tenant", tenantName: "Jane Smith", billId: "bill", billStatus: "UNPAID" };
  const billed = { ...record, charged: true, shares: [share] };
  const billButtons = Array.from(render({ record: billed }).props.footer.props.children).filter(Boolean);
  assert.deepEqual(billButtons.map((button) => button.props.label), ["Delete", "View bill"]);
  assert.equal(billButtons[1].props.variant, "secondary", "The shared secondary button is white with blue text and border");
  billButtons[1].props.onPress();
  assert.equal(stateChanges.at(-1), share);
  const split = render({ record: { ...billed, shares: [share, { ...share, tenancyId: "other", billId: "other-bill" }] } });
  const viewBills = split.props.footer.props.children[2];
  assert.equal(viewBills.props.label, "View bills");
  viewBills.props.onPress();
  assert.equal(stateChanges.at(-1), true, "Split damage lets the viewer choose their bill rather than silently selecting someone else's");
  const viewOnly = Array.from(render({ record: billed, canManage: false }).props.footer.props.children).filter(Boolean);
  assert.equal(viewOnly.length, 1);
  assert.equal(viewOnly[0].props.label, "View bill");
  for (const props of [{ canManage: false }, { record: { ...record, locked: true, charged: true } }]) {
    assert.equal(render(props).props.headerRight, undefined);
    assert.equal(render(props).props.footer, undefined);
  }
  const shell = read("src/components/sheet-shell.tsx");
  assert.match(shell, /<\/ModalTitle>\s+(?:\)\s+)*(?:\)\}\s+)?\{headerRight\}/, "The action is in the title row, to the right of its title");
});

test("read-only damage text cannot opt into native long-press selection", () => {
  for (const text of [detail, damages, read("src/features/damage/damage-record-card.tsx")]) {
    assert.doesNotMatch(text, /selectable(?:\s|>)(?![={])/);
    assert.doesNotMatch(text, /selectable=\{true\}/);
  }
  assert.match(detail, /<Text selectable=\{false\}[^>]*>\{note\}<\/Text>/);
  assert.match(read("src/features/damage/record-damage-sheet.tsx"), /<NoticeBar[\s\S]*?selectable=\{false\}/);
});

test("one Damages screen: Open and History, Record, card actions, and repairs", () => {
  assert.match(damages, /label: "Damage list", value: "open"/);
  assert.match(damages, /label: "Repair history", value: "history"/);
  // Keep counts visible when either tab is selected as well as when inactive.
  assert.match(damages, /badge: openCount, label: "Damage list"/);
  assert.match(damages, /badge: historyCount, label: "Repair history"/);
  assert.match(damages, />Record</);
  assert.match(damages, /<DamageRecordCard key=\{record\.id\} onPress=\{\(\) => setViewing\(record\)\} record=\{record\}>/);
  assert.match(damages, /<DamageRecordDetailSheet/);
  assert.match(damages, /label="Mark repaired"/);
  // Every level can be repaired or replaced, D1 included (user, 2026-10-31).
  assert.doesNotMatch(damages, /damageLevel === "D1"/);
  assert.match(damages, /label="Mark replaced"/);
  // A fix asks no level (user, 2026-11-07: levels are only price tiers).
  assert.match(damages, /const payload = \{ level: null, note: note\.trim\(\) \|\| null, photoUrls: photos \};/);
  assert.doesNotMatch(damages, /label="Level now"/);
  assert.match(damages, /max=\{3\}/);
  assert.match(read("app/_layout.tsx"), /<Stack\.Screen name="owner-damages"/);
  // It sits in the Property workspace beside the item catalogue, which is settings only again.
  assert.match(read("app/owner-property.tsx"), /title="Damages & Repairs"[\s\S]*?open\(router, "\/owner-damages"\)/);
  assert.doesNotMatch(read("app/owner-exit-policies.tsx"), /DamageRecordsSection/);
});

test("damage summary uses grey open and yellow uncharged pills, hiding only a zero uncharged count", () => {
  const source = ts.createSourceFile("damages.tsx", damages, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let summary;
  function locate(node) {
    if (ts.isConditionalExpression(node) && node.condition.getText(source) === 'tab === "open" && openCount > 0') summary = node;
    ts.forEachChild(node, locate);
  }
  locate(source);
  assert.ok(summary);
  const code = ts.transpileModule(`exports.render = (tab, openCount, notCharged, manage) => (${summary.getText(source)});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code, { exports, View: "View", StatusPill: "Pill", RecordButton: "Record", spacing: { xs: 6, sm: 10 },
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  });
  const summaryRow = exports.render("open", 2, 1, true);
  const group = summaryRow.props.children[0];
  assert.equal(group.props.style.flexWrap, "wrap", "Counts can wrap without crowding the Record action");
  const pills = group.props.children;
  assert.deepEqual(Array.from(pills).map((pill) => [pill.props.label, pill.props.tone]), [["2 open", "neutral"], ["1 not charged", "warning"]]);
  assert.equal(summaryRow.props.children[1].type, "Record");
  const zero = exports.render("open", 1, 0, false);
  assert.equal(zero.props.children[0].props.children[0].props.label, "1 open");
  assert.equal(zero.props.children[0].props.children[1], null, "Do not show a zero not charged pill");
  assert.equal(exports.render("history", 1, 1, false), null);
});

test("repair and replacement sheets hug their content with a pinned action and slash-separated photo counts", () => {
  const source = ts.createSourceFile("damages.tsx", damages, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "FixSheet");
  const code = ts.transpileModule(`${fn.getText(source)}\nexports.render = FixSheet;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  let photos = [];
  let busy = false;
  vm.runInNewContext(code, { exports,
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
    useState: (initial) => [Array.isArray(initial) ? photos : initial, () => {}],
    useTheme: () => ({ colors: {}, type: {} }), useToast: () => ({}),
    useGetPropertyExitPoliciesQuery: () => ({ data: { damageLevels: [] } }),
    useRepairDamageRecordMutation: () => [() => {}, { isLoading: busy }],
    useReplaceDamageRecordMutation: () => [() => {}, { isLoading: false }],
    ORDER: ["NA", "D1", "D2", "D3"], spacing: { xs: 6, md: 14 },
    SheetShell: "Sheet", View: "View", Text: "Text", ActionButton: "Action", DamageLevelDropdown: "Level",
    MultiImageField: "Photos", NotchedInput: "Note", NoticeBar: "Notice", AlertModal: "Alert",
  });
  for (const outcome of ["repair", "replace"]) {
    for (const count of [0, 1, 3]) {
      photos = Array.from({ length: count }, (_, i) => `photo-${i}`);
      const sheet = exports.render({ outcome, propertyId: "p1", record: { itemName: "TV", damageLevel: "D3" }, onClose() {} });
      assert.equal(sheet.props.size, "content", "Do not reserve empty fixed-height space under the action");
      assert.equal(sheet.props.contentMaxSize, "tall", "Keep the form scrollable when photos or the keyboard take space");
      assert.equal(sheet.props.footerSpacing, 6);
      const action = sheet.props.footer.props.children;
      assert.equal(action.type, "Action");
      assert.equal(action.props.label, outcome === "repair" ? "Mark repaired" : "Mark replaced");
      const body = sheet.props.children[0].props.children;
      assert.ok(!Array.from(body).some((node) => node?.props?.children?.type === "Action"), "The action is outside the scroll body");
      assert.equal(body[1].props.children[0].props.label, `Photos of the ${outcome === "repair" ? "fix" : "new one"} (${count}/3) *`);
      assert.equal(body[1].props.children[0].props.max, 3);
    }
  }
  busy = true;
  const saving = exports.render({ outcome: "repair", propertyId: "p1", record: { itemName: "TV", damageLevel: "D3" }, onClose() {} });
  assert.equal(saving.props.footer.props.children.props.disabled, true);
  assert.equal(saving.props.footer.props.children.props.label, "Saving…");
});

test("the tenant sees their own share and bill on the owner's card, on its own screen (2026-11-10)", () => {
  assert.match(tenant, /title="No damage records"/);
  assert.match(tenant, /record\.shares\.find\(\(share\) => share\.tenancyId === tenancyId\)/);
  assert.match(tenant, /<DamageRecordCard key=\{record\.id\} record=\{record\} viewerTenancyId=\{tenancyId\}>/);
  // A sticky search by damage ID or item, with a level dropdown beside it (user, 2026-11-14).
  const screen = read("app/tenancy-damages.tsx");
  assert.match(screen, /<TenantDamageRecords level=\{level\} search=\{search\} tenancyId=\{tenancyId\} \/>/);
  assert.match(screen, /stickyHeaderIndices=\{\[1\]\}/);
  assert.match(screen, /placeholder="Search by damage ID or item"/);
  assert.match(read("src/features/damage/tenant-damage-records.tsx"), /record\.code\.toLowerCase\(\)\.includes\(needle\) \|\| record\.itemName\.toLowerCase\(\)\.includes\(needle\)/);
  assert.doesNotMatch(read("app/(tabs)/tenancy.tsx"), /TenantDamageRecords/);
});

test("every change sends the version back", () => {
  for (const name of ["updateDamageRecord", "deleteDamageRecord", "chargeDamageRecord", "repairDamageRecord", "replaceDamageRecord"]) {
    const block = api.slice(api.indexOf(`${name}:`), api.indexOf("}),", api.indexOf(`${name}:`)));
    assert.match(block, /headers: ifMatch\(version\)/, name);
  }
});

test("End tenancy settles damage records, and billed damage is a Damage bill", () => {
  const screen = read("app/owner-end-tenancy.tsx");
  const section = read("src/features/damage/checkout-damage-section.tsx");
  // The catalogue ticks are gone, and every open record goes in one list or the other.
  assert.doesNotMatch(screen, /itemNames|damageCharges|damageSelected/);
  assert.match(screen, /recordIds: chargedDamage/);
  assert.match(screen, /waivedRecordIds:/);
  // Not refundable waits for a Damage bill to give the deposit back.
  assert.match(screen, /Use Move all to the bill first/);
  // The split and the way back.
  assert.match(section, /useRaiseDamageBillMutation/);
  assert.match(section, /Move all to the bill/);
  assert.match(section, /Charge from deposit/);
  // The explanations are behind an i, in a How it works sheet.
  assert.match(section, /HowItWorksSheet/);
  assert.match(section, /Collecting the amount is your responsibility\./);
  // A bill from this screen would only block the same checkout.
  assert.match(read("src/features/damage/record-damage-sheet.tsx"), /record\?\.charged \|\| fixedStay \? null/);
});
