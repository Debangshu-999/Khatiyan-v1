const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, __DEV__: false, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const icons = new Proxy({}, { get: (_, name) => name });
const actions = load("src/features/owner/action-center.ts", {
  "@/components/artwork-icon": icons, "@/components/tenancy-line-icons": icons,
  "@/features/property/property-control-icons": icons, "@/components/booking-vector-icons": icons,
  "lucide-react-native": icons, "@/features/owner/owner-ui": { formatMoneyPaise: (n) => `Rs ${n / 100}` },
  "@/features/owner/bill-views": { formatDate: (date) => date },
});
const attention = { paymentsOverdue: 0, escalatedConcerns: 0, concernsUnattended24h: 0, exitsPastDue: 0,
  exitsDueToday: 0, pendingExitRequests: 0, pendingRoomChangeRequests: 0, upcomingExits: 0,
  tenantsOnNotice: 0, newEnquiries: 0, pendingDepositSettlements: 0, salaryPaymentsDue: 0, agreementsPendingAcceptance: 0 };
const dashboard = (extra = {}) => ({ attention, concerns: { open: 0 }, blockedBookings: [], ...extra });

test("Home and Action center use the same unresolved count, including Ends today and previously omitted actions", () => {
  const data = dashboard({ attention: { ...attention, exitsDueToday: 2, salaryPaymentsDue: 3, agreementsPendingAcceptance: 1, newEnquiries: 4 } });
  const first = actions.attentionCount(data);
  assert.equal(first, 10);
  assert.equal(first, actions.countActionItems(actions.buildActionItems(data)));
  assert.equal(actions.attentionCount(data), first); // Opening/viewing has no acknowledgement side effect.
  assert.equal(actions.attentionCount(dashboard()), 0);
  assert.equal(actions.attentionCount(undefined), 0);
  assert.match(read("app/(tabs)/index.tsx"), /import \{ attentionCount \} from "@\/features\/owner\/action-center"/);
  assert.doesNotMatch(read("app/(tabs)/index.tsx"), /function attentionCount/);
});

test("all new service queues carry actionable routes and their filter counts sum work items, not rows", () => {
  const data = dashboard({
    bookings: { awaitingResponse: 2, tokenClaims: 3, awaitingConfirmation: 4, moveInsDue: 5, tokenDecisions: 6 },
    visits: { arrivalsToday: 7, attendanceOverdue: 8 }, enquiries: { unassigned: 9, awaitingResponse: 10, callsToRecord: 11 },
    paymentIntents: { awaitingReview: 12 }, concerns: { open: 3, underReview: 2, reopened: 1 },
  });
  const items = actions.buildActionItems(data);
  for (const [key, source, count, route] of [
    ["booking-response", "booking", 2, "/owner-bookings?attention=RESPONSE"],
    ["booking-token-claims", "booking", 3, "/owner-bookings?attention=TOKEN_CLAIMS"],
    ["booking-confirmation", "booking", 4, "/owner-bookings?attention=CONFIRMATION"],
    ["booking-move-ins", "booking", 5, "/owner-bookings?attention=MOVE_IN"],
    ["booking-token-decisions", "booking", 6, "/owner-booking-tokens?status=DECISION_PENDING"],
    ["visits-today", "visit", 7, "/owner-visits"], ["visit-attendance", "visit", 8, "/owner-visits-earlier"],
    ["enquiry-unassigned", "enquiry", 9, "/owner-enquiries?attention=UNASSIGNED"],
    ["enquiry-response", "enquiry", 10, "/owner-enquiries?attention=RESPONSE"],
    ["enquiry-call-outcomes", "enquiry", 11, "/owner-enquiries?attention=CALLS"],
    ["payment-claims", "billing", 12, "/owner-payment-claims"],
  ]) {
    const row = items.find((item) => item.key === key);
    assert.ok(row, key); assert.equal(row.source, source); assert.equal(row.count, count); assert.equal(row.route, route);
  }
  assert.equal(actions.countActionItems(items.filter((item) => item.source === "booking")), 20);
  assert.equal(actions.countActionItems(items.filter((item) => item.source === "visit")), 15);
  assert.equal(actions.countActionItems(items.filter((item) => item.source === "enquiry")), 30);
  assert.equal(actions.attentionCount(data), 83);
  for (const source of new Set(items.map((item) => item.source))) assert.ok(actions.ACTION_FILTERS.some((filter) => filter.key === source));
});

