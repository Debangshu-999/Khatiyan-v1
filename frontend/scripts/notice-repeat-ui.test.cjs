const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const text = fs.readFileSync(path.join(__dirname, "..", "app/owner-notice-create.tsx"), "utf8");
const source = ts.createSourceFile("notice.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const jsx = (type, props) => ({ type, props });
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((full) => ({ full, short: full.slice(0, 3), value: full.toUpperCase() }));
const spacing = { xs: 6, sm: 10 };
const fonts = { sansBold: "Bold", sansMedium: "Medium" };
function component(name, colors) {
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const code = ts.transpileModule(`${fn.getText(source)}\nexports.Picker = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, WEEKDAYS: weekdays, spacing, radii: { card: 10 },
    View: "View", Text: "Text", FitText: "FitText", RequiredMark: "RequiredMark", AnimatedPressable: "Button", FieldError: "Error", Info: "Info", Svg: "Svg", Circle: "Circle",
    DateTimePart: "DateTimePart", CalendarDays: "CalendarDays", Clock3: "Clock3", DeleteIcon: "DeleteIcon", formatByMode: (_value, mode) => `${mode}-value`,
    useState: (initial) => [initial, () => {}], useTheme: () => ({ colors, fonts, type: { label: { fontSize: 14, fontFamily: "Label" } } }),
    useSoftShadow: () => (color, offset, blur, opacity) => ({ boxShadow: `${color}:${offset}:${blur}:${opacity}` }),
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  });
  return exports.Picker;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}

test("New Notice and Edit Recurring use the standard back-enabled screen header and keep the unsaved-exit guard", () => {
  assert.match(text, /<ScreenHeader title=\{isEditingTemplate \? "Edit Recurring" : "New Notice"\} \/>/);
  assert.match(text, /const unsaved = useUnsavedChanges\(dirty\)/);
  assert.match(text, /\{unsaved.dialog\}/);
  const header = fs.readFileSync(path.join(__dirname, "..", "src/components/compact-screen-header.tsx"), "utf8");
  assert.match(header, /accessibilityLabel="Back"/);
  assert.match(header, /if \(router.canGoBack\(\)\) router.back\(\)/);
  assert.match(header, /else router.replace\("\/"\)/);
});

test("Make it recurring uses the app's right-aligned on/off switch with its repeat icon beside the title", () => {
  let toggle;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "Switch"
      && node.attributes.properties.some((attribute) => attribute.name?.text === "accessibilityLabel" && attribute.initializer?.text === "Make it recurring")) toggle = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(toggle);
  const code = ts.transpileModule(`exports.render = (recurring) => (${toggle.parent.getText(source)});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  const colors = { primary: "blue", surface: "white-surface", surfaceRaised: "raised", border: "border", borderStrong: "strong-border", ink: "ink", muted: "muted", kicker: "kicker" };
  let next;
  vm.runInNewContext(code, { exports, Switch: "Switch", View: "View", Text: "Text", Repeat2: "Repeat2", colors, spacing, type: { body: {}, caption: {} }, setRecurring: (value) => next = value,
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  });
  for (const active of [false, true]) {
    const tree = exports.render(active);
    const [text, control] = tree.props.children;
    assert.equal(control.type, "Switch", "The switch sits to the right of the text block");
    assert.equal(control.props.accessibilityLabel, "Make it recurring");
    assert.equal(control.props.value, active);
    assert.equal(control.props.trackColor.true, colors.primary);
    assert.equal(control.props.trackColor.false, colors.borderStrong);
    assert.equal(control.props.thumbColor, colors.surface);
    assert.equal(tree.props.style.alignItems, "center", "Center the switch vertically beside the complete text block");
    assert.equal(tree.props.style.backgroundColor, colors.surfaceRaised, "The full card does not get a blue wash");
    const [title, icon] = text.props.children[0].props.children;
    assert.equal(title.props.children, "Make it recurring");
    assert.equal(icon.type, "Repeat2");
    control.props.onValueChange(!active);
    assert.equal(next, !active);
  }
});

for (const mode of ["light", "dark"]) {
  const colors = { ink: `${mode}-ink`, muted: `${mode}-muted`, primary: `${mode}-blue`, primarySoft: `${mode}-pale-blue`, primaryDeep: `${mode}-deep-blue`, onPrimary: `${mode}-on-blue`,
    surface: `${mode}-surface`, borderStrong: `${mode}-border`, shadow: `${mode}-shadow`, danger: `${mode}-danger` };
  test(`${mode}: weekday cards have subtle depth, bold readable text and breathing room below`, () => {
    const Picker = component("DayOfWeekPicker", colors);
    const selected = ["TUESDAY", "SATURDAY"];
    const toggled = [];
    const tree = Picker({ value: selected, onToggle: (day) => toggled.push(day) });
    assert.equal(tree.props.style.marginBottom, spacing.sm);
    const label = tree.props.children[0];
    assert.equal(label.props.children, "Repeats on");
    assert.equal(label.props.style.color, colors.ink);
    assert.equal(label.props.style.fontFamily, fonts.sansBold);
    assert.equal(label.props.style.fontSize, 14, "Match the Frequency and time-field headings");
    const buttons = nodes(tree).filter((node) => node.type === "Button");
    assert.equal(buttons.length, 7);
    buttons.forEach((button, index) => {
      const active = selected.includes(weekdays[index].value);
      assert.equal(button.props.accessibilityLabel, weekdays[index].full);
      assert.equal(button.props.accessibilityState.selected, active);
      assert.equal(button.props.style.boxShadow, `${colors.shadow}:2:6:0.75`);
      assert.equal(button.props.style.minHeight, 42);
      assert.equal(button.props.style.borderColor, active ? colors.primary : colors.borderStrong);
      assert.equal(button.props.style.backgroundColor, active ? colors.primarySoft : colors.surface);
      assert.equal(button.props.children.props.style.fontFamily, fonts.sansBold);
      assert.equal(button.props.children.props.style.color, active ? colors.primaryDeep : colors.ink);
      assert.equal(button.props.tapLockMs, 0, "Do not swallow quick consecutive day selections");
      button.props.onPress();
    });
    assert.deepEqual(toggled, weekdays.map((day) => day.value));
    assert.deepEqual(selected, ["TUESDAY", "SATURDAY"], "Styling never mutates the selection");
    const error = Picker({ value: [], onToggle() {}, error: "Choose a day" });
    assert.equal(error.props.children[0].props.style.color, colors.danger);
    assert.equal(nodes(error).find((node) => node.type === "Error").props.message, "Choose a day");
  });

  test(`${mode}: selected month days use explicit pale-blue vector circles on web and native`, () => {
    const Picker = component("DayOfMonthPicker", colors);
    const chosen = [];
    const tree = Picker({ value: [1, 31], onToggle: (day) => chosen.push(day) });
    assert.equal(tree.props.style.marginBottom, spacing.sm);
    const label = nodes(tree).find((node) => node.props.children === "Repeats on days");
    assert.equal(label.props.style.fontFamily, fonts.sansBold);
    assert.equal(label.props.style.fontSize, 14);
    assert.equal(label.props.style.color, colors.ink);
    const buttons = nodes(tree).filter((node) => node.type === "Button" && /^Day /.test(node.props.accessibilityLabel));
    assert.equal(buttons.length, 31);
    buttons.forEach((button, index) => {
      const day = index + 1;
      const circle = button.props.children;
      assert.equal(circle.props.style.width, 34);
      assert.equal(circle.props.style.height, 34);
      assert.equal(circle.props.style.borderRadius, 17);
      assert.equal(circle.props.style.backgroundColor, undefined, "Do not depend on a native View corner mask for the selection fill");
      const [svg, label] = circle.props.children;
      const active = [1, 31].includes(day);
      assert.equal(button.props.accessibilityState.selected, active);
      if (active) {
        assert.equal(svg.type, "Svg");
        assert.equal(svg.props.width, 34);
        assert.equal(svg.props.height, 34);
        assert.equal(svg.props.pointerEvents, "none");
        assert.equal(svg.props.children.type, "Circle");
        assert.equal(svg.props.children.props.cx, 17);
        assert.equal(svg.props.children.props.cy, 17);
        assert.equal(svg.props.children.props.r, 17);
        assert.equal(svg.props.children.props.fill, colors.primarySoft);
      } else {
        assert.equal(svg, null);
      }
      assert.equal(label.props.style.fontFamily, fonts.sansBold);
      assert.equal(label.props.style.color, active ? colors.primaryDeep : colors.ink);
      assert.equal(button.props.tapLockMs, 0);
      button.props.onPress();
    });
    assert.deepEqual(chosen, Array.from({ length: 31 }, (_, index) => index + 1));
    assert.ok(nodes(tree).some((node) => node.type === "Button" && node.props.accessibilityLabel === "See which dates these land on"));
    const error = Picker({ value: [], onToggle() {}, error: "Choose a day" });
    assert.equal(nodes(error).find((node) => node.props.children === "Repeats on days").props.style.color, colors.danger);
  });
}

test("frequency opts into pale-blue choices without changing existing default or square buttons", () => {
  const file = fs.readFileSync(path.join(__dirname, "..", "src/features/owner/owner-ui.tsx"), "utf8");
  const parsed = ts.createSourceFile("owner-ui.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "ChoiceButton");
  const code = ts.transpileModule(fn.getText(parsed), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const colors = { ink: "ink", surface: "surface", primary: "blue", primarySoft: "pale-blue", primaryDeep: "deep-blue", onPrimary: "white", jade: "jade", jadeSoft: "pale-jade", borderStrong: "border" };
  const exports = {};
  vm.runInNewContext(code, { exports, AnimatedPressable: "Button", Text: "Text", spacing: { md: 14 },
    useTheme: () => ({ colors, fonts }),
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  });
  let tapped = 0;
  const props = { active: true, label: "Weekly", onPress: () => tapped++ };
  for (const [options, fill, textColor] of [
    [{}, colors.primary, colors.onPrimary],
    [{ soft: true }, colors.primarySoft, colors.primaryDeep],
    [{ active: false, soft: true }, colors.surface, colors.ink],
    [{ square: true }, colors.jadeSoft, colors.ink],
    [{ square: true, soft: true }, colors.jadeSoft, colors.ink],
  ]) {
    const button = exports.ChoiceButton({ ...props, ...options });
    assert.equal(button.props.style.backgroundColor, fill);
    assert.equal(button.props.children.props.style.color, textColor);
    assert.equal(button.props.accessibilityState.selected, options.active ?? true);
    button.props.onPress();
  }
  assert.equal(tapped, 5);
  const choices = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "ChoiceButton") choices.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(choices.length, 1, "All Frequency options share the same mapped ChoiceButton");
  assert.ok(choices[0].attributes.properties.some((attribute) => attribute.name?.text === "soft" && !attribute.initializer));
});

test("Message, Attachments and Configuration each have a section card instead of separating lines", () => {
  const sections = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "SectionHeading") {
      const step = node.attributes.properties.find((attribute) => attribute.name?.text === "step")?.initializer?.text;
      const outerSection = node.parent.parent;
      assert.ok(ts.isJsxElement(outerSection));
      sections.push({ step, tag: outerSection.openingElement.tagName.getText(source), opening: outerSection.openingElement.getText(source) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual(sections.map((section) => section.step), ["1", "2", "3"]);
  assert.ok(sections.every((section) => section.tag === "Card"));
  assert.match(sections[2].opening, /marginBottom: spacing.xl/, "Extra breathing room under Configuration, above the fixed create button");
  const screen = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "OwnerNoticeCreateScreen");
  assert.ok(!screen.getText(source).includes("borderTopWidth"), "No divider lines between the three section cards");
});

test("Priority uses a content-height sheet while other option pickers retain their default sizing", () => {
  const file = fs.readFileSync(path.join(__dirname, "..", "src/components/option-picker.tsx"), "utf8");
  const parsed = ts.createSourceFile("option-picker.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "SingleOptionPicker");
  const code = ts.transpileModule(fn.getText(parsed), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  let open;
  vm.runInNewContext(code, { exports, PickerField: "PickerField", PickerOptionRow: "Option", SheetShell: "SheetShell", View: "View",
    useTheme: () => ({ colors: {}, fonts }), useState: () => [true, (value) => open = value],
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  });
  let selected;
  const props = { label: "Priority", onChange: (value) => selected = value, options: ["NORMAL", "IMPORTANT", "URGENT", "EMERGENCY"].map((value) => ({ label: value, value })), value: "NORMAL", optionIcon: (value) => `${value}-icon` };
  for (const sheetSize of [undefined, "content"]) {
    const all = nodes(exports.SingleOptionPicker({ ...props, sheetSize }));
    const sheet = all.find((node) => node.type === "SheetShell");
    assert.equal(sheet.props.size, sheetSize);
    assert.equal(sheet.props.title, props.label);
    const options = all.filter((node) => node.type === "Option");
    assert.equal(options.length, 4);
    assert.equal(options[0].props.selected, true);
    assert.equal(options[1].props.icon, "IMPORTANT-icon");
    options[1].props.onPress();
    assert.equal(selected, "IMPORTANT");
    assert.equal(open, false, "Selecting an option still closes the sheet");
  }
  assert.match(text, /<SingleOptionPicker[\s\S]*?label="Priority"[\s\S]*?sheetSize="content"/);
});

test("date and time groups keep their controls and errors but no longer have outer cards", () => {
  const colors = { ink: "ink", danger: "danger", dangerSoft: "pale-red" };
  const Field = component("DateTimeField", colors);
  for (const mode of ["date", "time", "datetime"]) {
    let cleared = 0;
    const picked = [];
    const props = { label: "Starts on", mode, value: new Date(2026, 10, 1), error: "Check this date", onClear: () => cleared++, onPickDate: () => picked.push("date"), onPickTime: () => picked.push("time") };
    const tree = Field(props);
    assert.equal(tree.props.style.gap, spacing.xs, "Keep labels close to their inputs, just like Priority");
    for (const property of ["backgroundColor", "borderWidth", "borderRadius", "padding"]) assert.equal(tree.props.style[property], undefined);
    const all = nodes(tree);
    const heading = tree.props.children[0].props.children[0];
    assert.equal(heading.props.style[0].fontFamily, "Label", "Use the same theme label typography as Priority");
    assert.equal(heading.props.style[1].color, colors.danger);
    assert.equal(nodes(heading).find((node) => node.type === "RequiredMark").props.required, true);
    assert.equal(tree.props.children[0].props.style.minHeight, undefined, "Do not hold an extra-tall empty label row open");
    const normal = Field({ ...props, error: undefined, value: null });
    assert.equal(normal.props.children[0].props.children[0].props.style[1].color, colors.muted);
    all.find((node) => node.props.accessibilityLabel === "Clear Starts on").props.onPress();
    assert.equal(cleared, 1);
    const parts = all.filter((node) => node.type === "DateTimePart");
    assert.equal(parts.length, mode === "datetime" ? 2 : 1);
    parts.forEach((part) => part.props.onPress());
    assert.deepEqual(picked, mode === "datetime" ? ["date", "time"] : [mode]);
    assert.equal(all.find((node) => node.type === "Error").props.message, props.error);
    assert.ok(!nodes(Field({ ...props, value: null })).some((node) => node.props.accessibilityLabel?.startsWith("Clear ")));
  }
  assert.match(text, /label="Starts on"/);
  assert.match(text, /label=\{recurring \? "Shown until" : "Stops showing"\}/);
});

test("selected dates and times keep the same muted text color as their Select placeholder", () => {
  const colors = { muted: "muted", ink: "ink", primary: "blue" };
  const Part = component("DateTimePart", colors);
  for (const value of [null, "02 Nov 2026", "9:00 am"]) {
    let pressed = 0;
    const tree = Part({ icon: "CalendarDays", label: "Date", onPress: () => pressed++, value });
    const label = nodes(tree).find((node) => node.type === "FitText");
    assert.equal(label.props.style.color, colors.muted);
    assert.equal(label.props.children, value ?? "Select");
    assert.equal(tree.props.accessibilityLabel, `Date, ${value ?? "not set"}`);
    tree.props.onPress();
    assert.equal(pressed, 1);
  }
});

test("Title and Body reuse notched inputs with required marks, values and inline errors intact", () => {
  const inputs = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "NotchedInput") inputs.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(inputs.length, 2);
  for (const name of ["title", "body"]) {
    const input = inputs.find((input) => input.includes(`value={${name}}`));
    assert.ok(input);
    assert.match(input, /\brequired\b/);
    assert.ok(input.includes(`invalid={Boolean(form.errors.${name})}`));
    assert.ok(input.includes(`form.clearField("${name}")`));
    assert.ok(text.includes(`<FieldError message={form.errors.${name}} />`));
  }
  assert.match(inputs.find((input) => input.includes('label="Body"')), /\bmultiline\b/);

  const file = fs.readFileSync(path.join(__dirname, "..", "src/components/notched-input.tsx"), "utf8");
  const parsed = ts.createSourceFile("notched-input.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "NotchedInput");
  const code = ts.transpileModule(fn.getText(parsed), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  const colors = { surface: "surface", surfaceRaised: "raised", surfaceSunken: "sunken", ink: "ink", muted: "muted", border: "border", danger: "red", primary: "blue" };
  vm.runInNewContext(code, { exports, AppTextInput: "Input", View: "View", Text: "Text", spacing: { xs: 6, sm: 10, md: 14 },
    useTheme: () => ({ colors, fonts }), useState: (initial) => [initial, () => {}],
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  });
  let changed;
  const props = { label: "Body", required: true, multiline: true, invalid: true, value: "Notice body", onChangeText: (value) => changed = value };
  const tree = exports.NotchedInput(props);
  assert.equal(tree.props.style.borderColor, colors.danger);
  const all = nodes(tree);
  const notch = all.find((node) => node.props.style?.top === -9);
  assert.ok(notch, "The label is placed across the top border");
  assert.ok(nodes(notch).some((node) => node.props.children === " *" && node.props.style.color === colors.danger));
  const input = all.find((node) => node.type === "Input");
  assert.equal(input.props.accessibilityLabel, "Body, required");
  assert.equal(input.props.multiline, true);
  assert.equal(input.props.value, props.value);
  assert.equal(input.props.underlineColorAndroid, "transparent");
  input.props.onChangeText("Updated body");
  assert.equal(changed, "Updated body");
  assert.ok(!nodes(exports.NotchedInput({ ...props, required: false })).some((node) => node.props.children === " *"));
});

test("notice attachment advice uses the same TipBoard as Room photos, without changing upload controls or empty/read-only behavior", () => {
  const file = fs.readFileSync(path.join(__dirname, "..", "src/features/notice/notice-attachments.tsx"), "utf8");
  const parsed = ts.createSourceFile("attachments.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AttachmentSection");
  const code = ts.transpileModule(fn.getText(parsed), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, View: "View", Text: "Text", AnimatedPressable: "Button", Plus: "Plus", TipBoard: "TipBoard",
    AttachmentRow: "Attachment", AttachmentGroupRow: "Group", spacing: { xs: 6, sm: 10, lg: 18 },
    useTheme: () => ({ colors: {}, fonts: {}, type: {} }),
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
  });
  let added = 0;
  const props = { documents: [], editing: true, images: [], items: [], onAdd: () => added++, onRemove() {}, onOpenDocuments() {}, onOpenSlideshow() {},
    tip: "Attach updated images before the notice goes live." };
  const all = nodes(exports.AttachmentSection(props));
  const tip = all.find((node) => node.type === "TipBoard");
  assert.equal(tip.props.children, props.tip);
  const add = all.find((node) => node.props.accessibilityLabel === "Add an attachment");
  assert.ok(all.indexOf(add) < all.indexOf(tip), "The advice stays below the attachment controls");
  add.props.onPress();
  assert.equal(added, 1);
  assert.ok(!nodes(exports.AttachmentSection({ ...props, tip: undefined })).some((node) => node.type === "TipBoard"));
  assert.equal(exports.AttachmentSection({ ...props, editing: false }), null);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "src/features/property/room-type-sheet.tsx"), "utf8"), /<TipBoard>Rooms with photos/);
});
