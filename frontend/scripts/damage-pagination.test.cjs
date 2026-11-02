const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { configureStore } = require("@reduxjs/toolkit");
const { createApi } = require("@reduxjs/toolkit/query");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
function compile(source, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, ...globals, require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      assert.ok(name in dependencies, name); return dependencies[name];
    },
  });
  return exports;
}
function declaration(file, name) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source);
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  if (typeof tree.type === "function") return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}

test("damage infinite queries append bounded pages, isolate tabs/properties and refresh all loaded pages", async () => {
  const rows = (prefix, count) => Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` }));
  let open = rows("open", 23);
  const history = rows("history", 12);
  const calls = [];
  const api = createApi({ reducerPath: "damagePageTest", tagTypes: ["DamageRecords", "BillingCycle"], endpoints: () => ({}),
    baseQuery: async (url) => {
      calls.push(url);
      const params = new URL(url, "http://test").searchParams;
      const page = Number(params.get("page"));
      const size = Number(params.get("size"));
      assert.equal(size, 10);
      const items = url.includes("/other/") ? rows("other", 3) : params.get("history") === "true" ? history : open;
      return { data: { records: { items: items.slice(page * size, (page + 1) * size), page, size, totalElements: items.length,
        totalPages: Math.ceil(items.length / size), hasNext: (page + 1) * size < items.length, hasPrevious: page > 0 },
        openCount: open.length, historyCount: history.length, notChargedCount: 8 } };
    },
  });
  compile(read("src/store/services/damage-api.ts"), { "@/store/api": { api, ifMatch: () => ({}) } });
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: (getDefault) => getDefault().concat(api.middleware) });
  const endpoint = api.endpoints.getDamageRecordPages;
  const arg = { propertyId: "property", history: false };
  const subscriptions = [];
  const fetch = (args, options) => {
    const request = store.dispatch(endpoint.initiate(args, options)); subscriptions.push(request); return request;
  };
  try {
    let result = await fetch(arg);
    assert.equal(result.data.pages[0].records.items.length, 10);
    assert.equal(result.data.pages[0].openCount, 23, "Badge counts are not the loaded page length");
    assert.equal(result.data.pages[0].notChargedCount, 8);
    const next = fetch(arg, { direction: "forward" });
    const duplicate = fetch(arg, { direction: "forward" });
    await Promise.all([next, duplicate]);
    result = await fetch(arg, { direction: "forward" });
    assert.deepEqual(Array.from(result.data.pageParams), [0, 1, 2]);
    assert.deepEqual(result.data.pages.flatMap((page) => page.records.items).map((row) => row.id), open.map((row) => row.id));
    assert.equal(calls.length, 3, "Repeated near-end events must not request the same page twice");
    await fetch(arg, { direction: "forward" });
    assert.equal(calls.length, 3, "The final page stops further requests");

    const repaired = await fetch({ ...arg, history: true });
    assert.equal(repaired.data.pages.length, 1);
    assert.ok(repaired.data.pages[0].records.items.every((row) => row.id.startsWith("history")));
    const other = await fetch({ propertyId: "other", history: false });
    assert.equal(other.data.pages[0].records.items.length, 3);
    assert.ok(other.data.pages[0].records.items.every((row) => row.id.startsWith("other")));

    open = open.slice(1); // Simulate a damage being repaired or deleted elsewhere.
    calls.length = 0;
    store.dispatch(api.util.invalidateTags(["DamageRecords"]));
    await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));
    const refreshed = endpoint.select(arg)(store.getState()).data;
    assert.deepEqual(refreshed.pages.flatMap((page) => page.records.items).map((row) => row.id), open.map((row) => row.id));
    assert.equal(calls.filter((url) => url.includes("/property/") && url.includes("history=false")).length, 3, "Changes re-read every cached page, not just the last page");
  } finally {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    store.dispatch(api.util.resetApiState());
  }
});

function damageScreen(query, { tab = "open", accountsLoading = false } = {}) {
  let loaded = 0;
  const state = { ...query, fetchNextPage: () => { loaded++; }, refetch() {} };
  const components = Object.fromEntries(["View", "Text", "ScreenScrollView", "ScreenHeader", "OwnerDamagesScreenSkeleton", "SelectionTabs", "StatusPill",
    "RecordButton", "LoadFailed", "NoticeBar", "ActionButton", "EmptyState", "DamagesIcon", "DamageRecordCard", "DamageRepairHistoryCard", "ActivityIndicator", "ListEnd"].map((name) => [name, name]));
  const result = compile(declaration("app/owner-damages.tsx", "OwnerDamagesScreen"), {}, {
    ...components, useTheme: () => ({ colors: {} }), spacing: { xs: 6, sm: 10, md: 14, lg: 18 },
    useState: (initial) => [initial === "open" ? tab : initial, () => {}], useMemo: (fn) => fn(), useRef: (current) => ({ current }), useCallback: (fn) => fn, useEffect() {},
    useAppSelector: (select) => select({ ownerWorkspace: { selectedPropertyId: "p1" } }),
    useAvailableAccounts: () => ({ ownedProperties: [{ id: "p1", name: "Property" }], managedProperties: [], loading: accountsLoading }),
    usePropertyPermissions: () => ({ canManage: () => true }), useQuickActionIntent() {},
    useGetDamageRecordPagesInfiniteQuery: () => state, errorMessage: () => "Request failed",
  });
  const tree = result.default();
  return { tree, nodes: nodes(tree), loaded: () => loaded };
}

test("the damage screen has a full initial skeleton and an error retry, not a false empty state", () => {
  const loading = damageScreen({ isError: false });
  assert.ok(loading.nodes.some((node) => node.type === "OwnerDamagesScreenSkeleton"));
  assert.ok(!loading.nodes.some((node) => node.type === "ScreenHeader" || node.type === "EmptyState"));
  const failed = damageScreen({ isError: true, error: {} });
  assert.ok(failed.nodes.some((node) => node.type === "LoadFailed"));
  assert.ok(!failed.nodes.some((node) => node.type === "OwnerDamagesScreenSkeleton" || node.type === "EmptyState"));
});

test("both damage tabs fetch near the bottom, retain global badges and show the shared infinite-list footer", () => {
  const page = { records: { items: [{ id: "d1", damageLevel: "D2" }], hasNext: true }, openCount: 23, historyCount: 12, notChargedCount: 8 };
  for (const tab of ["open", "history"]) {
    const screen = damageScreen({ currentData: { pages: [page] }, hasNextPage: true, isFetching: false, isError: false }, { tab });
    const tabs = screen.nodes.find((node) => node.type === "SelectionTabs");
    assert.deepEqual(Array.from(tabs.props.options).map((option) => option.badge), [23, 12]);
    const scroll = screen.nodes.find((node) => node.type === "ScreenScrollView");
    scroll.props.onContentSizeChange(400, 1200);
    scroll.props.onLayout({ nativeEvent: { layout: { height: 600 } } });
    assert.equal(screen.loaded(), 0);
    scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 400 } } });
    assert.equal(screen.loaded(), 1);
    assert.ok(screen.nodes.some((node) => node.type === "ActivityIndicator"));
    assert.ok(!screen.nodes.some((node) => node.type === "ListEnd"));
    const done = damageScreen({ currentData: { pages: [{ ...page, records: { ...page.records, hasNext: false } }] }, hasNextPage: false }, { tab });
    assert.ok(done.nodes.some((node) => node.type === "ListEnd"));
    assert.ok(!done.nodes.some((node) => node.type === "ActivityIndicator"));
  }
});

test("screen skeletons cover their headings and real layouts without interactive sample data", () => {
  const skeletons = compile(read("src/components/skeletons/owner/modules/damages.tsx"), {
    "react-native": { View: "View" }, "@/components/card": { Card: "Card" },
    "@/components/skeletons/primitives": { Skeleton: "Skeleton", SkeletonHeader: "Header", SkeletonPills: "Pills" },
    "@/theme/spacing": { spacing: { xs: 6, sm: 10, md: 14, lg: 18 } },
  });
  for (const render of [() => skeletons.OwnerDamagesScreenSkeleton({}), () => skeletons.OwnerDamagesScreenSkeleton({ history: true }), skeletons.OwnerItemCatalogueScreenSkeleton]) {
    const tree = render();
    assert.equal(tree.props.accessibilityState.busy, true);
    const all = nodes(tree);
    assert.ok(all.some((node) => node.type === "Header"));
    assert.ok(all.filter((node) => node.type === "Skeleton").length > 15);
    assert.ok(all.some((node) => node.props.pointerEvents === "none" && node.props.accessibilityElementsHidden === true));
    assert.ok(!all.some((node) => node.props.onPress));
  }
});

test("the item catalogue waits for required data and exits its skeleton on a load failure", () => {
  const source = declaration("app/owner-exit-policies.tsx", "OwnerExitPoliciesScreen");
  const components = Object.fromEntries(["LoadFailed", "View", "ScreenScrollView", "ScreenHeader", "OwnerItemCatalogueScreenSkeleton", "EmptyState", "NoticeBar", "ActionButton", "DoorOpen", "ViewOnlyChip"].map((name) => [name, name]));
  function render(error) {
    const query = { isLoading: !error, isError: Boolean(error), error };
    const result = compile(source, {}, {
      ...components, useTheme: () => ({ colors: {}, type: {} }), useSafeAreaInsets: () => ({ bottom: 0 }), useToast: () => ({}),
      useAppSelector: (select) => select({ ownerWorkspace: { selectedPropertyId: "p1" } }),
      useAvailableAccounts: () => ({ ownedProperties: [{ id: "p1" }], managedProperties: [], loading: false }),
      usePropertyPermissions: () => ({ canManage: () => true }),
      useGetPropertyExitPoliciesQuery: () => query, useListPropertyRoomsQuery: () => ({ data: [] }), useListMyPropertiesQuery: () => ({ data: [] }),
      useUpdatePropertyExitPoliciesMutation: () => [() => {}, {}], useState: (initial) => [initial, () => {}], useEffect() {},
      useFormErrors: () => ({ serverError: null }), errorMessage: () => "Request failed", PINNED_FOOTER_CLEARANCE: 80,
    });
    return nodes(result.default());
  }
  assert.ok(render().some((node) => node.type === "OwnerItemCatalogueScreenSkeleton"));
  const failed = render({ status: 500 });
  assert.ok(failed.some((node) => node.type === "LoadFailed"));
  assert.ok(!failed.some((node) => node.type === "OwnerItemCatalogueScreenSkeleton"));
});