test("assignment transfers an enquiry between queues but cannot reduce the total; responses do", () => {
  const data = dashboard({ attention: { ...attention, newEnquiries: 999 }, enquiries: { unassigned: 2, awaitingResponse: 0, callsToRecord: 0 } });
  assert.equal(actions.attentionCount(data), 2); // Do not double count legacy newEnquiries.
  data.enquiries = { unassigned: 1, awaitingResponse: 1, callsToRecord: 0 };
  assert.equal(actions.attentionCount(data), 2);
  data.enquiries.awaitingResponse = 0;
  assert.equal(actions.attentionCount(data), 1);
});

test("deposit work is under Deposits, blocked arrivals and budget alerts count once each", () => {
  const data = dashboard({ attention: { ...attention, pendingDepositSettlements: 2 }, budget: { level: "EXCEEDED", overPaise: 5000 },
    blockedBookings: [{ bookingTenancyId: "stay-1", startDate: "2026-10-18", reason: "STAY_NOT_ENDED", blockingTenancyId: "stay-old" }] });
  assert.equal(actions.attentionCount(data), 4);
  const items = actions.buildActionItems(data);
  assert.equal(items.find((row) => row.key === "deposit-settlements").source, "deposit");
  assert.equal(items.find((row) => row.key === "booking-blocked-stay-1").route, "/owner-end-tenancy?tenancyId=stay-old");
});

test("the filter bubbles retain the shared single sideways-scrolling strip in loaded and loading states", () => {
  const file = read("app/owner-action-center.tsx");
  assert.equal((file.match(/<FilterPillRow /g) ?? []).length, 2);
  assert.doesNotMatch(file, /flexWrap:\s*"wrap"|ActionFilters/);
  const bubbles = load("src/components/filter-bubbles.tsx", {
    react: {}, "react-native": { ScrollView: "ScrollView" }, "lucide-react-native": icons,
    "@/components/animated-pressable": {}, "@/theme/spacing": { spacing: { sm: 8, md: 12, lg: 18 } }, "@/theme/use-theme": {},
  });
  const tree = bubbles.FilterPillRow({ onChange() {}, options: actions.ACTION_FILTERS.map((filter) => ({ label: filter.label, value: filter.key })), value: "all" });
  assert.equal(tree.type, "ScrollView"); assert.equal(tree.props.horizontal, true);
  assert.equal(tree.props.showsHorizontalScrollIndicator, false);
  assert.equal(tree.props.contentContainerStyle.flexWrap, undefined);
  assert.equal(tree.props.children.length, actions.ACTION_FILTERS.length);
});

test("refresh is property-specific and invalidated by service mutations, never by read acknowledgements", () => {
  let endpoints;
  load("src/store/services/dashboard-api.ts", { "@/store/api": { api: { injectEndpoints: (definition) => {
    endpoints = definition.endpoints({ query: (value) => value }); return {};
  } } } });
  assert.equal(endpoints.getOwnerDashboard.query("property-1"), "/api/v1/dashboard/owner/property-1");
  for (const tag of ["Tenancy", "Booking", "Enquiry", "EnquiryChat", "PaymentIntent", "Concern", "Deposit", "Staff", "Expense"])
    assert.ok(endpoints.getOwnerDashboard.providesTags.includes(tag), tag);
  const home = read("app/(tabs)/index.tsx"), screen = read("app/owner-action-center.tsx");
  assert.match(home, /attentionCount\(headerDashboardQuery.currentData\)/);
  assert.match(screen, /const dashboard = dashboardQuery.currentData/);
  for (const source of [home, screen]) {
    assert.match(source, /pollingInterval: 60_000/); assert.match(source, /refetchOnReconnect: true/);
    assert.match(source, /useFocusEffect/);
  }
});
