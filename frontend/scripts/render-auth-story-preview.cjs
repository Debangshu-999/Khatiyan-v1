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
const output = path.join(root, "..", "docs", "previews", "signin-story.html");

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

const { SLIDES } = require(path.join(root, "src/features/auth/story/slides.tsx"));
const { UTILITY_MS, UTILITY_SCENES } = require(path.join(root, "src/features/auth/story/utility.tsx"));
const { SLIDE_MS, STORY_HEIGHT, STORY_WIDTH, SlideFrame, UtilityFrame } = require(path.join(root, "src/features/auth/auth-story.tsx"));

const FRAME_MS = 50; // the app's 20 frames a second
const WEIGHT = { GoogleSans_400Regular: 400, GoogleSans_500Medium: 500, GoogleSans_600SemiBold: 600, GoogleSans_700Bold: 700 };
const size = { height: STORY_HEIGHT, topInset: 0, width: STORY_WIDTH };
const unique = [];
const seen = new Map();
function frame(element) {
  // The app's font files are 2 MB each: the page asks for Google Sans by weight instead.
  const svg = renderToStaticMarkup(element)
    .replace(/font-family="GoogleSans_500Medium_Italic"/g, 'font-family="Google Sans, Segoe UI, sans-serif" font-weight="500" font-style="italic"')
    .replace(/font-family="(GoogleSans_\w+)"/g, (_, family) => `font-family="Google Sans, Segoe UI, sans-serif" font-weight="${WEIGHT[family] ?? 400}"`);
  if (!seen.has(svg)) {
    seen.set(svg, unique.length);
    unique.push(svg);
  }
  return seen.get(svg);
}

const screens = [
  { frames: SLIDES.map((_, index) => frame(React.createElement(SlideFrame, { index, ...size }))), kind: "slides", name: "Log in · Sign up", names: SLIDES.map((s) => s.name) },
  ...Object.entries(UTILITY_SCENES).map(([step, scene]) => {
    const frames = [];
    for (let ms = 0; ms <= UTILITY_MS; ms += FRAME_MS) frames.push(frame(React.createElement(UtilityFrame, { ms, step, ...size })));
    return { frames, kind: "scene", name: scene.name, step };
  }),
];

