const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

// The tracker's queue, batching and retry rules (2026-10-18), run against stand-ins.
const source = fs.readFileSync(path.join(__dirname, "../src/features/analytics/tracker.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function harness({ failSends = 0, signedIn = true, saved = null } = {}) {
  const storage = new Map(saved ? [["khatiyan.tracker.queue.v1", JSON.stringify(saved)]] : []);
  const sent = [];
  let failuresLeft = failSends;
  const exported = {};
  const appStateListeners = [];
  const dependencies = {
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: {
        getItem: async (key) => storage.get(key) ?? null,
        setItem: async (key, value) => { storage.set(key, value); },
      },
    },
    "expo-constants": { __esModule: true, default: { expoConfig: { version: "1.2.3" } } },
    "react-native": {
      AppState: { addEventListener: (_event, listener) => { appStateListeners.push(listener); return { remove() {} }; } },
      Platform: { OS: "android" },
    },
    "@/store/store": {
      store: {
        dispatch: (action) => ({ unwrap: async () => {
          if (failuresLeft > 0) { failuresLeft--; throw new Error("offline"); }
          sent.push(action);
          return { accepted: action.length, rejected: 0 };
        } }),
        getState: () => ({ auth: { accessToken: signedIn ? "token" : null } }),
      },
    },
    "@/store/services/app-events-api": { appEventsApi: { endpoints: { sendAppEvents: { initiate: (batch) => batch } } } },
  };
  const timers = [];
  vm.runInNewContext(compiled, {
    exports: exported,
    require: (name) => { if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    Date, JSON, Math, Set, Promise,
  });
  return { exported, sent, storage, appStateListeners, timers };
}

const open = (i) => ({ name: "PROFILE_OPENED", propertyId: "p1", source: "SEARCH", viewId: `v${i}` });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("events wait in the queue and go together, not one request each", async () => {
  const h = harness();
  // Launch first: loading last run's queue sends whatever is waiting.
  h.exported.startTracker();
  await settle();
  for (let i = 0; i < 3; i++) h.exported.track(open(i));
  await settle();
  assert.equal(h.sent.length, 0);

  await h.exported.flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].events.length, 3);
  assert.equal(h.sent[0].context.platform, "android");
  assert.equal(h.sent[0].context.appVersion, "1.2.3");
  assert.ok(h.sent[0].sentAt);
});

test("twenty queued events send at once", async () => {
  const h = harness();
  for (let i = 0; i < 20; i++) h.exported.track(open(i));
  await settle();
  await settle();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].events.length, 20);
});

test("going to the background sends what is queued", async () => {
  const h = harness();
  h.exported.track(open(1));
  h.appStateListeners.forEach((listener) => listener("background"));
  await settle();
  assert.equal(h.sent.length, 1);
});

test("every event has its own id and the schema version", () => {
  const h = harness();
  h.exported.track(open(1));
  h.exported.track(open(2));
  const queued = JSON.parse(h.storage.get("khatiyan.tracker.queue.v1"));
  assert.equal(queued.length, 2);
  assert.notEqual(queued[0].eventId, queued[1].eventId);
  assert.match(queued[0].eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(queued[0].schemaVersion, 1);
});

test("a failed send keeps the events and backs off before trying again", async () => {
  const h = harness({ failSends: 1 });
  h.exported.track(open(1));
  await h.exported.flush();
  assert.equal(h.sent.length, 0);
  assert.equal(JSON.parse(h.storage.get("khatiyan.tracker.queue.v1")).length, 1);

  // Straight away it is still backing off.
  await h.exported.flush();
  assert.equal(h.sent.length, 0);
});

test("nothing is sent without a session", async () => {
  const h = harness({ signedIn: false });
  h.exported.track(open(1));
  await h.exported.flush();
  assert.equal(h.sent.length, 0);
});

test("what an earlier run left unsent goes out first", async () => {
  const earlier = [{ ...open(0), eventId: "11111111-1111-4111-8111-111111111111", occurredAt: "2026-10-18T00:00:00Z", schemaVersion: 1 }];
  const h = harness({ saved: earlier });
  h.exported.startTracker();
  await settle();
  await settle();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].events[0].eventId, earlier[0].eventId);
});
