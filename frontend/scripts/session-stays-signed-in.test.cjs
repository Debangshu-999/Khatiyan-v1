const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// A sign-in lasted 60 minutes with nothing to renew it, so anyone was thrown out
// mid-form every hour (user, 2026-11-01).
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function guard({ accessToken, dirty }) {
  const listeners = {};
  const state = { auth: { accessToken } };
  const exports_ = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(read("src/components/use-unsaved-changes.tsx"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports: exports_, require: (name) => ({
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useCallback: (fn) => fn,
      useEffect: (fn) => { fn(); },
      useRef: (current) => ({ current }),
      useState: (initial) => [initial, () => {}],
    },
    "expo-router": { useNavigation: () => ({ addListener: (name, fn) => { listeners[name] = fn; return () => {}; }, dispatch() {} }) },
    "@/features/owner/owner-ui": { ConfirmDialog: "ConfirmDialog" },
    "@/store/hooks": { useAppSelector: (select) => select(state) },
  })[name] });
  exports_.useUnsavedChanges(dirty);
  let prevented = false;
  listeners.beforeRemove({ data: { action: {} }, preventDefault: () => { prevented = true; } });
  return prevented;
}

test("an expired session goes straight to sign-in, with no Unsaved changes dialog in the way", () => {
  assert.equal(guard({ accessToken: null, dirty: true }), false);
});

test("a signed-in form with changes still asks before leaving", () => {
  assert.equal(guard({ accessToken: "token", dirty: true }), true);
  assert.equal(guard({ accessToken: "token", dirty: false }), false);
});

test("a sign-in lasts 30 days", () => {
  const backend = path.join(root, "..");
  assert.match(fs.readFileSync(path.join(backend, "src/main/resources/application.yml"), "utf8"), /access-token-expiry-minutes: \$\{JWT_ACCESS_TOKEN_EXPIRY_MINUTES:43200\}/);
  assert.match(fs.readFileSync(path.join(backend, ".env.example"), "utf8"), /^JWT_ACCESS_TOKEN_EXPIRY_MINUTES=43200\s*$/m);
});
