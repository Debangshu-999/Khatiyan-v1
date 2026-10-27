const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function harness() {
  let current, now = 10000;
  const calls = [], pendingEffects = [];
  const exports = {};
  const { outputText } = ts.transpileModule(read("src/navigation/use-guarded-router.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(outputText, {
    exports, Date: { now: () => now },
    setTimeout: () => { throw new Error("Navigation must not be deferred"); },
    require: (name) => {
      if (name === "react") return { useMemo: (fn) => fn(), useEffect: (fn) => pendingEffects.push(fn) };
      if (name === "expo-router") return { useRouter: () => current.router, useNavigation: () => current.navigation };
      if (name === "@/components/animated-pressable") return { resetPressableTapLocks: () => calls.push({ method: "resetTapLocks" }) };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  function screen(name) {
    const listeners = { focus: new Set(), blur: new Set() };
    let focused = true;
    const navigation = { isFocused: () => focused, addListener: (event, callback) => {
      listeners[event].add(callback); return () => listeners[event].delete(callback);
    } };
    const router = { canGoBack: () => true };
    for (const method of ["push", "navigate", "replace", "back", "dismiss", "dismissAll", "setParams"]) router[method] = (...args) => calls.push({ screen: name, method, args, at: now });
    return { router, navigation, listeners,
      focus() { focused = true; listeners.focus.forEach((fn) => fn()); },
      blur() { focused = false; listeners.blur.forEach((fn) => fn()); },
    };
  }
  return { calls, screen, advance: (ms) => { now += ms; },
    use: (state) => { current = state; const router = exports.useGuardedRouter(); const cleanup = pendingEffects.splice(0).map((fn) => fn()); return { router, cleanup }; },
  };
}

test("forward navigation dispatches immediately and does not wait on the previous screen's cooldown", () => {
  const h = harness(); const home = h.screen("home"), detail = h.screen("detail");
  h.use(home).router.push("/owner-bookings");
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].at, 10000);
  h.advance(20);
  h.use(detail).router.push("/owner-booking-settings");
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].at, 10020);
});

test("different controls on the same screen still cannot push two screens from one rapid tap sequence", () => {
  const h = harness(); const home = h.screen("home");
  const first = h.use(home).router, second = h.use(home).router;
  first.push("/owner-bookings"); second.push("/owner-billing"); second.navigate("/owner-enquiries");
  assert.equal(h.calls.length, 1);
  h.advance(651); second.navigate("/owner-enquiries"); assert.equal(h.calls.length, 2);
});

test("hardware Back focus reset allows immediate reopening without waiting for 650ms", () => {
  const h = harness(); const home = h.screen("home"); const { router } = h.use(home);
  router.push("/owner-bookings"); home.blur(); home.focus();
  h.advance(80); router.push("/owner-bookings");
  assert.equal(h.calls.filter((call) => call.method === "push").length, 2);
  assert.equal(h.calls.at(-1).at, 10080);
  assert.equal(h.calls.some((call) => call.method === "resetTapLocks"), true);
});

test("back and dismissal are immediate and clear only their own screen's forward lock", () => {
  for (const method of ["back", "dismiss", "dismissAll"]) {
    const h = harness(); const state = h.screen("detail"); const { router } = h.use(state);
    router.push("/next"); router[method](); router.replace("/home");
    assert.deepEqual(h.calls.map((call) => call.method), ["push", method, "replace"]);
    assert.equal(h.calls.every((call) => call.at === 10000), true);
  }
});

test("off-screen controls remain blocked and other router methods stay intact", () => {
  const h = harness(); const state = h.screen("detail"); const { router } = h.use(state); state.blur();
  router.push("/next"); router.navigate("/next"); router.replace("/next"); assert.equal(h.calls.length, 0);
  router.setParams({ filter: "all" }); assert.equal(h.calls[0].method, "setParams"); assert.equal(router.canGoBack(), true);
});

test("unmount unsubscribes focus listeners and cannot carry a stale lock into a remount", () => {
  const h = harness(); const state = h.screen("detail"); const { router, cleanup } = h.use(state);
  router.push("/next"); cleanup.forEach((fn) => fn());
  assert.equal(state.listeners.focus.size, 0); assert.equal(state.listeners.blur.size, 0);
  h.use(state).router.push("/next"); assert.equal(h.calls.length, 2);
});

test("normal stack push and Back use a quick native fade, while bottom-sheet motion remains explicit", () => {
  const source = read("app/_layout.tsx");
  assert.match(source, /screenOptions=\{\{[\s\S]*?animation: "fade",\s*animationDuration: 160/);
  assert.doesNotMatch(source, /animation: "slide_from_left"/);
  assert.match(source, /animation: "slide_from_bottom"/);
});

test("mounted buttons can be used immediately after returning, while same-screen double taps stay blocked", () => {
  let now = 10000, cursor = 0, presses = 0;
  const refs = [], exports = {};
  const jsx = (type, props) => ({ type, props });
  const { outputText } = ts.transpileModule(read("src/components/animated-pressable.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(outputText, { exports, Date: { now: () => now }, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return { useRef: (initial) => { const index = cursor++; return refs[index] ??= { current: initial }; } };
    if (name === "react-native") return { Pressable: "Pressable", Animated: { createAnimatedComponent: () => "AnimatedPressableImpl", Value: class {} } };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  const tree = exports.AnimatedPressable({ onPress: () => presses++, children: "Open screen" });
  tree.props.onPress({}); now += 80; tree.props.onPress({}); assert.equal(presses, 1);
  exports.resetPressableTapLocks(); tree.props.onPress({}); assert.equal(presses, 2);
  tree.props.onPress({}); assert.equal(presses, 2, "The new focus still has its own duplicate-tap lock");
});
