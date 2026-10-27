const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const element = (type, props) => ({ type, props });
const spacing = { xs: 4, sm: 8, md: 12, lg: 20, xl: 24, xxl: 32 };
const theme = {
  colors: { ink: "#111111", muted: "#666666", kicker: "#777777" },
  fonts: { display: "display" },
  type: { eyebrow: { fontSize: 11 } },
};

function load(source, globals = {}) {
  const exported = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(outputText, {
    exports: exported,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
      if (name === "react-native") return { Image: "Image", Text: "Text", View: "View", Dimensions: { get: () => ({ height: 800 }) } };
      if (name === "@/components/card") return { Card: "Card" };
      if (name === "@/theme/spacing") return { spacing };
      if (name === "@/theme/use-theme") return { useTheme: () => theme };
      throw new Error(`Unexpected empty-state dependency: ${name}`);
    },
    ...globals,
  });
  return exported;
}

function nodes(tree, type) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}

const { EmptyState } = load(read("src/components/empty-state.tsx"));
const { DiscoveryEmptyState } = load(read("src/features/discovery/components/discovery-empty-state.tsx"));

test("the shared empty state renders only its bold title, even when callers still pass helper copy", () => {
  for (const title of ["No early leads", "No bookings yet", "No matching transactions"]) {
    const tree = EmptyState({ title, description: "Legacy supporting text must not be visible." });
    const text = nodes(tree, "Text");
    assert.equal(text.length, 1);
    assert.equal(text[0].props.children, title);
    assert.equal(text[0].props.style.fontFamily, "display");
    assert.equal(text[0].props.style.textAlign, "center");
    assert.doesNotMatch(JSON.stringify(tree), /Legacy supporting text/);
  }
});

test("title-only empty states retain their centered layout, artwork priority and action handlers", () => {
  let pressed = false;
  function Icon() {}
  const artworkNode = element("BlueArtwork", { size: 64 });
  const action = element("ActionButton", { label: "Try again", onPress: () => { pressed = true; } });
  const tree = EmptyState({ title: "No matching leads", artworkNode, artwork: "fallback.png", icon: Icon, action });
  assert.equal(tree.props.style.alignItems, "center");
  assert.equal(tree.props.style.justifyContent, "center");
  assert.equal(tree.props.style.minHeight, 368);
  assert.equal(nodes(tree, "BlueArtwork")[0], artworkNode);
  assert.equal(nodes(tree, "Image").length, 0);
  assert.equal(nodes(tree, Icon).length, 0);
  nodes(tree, "ActionButton")[0].props.onPress();
  assert.equal(pressed, true);
});

test("compact, image and glyph empty-state variants lose no artwork or spacing options", () => {
  const compact = EmptyState({ title: "No managers yet", compact: true, artwork: "people.png", artworkTextGap: -6 });
  assert.equal(compact.props.style.minHeight, undefined);
  assert.equal(compact.props.style.paddingVertical, spacing.xl);
  const image = nodes(compact, "Image")[0];
  assert.equal(image.props.source, "people.png");
  assert.equal(image.props.style.height, 132);
  assert.equal(image.props.style.marginBottom, -6 - spacing.md);
  function Icon() {}
  const glyph = nodes(EmptyState({ title: "Nothing here", icon: Icon }), Icon)[0];
  assert.equal(glyph.props.size, 46);
  assert.equal(glyph.props.color, theme.colors.ink);
});

test("Discovery's card variant also removes only the helper line", () => {
  const tree = DiscoveryEmptyState({ title: "Could not load properties", description: "Old supporting instruction." });
  assert.equal(tree.type, "Card");
  assert.equal(tree.props.tone, "sunken");
  assert.deepEqual(nodes(tree, "Text").map((node) => node.props.children), ["Discovery", "Could not load properties"]);
});

test("Discovery's animated search prompt remains title-only with its illustration intact", () => {
  const file = ts.createSourceFile("discovery.tsx", read("app/(tabs)/discovery.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const prompt = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "EmptySearchPrompt");
  const { EmptySearchPrompt } = load(`export ${prompt.getText(file)}`, {
    View: "View", Text: "Text", spacing,
    EMPTY_SEARCH_ILLUSTRATION: "search.png",
    useTheme: () => theme,
    useRef: (current) => ({ current }),
    useEffect: () => {},
    Animated: { Image: "AnimatedImage", Value: class { interpolate() { return "bob-offset"; } } },
  });
  const tree = EmptySearchPrompt({ title: "Search a place to see listings" });
  assert.deepEqual(nodes(tree, "Text").map((node) => node.props.children), ["Search a place to see listings"]);
  assert.equal(nodes(tree, "AnimatedImage")[0].props.source, "search.png");
});

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? sourceFiles(path.join(dir, entry.name))
    : entry.name.endsWith(".tsx") ? [path.join(dir, entry.name)] : []);
}

test("custom empty states across the app have no supporting Text immediately below their bold empty title", () => {
  const violations = [];
  for (const filename of [...sourceFiles(path.join(root, "app")), ...sourceFiles(path.join(root, "src"))]) {
    const source = fs.readFileSync(filename, "utf8");
    const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "Text") {
        const title = node.children.map((child) => child.getText(file)).join(" ").replace(/\s+/g, " ").trim();
        const attributes = node.openingElement.attributes.getText(file);
        if (/\b(No|Nothing|All clear|All caught)\b/.test(title) && /display|sansBold|bodyStrong|fontWeight/.test(attributes) && node.parent.children) {
          // Listing content and completed/failed identity verification are not empty-list helper text.
          const relative = path.relative(root, filename).replaceAll("\\", "/");
          const statusOrContent = (relative === "app/owner-property.tsx" && title.includes("profile?.headline?.trim()"))
            || (relative === "src/features/compliance/tenant-onboarding-steps.tsx" && title === "Nothing to do here")
            || (relative === "src/features/compliance/verification-flow-parts.tsx" && title.includes("verified ?"));
          if (!statusOrContent) {
            const siblings = [...node.parent.children].filter((child) => !(ts.isJsxText(child) && !child.text.trim()));
            const next = siblings[siblings.indexOf(node) + 1];
            if (next && ts.isJsxElement(next) && next.openingElement.tagName.getText(file) === "Text") {
              violations.push(`${relative}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${title}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  assert.deepEqual(violations, []);
});

test("custom result empty states keep their clear-search and retry buttons", () => {
  assert.ok(read("app/(tabs)/discovery.tsx").includes("onPress={clearSearch}"));
  assert.ok(read("src/features/discovery/components/ai-results.tsx").includes("onPress={onTryAgain}"));
  assert.ok(read("src/features/discovery/components/nearby-places-view.tsx").includes('setQuery("");'));
});
