/**
 * Renders the sign-in story to docs/previews/signin-story.html (user, 2026-11-14):
 * the real scene code from src/features/auth, drawn frame by frame at the app's
 * frame rate into a flipbook page, so the preview is exactly what the app plays.
 *
 *   node scripts/render-auth-story-preview.cjs
 */
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const zlib = require("node:zlib");

const root = path.join(__dirname, "..");
const output = path.join(root, "..", "docs", "previews", "art.html");

// TypeScript and TSX straight from source.
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}
// The logo is swapped for the real file in the page, once, not per frame.
require.extensions[".png"] = (module) => {
  module.exports = "LOGO://";
};

const tag = (name, extra = {}) =>
  function SvgShim({ children, ...props }) {
    return React.createElement(name, { ...extra, ...props }, children);
  };
const shims = {
  "react-native": {
    AccessibilityInfo: { isReduceMotionEnabled: async () => false },
    Platform: { OS: "web", select: (options) => options.web ?? options.default },
    View: ({ children }) => React.createElement(React.Fragment, null, children),
  },
  "react-native-svg": {
    Circle: tag("circle"),
    ClipPath: tag("clipPath"),
    Defs: tag("defs"),
    Ellipse: tag("ellipse"),
    G: tag("g"),
    Image: tag("image"),
    Line: tag("line"),
    LinearGradient: tag("linearGradient"),
    Path: tag("path"),
    Pattern: tag("pattern"),
    RadialGradient: tag("radialGradient"),
    Rect: tag("rect"),
    Stop: tag("stop"),
    Text: tag("text"),
    default: tag("svg", { xmlns: "http://www.w3.org/2000/svg" }),
  },
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (shims[request]) return `shim:${request}`;
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolve.call(this, request, parent, ...rest);
};
for (const [name, exports] of Object.entries(shims)) {
  const id = `shim:${name}`;
  const module = new Module(id);
  module.exports = { __esModule: true, ...exports };
  module.loaded = true;
  require.cache[id] = module;
}


const groups = [
  ["Empty states", require(path.join(root, "src/components/empty-art.tsx")), 120],
  ["Workspace modules", require(path.join(root, "src/features/owner/workspace-module-icons.tsx")), 72],
  ["Home tools and digest", require(path.join(root, "src/features/owner/home-tool-art.tsx")), 72],
  ["Tenancy, billing, concern and staff controls", require(path.join(root, "src/components/control-art.tsx")), 56],
  ["Manage Visits cards", require(path.join(root, "src/features/visits/visit-desk-art.tsx")), 56],
];
const sections = groups.map(([title, mod, size]) => {
  const cells = Object.entries(mod)
    .filter(([name, value]) => (typeof value === "function" || (value && value.$$typeof)) && /^[A-Z]/.test(name) && name !== "Frame")
    .map(([name, Art]) => {
      try {
        return `<figure>${renderToStaticMarkup(React.createElement(Art, { size }))}<figcaption>${name}</figcaption></figure>`;
      } catch (error) {
        return "";
      }
    })
    .join("");
  return `<h2>${title}</h2><div class="grid">${cells}</div>`;
}).join("");
// The profit and loss hero's two drawings, on the card's own dark blue.
const pnl = require(path.join(root, "src/components/control-art.tsx"));
const pnlHero = pnl.PnlHeroArt
  ? `<h2>Profit and loss hero</h2><div class="grid">${[true, false].map((profit) => `<figure style="background:linear-gradient(135deg,#1E2A55,#4B4E92);padding:12px;border-radius:12px">${renderToStaticMarkup(React.createElement(pnl.PnlHeroArt, { profit, width: 132 }))}<figcaption style="color:#fff">${profit ? "Profit" : "Loss"}</figcaption></figure>`).join("")}</div>`
  : "";
fs.writeFileSync(output, `<!doctype html><meta charset=utf-8><title>Art preview</title><style>body{font-family:system-ui,sans-serif;padding:20px;background:#fff;color:#0F172A}h2{font-size:16px;margin:24px 0 8px}.grid{display:flex;flex-wrap:wrap;gap:18px}figure{margin:0;text-align:center;font-size:11px;color:#475569}</style>${sections}${pnlHero}`);
console.log("wrote", output);