// Frames repeat almost everything: gzipped, they fit the browser pane.
const packed = zlib.gzipSync(JSON.stringify(unique), { level: 9 }).toString("base64");
const logo = fs.readFileSync(path.join(root, "assets/icons/brand/logo-light-no-tagline.png")).toString("base64");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auth band preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,wght@0,400;0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">
<style>
  * { box-sizing:border-box; }
  body { margin:0; background:#EEF1F6; font-family:"Google Sans","Segoe UI",system-ui,sans-serif; color:#0F172A; display:flex; flex-direction:column; align-items:center; gap:14px; padding:20px 16px 40px; }
  h1 { font-size:18px; margin:0; font-weight:600; }
  p.note { margin:0; font-size:13px; color:#475569; max-width:440px; text-align:center; }
  .phone { width:390px; max-width:100%; background:#fff; border-radius:36px; overflow:hidden; box-shadow:0 20px 50px rgba(15,23,42,.18); border:8px solid #111827; }
  .band { position:relative; width:100%; aspect-ratio:${STORY_WIDTH}/${STORY_HEIGHT}; overflow:hidden; }
  .band .layer { position:absolute; inset:0; transition:opacity .5s; }
  .band svg { display:block; width:100%; height:100%; }
  .dots { position:absolute; right:4.1%; top:82.6%; display:flex; gap:5px; }
  .dots i { display:block; width:7px; height:7px; border-radius:4px; background:#fff; opacity:.5; transition:width .3s; }
  .dots i.on { width:18px; opacity:1; }
  .sheet { position:relative; background:#fff; padding:22px 20px 26px; display:flex; flex-direction:column; gap:12px; }
  .sheet h2 { margin:0; font-size:22px; font-weight:600; }
  .sheet .sub { margin:0; font-size:13px; color:#64748B; }
  .field { height:46px; border:1px solid #CBD5E1; border-radius:12px; display:flex; align-items:center; padding:0 14px; gap:10px; font-size:14px; color:#94A3B8; }
  .cta { height:46px; border-radius:12px; background:#3F6ED8; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:15px; }
  .controls { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; max-width:600px; }
  button { font:inherit; font-size:13px; border:1px solid #3F6ED8; color:#3F6ED8; background:#fff; border-radius:999px; padding:7px 14px; cursor:pointer; }
  .tabs button.on { background:#0F172A; border-color:#0F172A; color:#fff; }
  .slides button.on { background:#3F6ED8; color:#fff; }
</style>
</head>
<body>
<h1>Auth band</h1>
<p class="note">Drawn by the app's own code (src/features/auth/story). Log in and sign up show the slideshow, each other screen plays its own scene once.</p>
<div class="controls tabs" id="tabs"></div>
<div class="phone">
  <div class="band" id="band"><div class="layer" id="a"></div><div class="layer" id="b" style="opacity:0"></div></div>
  <div class="sheet">
    <h2 id="title">Welcome back</h2>
    <p class="sub">Sign in to manage your stays and properties.</p>
    <div class="field">+91 Enter your phone</div>
    <div class="cta">Continue</div>
  </div>
</div>
<div class="controls" id="actions"><button id="replay">Replay</button></div>
<div class="controls slides" id="slides"></div>
<script>
const FRAME_MS = ${FRAME_MS};
const SLIDE_MS = ${SLIDE_MS};
const SCREENS = ${JSON.stringify(screens)};
const bytes = Uint8Array.from(atob("${logo}"), (c) => c.charCodeAt(0));
const logoUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
let FRAMES = null, screen = 0, slide = 0, timer = null, start = 0, front = "a";
const $ = (id) => document.getElementById(id);

function showSlide(k, instant) {
  slide = (k + SCREENS[0].frames.length) % SCREENS[0].frames.length;
  const back = front === "a" ? "b" : "a";
  $(back).innerHTML = FRAMES[SCREENS[0].frames[slide]];
  $(back).style.transition = instant ? "none" : "";
  $(front).style.transition = instant ? "none" : "";
  $(back).style.opacity = 1; $(front).style.opacity = 0; front = back;
  [...$("slides").children].forEach((b, i) => b.classList.toggle("on", i === slide));
  clearTimeout(timer);
  timer = setTimeout(() => showSlide(slide + 1), SLIDE_MS);
}
function play(k) {
  screen = k; clearTimeout(timer); cancelAnimationFrame(start);
  [...$("tabs").children].forEach((b, i) => b.classList.toggle("on", i === k));
  const s = SCREENS[k];
  $("title").textContent = s.kind === "slides" ? "Welcome back" : s.name;
  $("slides").style.display = s.kind === "slides" ? "" : "none";
  if (s.kind === "slides") { $("a").innerHTML = ""; $("b").innerHTML = ""; front = "b"; showSlide(0, true); return; }
  $("b").style.opacity = 0; $("a").style.opacity = 1; $("a").style.transition = "none"; front = "a";
  const t0 = performance.now(); let shown = -1;
  const tick = (now) => {
    const f = Math.min(s.frames.length - 1, Math.floor((now - t0) / FRAME_MS));
    if (s.frames[f] !== shown) { shown = s.frames[f]; $("a").innerHTML = FRAMES[shown]; }
    if (f < s.frames.length - 1) start = requestAnimationFrame(tick);
  };
  start = requestAnimationFrame(tick);
}
(async () => {
  const gz = Uint8Array.from(atob("${packed}"), (c) => c.charCodeAt(0));
  const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  FRAMES = JSON.parse(text).map((svg) => svg.replaceAll("LOGO://", logoUrl));
  SCREENS.forEach((s, k) => { const b = document.createElement("button"); b.textContent = s.name; b.onclick = () => play(k); $("tabs").appendChild(b); });
  SCREENS[0].names.forEach((name, k) => {
    const b = document.createElement("button"); b.textContent = (k + 1) + ". " + name; b.onclick = () => showSlide(k, true); $("slides").appendChild(b);
  });
  $("replay").onclick = () => play(screen);
  play(0);
})();
</script>
</body>
</html>
`;
fs.writeFileSync(output, html);
console.log(`${path.relative(process.cwd(), output)}: ${unique.length} distinct frames, ${(html.length / 1e6).toFixed(2)} MB`);
