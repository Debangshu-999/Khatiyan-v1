const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the auth band is the story band, not the old photo and logo tile", () => {
  const hero = read("src/features/auth/auth-hero.tsx");
  assert.match(hero, /<AuthStory\s+height=\{height\}\s+screen=\{screen\}\s+topInset=\{insets\.top\}\s+width=\{width\}\s*\/>/);
  assert.match(read("src/features/auth/auth-screen.tsx"), /<AuthHero copy=\{heroCopy\} screen=\{`\$\{step\}:\$\{mode\}`\} \/>/);
  assert.doesNotMatch(hero, /ImageBackground|hero-property\.jpg|BrandLogo/);
});

test("login and sign-up show a slideshow of eight stills; the other screens play their own scene on every visit", () => {
  const story = read("src/features/auth/auth-story.tsx");
  assert.match(story, /UTILITY_SCENES\[step\] \? <UtilityScene step=\{step\} \{\.\.\.size\} \/> : <Slideshow \{\.\.\.size\} \/>/);
  assert.match(story, /export const SLIDE_MS = 3600;/);
  // Replayed every time the screen opens (user, 2026-11-14): no "played" memory.
  assert.doesNotMatch(story, /new Set<string>|played.(has|add)/);
  assert.match(story, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  const slides = read("src/features/auth/story/slides.tsx");
  const names = [...slides.matchAll(/\{ Draw: \w+, name: "([^"]+)" \}/g)].map((m) => m[1]);
  assert.deepEqual(names, ["Find a property", "Visits", "Move-ins", "Rent payments", "Meals", "Notices", "Concerns", "And much more"]);
  // Slides are stills: nothing in them moves.
  assert.doesNotMatch(slides, /track\(|<A\b/);
  const utility = read("src/features/auth/story/utility.tsx");
  for (const step of ["activate", "emailLogin", "resetOtp", "resetPin", "resetRequest", "setupOtp", "setupPin"]) {
    assert.match(utility, new RegExp(`\\b${step}: \\{ Draw:`), step);
  }
});

test("flat style: no outlines on people, phones held by a palm under them and two thumbs over", () => {
  const flat = read("src/features/auth/story/flat.tsx");
  const person = flat.slice(flat.indexOf("export function Person("), flat.indexOf("// ---------- phones in hands"));
  assert.doesNotMatch(person, /stroke=\{C\.ink\}|stroke=\{INK\}/);
  assert.match(flat, /export function phoneInHands\(/);
  assert.match(person, /\{held\}\s*\{over\}/); // the phone over the palms, the thumbs over the phone
});

test("no hand-drawn wobble: nothing displaces the drawing", () => {
  for (const path of ["src/features/auth/auth-story.tsx", "src/features/auth/story/slides.tsx", "src/features/auth/story/utility.tsx", "src/features/auth/story/flat.tsx"]) {
    assert.doesNotMatch(read(path), /FeTurbulence|FeDisplacementMap|boil/i, path);
  }
});
