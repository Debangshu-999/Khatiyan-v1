const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const element = (type, props) => ({ type, props });
function load(file, dependencies, globals = {}) {
  const exported = {};
  const { outputText } = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(outputText, { exports: exported, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, ...globals });
  return exported;
}
const flatten = (style) => Object.assign({}, ...[].concat(style));
const sizing = load("src/components/modal-title-size.ts", {});

test("native modal titles reserve 80 percent, shrink to fit and retain accessibility", () => {
  const { ModalTitle } = load("src/components/modal-title.tsx", { "react-native": { Text: "Text" } });
  const tree = ModalTitle({ children: "Communication permissions", accessibilityLabel: "Permission choices", style: { fontSize: 22, flex: 1 } });
  assert.equal(tree.type, "Text");
  assert.equal(tree.props.adjustsFontSizeToFit, true);
  assert.equal(tree.props.minimumFontScale, 0.65);
  assert.equal(tree.props.numberOfLines, 1);
  assert.equal(tree.props.accessibilityRole, "header");
  assert.equal(tree.props.accessibilityLabel, "Permission choices");
  assert.notEqual(tree.props.allowFontScaling, false);
  assert.equal(flatten(tree.props.style).width, "80%");
  assert.equal(flatten(tree.props.style).maxWidth, "80%");
  assert.equal(flatten(tree.props.style).minWidth, 0);
  assert.equal(flatten(tree.props.style).flexShrink, 1);
  assert.equal(flatten(tree.props.style).fontSize, 22);
});

test("sizing preserves short headings, fits narrow slots and respects the legibility floor", () => {
  const fit = sizing.modalTitleFontSize;
  assert.equal(fit(350, 200, 22), 22);
  assert.equal(fit(250, 310, 22), 17.6);
  assert.equal(fit(100, 500, 22), 22 * 0.65);
  assert.equal(fit(0, 300, 22), 22);
  assert.equal(fit(250, 0, 22), 22);
});

function webHarness() {
  let current;
  let cleanup;
  let effect;
  let resize;
  let fontLoaded;
  let disconnected = false;
  const node = { clientWidth: 250, textContent: "Communication permissions" };
  const props = { children: node.textContent, style: { fontSize: 22, flex: 1 } };
  const globals = {
    document: { createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 310 }) }) }), fonts: { ready: Promise.resolve(), addEventListener: (_, fn) => { fontLoaded = fn; }, removeEventListener: () => { fontLoaded = null; } } },
    window: { getComputedStyle: () => ({ fontStyle: "normal", fontWeight: "800", fontFamily: "PlusJakartaSans", letterSpacing: "normal", paddingLeft: "0", paddingRight: "0" }) },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() { disconnected = true; } },
  };
  const { ModalTitle } = load("src/components/modal-title.web.tsx", {
    react: { useLayoutEffect: (callback) => { effect = callback; }, useRef: () => ({ current: node }), useState: (initial) => { current ??= initial; return [current, (next) => { current = typeof next === "function" ? next(current) : next; }]; } },
    "react-native": { StyleSheet: { flatten }, Text: "Text" },
    "./modal-title-size": sizing,
  }, globals);
  return { node, render: () => ModalTitle(props), install: () => { cleanup = effect(); }, resize: () => resize(), fontLoaded: () => fontLoaded(), dispose: () => cleanup(), get disconnected() { return disconnected; } };
}

test("web fits the measured font and refits after narrow/wide resizing and font load", () => {
  const h = webHarness();
  h.render(); h.install();
  let tree = h.render();
  assert.equal(flatten(tree.props.style).width, "80%");
  assert.equal(flatten(tree.props.style).fontSize, 17.6);
  h.node.clientWidth = 180; h.resize();
  assert.equal(flatten(h.render().props.style).fontSize, 22 * 0.65);
  h.node.clientWidth = 400; h.resize();
  assert.equal(flatten(h.render().props.style).fontSize, 22);
  h.node.clientWidth = 250; h.fontLoaded();
  assert.equal(flatten(h.render().props.style).fontSize, 17.6);
  h.dispose();
  assert.equal(h.disconnected, true);
  h.node.clientWidth = 400; h.resize();
  assert.equal(flatten(h.render().props.style).fontSize, 17.6);
});

test("all modal header variants use the shared responsive title, not fixed-size text", () => {
  function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [path.join(dir, entry.name)] : []); }
  const missed = [];
  let titles = 0;
  for (const file of [...files(path.join(root, "src")), ...files(path.join(root, "app"))]) {
    const source = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function scan(node, modal = false) {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement.tagName.getText(sf);
        if (tag === "ModalTitle") titles++;
        modal ||= /^(Modal|CenterModal|BottomSheetModal|SheetShell)$/.test(tag);
        if (tag === "Text" && modal) {
          const props = node.openingElement.getText(sf);
          // These are content/controls, not the modal heading: year navigation,
          // pass/PIN codes and the request timeline's tenant identity.
          const content = /month-selector|request-timeline-sheet/.test(file) || /formatPassCode|pin\[index\]|tab === "MONTH"/.test(node.getText(sf));
          if (!content && (/accessibilityRole="header"/.test(props) || /fontSize:\s*(?:1[89]|2\d)/.test(props) || /fonts\.display/.test(props) && !node.getText(sf).includes("entry.itemName"))) missed.push(`${path.relative(root, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
      }
      ts.forEachChild(node, (child) => scan(child, modal));
    }
    scan(sf);
  }
  assert.deepEqual(missed, []);
  assert.ok(titles >= 65, `Expected all custom headers plus the shared shells; found ${titles}`);
});
