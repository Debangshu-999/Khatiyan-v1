const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// One screen and card for anything that fails to load or breaks (user, 2026-10-31).
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const component = read("src/components/load-failed.tsx");
const { "@/components/load-failed": { loadFailure } } = require("./shared-text-mocks.cjs");

function sources(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test("it says the one sentence, with a Reload button", () => {
  assert.match(component, /"Oops\.\.\.something went wrong, please reload again!"/);
  assert.match(component, />Reload<\/Text>/);
  assert.match(component, /fill="#FF4D6A"/);
});

test("nothing a person reads mentions Expo Go or the backend", () => {
  for (const file of [...sources("app"), ...sources("src")]) {
    for (const [index, line] of read(file).split(/\r?\n/).entries()) {
      if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line) || /new Error\(|throw /.test(line)) continue;
      assert.doesNotMatch(line, /"[^"]*\bbackend\b[^"]*"/i, `${file}:${index + 1}`);
      if (file !== "app/tenancy-nearby-map.tsx" && file !== "src/features/geo/map-location-picker.tsx") {
        assert.doesNotMatch(line, /"[^"]*Expo Go[^"]*"/, `${file}:${index + 1}`);
      }
    }
  }
});

test("a screen that throws is replaced on its own, so the navigator survives", () => {
  assert.match(read("app/_layout.tsx"), /screenLayout=\{\(\{ children \}\) => <ScreenBoundary>\{children\}<\/ScreenBoundary>\}/);
  // Inside the blur target the tab bar's glass reads, so a crashed screen is still behind the glass.
  assert.match(read("app/(tabs)/_layout.tsx"), /screenLayout=\{\(\{ children, route \}\) => \(\s+<BlurTargetView[^>]*>\s+<ScreenBoundary>\{children\}<\/ScreenBoundary>/);
  assert.match(read("src/components/screen-error-fallback.tsx"), /<CrashedScreen /);
});

test("the crash screen reads nothing from the store, because the root boundary draws outside it", () => {
  const crash = component.slice(component.indexOf("export function CrashedScreen"), component.indexOf("export class ScreenBoundary"));
  const full = component.slice(component.indexOf("function FullScreen"), component.indexOf("/** A whole screen"));
  assert.doesNotMatch(crash + full, /useTheme\(|useAppSelector\(/);
  assert.doesNotMatch(full, /useSafeAreaInsets\(/);
});

test("a read that failed with nothing to show stops the screen", () => {
  const failed = { currentData: undefined, error: { status: "FETCH_ERROR" }, isError: true };
  assert.equal(loadFailure(failed).error, failed.error);
  assert.equal(loadFailure({ error: { status: "TIMEOUT_ERROR" }, isError: true }).error.status, "TIMEOUT_ERROR");
  assert.equal(loadFailure({ error: { status: 500 }, isError: true }).error.status, 500);
});

test("a failed refresh keeps its data, and a read still loading or skipped is no failure", () => {
  assert.equal(loadFailure({ currentData: [], error: { status: 500 }, isError: true }), null);
  assert.equal(loadFailure({ isError: false }), null);
  assert.equal(loadFailure(), null);
});

test("a refusal is an answer, not a failure, but a timeout or rate limit is still a failure", () => {
  assert.equal(loadFailure({ error: { status: 403 }, isError: true }), null);
  assert.equal(loadFailure({ error: { status: 404 }, isError: true }), null);
  assert.ok(loadFailure({ error: { status: 408 }, isError: true }));
  assert.ok(loadFailure({ error: { status: 429 }, isError: true }));
});

test("Reload refetches only the reads that failed", () => {
  const calls = [];
  const reads = [
    { currentData: undefined, error: { status: 503 }, isError: true, refetch: () => calls.push("a") },
    { currentData: [], isError: false, refetch: () => calls.push("b") },
    { currentData: undefined, error: { status: 503 }, isError: true, refetch: () => calls.push("c") },
  ];
  loadFailure(...reads).reload();
  assert.deepEqual(calls, ["a", "c"]);
});

test("the shared mock and the real rule agree", () => {
  assert.match(component, /query\.isError && query\.currentData === undefined && !isRefusal\(query\.error\)/);
  assert.match(component, /status >= 400 && status < 500 && status !== 408 && status !== 429/);
});

test("a screen's failed read covers the whole screen, and a refusal stays where it says why", () => {
  const inline = component.slice(component.indexOf("export function LoadFailed("), component.indexOf("/** For one list or section"));
  assert.match(inline, /setFocusedFailure\(\(\) => reload\.current\(\)\)/);
  assert.match(inline, /return \(\) => setFocusedFailure\(null\)/);
  assert.match(inline, /if \(!refused\) \{\s+return null;/);
});

test("the server not answering takes over the app, whatever a screen has cached", () => {
  assert.match(read("app/_layout.tsx"), /<\/Stack>\s+<AppFailureOverlay \/>/);
  assert.match(component, /state\.auth\.accessToken\) && state\.connection\.unansweredReads >= UNREACHABLE_AFTER/);
  // Reload asks the same question the timer asks. It does not start every read again by
  // itself: that aborted the reads the timer's answer had just started.
  assert.match(component, /onReload=\{\(\) => \(unreachable \? checkServer\(\) : screenReload\?\.\(\)\)\}/);
});

test("while the server cannot be reached the app asks for it, because most screens have no timer", () => {
  assert.match(component, /SERVER_CHECK_MS = 5_000/);
  assert.match(component, /if \(!unreachable\) \{\s+return undefined;/);
  assert.match(component, /dispatch\(serverAnswered\(\)\);\s+dispatch\(api\.util\.resetApiState\(\)\);/);
  assert.match(component, /return \(\) => clearInterval\(timer\)/);
  // One question at a time, so one outage ends in one reset however often Reload is tapped.
  assert.match(component, /if \(checking\.current\) \{\s+return;/);
});

test("the selected property survives the property list being refetched or failing", () => {
  const home = read("app/(tabs)/index.tsx");
  assert.match(home, /if \(propertiesKnown && selectedPropertyId && !properties\.some\(/);
  assert.match(home, /propertiesKnown=\{propertiesKnown\}/);
  assert.match(read("src/features/account/accounts.ts"), /propertiesKnown: propertiesQuery\.isSuccess/);
});

test("only reads count against the server, any answer clears it, and saves never cover a form", () => {
  const client = read("src/store/api.ts");
  assert.match(client, /apiContext\.type === "query" && !apiContext\.signal\.aborted/);
  assert.match(client, /status === "FETCH_ERROR" \|\| result\.error\?\.status === "TIMEOUT_ERROR"/);
  assert.match(client, /apiContext\.dispatch\(serverAnswered\(\)\)/);
  assert.match(read("src/store/slices/connection-slice.ts"), /UNREACHABLE_AFTER = 2/);
  // One read is all some screens make, so a read with nothing to show cannot wait for a second.
  assert.match(client, /nothingToShow: isFirstLoad\(/);
  assert.match(client, /query\.status === "pending" && query\.data === undefined/);
});

test("every screen that loads data has an answer for failing", () => {
  const exempt = new Set(["app/mappls-spike.tsx", "app/account-settings.tsx"]);
  for (const file of sources("app")) {
    const source = read(file);
    if (!exempt.has(file) && /\buse(?!Lazy)[A-Z]\w*Query\(/.test(source)) {
      assert.match(source, /components\/load-failed/, file);
    }
  }
});
