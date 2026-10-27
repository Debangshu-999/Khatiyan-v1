const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const { guardSource, patchSource } = require("./patch-expo-router.cjs");

function linkingGuard(currentPath) {
  const updates = [];
  let mount;
  const react = {
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useEffect: (effect) => { mount = effect; },
  };
  const callback = vm.runInNewContext(`(() => {
    ${guardSource}
    return onUnhandledLinkingAfterMount;
  })()`, {
    react_1: { default: react },
    refContainer: { current: { getCurrentRoute: () => ({ path: currentPath }) } },
    setLastUnhandledLink: (value) => updates.push(value),
  });
  return { callback, updates, mount: () => mount() };
}

test("initial link resolving before commit is retained without updating React", () => {
  const guard = linkingGuard();
  guard.callback("/owner-billing");
  assert.deepEqual(guard.updates, []);
  guard.mount();
  assert.deepEqual(guard.updates, ["/owner-billing"]);
});

test("an initial link already handled by navigation is cleared after mounting", () => {
  const guard = linkingGuard("/owner-billing");
  guard.callback("/owner-billing");
  guard.mount();
  assert.deepEqual(guard.updates, [undefined]);
});

test("live links work while mounted and late callbacks after unmount are ignored", () => {
  const guard = linkingGuard();
  const unmount = guard.mount();
  guard.callback("/owner-tenancy");
  unmount();
  guard.callback("/owner-staff");
  assert.deepEqual(guard.updates, ["/owner-tenancy"]);
});

test("undefined initial links and remounting remain safe", () => {
  const guard = linkingGuard();
  guard.callback(undefined);
  const unmount = guard.mount();
  unmount();
  guard.mount();
  guard.callback("/owner-concerns");
  assert.deepEqual(guard.updates, [undefined, "/owner-concerns"]);
});

test("dependency patch is idempotent and rejects an unexpected source shape", () => {
  const original = "    const [lastUnhandledLink, setLastUnhandledLink] = react_1.default.useState();\n    }, setLastUnhandledLink);";
  const patched = patchSource(original);
  assert.match(patched, /}, onUnhandledLinkingAfterMount\);/);
  assert.equal(patchSource(patched), patched);
  assert.throws(() => patchSource("unknown router source"), /linking code changed/);
});
