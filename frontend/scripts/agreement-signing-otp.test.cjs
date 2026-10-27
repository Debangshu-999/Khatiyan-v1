const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const jsx = (type, props) => ({ type, props });

function loadFunction(file, name, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} exists`);
  const exports = {};
  const output = ts.transpileModule(declaration.getText(parsed), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      assert.equal(name, "react/jsx-runtime");
      return { jsx, jsxs: jsx };
    },
    useTheme: () => ({ colors: {}, fonts: {}, type: {} }),
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    View: "View", Text: "Text", TextInput: "TextInput", AnimatedPressable: "AnimatedPressable",
    ...globals,
  });
  return exports[name];
}

function find(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((node) => find(node, type));
  if (!tree || typeof tree !== "object") return [];
  return [...(tree.type === type ? [tree] : []), ...find(tree.props?.children, type)];
}

test("signing OTP boxes do not submit or dismiss the keyboard on the sixth digit", () => {
  const changes = [];
  let dismissed = 0;
  const OtpBoxes = loadFunction("src/features/auth/auth-ui.tsx", "OtpBoxes", {
    digitsOnly: (value) => value.replace(/\D/g, ""),
    Keyboard: { dismiss: () => dismissed++ },
    LayoutAnimation: { configureNext() {}, Types: { easeInEaseOut: "ease" } },
  });
  const tree = OtpBoxes({ value: "", onChangeText: (value) => changes.push(value) });
  find(tree, "TextInput")[0].props.onChangeText("123456");
  assert.deepEqual(changes, ["123456"]);
  assert.equal(dismissed, 0);
});

test("auth still invokes its explicit completion callback on the sixth digit", () => {
  const completed = [];
  let dismissed = 0;
  const OtpBoxes = loadFunction("src/features/auth/auth-ui.tsx", "OtpBoxes", {
    digitsOnly: (value) => value.replace(/\D/g, ""),
    Keyboard: { dismiss: () => dismissed++ },
    LayoutAnimation: { configureNext() {}, Types: { easeInEaseOut: "ease" } },
  });
  const tree = OtpBoxes({ value: "", onChangeText() {}, onComplete: (value) => completed.push(value) });
  find(tree, "TextInput")[0].props.onChangeText("123456");
  assert.deepEqual(completed, ["123456"]);
  assert.equal(dismissed, 1);
});

test("signing sends the OTP only when the confirm button is pressed with six digits", () => {
  for (const code of ["12345", "123456"]) {
    const submitted = [];
    let stateIndex = 0;
    const Entry = loadFunction("src/components/otp-code-sheet.tsx", "OtpCodeEntry", {
      CODE_LENGTH: 6, RESEND_COOLDOWN_SECONDS: 30,
      spacing: {}, OtpBoxes: "OtpBoxes", CodeField: "CodeField", ActionButton: "ActionButton",
      Keyboard: { dismiss() {} },
      useState: (initial) => [stateIndex++ === 0 ? code : initial, () => {}],
    });
    const tree = Entry({ boxed: true, busy: false, busyLabel: "Signing", message: "Confirm signing", onResend() {}, onSubmit: (value) => submitted.push(value), resending: false });
    assert.equal(find(tree, "OtpBoxes")[0].props.onComplete, undefined);
    assert.equal(submitted.length, 0);
    const confirm = find(tree, "ActionButton")[1];
    confirm.props.onPress();
    assert.deepEqual(submitted, code.length === 6 ? [code] : []);
  }
});
