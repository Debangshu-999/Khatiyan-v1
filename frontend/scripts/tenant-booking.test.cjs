const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
const settle = () => new Promise((resolve) => setImmediate(resolve));
function load(source, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  // The services ask whether this is a development build. Here it is not.
  vm.runInNewContext(outputText, { __DEV__: false, exports, require: (name) => { if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }; if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; } });
  return exports;
}
const ui = load(read("src/features/booking/booking-ui.ts"));
const form = load(read("src/features/booking/booking-request-form.ts"), { "@/features/booking/booking-ui": ui });
const { spacing, radii } = load(read("src/theme/spacing.ts"));
const { themes } = load(read("src/theme/colors.ts"));
const room = (overrides = {}) => ({ roomId: "room-1", roomNumber: "101", floor: "1", conditioning: "AC", capacity: 2, amenities: [], customAmenities: [], freeBeds: 1, futureBeds: [], available: true, listedRentPaise: 950000, imageUrls: [], ...overrides });
const options = (overrides = {}) => ({ canBook: true, enquiryId: "enquiry-1", propertyId: "property-1", propertyName: "Sample PG", propertyArea: "Salt Lake", propertyCity: "Kolkata", visitedOn: "2026-10-05", windowEndsOn: "2026-11-04", currentStayEndsOn: null, pgFor: "ANYONE", earliestMoveInDate: "2026-10-18", latestMoveInDate: "2026-10-31", rooms: [room()], requestsLeft: 2, tokenRequired: true, tokenAmountPaise: 200000, tokenRefundable: true, depositPaise: 950000, ...overrides });
const draft = (overrides = {}) => ({ name: "Sample visitor", phone: "+919000000000", email: "", gender: "MALE", dateOfBirth: "2000-01-01", roomId: "room-1", exitRequestId: null, moveInDate: "2026-10-18", negotiate: false, proposedRent: "", agreementMonths: null, ...overrides });
const record = (overrides = {}) => ({ id: "request-1", referenceCode: "BKG-2026-000263", propertyId: "property-1", propertyName: "Sample PG", roomNumber: "204", tenantName: "Sample visitor", tenantPhone: "+919000000000", tenantEmail: "visitor@example.com", tenantGender: "MALE", tenantDateOfBirth: "2000-01-01", futureBed: false, agreementMonths: 2, depositPaise: 950000, dueAtMoveInPaise: 1800000, tokenRequired: true, tokenPaise: 50000, status: "AWAITING_TENANT", currentRentPaise: 900000, listedRentPaise: 950000, currentOfferBy: "MANAGEMENT", moveInDate: "2026-10-22", latestPushDate: "2026-10-29", submittedAt: "2026-10-10T12:00:00Z", expiresAt: "2026-10-17T12:00:00Z", offers: [], history: [], currentOfferSequence: 4, version: 12, allowedActions: ["ACCEPT", "COUNTER", "CANCEL"], allowedTokenActions: [], allowedMoveInActions: [], ...overrides });
function nodes(tree, type) {
  const found = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== "object") return; if (node.type === type || node.type?.name === type) found.push(node); walk(node.props?.children); } walk(tree); return found;
}
const one = (tree, type, fn = () => true) => { const found = nodes(tree, type).find(fn); assert.ok(found, `Missing ${type}`); return found; };
const button = (tree, label) => one(tree, "ActionButton", (node) => node.props.label === label);

test("future exit before the minimum still allows a move-in beyond the minimum", () => {
  const future = room({ freeBeds: 0, futureBeds: [{ exitRequestId: "exit-1", earliestMoveInDate: "2026-10-12", latestMoveInDate: "2026-10-31" }] });
  const data = options({ rooms: [future] }); const window = form.bookingBedWindow(data, future, "exit-1");
  assert.equal(window.earliest, "2026-10-18");
  assert.deepEqual(Object.keys(form.validateBookingStep(1, draft({ exitRequestId: "exit-1", moveInDate: "2026-10-20" }), data, "2026-10-10")), []);
});
test("future availability starts after checkout using the server's bed-specific minimum", () => {
  const future = room({ freeBeds: 0, futureBeds: [{ exitRequestId: "exit-1", earliestMoveInDate: "2026-10-25", latestMoveInDate: "2026-11-20" }] });
  const window = form.bookingBedWindow(options(), future, "exit-1"); assert.equal(window.earliest, "2026-10-25"); assert.equal(window.latest, "2026-10-31");
});
test("owner limits beyond 21 days are preserved, not hardcoded in the form", () => {
  const future = room({ freeBeds: 0, futureBeds: [{ exitRequestId: "exit-1", earliestMoveInDate: "2026-11-10", latestMoveInDate: "2026-11-24" }] });
  const window = form.bookingBedWindow(options({ latestMoveInDate: "2026-11-24" }), future, "exit-1"); assert.equal(window.latest, "2026-11-24");
});
test("full, maintenance, stale exits and empty date intersections are not selectable", () => {
  for (const candidate of [room({ available: false }), room({ freeBeds: 0 }), room({ futureBeds: [{ exitRequestId: "exit-1", earliestMoveInDate: "2026-11-01", latestMoveInDate: "2026-11-05" }] })]) {
    assert.equal(form.bookingBedWindow(options(), candidate, candidate.futureBeds.length ? "exit-1" : null), null);
  }
  assert.equal(form.bookingBedWindow(options(), room(), "missing-exit"), null);
});
test("civil dates reject rollover; adulthood follows the server's leap-day birthday", () => {
  assert.equal(form.validBookingDate("2026-02-31"), false); assert.equal(form.validBookingDate("2026-02-28"), true);
  assert.equal(form.adultOn("2008-02-29", "2026-02-28"), true); assert.equal(form.adultOn("2008-02-29", "2026-02-27"), false);
});
test("details, selected bed/date, proposed rent and agreement term are validated at their step", () => {
  assert.ok(form.validateBookingStep(0, draft({ name: "", gender: null, dateOfBirth: "2010-01-01" }), options(), "2026-10-10").dateOfBirth);
  assert.ok(form.validateBookingStep(1, draft({ moveInDate: "2026-10-17" }), options(), "2026-10-10").moveInDate);
  assert.ok(form.validateBookingStep(2, draft({ negotiate: true, proposedRent: "9.001", agreementMonths: 12 }), options(), "2026-10-10").proposedRent);
  assert.equal(Object.keys(form.validateBookingStep(3, draft({ agreementMonths: 1 }), options(), "2026-10-10")).length, 0);
});
test("creation body trims identity, names the enquiry/future bed and preserves exact paise", () => {
  const body = form.bookingRequestBody(draft({ name: " Name ", phone: " +919000000000 ", negotiate: true, proposedRent: "9000.01", exitRequestId: "exit-1", agreementMonths: 11 }), "enquiry-1", "same-key");
  assert.equal(body.proposedRentPaise, 900001); assert.equal(body.exitRequestId, "exit-1"); assert.equal(body.email, null); assert.equal(body.name, "Name"); assert.equal(body.idempotencyKey, "same-key"); assert.equal("propertyId" in body, false);
});

const paymentMethods = load(read("src/features/billing/payment-methods.ts"));
function harness(settings = {}) {
  let cursor = 0; const values = []; const writes = []; const routes = []; const calls = []; const backs = [];
  const dependencies = {
    "@/components/modal-title": { ModalTitle: "Text" },
    react: { useState: (initial) => { const at = cursor++; if (!(at in values)) values[at] = typeof initial === "function" ? initial() : initial; return [values[at], (next) => { values[at] = typeof next === "function" ? next(values[at]) : next; }]; }, useRef: (initial) => { const at = cursor++; if (!(at in values)) values[at] = { current: initial }; return values[at]; } },
    "react-native": { Text: "Text", View: "View", Image: "Image" },
    "expo-router": { useLocalSearchParams: () => ({ enquiryId: "enquiry-1", requestId: "request-1", ...settings.params }) },
    // Any icon, by its own name, so a screen can take a new one without this list growing.
    "lucide-react-native": new Proxy({}, { get: (_, name) => name, has: () => true }),
    "@/features/booking/booking-ui": ui, "@/features/booking/booking-request-form": form,
    "@/features/booking/booking-date-field": { BookingDateField: "BookingDateField" },
    "@/features/property/property-control-icons": { BookingsIcon: "BookingsIcon" },
    "@/features/account/gender-picker": { GenderPicker: "GenderPicker", GENDER_LABELS: { MALE: "Male", FEMALE: "Female", TRANSGENDER: "Transgender", OTHER: "Others", UNDECLARED: "Undeclared" } },
    "@/features/enquiry/enquiry-tags": { InitialsAvatar: "InitialsAvatar" },
    "@/features/booking/booking-confirm-body": { BookingConfirmBody: "BookingConfirmBody" },
    // The real formatter, so what a screen shows is what a person will read.
    "@/features/owner/phone-display": load(read("src/features/owner/phone-display.ts")),
    "@/components/artwork-icon": { PropertyArtwork: "PropertyArtwork", PaymentClaimsIcon: "PaymentClaimsIcon" },
    "@/features/billing/payment-method-toggle": { PaymentMethodIcon: "PaymentMethodIcon" },
    "@/features/booking/token-verify-sheet": { TokenProofImages: "TokenProofImages" },
    "@/components/booking-vector-icons": { BookingTokenAmountIcon: "BookingTokenAmountIcon", BookingPropertyIcon: "BookingPropertyIcon", BookingTokenStatusIcon: "BookingTokenStatusIcon" },
    "@/components/picker-option-row": { PickerOptionRow: "PickerOptionRow" },
    "@/components/image-carousel": { ImageCarousel: "ImageCarousel" },
    "@/features/property/floor": load(read("src/features/property/floor.ts")),
    "@/features/property/room-amenity-icons": { ROOM_AMENITY_ICONS: { CUPBOARD: "CupboardIcon", TV: "TelevisionIcon" } },
    "@/features/property/room-amenity-strip": { ROOM_AMENITY_LABELS: { CUPBOARD: "Cupboard", TV: "TV" } },
    "@/components/use-hardware-back": { useHardwareBack: (handler, enabled = true) => { backs.push({ handler, enabled }); } },
    "@/features/uploads/multi-image-field": { MultiImageField: "MultiImageField" },
    // The real table of methods, so what a tenant may record is filtered from what the app really offers.
    "@/features/billing/payment-methods": paymentMethods,
    // The picker's lines are built as the pay sheet builds them, from the app's own names and marks.
    "@/features/billing/pay-bill-sheet": { BankTab: "BankTab", DeskTab: "DeskTab", PaymentMethodDropdown: "PaymentMethodDropdown", UpiTab: "UpiTab", payMethodOptions: (list) => list.map((value) => ({ icon: paymentMethods.METHOD_ICON[value], label: paymentMethods.METHOD_LABEL[value], value })) },
    "@expo/vector-icons": { MaterialCommunityIcons: "MaterialCommunityIcons" },
    "@/features/billing/raise-claim-modal": { PaymentProofForm: "PaymentProofForm", PaymentProofHeading: "PaymentProofHeading" },
    "expo-clipboard": { setStringAsync: async () => {} },
    "@/features/forms/server-error": { errorMessage: () => "Please try again." },
    "@/features/visits/visit-clock": { indiaDate: () => "2026-10-10" },
    "@/features/owner/owner-ui": { ActionButton: "ActionButton", FormInput: "FormInput", IconButton: "IconButton", NoticeBar: "NoticeBar", formatMoneyPaise: (amount) => `Rs ${amount / 100}`, humanizeToken: (value) => value },
    "@/navigation/use-guarded-router": { useGuardedRouter: () => ({ push: (route) => routes.push(route), replace: (route) => routes.push(route) }) },
    "@/theme/use-theme": { useTheme: () => ({ colors: themes.light, type: { description: { fontSize: 12, lineHeight: 16 } }, fonts: { sansBold: "bold" } }) },
    "@/theme/spacing": { spacing, radii }, "@/store/hooks": { useAppSelector: () => ({ fullName: "Visitor", phone: "+919000000000" }) },
    "@/components/toast": { useToast: () => ({ success() {} }) },
    "@/components/pinned-footer": { PinnedFooter: "PinnedFooter", PINNED_FOOTER_CLEARANCE: 104 },
    "@/components/skeletons/boundary": { useIsSkeleton: () => settings.ghost ?? false },
    "@/components/skeletons/primitives": { Skeleton: "Skeleton", SkeletonForm: "SkeletonForm" },
    "@/components/skeletons/booking/tenant": { BookingRequestSkeleton: "BookingRequestSkeleton", MyBookingsSkeleton: "MyBookingsSkeleton" },
    "@/components/skeletons/booking/workspace": { BookingDetailSkeleton: "BookingDetailSkeleton" },
    "@/store/services/auth-api": { useGetMyIdentityQuery: () => ({ currentData: null, isLoading: false }) },
  };
  const mutation = (kind) => (payload) => ({ unwrap: async () => { writes.push({ kind, payload }); if (settings.writeError) throw settings.writeError; return record(); } });
  const bookingDependencies = {
    useGetBookingFormOptionsQuery: (id, config) => { calls.push(config); return { currentData: options(), isSuccess: true, ...settings.optionsQuery }; },
    useCreateBookingRequestMutation: () => [mutation("create")],
    useGetMyBookingsQuery: () => ({ currentData: [], isSuccess: true, ...settings.listQuery }),
    useGetMyBookingRequestQuery: () => ({ currentData: record(), ...settings.detailQuery }),
    useGetBookingTokenPayDetailsQuery: () => ({ currentData: { amountPaise: 200000, acceptedMethods: ["CASH", "UPI"], payee: null }, ...settings.payQuery }),
  };
  for (const [name, kind] of [["AcceptBookingOffer", "accept"], ["CounterBookingOffer", "counter"], ["CancelMyBooking", "cancel"], ["PushBookingMoveInDate", "push"], ["AcceptAnotherBed", "takeBed"], ["DeclineAnotherBed", "declineBed"], ["LeaveBookingBedNotReady", "leave"], ["ConfirmBookingTokenRefund", "refundReceived"], ["DisputeBookingTokenRefund", "refundMissing"], ["ClaimBookingTokenPaid", "claim"]]) bookingDependencies[`use${name}Mutation`] = () => [mutation(kind)];
  dependencies["@/store/services/booking-api"] = bookingDependencies;
  dependencies["@/features/booking/tenant-booking-list"] = load(read("src/features/booking/tenant-booking-list.ts"));
  dependencies["@/features/booking/use-open-booking-chat"] = { useOpenBookingChat: () => async () => {} };
  for (const [file, name] of [["animated-pressable", "AnimatedPressable"], ["agreement-month-dropdown", "AgreementMonthDropdown"], ["card", "Card"], ["empty-state", "EmptyState"], ["screen-header", "ScreenHeader"], ["screen-scroll-view", "ScreenScrollView"], ["selection-tabs", "SelectionTabs"], ["status-pill", "StatusPill"], ["sheet-shell", "SheetShell"], ["split-button", "SplitButton"], ["alert-modal", "AlertModal"], ["how-it-works-sheet", "HowItWorksSheet"], ["search-field", "SearchField"]]) dependencies[`@/components/${file}`] = { [name]: name };
  const entry = load(read("src/features/booking/book-a-stay-entry.tsx"), dependencies);
  // The form's own pieces are the real ones, so a test can read what a room card or a stepper is given.
  const parts = load(read("src/features/booking/booking-form-parts.tsx"), dependencies);
  dependencies["@/features/booking/booking-form-parts"] = parts;
  dependencies["@/features/booking/tenant-booking-parts"] = load(read("src/features/booking/tenant-booking-parts.tsx"), dependencies);
  const formModule = load(`${read("app/booking-request.tsx")}\nexports.Form = BookingRequestForm;`, dependencies);
  // The sheet behind "View/Record payment" is the real one. Its proof form and the pay sheet's pieces are named stand-ins.
  const paid = load(read("src/features/booking/token-paid-sheet.tsx"), dependencies);
  dependencies["@/features/booking/token-paid-sheet"] = paid;
  dependencies["@/features/booking/booking-payment-claims"] = load(read("src/features/booking/booking-payment-claims.tsx"), dependencies);
  const detailModule = load(`${read("app/my-booking-detail.tsx")}\nexports.Decision = TenantBookingDecisionSheet; exports.Summary = TenantBookingSummary; exports.Claims = TenantTokenClaims;`, dependencies);
  const listModule = load(`${read("app/my-bookings.tsx")}\nexports.ListCard = TenantBookingListCard;`, dependencies);
  return { entry, formModule, detailModule, listModule, parts, paid, dependencies, writes, routes, calls, values, backs, render: (component, props) => { cursor = 0; return component(props); } };
}
// As the profile holds them. The form shows these and asks for none of them.
const identity = { id: "user-1", fullName: "Sample visitor", phone: "+919000000000", email: "visitor@example.com", gender: "MALE", dateOfBirth: "2000-01-01" };
const formProps = { options: options(), identity, authUser: null };
const decisionProps = (action, booking = record()) => ({ action, booking, onClose() {}, onDone() {} });

test("Account, visited cards and routes all expose the tenant booking flow", () => {
  assert.match(read("app/(tabs)/account.tsx"), /label="My bookings".*router.push\("\/my-bookings"\)/);
  assert.match(read("app/my-visits.tsx"), /visited && visit.enquiryId.*BookAStayEntry/);
  assert.match(read("app/my-enquiries.tsx"), /bookingEligibility\?\.eligible.*VISITED.*BookAStayEntry/);
  for (const name of ["my-bookings", "my-booking-detail", "booking-request"]) assert.ok(read("app/_layout.tsx").includes(`name="${name}"`));
});
test("entry navigates to the enquiry-specific form without submitting or holding a bed", () => {
  const h = harness(); const tree = h.render(h.entry.BookAStayEntry, { enquiryId: "enquiry-1" }); button(tree, "Book a stay").props.onPress();
  assert.equal(h.routes[0].params.enquiryId, "enquiry-1"); assert.equal(h.writes.length, 0);
});
test("an existing request opens its detail instead of raising a duplicate", () => {
  const h = harness({ optionsQuery: { currentData: options({ canBook: false, existingRequestId: "request-1" }) } }); const tree = h.render(h.entry.BookAStayEntry, { enquiryId: "enquiry-1" }); button(tree, "View booking").props.onPress(); assert.equal(h.routes[0].pathname, "/my-booking-detail");
});
test("not-configured availability is explained, not an invisible tenant feature", () => {
  const h = harness({ optionsQuery: { currentData: options({ canBook: false, whyNot: "Property has not set up bookings." }) } });
  const tree = h.render(h.entry.BookAStayEntry, { enquiryId: "enquiry-1" }); button(tree, "Book a stay");
  // Why not is said under the button, beside a red warning mark (user, 2026-10-10).
  const parts = tree.props.children.flat(Infinity).filter(Boolean);
  const reason = parts.at(-1);
  assert.equal(nodes(parts.at(-2), "ActionButton").length, 1);
  assert.equal(one(reason, "CircleAlert").props.color, themes.light.danger);
  assert.equal(one(reason, "Text").props.children, "Property has not set up bookings.");
  // An empty state with the server's own sentence, and no button left to grow across the page (user, 2026-10-10).
  const page = h.render(h.formModule.default);
  const state = one(page, "EmptyState", (node) => node.props.title === "Booking unavailable");
  assert.equal(state.props.description, "Property has not set up bookings.");
  assert.equal(state.props.action, undefined);
  assert.equal(nodes(page, "NoticeBar").length, 0); assert.equal(nodes(page, "ActionButton").length, 0);
  assert.equal(one(page, "ScreenScrollView").props.refreshable, true);
  assert.equal(nodes(page, "BookingRequestForm").length, 0);
});
test("ghost visited cards never issue options reads", () => {
  const h = harness({ ghost: true }); assert.equal(h.render(h.entry.BookAStayEntry, { enquiryId: "fake-enquiry" }), null); assert.equal(h.calls[0].skip, true);
});
test("first list loading shows a skeleton, never No bookings yet", () => {
  const h = harness({ listQuery: { currentData: undefined, isSuccess: false, isLoading: true } }); const tree = h.render(h.listModule.default); one(tree, "MyBookingsSkeleton"); assert.equal(nodes(tree, "EmptyState").length, 0);
});

test("tenant tabs and search cover the collection, with real counts and matching detail routes", () => {
  const all = [record({ id: "review", status: "AWAITING_HANDLER", currentOfferBy: "TENANT" }), record({ id: "offer" }), record({ id: "confirmed", status: "CONFIRMED" }), record({ id: "cancelled", status: "CANCELLED" }), record({ id: "expired", status: "EXPIRED" }), record({ id: "moved", status: "MOVED_IN" })];
  const h = harness({ listQuery: { currentData: all } });
  let tree = h.render(h.listModule.default);
  const tabs = one(tree, "SelectionTabs").props;
  assert.equal(tabs.distributed, true);
  assert.equal(tabs.bleed, spacing.lg);
  assert.equal(tabs.active, "ACTIVE");
  assert.deepEqual(Array.from(tabs.options, (option) => option.label), ["Active", "Confirmed", "History"]);
  assert.equal(nodes(tree, "UnderlineTabs").length, 0);
  assert.match(read("app/my-visits.tsx"), /<SelectionTabs<Tab>[\s\S]*?bleed=\{spacing\.lg\}[\s\S]*?distributed/);
  assert.deepEqual(Array.from(nodes(tree, "TenantBookingListCard"), (node) => node.props.item.id), ["review", "offer"]);
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "2 active requests"));
  nodes(tree, "TenantBookingListCard")[1].props.onOpen();
  assert.equal(h.routes[0].params.requestId, "offer"); assert.equal(h.writes.length, 0);
  one(tree, "SelectionTabs").props.onChange("CONFIRMED"); tree = h.render(h.listModule.default);
  assert.deepEqual(Array.from(nodes(tree, "TenantBookingListCard"), (node) => node.props.item.id), ["confirmed"]);
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "1 confirmed booking"));
  one(tree, "SelectionTabs").props.onChange("HISTORY"); tree = h.render(h.listModule.default);
  assert.equal(nodes(tree, "TenantBookingListCard").length, 3);
  one(tree, "SearchField").props.onChangeText("  bkg-2026-000263 "); assert.equal(nodes(h.render(h.listModule.default), "TenantBookingListCard").length, 3);
  one(tree, "SearchField").props.onChangeText("missing property"); tree = h.render(h.listModule.default);
  assert.equal(one(tree, "EmptyState").props.title, "No matching bookings");
  one(tree, "EmptyState").props.action.props.children.props.onPress();
  assert.equal(nodes(h.render(h.listModule.default), "TenantBookingListCard").length, 3);
});

test("tenant booking cards use grey fact bands, blue actions and deadlines only while negotiating", () => {
  const h = harness();
  let tree = h.render(h.listModule.ListCard, { item: record(), onOpen() {} });
  assert.equal(nodes(tree, "BookingInfoBand").length, 3); button(tree, "View offer");
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "Property offer"));
  tree = h.render(h.listModule.ListCard, { item: record({ status: "CONFIRMED" }), onOpen() {} });
  assert.equal(nodes(tree, "BookingInfoBand").length, 2); button(tree, "View booking");
  const parts = h.dependencies["@/features/booking/tenant-booking-parts"];
  const received = parts.TenantBookingStatus({ status: "AWAITING_TENANT" });
  assert.equal(received.props.style.backgroundColor, themes.light.successSoft);
  assert.equal(one(received, "CircleCheck").props.color, themes.light.successText);
  const review = parts.TenantBookingStatus({ status: "AWAITING_HANDLER" });
  assert.equal(one(review, "Clock3").props.color, themes.light.warningText);
});

test("tenant booking card groups the reference directly under the property and omits room and bed details", () => {
  const h = harness();
  for (const status of ["AWAITING_HANDLER", "AWAITING_TENANT", "CONFIRMED", "CANCELLED", "EXPIRED", "MOVED_IN"]) {
    const item = record({ status, propertyName: "Ashirvad Home Stays", bedNumber: "B-03" });
    const tree = h.render(h.listModule.ListCard, { item, onOpen() {} });
    const nameGroup = nodes(tree, "View").find((node) => {
      const children = node.props.children;
      return Array.isArray(children) && children[0]?.type === "Text"
        && children[0].props.children === item.propertyName;
    });
    assert.ok(nameGroup, "name and reference share their own column");
    assert.equal(nameGroup.props.children[1].props.children, item.referenceCode);
    assert.equal(nodes(nameGroup, "TenantBookingStatus").length, 0);
    assert.equal(one(tree, "TenantBookingStatus").props.status, status);
    assert.equal(one(tree, "BookingPropertyIcon").props.color, themes.light.primary);
    assert.equal(nodes(tree, "Building2").length, 0);
    assert.equal(nodes(tree, "BedDouble").length, 0);
    assert.equal(nodes(tree, "Text").some((node) => JSON.stringify(node.props.children).includes("B-03")), false);
    assert.equal(nodes(tree, "Text").some((node) => Array.isArray(node.props.children)
      && node.props.children.join("") === "Room 204"), false);
  }
});

test("empty Confirmed and History tabs are not offered unrelated booking actions", () => {
  const h = harness();
  for (const tab of ["CONFIRMED", "HISTORY"]) {
    one(h.render(h.listModule.default), "SelectionTabs").props.onChange(tab);
    const tree = h.render(h.listModule.default);
    assert.equal(one(tree, "EmptyState").props.action, undefined);
    assert.equal(nodes(tree, "TenantBookingListCard").length, 0);
  }
});

function tenantCollectionEndpoint(name = "getMyBookings") {
  let definitions;
  load(read("src/store/services/booking-api.ts"), { "@/store/api": {
    ifMatch: (version) => ({ "If-Match": String(version) }),
    api: { injectEndpoints: (config) => { definitions = config.endpoints({ query: (value) => value, mutation: (value) => value }); return {}; } },
  } });
  assert.deepEqual(Array.from(definitions.getMyBookings.providesTags), ["Booking"]);
  return definitions[name];
}

test("tenant collection reads later pages for tab/search results, deduplicates and uses only GET routes", async () => {
  const urls = [];
  const result = await tenantCollectionEndpoint().queryFn(undefined, {}, {}, async (url) => {
    urls.push(url);
    return { data: urls.length === 1 ? { items: [record({ id: "first" })], totalPages: 2 } : { items: [record({ id: "first", version: 13 }), record({ id: "later", status: "CONFIRMED" })] } };
  });
  assert.deepEqual(urls, ["/api/v1/booking-requests?page=0&size=20", "/api/v1/booking-requests?page=1&size=20"]);
  assert.deepEqual(Array.from(result.data, (item) => item.id), ["first", "later"]);
  assert.equal(result.data[0].version, 13);
  const filter = load(read("src/features/booking/tenant-booking-list.ts"));
  assert.equal(filter.filterTenantBookings(result.data, "CONFIRMED", "Sample PG")[0].id, "later");
});

test("a later tenant page failing never becomes an incomplete collection or a false empty tab", async () => {
  let calls = 0; const error = { status: 503, data: "Unavailable" };
  const result = await tenantCollectionEndpoint().queryFn(undefined, {}, {}, async () => ++calls === 1 ? { data: { items: [record()], totalPages: 3 } } : { error });
  assert.equal(result.error, error); assert.equal(result.data, undefined); assert.equal(calls, 2);
  const h = harness({ listQuery: { currentData: undefined, isError: true } }); const tree = h.render(h.listModule.default);
  assert.equal(nodes(tree, "EmptyState").length, 0); button(tree, "Try again");
});

test("booking details use a single-line reference, snapshot identity and connected offer/activity rows", () => {
  const h = harness();
  const booking = record({ offers: [{ sequence: 4, madeBy: "MANAGEMENT", monthlyRentPaise: 900000, negotiable: false, madeAt: "2026-10-11T12:00:00Z" }], history: [{ type: "FINAL_OFFER", offerSequence: 4, occurredAt: "2026-10-11T12:00:00Z", note: "Final price" }] });
  const tree = h.render(h.detailModule.Summary, { booking });
  const ref = one(tree, "Text", (node) => node.props.children === booking.referenceCode);
  // One line that shrinks to fit: a FitText, drawn as Text here (user, 2026-10-28).
  assert.equal(ref.props.numberOfLines, 1); assert.match(read("app/my-booking-detail.tsx"), /<FitText[^>]*>\s*\{booking\.referenceCode\}/);
  assert.equal(ref.props.style.at(-1).fontWeight, "900");
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "+91 90000 00000"));
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "visitor@example.com"));
  assert.equal(nodes(tree, "BookingInitialsAvatar").length, 1);
  // One ruled pair is left, for move-in and the agreement. The offer's four facts are grey boxes now.
  assert.equal(nodes(tree, "BookingFactPair").length, 1); assert.equal(nodes(tree, "BookingFactBox").length, 4);
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "Property offered Rs 9000 / month · Final offer"));
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "Final price"));
  assert.equal(h.writes.length, 0);
});

test("booked room uses its type photo or an identically sized grey box with a no-image mark", () => {
  const h = harness(); const photo = h.dependencies["@/features/booking/tenant-booking-parts"].BookingRoomPhoto;
  const empty = h.render(photo, { imageUrls: [] });
  assert.equal(empty.props.style.backgroundColor, themes.light.neutralSoft);
  assert.equal(empty.props.style.width, 72); assert.equal(empty.props.style.height, 72);
  assert.equal(nodes(empty, "Image").length, 0); assert.equal(nodes(empty, "ImageOff").length, 1);
  let tree = h.render(photo, { imageUrls: ["https://img.example/room.jpg"] });
  assert.deepEqual(tree.props.style, empty.props.style);
  const image = one(tree, "Image"); assert.equal(image.props.source.uri, "https://img.example/room.jpg"); assert.equal(image.props.resizeMode, "cover");
  image.props.onError(); tree = h.render(photo, { imageUrls: ["https://img.example/room.jpg"] });
  assert.equal(nodes(tree, "Image").length, 0); assert.equal(nodes(tree, "ImageOff").length, 1);
  tree = h.render(photo, { imageUrls: ["https://img.example/new.jpg"] });
  assert.equal(one(tree, "Image").props.source.uri, "https://img.example/new.jpg");
  const summary = h.render(h.detailModule.Summary, { booking: record({ roomImageUrls: ["https://img.example/actual-type.jpg"] }) });
  assert.equal(one(summary, "BookingRoomPhoto").props.imageUrls[0], "https://img.example/actual-type.jpg");
  assert.equal(nodes(summary, "BedDouble").length, 0);
});

test("agreement is its icon and term only, and request/expiry are separate bold grey parts", () => {
  const h = harness(); const tree = h.render(h.detailModule.Summary, { booking: record() });
  const agreement = nodes(tree, "BookingFactPair")[0].props.right;
  assert.equal(nodes(agreement, "FileText").length, 1);
  assert.deepEqual(nodes(agreement, "Text").map((node) => node.props.children), ["Definite · 2 months"]);
  const textOf = (node) => [].concat(node.props.children).join("");
  const strip = one(tree, "Text", (node) => textOf(node).startsWith("Requested "));
  assert.equal(textOf(strip), "Requested 10 Oct");
  assert.equal(strip.props.numberOfLines, 1); assert.equal(strip.props.style.fontFamily, "bold");
  const expiry = one(tree, "Text", (node) => textOf(node).startsWith("Expires "));
  assert.equal(textOf(expiry), "Expires 17 Oct, 5:30pm");
  assert.equal(expiry.props.style.fontFamily, strip.props.style.fontFamily);
  const timing = one(tree, "View", (node) => node.props.style?.flexDirection === "row" && nodes(node, "BookingInfoBand").length === 2);
  assert.equal(timing.props.style.gap, 8);
  const bands = nodes(timing, "BookingInfoBand");
  assert.equal(bands[0].props.iconGap, 6);
  const parts = h.dependencies["@/features/booking/tenant-booking-parts"];
  const requestedBand = parts.BookingInfoBand(bands[0].props);
  assert.equal(requestedBand.props.style.gap, 6);
  assert.equal(nodes(requestedBand, "Clock3").length, 1);
  assert.equal(nodes(parts.BookingInfoBand(bands[1].props), "Clock3").length, 0);
  const completed = h.render(h.detailModule.Summary, { booking: record({ status: "CONFIRMED" }) });
  assert.equal(nodes(completed, "Text").some((node) => textOf(node).startsWith("Expires ")), false);
  assert.equal(nodes(tree, "Text").some((node) => textOf(node).includes("Counter offers do not restart")), false);
  assert.equal(ui.bookingMomentLabel("2026-10-07T11:30:00Z"), "7 Oct, 5pm");
});

test("token has no purse icon and its policy is behind a ? in a sheet using the booking's actual refund terms", () => {
  // It was a blue notice on the card. The user moved it into the How it works sheet, titled Token policy (2026-10-11).
  const policyOf = (overrides) => {
    const h = harness(); const props = { booking: record(overrides) };
    let tree = h.render(h.detailModule.Summary, props);
    assert.ok(nodes(tree, "Text").some((node) => node.props.children === "Token amount"));
    assert.equal(nodes(tree, "Wallet").length, 0);
    assert.equal(nodes(tree, "NoticeBar").some((node) => node.props.title === "Token policy"), false);
    const help = nodes(tree, "IconButton").find((node) => node.props.accessibilityLabel === "Token policy");
    if (!help) return null;
    assert.equal(help.props.icon, "CircleHelp"); assert.equal(nodes(tree, "HowItWorksSheet").length, 0);
    help.props.onPress(); tree = h.render(h.detailModule.Summary, props);
    return one(tree, "HowItWorksSheet").props;
  };
  const refundable = policyOf({ tokenRefundable: true });
  assert.equal(refundable.title, "Token policy");
  assert.deepEqual(Array.from(refundable.steps, (step) => step.body), ["The token is adjusted from your first cycle bill after your tenancy starts.", "The token is refunded to you.", "The token is always owed back if the property cancels or cannot host you."]);
  assert.equal(policyOf({ tokenRefundable: false }).steps[1].body, "The token is not refunded.");
  // No token, no policy to explain.
  assert.equal(policyOf({ tokenRequired: false }), null);
});

test("a grey activity rail starts below the first circle even when there is only one event", () => {
  const h = harness(); const tree = h.render(h.detailModule.Summary, { booking: record() });
  const rail = one(tree, "View", (node) => node.props.style?.position === "absolute" && node.props.style?.top === 16);
  assert.equal(rail.props.style.backgroundColor, themes.light.borderStrong);
  assert.equal(rail.props.style.width, 2);
  // Under the last step the rail runs to the end of that step's words and stops before the padding under
  // them, which is the same 14 the words' own column keeps below itself (user, 2026-10-11).
  assert.equal(rail.props.style.bottom, spacing.md); assert.equal("height" in rail.props.style, false);
  const column = one(tree, "View", (node) => node.props.style?.paddingBottom === spacing.md && node.props.style?.flex === 1);
  assert.equal(column.props.style.paddingBottom, rail.props.style.bottom);
  // Between two steps it still joins one circle to the next.
  const two = h.render(h.detailModule.Summary, { booking: record({ offers: [{ sequence: 1, madeBy: "TENANT", monthlyRentPaise: 900000, negotiable: true, madeAt: "2026-10-10T13:00:00Z" }] }) });
  const rails = nodes(two, "View").filter((node) => node.props.style?.position === "absolute" && node.props.style?.top === 16);
  assert.equal(rails.length, 2); assert.equal(rails[0].props.style.bottom, 0); assert.equal(rails[1].props.style.bottom, spacing.md);
});

test("confirmed/closed details do not display an obsolete request expiry or an active bed hold", () => {
  const h = harness();
  let tree = h.render(h.detailModule.Summary, { booking: record({ status: "CONFIRMED", agreedAt: "2026-10-11T12:00:00Z" }) });
  assert.equal(one(tree, "NoticeBar").props.title, "Booking confirmed");
  assert.equal(nodes(tree, "Text").some((node) => String(node.props.children).includes("Expires ")), false);
  tree = h.render(h.detailModule.Summary, { booking: record({ status: "CANCELLED", allowedActions: [] }) });
  assert.equal(nodes(tree, "Text").some((node) => node.props.children === "One bed held for you"), false);
});

test("accept is a full-width primary footer row, with counter/withdraw in a separate row", () => {
  const h = harness(); const tree = h.render(h.detailModule.default);
  const footer = one(tree, "PinnedFooter");
  const rows = nodes(footer, "View").filter((node) => node.props.style?.flexDirection === "row");
  assert.deepEqual(rows.map((row) => nodes(row, "ActionButton").map((node) => node.props.label)), [["Accept Rs 9000"], ["Counter offer", "Withdraw request"]]);
  assert.equal(button(footer, "Withdraw request").props.variant, "dangerFilled");
  footer.props.onLayout({ nativeEvent: { layout: { height: 183 } } });
  assert.equal(one(h.render(h.detailModule.default), "ScreenScrollView").props.contentContainerStyle.paddingBottom, 183 + spacing.lg);
});

test("reference code sits slightly below Ref, and an unassigned request says Awaiting handler", () => {
  const h = harness(); const tree = h.render(h.detailModule.Summary, { booking: record({ status: "AWAITING_HANDLER", handlerName: null }) });
  one(tree, "View", (node) => node.props.style?.gap === 8 && nodes(node, "Text").some((text) => text.props.children === "Ref") && nodes(node, "Text").some((text) => text.props.children === "BKG-2026-000263"));
  assert.equal(nodes(tree, "Card")[0].props.style.paddingBottom, spacing.xxs);
  const status = h.dependencies["@/features/booking/tenant-booking-parts"].TenantBookingStatus({ status: "AWAITING_HANDLER" });
  assert.equal(one(status, "Text").props.children, "Awaiting handler");
  assert.equal(h.writes.length, 0);
});

test("initials have a local warm tint and gender/DOB are single-line facts below the contact block", () => {
  const h = harness(); const tree = h.render(h.detailModule.Summary, { booking: record() });
  const parts = h.dependencies["@/features/booking/tenant-booking-parts"];
  const avatar = parts.BookingInitialsAvatar({ name: "Arjun Mehta" });
  assert.equal(avatar.props.style.backgroundColor, `${themes.light.accent}12`);
  assert.equal(one(avatar, "Text").props.children, "AM");
  assert.equal(one(avatar, "Text").props.style.color, themes.light.accent);
  assert.equal(one(avatar, "Text").props.style.includeFontPadding, false);
  assert.equal(one(avatar, "Text").props.style.textAlign, "center");
  assert.equal(one(avatar, "Text").props.style.textAlignVertical, "center");
  assert.equal(one(avatar, "Text").props.style.lineHeight, avatar.props.style.height);
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "Male"));
  const dob = one(tree, "Text", (node) => Array.isArray(node.props.children) && node.props.children[0] === "DOB ");
  assert.equal(dob.props.children.join(""), `DOB ${ui.bookingDateLabel("2000-01-01")}`);
  assert.equal(nodes(tree, "Text").some((node) => ["Gender", "Date of birth"].includes(node.props.children)), false);
});

test("room metadata reuses the booking flow amenity row and empty amenities render nothing", () => {
  const h = harness(); const tree = h.render(h.detailModule.Summary, { booking: record({ roomConditioning: "AC", roomCapacity: 2, roomAmenities: ["CUPBOARD"], roomCustomAmenities: ["Study table"] }) });
  const props = one(tree, "BookingRoomAmenities").props;
  assert.deepEqual(Array.from(props.amenities), ["CUPBOARD"]); assert.deepEqual(Array.from(props.custom), ["Study table"]);
  const parts = h.dependencies["@/features/booking/tenant-booking-parts"];
  const row = one(parts.BookingRoomAmenities(props), "RoomAmenityRow");
  const rendered = row.type(row.props);
  assert.equal(one(rendered, "CupboardIcon").props.color, themes.light.inkSoft);
  assert.ok(nodes(rendered, "Text").some((node) => node.props.children === "Study table"));
  assert.equal(parts.BookingRoomAmenities({ amenities: [], custom: [] }), null);
  assert.equal(h.parts.RoomAmenityRow({ room: { amenities: [], customAmenities: [] } }), null);
  assert.ok(nodes(tree, "Text").some((node) => [].concat(node.props.children).join("") === "AC · 2 sharing"));
});

test("room photo sits left of details and follows their measured height without stretching them", () => {
  const h = harness(); const props = { booking: record() }; let tree = h.render(h.detailModule.Summary, props);
  const text = one(tree, "View", (node) => typeof node.props.onLayout === "function");
  text.props.onLayout({ nativeEvent: { layout: { height: 136.4 } } });
  tree = h.render(h.detailModule.Summary, props);
  assert.equal(one(tree, "BookingRoomPhoto").props.height, 137);
  assert.equal(one(tree, "BookingRoomPhoto").props.width, "100%");
  one(tree, "View", (node) => node.props.style?.width === "46%" && nodes(node, "BookingRoomPhoto").length === 1);
  assert.equal(one(tree, "RoomRent").props.paise, 900000);
  const photo = h.dependencies["@/features/booking/tenant-booking-parts"].BookingRoomPhoto;
  assert.equal(h.render(photo, { imageUrls: [], height: 137 }).props.style.height, 137);
  assert.equal(text.props.style.height, undefined);
  const roomRow = one(tree, "View", (node) => nodes(node.props.children, "BookingRoomPhoto").length === 1 && node.props.style?.flexDirection === "row");
  assert.equal(roomRow.props.style.alignItems, "flex-start");
  assert.equal(nodes(roomRow.props.children[0], "BookingRoomPhoto").length, 1);
  assert.equal(typeof roomRow.props.children[1].props.onLayout, "function");
  assert.equal(nodes(tree, "BookingRoomAmenities").length, 0);
  const lines = nodes(text, "Text").map((node) => [].concat(node.props.children).join(""));
  assert.equal(lines.includes("Sample PG"), false);
  const pill = one(text, "View", (node) => node.props.style?.backgroundColor === themes.light.successSoft);
  assert.equal(one(pill, "Text").props.children, "One bed held for you");
});

test("rents have an inline /month suffix and token title, vector and amount share one row", () => {
  const h = harness(); const tree = h.render(h.detailModule.Summary, { booking: record() });
  const boxes = nodes(tree, "BookingFactBox");
  for (const cell of [boxes[0], boxes[1]]) {
    const suffix = one(cell, "Text", (node) => node.props.children === "/month");
    const amount = one(cell, "Text", (node) => nodes(node.props.children, "Text").includes(suffix));
    assert.equal(amount.props.numberOfLines, 1);
  }
  assert.equal(nodes(tree, "Text").some((node) => node.props.children === "per month"), false);
  const tokenRow = one(tree, "View", (node) => node.props.style?.flexDirection === "row" && nodes(node, "BookingTokenAmountIcon").length === 1);
  assert.ok(nodes(tokenRow, "Text").some((node) => node.props.children === "Token amount"));
  assert.equal(one(tokenRow, "Text", (node) => node.props.children === "Rs 500").props.style.color, themes.light.successText);
  assert.equal(one(tokenRow, "BookingTokenAmountIcon").props.color, themes.light.successText);
});

test("tenant booking empty state uses the shared 64pt vector, not a generic glyph", () => {
  const h = harness();
  const state = one(h.render(h.listModule.default), "EmptyState");
  // Both ways on, as one button cut in two (user, 2026-10-10). A visit and an enquiry each offer Book a stay.
  const pair = state.props.action.props.children;
  assert.equal(pair.type, "SplitButton");
  assert.equal(pair.props.left.label, "My visits"); assert.equal(pair.props.right.label, "My enquiries");
  pair.props.left.onPress(); pair.props.right.onPress();
  assert.deepEqual(h.routes, ["/my-visits", "/my-enquiries"]);
  // The pair has a width given to it and a height of its own, so it cannot grow to fill the page.
  assert.equal(state.props.action.props.style.maxWidth, 320);
  assert.ok(read("src/components/split-button.tsx").includes("height: 48"));
  // Every action remains inside a row instead of stretching in the scroll axis.
  assert.equal(state.props.action.props.children.type, "SplitButton");
  assert.equal(state.props.artworkNode.type, "BookingsIcon");
  assert.equal(state.props.artworkNode.props.size, 64);
  assert.equal(state.props.icon, undefined);
});
test("the person's details are carried from their profile and cannot be typed in the form", () => {
  const h = harness(); const tree = h.render(h.formModule.Form, formProps);
  // Shown, never asked for (user, 2026-10-10).
  for (const input of ["FormInput", "GenderPicker", "BookingDateField"]) assert.equal(nodes(tree, input).length, 0);
  const field = (label) => one(tree, "ReadOnlyField", (node) => node.props.label === label).props;
  assert.equal(field("Full name").value, "Sample visitor"); assert.equal(field("Email").value, "visitor@example.com");
  // A gap after the country code, as everywhere a phone is shown (user, 2026-10-10).
  assert.equal(field("Phone number").value, "+91 90000 00000");
  assert.equal(field("Date of birth").value, ui.bookingDateLabel("2000-01-01"));
  for (const label of ["Full name", "Phone number", "Date of birth"]) assert.equal(field(label).error, undefined);
  // Gender as the demo draws it: three chips with a person on each, theirs chosen, none taking a tap.
  const gender = one(tree, "BookingGenderChips").props;
  assert.equal(gender.value, "MALE"); assert.equal(gender.error, undefined);
  const chips = nodes(h.parts.BookingGenderChips({ value: "MALE" }), "ChoiceChip");
  assert.deepEqual(chips.map((chip) => [chip.props.label, chip.props.selected]), [["Male", true], ["Female", false], ["Other", false]]);
  assert.equal(chips.every((chip) => chip.props.readOnly && chip.props.icon === "UserRound" && chip.props.onPress === undefined), true);
  // A read-only chip is drawn as a plain view, so there is nothing to press.
  assert.equal(h.parts.ChoiceChip(chips[0].props).type, "View");
  assert.deepEqual(nodes(h.parts.BookingGenderChips({ value: "TRANSGENDER" }), "ChoiceChip").map((chip) => [chip.props.label, chip.props.selected]), [["Male", false], ["Female", false], ["Transgender", true]]);
  assert.equal(nodes(h.parts.BookingGenderChips({ value: null }), "ChoiceChip").some((chip) => chip.props.selected), false);
  // "Verified adult", green with its tick, only for a date of birth an ID check gave (user, 2026-10-10).
  // This profile's was typed, so the line is plain and makes no such claim.
  assert.equal(one(tree, "VerifiedAdult").props.verified, false);
  const typed = h.parts.VerifiedAdult({ verified: false });
  assert.equal(typed.props.children, "18 or older"); assert.equal(nodes(typed, "TickDisc").length, 0);
  const checked = h.render(h.formModule.Form, { ...formProps, identity: { ...identity, identityVerified: true } });
  assert.equal(one(checked, "VerifiedAdult").props.verified, true);
  const green = h.parts.VerifiedAdult({ verified: true });
  assert.equal(nodes(green, "TickDisc").length, 1); assert.equal(one(green, "Text").props.children, "Verified adult");
  assert.equal(read("app/booking-request.tsx").includes("You must be 18 or older."), false);
  assert.equal(button(tree, "Continue to rooms").props.trailingIcon, "ArrowRight");
  // The property and the visit that opened the window, above the steps.
  const card = one(tree, "BookingPropertyCard").props;
  assert.equal(card.name, "Sample PG"); assert.equal(card.area, "Salt Lake"); assert.equal(card.city, "Kolkata"); assert.equal(card.visitedOn, "2026-10-05");
  assert.equal(one(tree, "BookingStepper").props.step, 0);
  assert.equal(button(tree, "Continue to rooms").props.disabled, false);
  button(tree, "Continue to rooms").props.onPress(); assert.equal(h.values[0], 1); assert.equal(h.writes.length, 0);
});
test("a profile with no gender or date of birth blocks the form and points at the profile", () => {
  const h = harness(); const props = { ...formProps, identity: { ...identity, gender: null, dateOfBirth: null } }; const tree = h.render(h.formModule.Form, props);
  const field = (label) => one(tree, "ReadOnlyField", (node) => node.props.label === label).props;
  assert.match(one(tree, "BookingGenderChips").props.error, /in your profile/); assert.match(field("Date of birth").error, /in your profile/);
  // Nobody is called a verified adult without a date of birth that says so.
  assert.equal(nodes(tree, "VerifiedAdult").length, 0);
  assert.equal(nodes(h.render(h.formModule.Form, { ...formProps, identity: { ...identity, dateOfBirth: "2015-01-01" } }), "VerifiedAdult").length, 0);
  assert.equal(button(tree, "Continue to rooms").props.disabled, true);
  button(tree, "Continue to rooms").props.onPress(); assert.equal(h.values[0], 0);
  button(tree, "Open my profile").props.onPress(); assert.equal(h.routes[0], "/account-settings"); assert.equal(h.writes.length, 0);
});
test("the form refuses what the server would: no gender, or one the property does not take", () => {
  assert.match(form.validateBookingStep(0, draft({ gender: "UNDECLARED" }), options(), "2026-10-10").gender, /profile/);
  assert.equal(form.validateBookingStep(0, draft({ gender: "FEMALE" }), options({ pgFor: "MALE" }), "2026-10-10").gender, "This property takes men only.");
  assert.equal(form.validateBookingStep(0, draft({ gender: "MALE" }), options({ pgFor: "FEMALE" }), "2026-10-10").gender, "This property takes women only.");
  assert.equal(form.validateBookingStep(0, draft(), options(), "2026-10-10").gender, undefined);
});
test("a room's beds are listed soonest first, and its card says what can be asked for", () => {
  const two = room({ freeBeds: 0, futureBeds: [{ exitRequestId: "exit-2", checkoutDate: "2026-10-27", earliestMoveInDate: "2026-10-28", latestMoveInDate: "2026-10-31" }, { exitRequestId: "exit-1", checkoutDate: "2026-10-20", earliestMoveInDate: "2026-10-21", latestMoveInDate: "2026-10-31" }] });
  assert.deepEqual(Array.from(form.bookingRoomBeds(options(), two), (bed) => bed.exitRequestId), ["exit-1", "exit-2"]);
  const later = form.bookingRoomStatus(options(), two);
  assert.equal(later.tone, "warning"); assert.equal(later.label, `2 beds from ${ui.bookingDayLabel("2026-10-21")}`); assert.equal(later.note, `Confirmed move-out: ${ui.bookingDayLabel("2026-10-20")}`);
  // A bed free today leads, whatever is being vacated beside it.
  assert.equal(form.bookingRoomBeds(options(), room({ futureBeds: two.futureBeds }))[0].exitRequestId, null);
  assert.equal(form.bookingRoomStatus(options(), room()).label, "1 bed available now");
  assert.equal(form.bookingRoomStatus(options(), room({ available: false, freeBeds: 0, unavailableReason: "MAINTENANCE" })).label, "Under maintenance");
  const full = form.bookingRoomStatus(options(), room({ available: false, freeBeds: 0, unavailableReason: "FULL" }));
  assert.equal(full.selectable, false); assert.equal(full.label, "No vacancy");
});
test("an unanswered request lapses in seven days, or at 6 pm two days before move-in when that is sooner", () => {
  const sent = Date.parse("2026-10-10T16:00:00Z");
  const near = form.bookingReviewDeadline(sent, "2026-10-13");
  assert.equal(near.beforeMoveIn, true); assert.equal(new Date(near.at).toISOString(), "2026-10-11T12:30:00.000Z");
  const far = form.bookingReviewDeadline(sent, "2026-10-31");
  assert.equal(far.beforeMoveIn, false); assert.equal(far.at, sent + 7 * 86_400_000);
});
test("dates read as one range across a month end, and a stay elsewhere explains a late first day", () => {
  assert.equal(ui.bookingRangeLabel("2026-10-29", "2026-10-31"), `29–${ui.bookingDateLabel("2026-10-31")}`);
  assert.equal(ui.bookingRangeLabel("2026-10-29", "2026-11-03"), `${ui.bookingDayLabel("2026-10-29")} – ${ui.bookingDateLabel("2026-11-03")}`);
  assert.equal(ui.bookingRangeLabel("2026-10-29", "2026-10-29"), ui.bookingDateLabel("2026-10-29"));
  assert.equal(form.bookingStayHoldsStart({ currentStayEndsOn: "2026-10-28", earliestMoveInDate: "2026-10-29" }), true);
  assert.equal(form.bookingStayHoldsStart({ currentStayEndsOn: "2026-10-31", earliestMoveInDate: "2026-11-01" }), true);
  assert.equal(form.bookingStayHoldsStart({ currentStayEndsOn: "2026-10-11", earliestMoveInDate: "2026-10-13" }), false);
  assert.equal(form.bookingStayHoldsStart({ currentStayEndsOn: null, earliestMoveInDate: "2026-10-13" }), false);
});
test("the Room step is a list and then the chosen room's beds, and choosing holds nothing", () => {
  const future = room({ roomId: "room-2", roomNumber: "201", freeBeds: 0, futureBeds: [{ exitRequestId: "exit-1", checkoutDate: "2026-10-24", earliestMoveInDate: "2026-10-25", latestMoveInDate: "2026-10-31" }] });
  const full = room({ roomId: "room-3", roomNumber: "102", freeBeds: 0, available: false, unavailableReason: "FULL" });
  const props = { ...formProps, options: options({ rooms: [full, room(), future] }) };
  const h = harness(); h.render(h.formModule.Form, props); h.values[0] = 1;
  let tree = h.render(h.formModule.Form, props);
  assert.equal(one(tree, "ScreenHeader").props.title, "Choose a"); assert.equal(button(tree, "Continue").props.disabled, true);
  const list = one(tree, "RoomList"); const cards = nodes(list.type(list.props), "RoomChoiceCard");
  // Rooms with a bed to ask for first, the full one last and taking no choice.
  assert.deepEqual(cards.map((card) => card.props.room.roomNumber), ["101", "201", "102"]);
  assert.equal(cards[2].props.status.selectable, false);
  cards[2].props.onPress(); assert.equal(h.values[1].roomId, "");
  cards[1].props.onPress();
  assert.equal(h.values[1].roomId, "room-2"); assert.equal(h.values[1].exitRequestId, "exit-1"); assert.equal(h.values[1].moveInDate, "2026-10-25");
  tree = h.render(h.formModule.Form, props); button(tree, "Continue with 201").props.onPress();
  tree = h.render(h.formModule.Form, props);
  assert.equal(h.values[0], 1); assert.equal(one(tree, "ScreenHeader").props.title, "Your");
  const rows = nodes(tree, "BedChoiceRow");
  assert.equal(rows[0].props.title, "Current vacancy"); assert.equal(rows[0].props.disabled, true);
  assert.equal(rows[1].props.title, "Future vacancy"); assert.equal(rows[1].props.selected, true);
  assert.equal(one(tree, "BookingDateField").props.minimum, "2026-10-25"); assert.equal(one(tree, "BookingDateField").props.maximum, "2026-10-31");
  one(tree, "NoticeBar", (node) => node.props.title === "Move in after the current checkout");
  button(tree, "Continue to terms").props.onPress(); assert.equal(h.values[0], 2); assert.equal(h.writes.length, 0);
});
test("rooms are found by type and by how many share them, and the heading follows the tab", () => {
  const props = { ...formProps, options: options({ rooms: [room(), room({ roomId: "room-2", roomNumber: "202", conditioning: "NON_AC", capacity: 3 })] }) };
  const h = harness(); h.render(h.formModule.Form, props); h.values[0] = 1; h.values[9] = "TYPE"; h.values[11] = "NON_AC";
  const tree = h.render(h.formModule.Form, props);
  assert.equal(one(tree, "ScreenHeader").props.title, "Find a");
  const list = one(tree, "RoomList"); const drawn = list.type(list.props);
  assert.deepEqual(nodes(drawn, "RoomChoiceCard").map((card) => card.props.room.roomNumber), ["202"]);
  // The same card as the Room number tab, with nothing to tell it which tab it is on (user, 2026-10-10).
  assert.equal("byType" in nodes(drawn, "RoomChoiceCard")[0].props, false);
  assert.deepEqual(nodes(drawn, "ChoiceChip").map((chip) => chip.props.label), ["AC", "Non-AC", "2 sharing", "3 sharing"]);
});
test("terms show the deposit and the token a request freezes, and a lower agreed rent caps the token", () => {
  const h = harness(); h.render(h.formModule.Form, formProps); h.values[0] = 2; h.values[1] = draft({ negotiate: true, proposedRent: "1500" });
  const tree = h.render(h.formModule.Form, formProps);
  const value = (label) => one(tree, "TermRow", (node) => node.props.label === label).props.value;
  assert.equal(value("Deposit"), "Rs 9500"); assert.equal(value("Token"), "Rs 1500 · Refundable");
  assert.equal(one(tree, "BookingDateField").props.minimum, "2026-10-18");
  assert.deepEqual(nodes(tree, "RadioOption").map((option) => [option.props.label, option.props.selected]), [["Use listed rent", false], ["Negotiate rent", true], ["Indefinite", true], ["Definite", false]]);
  button(tree, "Review request").props.onPress(); assert.equal(h.values[0], 3);
});
test("review states what will be sent and when it lapses, with a way back to the room and the terms only", () => {
  const h = harness(); h.render(h.formModule.Form, formProps); h.values[0] = 3; h.values[1] = draft({ agreementMonths: 3, negotiate: true, proposedRent: "8800" });
  const tree = h.render(h.formModule.Form, formProps);
  const value = (label) => one(tree, "TermRow", (node) => node.props.label === label).props.value;
  assert.equal(value("Booking date"), ui.bookingDateLabel("2026-10-10")); assert.equal(value("Move-in date"), ui.bookingDateLabel("2026-10-18"));
  assert.equal(value("Listed rent"), "Rs 9500 / month"); assert.equal(value("Your proposed rent"), "Rs 8800 / month"); assert.equal(value("Agreement"), "Definite · 3 months");
  assert.equal(value("Token"), "Rs 2000 · Refundable");
  one(tree, "NoticeBar", (node) => node.props.title === "One bed will be reserved"); one(tree, "NoticeBar", (node) => /review window/i.test(node.props.title));
  assert.ok(nodes(tree, "Text").some((text) => text.props.children === "+91 90000 00000"));
  // The person's details are not the form's to change, so no link leads to them.
  const links = nodes(tree, "EditLink"); assert.deepEqual(links.map((link) => link.props.label), ["Room", "Terms"]);
  // Both sit on the Your details card's heading line, as the demo has them, and nowhere else (user, 2026-10-11).
  const cards = nodes(tree, "Card");
  assert.equal(nodes(cards[0], "EditLink").length, 2); assert.equal(nodes(cards[1], "EditLink").length + nodes(cards[2], "EditLink").length, 0);
  assert.ok(nodes(cards[0], "Text").some((text) => text.props.children === "Your details"));
  // The mark is a pen over its line.
  const link = h.parts.EditLink(links[0].props); assert.equal(nodes(link, "PenLine").length, 1); assert.equal(nodes(link, "Pencil").length, 0);
  // Room details carries the room type's photos, in the same window as the other steps.
  assert.ok(nodes(cards[1], "Text").some((text) => text.props.children === "Room details"));
  const reviewWindow = one(cards[1], "RoomPhotosWindow").props;
  assert.deepEqual(Array.from(reviewWindow.images), []);
  // Tall here whether or not there is a photo, with the room's lines spread to the same height beside it (user, 2026-10-11).
  assert.equal(reviewWindow.height, 132); assert.equal(reviewWindow.emptyHeight, 132);
  assert.equal(h.parts.RoomPhotosWindow(reviewWindow).props.style.height, 132);
  // Beside it (user, 2026-10-11): the property's name with no mark beside it, the room and its kind on
  // lines of their own, and the bed in a pale green pill.
  assert.equal(nodes(cards[1], "PropertyIconFilled").length + nodes(cards[1], "PropertyIcon").length, 0);
  assert.equal(read("app/booking-request.tsx").includes("PropertyIcon"), false);
  const words = nodes(cards[1], "Text").map((text) => [].concat(text.props.children).join(""));
  assert.ok(words.includes("Sample PG")); assert.ok(words.includes("Room 101")); assert.ok(words.includes("AC · 2 sharing"));
  assert.equal(words.some((line) => line.includes("Room 101 ·")), false);
  const bedPill = one(cards[1], "VacancyChip").props; assert.equal(bedPill.label, "1 current bed"); assert.equal(bedPill.tone, "success");
  links[1].props.onPress(); assert.equal(h.values[0], 2);
});
test("the hardware back button steps back through the form, not out of it", () => {
  const h = harness(); h.render(h.formModule.Form, formProps); assert.equal(h.backs.at(-1).enabled, false);
  h.values[0] = 2; h.values[1] = draft(); h.render(h.formModule.Form, formProps);
  assert.equal(h.backs.at(-1).enabled, true); assert.equal(h.backs.at(-1).handler(), true);
  // From Terms to the chosen room's beds, then the list, then Details.
  assert.equal(h.values[0], 1); assert.equal(h.values[8], true);
  h.render(h.formModule.Form, formProps); h.backs.at(-1).handler(); assert.equal(h.values[0], 1); assert.equal(h.values[8], false);
  h.render(h.formModule.Form, formProps); h.backs.at(-1).handler(); assert.equal(h.values[0], 0);
});
test("a refusal is said in a dialog, and the request can then be changed and sent again", async () => {
  const h = harness({ writeError: { status: 409 } }); h.render(h.formModule.Form, formProps); h.values[0] = 3; h.values[1] = draft();
  let tree = h.render(h.formModule.Form, formProps); button(tree, "Submit booking request").props.onPress(); await settle();
  tree = h.render(h.formModule.Form, formProps);
  assert.equal(one(tree, "AlertModal").props.message, "Please try again."); assert.equal(one(tree, "BookingStepper").props.disabled, false);
  button(tree, "Submit booking request"); one(tree, "AlertModal").props.onClose();
  assert.equal(nodes(h.render(h.formModule.Form, formProps), "AlertModal").length, 0);
});
test("an unknown submission result retries the exact body/key and freezes editing", async () => {
  const h = harness({ writeError: { status: "FETCH_ERROR" } }); h.render(h.formModule.Form, formProps); h.values[0] = 3; h.values[1] = draft();
  let tree = h.render(h.formModule.Form, formProps); button(tree, "Submit booking request").props.onPress(); button(tree, "Submit booking request").props.onPress(); await settle();
  tree = h.render(h.formModule.Form, formProps);
  // While the result is unknown no step reopens and nothing is edited. It is a state, not a refusal, so no dialog.
  assert.equal(one(tree, "BookingStepper").props.disabled, true); assert.equal(nodes(tree, "EditLink").every((link) => link.props.disabled), true); assert.equal(nodes(tree, "AlertModal").length, 0);
  one(tree, "NoticeBar", (node) => node.props.title === "Check before changing this request");
  button(tree, "Retry same request").props.onPress(); await settle();
  assert.equal(h.writes.length, 2); assert.equal(h.writes[0].payload, h.writes[1].payload); assert.equal(h.writes[0].payload.idempotencyKey, h.writes[1].payload.idempotencyKey);
});
test("successful submit opens the actual server booking, never a fabricated confirmation", async () => {
  const h = harness(); h.render(h.formModule.Form, formProps); h.values[0] = 3; h.values[1] = draft(); const tree = h.render(h.formModule.Form, formProps); button(tree, "Submit booking request").props.onPress(); await settle(); assert.equal(h.routes[0].params.requestId, "request-1");
  // What is sent names the person as their profile does.
  // The phone goes as it is stored. The gap is for reading only.
  assert.equal(h.writes[0].payload.phone, "+919000000000");
  assert.equal(h.writes[0].payload.name, "Sample visitor"); assert.equal(h.writes[0].payload.gender, "MALE"); assert.equal(h.writes[0].payload.dateOfBirth, "2000-01-01"); assert.equal(h.writes[0].payload.email, "visitor@example.com");
});
test("final offers expose accept/cancel but no invented tenant counter action", () => {
  const h = harness({ detailQuery: { currentData: record({ currentOfferNegotiable: false, allowedActions: ["ACCEPT", "CANCEL"] }) } }); const tree = h.render(h.detailModule.default);
  button(tree, "Accept Rs 9000"); assert.equal(nodes(tree, "ActionButton").some((node) => node.props.label === "Counter offer"), false);
});
test("accept and counter carry the loaded version and offer identity", async () => {
  for (const action of ["ACCEPT", "COUNTER"]) {
    const h = harness(); const tree = h.render(h.detailModule.Decision, decisionProps(action)); button(tree, action === "ACCEPT" ? "Confirm booking" : "Confirm").props.onPress(); await settle(); assert.equal(h.writes[0].payload.version, 12); assert.equal(h.writes[0].payload.offerSequence, 4);
  }
});

test("Withdraw in Awaiting handler opens the redesigned tenant cancellation sheet", () => {
  const booking = record({ status: "AWAITING_HANDLER", allowedActions: ["CANCEL"] });
  const h = harness({ detailQuery: { currentData: booking } }); let screen = h.render(h.detailModule.default);
  button(screen, "Withdraw request").props.onPress(); screen = h.render(h.detailModule.default);
  const target = one(screen, "TenantBookingDecisionSheet"); assert.equal(target.props.action, "CANCEL");
  const sheetHarness = harness(); const sheet = sheetHarness.render(sheetHarness.detailModule.Decision, target.props);
  assert.equal(sheet.props.title, "Cancel booking?"); assert.equal(sheet.props.closeButtonVariant, "raised");
  assert.equal(one(sheet, "CircleAlert").props.color, themes.light.danger);
  assert.ok(nodes(sheet, "Text").some((node) => node.props.children === "BKG-2026-000263"));
  const field = one(sheet, "FormInput");
  assert.equal(field.props.label, "Reason for cancellation"); assert.equal(field.props.required, true);
  assert.equal(field.props.labelAccessory, undefined); assert.equal(field.props.multiline, true); assert.equal(field.props.maxLength, 500);
  assert.equal(field.props.borderOnContainer, true);
  assert.equal(field.props.inputStyle.backgroundColor, themes.light.neutralSoft);
  assert.equal(nodes(sheet, "Text").some((node) => typeof node.props.children === "string" && node.props.children.startsWith("This reason will be shared")), false);
  const warning = one(sheet, "View", (node) => node.props.style?.backgroundColor === themes.light.warningSoft);
  assert.equal(nodes(warning, "AlertTriangle").length, 1);
  const notice = one(warning, "Text", (node) => node.props.children === "The reserved bed will be released.");
  assert.equal(Object.assign({}, ...notice.props.style).fontSize, 12);
  assert.equal(nodes(sheet, "NoticeBar").length, 0);
  button(sheet, "Keep booking"); assert.equal(button(sheet, "Cancel booking").props.variant, "dangerFilled");
  assert.equal(sheetHarness.writes.length, 0);
});

test("tenant withdrawal requires a reason and sends it trimmed with the loaded version", async () => {
  const h = harness(); const props = decisionProps("CANCEL", record({ status: "AWAITING_HANDLER", allowedActions: ["CANCEL"] }));
  let tree = h.render(h.detailModule.Decision, props); button(tree, "Cancel booking").props.onPress(); await settle();
  assert.equal(h.writes.length, 0);
  tree = h.render(h.detailModule.Decision, props); assert.equal(one(tree, "FormInput").props.error, "Give a reason for cancelling.");
  one(tree, "FormInput").props.onChangeText("  My move-in plans changed  ");
  tree = h.render(h.detailModule.Decision, props); button(tree, "Cancel booking").props.onPress(); button(tree, "Cancel booking").props.onPress(); await settle();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].kind, "cancel");
  assert.equal(h.writes[0].payload.reason, "My move-in plans changed"); assert.equal(h.writes[0].payload.version, 12); assert.equal(h.writes[0].payload.requestId, "request-1");
});

test("cancellation reason is sent in the actual tenant API request body with If-Match", () => {
  const endpoint = tenantCollectionEndpoint("cancelMyBooking");
  const request = endpoint.query({ requestId: "request-1", version: 12, reason: "My move-in plans changed" });
  assert.equal(request.url, "/api/v1/booking-requests/request-1/cancel"); assert.equal(request.method, "POST");
  assert.equal(request.headers["If-Match"], "12"); assert.equal(request.body.reason, "My move-in plans changed");
  assert.deepEqual(Array.from(endpoint.invalidatesTags), ["Booking"]);
});

test("new cancellation sheet retains confirmed-booking policy and refuses oversized or stale reasons", async () => {
  const h = harness(); const props = decisionProps("CANCEL", record({ status: "CONFIRMED", tokenRequired: false }));
  let tree = h.render(h.detailModule.Decision, props);
  assert.ok(nodes(tree, "Text").some((node) => typeof node.props.children === "string" && node.props.children.includes("prevents booking this property for 30 days")));
  one(tree, "FormInput").props.onChangeText("x".repeat(501)); tree = h.render(h.detailModule.Decision, props);
  button(tree, "Cancel booking").props.onPress(); await settle(); assert.equal(h.writes.length, 0);
  tree = h.render(h.detailModule.Decision, props); assert.equal(one(tree, "FormInput").props.error, "Keep the reason within 500 characters.");
  one(tree, "FormInput").props.onChangeText("My plans changed");
  tree = h.render(h.detailModule.Decision, { ...props, booking: { ...props.booking, version: 13 } });
  assert.equal(button(tree, "Cancel booking").props.disabled, true); button(tree, "Cancel booking").props.onPress(); await settle(); assert.equal(h.writes.length, 0);
});
test("date push uses server latestPushDate, not request date + 28", () => {
  const h = harness(); const tree = h.render(h.detailModule.Decision, decisionProps("PUSH_DATE", record({ latestPushDate: "2026-11-09", allowedMoveInActions: ["PUSH_DATE"] })));
  assert.equal(one(tree, "BookingDateField").props.minimum, "2026-10-23"); assert.equal(one(tree, "BookingDateField").props.maximum, "2026-11-09");
});
test("changed or expired records disable a pending decision even without a version change", () => {
  const h = harness(); h.render(h.detailModule.Decision, decisionProps("ACCEPT")); const tree = h.render(h.detailModule.Decision, decisionProps("ACCEPT", record({ allowedActions: [], status: "EXPIRED" }))); assert.equal(button(tree, "Confirm booking").props.disabled, true);
});
// The desk takes all four at every property, whatever its bills take. That is the server's answer, always.
const tokenPay = (overrides = {}) => ({ amountPaise: 200000, referenceCode: "BKG-2026-000263", acceptedMethods: ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE"], deskMethods: ["CASH", "CARD", "UPI", "CHEQUE"],
  payee: { payeeName: "Sample PG", upiVpa: "pg@upi", upiPhone: "9000000000", upiQrImageUrl: "https://img/qr", bankAccountNumber: "1234", bankIfsc: "IFSC0001", bankAccountHolder: "Sample PG", hasBankDetails: true }, ...overrides });
// Where to pay has one picker, the way. The desk's proof step has one too: how the token was handed over there.
const picked = (tree) => one(tree, "PaymentMethodDropdown").props;
const labels = (picker) => [...picker.options].map((option) => option.label);
const DESK_WORDS = "Hand over the amount at the property desk, either via cash, card, UPI or cheque. If you have already done so, you can submit the proof here.";

test("the token pay sheet offers UPI, a bank transfer and Paid at desk, each by what the property takes", () => {
  const h = harness();
  // From elsewhere a token is paid by UPI or a bank transfer. At the desk in cash, by card, by UPI or by cheque, never by transfer.
  assert.deepEqual([...h.paid.tokenPaidMethods(["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE"])], ["UPI", "BANK_TRANSFER"]);
  assert.deepEqual([...h.paid.tokenDeskMethods(["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE"])], ["CASH", "CARD", "UPI", "CHEQUE"]);
  const props = { booking: record({ allowedTokenActions: ["CLAIM_PAID"] }), onClose() {}, onDone() {} };

  // Everything taken: three lines in the picker, in that order, UPI first.
  const all = harness({ payQuery: { currentData: tokenPay() } });
  let tree = all.render(all.paid.BookingTokenPaidSheet, props);
  assert.deepEqual(labels(picked(tree)), ["UPI", "Bank transfer", "Paid at desk"]);
  assert.equal(picked(tree).value, "UPI"); assert.equal(picked(tree).options[2].icon, "desk");

  // A property with no UPI or bank details for its token, which is every property until its owner adds some: no
  // picker, the bill sheet's desk card in the user's words, and the button. No dead end.
  const desk = harness({ payQuery: { currentData: tokenPay({ acceptedMethods: ["CASH"], payee: null }) } });
  tree = desk.render(desk.paid.BookingTokenPaidSheet, props);
  assert.equal(one(tree, "SheetShell").props.title, "Pay Rs 2000");
  assert.equal(nodes(tree, "PaymentMethodDropdown").length, 0); assert.equal(nodes(tree, "UpiTab").length, 0);
  const card = one(tree, "DeskTab").props;
  assert.equal(card.title, "Pay at desk"); assert.equal(card.message, DESK_WORDS); assert.equal(card.method, "CASH");
  button(tree, "Submit payment proof");
  assert.equal(nodes(tree, "NoticeBar").some((node) => node.props.title === "Pay at the property"), false);
});
test("View/Record payment shows where to pay as the bill's pay sheet does, then asks for that way's proof", async () => {
  const props = { booking: record({ allowedTokenActions: ["CLAIM_PAID"] }), onClose() {}, onDone() {} };
  const h = harness({ payQuery: { currentData: tokenPay() } });
  let tree = h.render(h.paid.BookingTokenPaidSheet, props);

  // Step one is the pay sheet: the amount as its title, who and which booking, and the picker.
  assert.equal(one(tree, "SheetShell").props.title, "Pay Rs 2000");
  const said = nodes(tree, "Text").map((text) => [].concat(text.props.children).map((part) => typeof part === "object" && part ? [].concat(part.props.children).join("") : part).join(""));
  assert.ok(said.includes("Sample PG · BKG-2026-000263"));
  // UPI: the QR and the address to copy, no app to open, and "Submit payment proof" where Scan and pay sits on a bill.
  const upi = one(tree, "UpiTab").props;
  assert.equal(upi.hasPayLink, false); assert.equal(upi.payee.upiQrImageUrl, "https://img/qr"); assert.equal(upi.payee.upiVpa, "pg@upi");
  assert.equal(nodes(tree, "PaymentProofForm").length, 0); assert.equal(nodes(tree, "BankTab").length, 0);
  button(upi.action, "Submit payment proof").props.onPress(); tree = h.render(h.paid.BookingTokenPaidSheet, props);

  // Step two: the bill claim's proof form for that way, with a way back.
  assert.equal(one(tree, "SheetShell").props.title, "Submit payment proof");
  assert.equal(nodes(tree, "UpiTab").length, 0); assert.equal(nodes(tree, "PaymentMethodDropdown").length, 0);
  let proof = one(tree, "PaymentProofForm").props;
  assert.equal(proof.method, "UPI"); assert.equal(typeof proof.onBack, "function"); assert.equal(proof.referenceCode, "BKG-2026-000263"); assert.equal(proof.boxedProof, true);
  assert.equal(proof.submitLabel, "Submit payment proof"); assert.equal(proof.skipLabel, undefined);
  assert.equal(proof.requireProof, true); assert.equal(proof.showOptionalHint, false);
  // A reference, photos or both. More than two photos are not sent. The loaded version is. Not at the desk.
  proof.onSubmit({ referenceText: "123456789012", proofImageUrls: ["a", "b", "c"] }); await settle();
  assert.equal(h.writes[0].kind, "claim");
  assert.deepEqual({ ...h.writes[0].payload, proofImageUrls: [...h.writes[0].payload.proofImageUrls] }, { requestId: "request-1", version: 12, method: "UPI", paidAtDesk: false, reference: "123456789012", proofImageUrls: ["a", "b"] });

  // A bank transfer: the account, then the same button under it. Back returns to where to pay.
  const bank = harness({ payQuery: { currentData: tokenPay() } });
  tree = bank.render(bank.paid.BookingTokenPaidSheet, props);
  picked(tree).onChange("BANK_TRANSFER"); tree = bank.render(bank.paid.BookingTokenPaidSheet, props);
  assert.equal(one(tree, "BankTab").props.referenceCode, "BKG-2026-000263"); assert.equal(nodes(tree, "UpiTab").length, 0);
  button(tree, "Submit payment proof").props.onPress(); tree = bank.render(bank.paid.BookingTokenPaidSheet, props);
  proof = one(tree, "PaymentProofForm").props; assert.equal(proof.method, "BANK_TRANSFER"); assert.equal(proof.boxedProof, true);
  proof.onBack(); tree = bank.render(bank.paid.BookingTokenPaidSheet, props);
  assert.equal(nodes(tree, "PaymentProofForm").length, 0); assert.equal(picked(tree).value, "BANK_TRANSFER"); one(tree, "BankTab");
  button(tree, "Submit payment proof").props.onPress(); tree = bank.render(bank.paid.BookingTokenPaidSheet, props);
  one(tree, "PaymentProofForm").props.onSubmit({ referenceText: null, proofImageUrls: [] }); await settle();
  assert.equal(bank.writes.length, 0, "empty non-cash proof never reaches the API");
  tree = bank.render(bank.paid.BookingTokenPaidSheet, props);
  one(tree, "AlertModal");
  one(tree, "PaymentProofForm").props.onSubmit({ referenceText: " BANK-01 ", proofImageUrls: [] }); await settle();
  assert.deepEqual({ method: bank.writes[0].payload.method, paidAtDesk: bank.writes[0].payload.paidAtDesk, reference: bank.writes[0].payload.reference }, { method: "BANK_TRANSFER", paidAtDesk: false, reference: "BANK-01" });

  // A booking that moved since the sheet opened goes no further and sends nothing.
  const stale = harness({ payQuery: { currentData: tokenPay({ acceptedMethods: ["BANK_TRANSFER"], deskMethods: [] }) } });
  tree = stale.render(stale.paid.BookingTokenPaidSheet, props);
  assert.equal(nodes(tree, "PaymentMethodDropdown").length, 0); one(tree, "BankTab");
  button(tree, "Submit payment proof").props.onPress();
  tree = stale.render(stale.paid.BookingTokenPaidSheet, { ...props, booking: record({ allowedTokenActions: [], version: 13 }) });
  assert.equal(one(tree, "PaymentProofForm").props.disabled, true);
  one(tree, "PaymentProofForm").props.onSubmit({ referenceText: "1", proofImageUrls: [] }); await settle();
  assert.equal(stale.writes.length, 0); one(tree, "NoticeBar", (node) => node.props.title === "The booking changed");

  // On the booking the pay button leads, with Withdraw request under it.
  const due = harness({ detailQuery: { currentData: record({ status: "AWAITING_TOKEN", allowedActions: ["CANCEL"], allowedTokenActions: ["CLAIM_PAID"] }) } });
  assert.deepEqual(nodes(one(due.render(due.detailModule.default), "PinnedFooter"), "ActionButton").map((node) => node.props.label), ["View/Record payment", "Withdraw request"]);
  // The button that opens it, and the old sheet is gone.
  const screen = read("app/my-booking-detail.tsx");
  assert.ok(screen.includes('<ActionButton label="View/Record payment" onPress={() => setPayOpen(true)} />')); assert.equal(screen.includes('label="Record token paid"'), false); assert.equal(screen.includes("TenantTokenPaySheet"), false); assert.equal(screen.includes("I've paid"), false);
  // The pay sheet's UPI block puts a caller's own button where Scan and pay sits, and a bill's picker is built from its methods.
  const billSheet = read("src/features/billing/pay-bill-sheet.tsx");
  assert.ok(billSheet.includes("{action ? action : hasPayLink ? (")); assert.ok(billSheet.includes("<PaymentMethodDropdown onChange={setTab} options={payMethodOptions(tabs)} value={tab} />"));
});
test("Paid at desk: the desk card, then with the proof how it was handed over, cash, card, UPI or cheque", async () => {
  const props = { booking: record({ allowedTokenActions: ["CLAIM_PAID"] }), onClose() {}, onDone() {} };
  const h = harness({ payQuery: { currentData: tokenPay() } });
  let tree = h.render(h.paid.BookingTokenPaidSheet, props);
  picked(tree).onChange("DESK"); tree = h.render(h.paid.BookingTokenPaidSheet, props);

  // Where to pay: no QR, no account and nothing to pick yet. One card for the desk, and the button.
  assert.equal(picked(tree).value, "DESK"); assert.equal(nodes(tree, "PaymentMethodDropdown").length, 1);
  assert.equal(nodes(tree, "UpiTab").length, 0); assert.equal(nodes(tree, "BankTab").length, 0);
  const card = one(tree, "DeskTab").props; assert.equal(card.title, "Pay at desk"); assert.equal(card.message, DESK_WORDS);
  button(tree, "Submit payment proof").props.onPress(); tree = h.render(h.paid.BookingTokenPaidSheet, props);

  // The proof step opens as any other does, then asks how it was paid at the desk: all four, cash first.
  assert.equal(one(tree, "SheetShell").props.title, "Submit payment proof");
  const heading = one(tree, "PaymentProofHeading").props; assert.equal(heading.label, "Paid at desk"); assert.equal(heading.icon, "desk"); assert.equal(typeof heading.onBack, "function");
  assert.deepEqual(labels(picked(tree)), ["Cash", "Card", "UPI", "Cheque"]); assert.equal(picked(tree).value, "CASH");
  // The proof under it is that way's own, named by the picker and not a second time.
  let proof = one(tree, "PaymentProofForm").props; assert.equal(proof.method, "CASH"); assert.equal(proof.hideMethod, true); assert.equal(proof.onBack, undefined); assert.equal(proof.boxedProof, true);
  assert.equal(proof.requireProof, false); assert.equal(proof.showOptionalHint, false);
  proof.onSubmit({ referenceText: null, proofImageUrls: ["receipt"] }); await settle();
  assert.deepEqual({ ...h.writes[0].payload, proofImageUrls: [...h.writes[0].payload.proofImageUrls] }, { requestId: "request-1", version: 12, method: "CASH", paidAtDesk: true, reference: null, proofImageUrls: ["receipt"] });

  // Another way at the desk: its own proof form. UPI at the desk is not UPI paid from elsewhere.
  for (const method of ["CARD", "UPI", "CHEQUE"]) {
    const other = harness({ payQuery: { currentData: tokenPay() } });
    let drawn = other.render(other.paid.BookingTokenPaidSheet, props);
    picked(drawn).onChange("DESK"); drawn = other.render(other.paid.BookingTokenPaidSheet, props);
    button(drawn, "Submit payment proof").props.onPress(); drawn = other.render(other.paid.BookingTokenPaidSheet, props);
    picked(drawn).onChange(method); drawn = other.render(other.paid.BookingTokenPaidSheet, props);
    assert.equal(picked(drawn).value, method);
    const form = one(drawn, "PaymentProofForm").props; assert.equal(form.method, method); assert.equal(form.boxedProof, true);
    assert.equal(form.requireProof, true); assert.equal(form.showOptionalHint, false);
    form.onSubmit({ referenceText: "R1", proofImageUrls: [] }); await settle();
    assert.equal(other.writes[0].payload.method, method); assert.equal(other.writes[0].payload.paidAtDesk, true); assert.equal(other.writes[0].payload.reference, "R1");
  }
  // Back returns to the desk card, and coming forward again the way that was chosen is still chosen.
  const back = harness({ payQuery: { currentData: tokenPay() } });
  tree = back.render(back.paid.BookingTokenPaidSheet, props);
  picked(tree).onChange("DESK"); tree = back.render(back.paid.BookingTokenPaidSheet, props);
  button(tree, "Submit payment proof").props.onPress(); tree = back.render(back.paid.BookingTokenPaidSheet, props);
  picked(tree).onChange("CHEQUE"); tree = back.render(back.paid.BookingTokenPaidSheet, props);
  one(tree, "PaymentProofHeading").props.onBack(); tree = back.render(back.paid.BookingTokenPaidSheet, props);
  assert.equal(picked(tree).value, "DESK"); one(tree, "DeskTab"); assert.equal(nodes(tree, "PaymentProofForm").length, 0);
  button(tree, "Submit payment proof").props.onPress(); tree = back.render(back.paid.BookingTokenPaidSheet, props);
  assert.equal(picked(tree).value, "CHEQUE"); assert.equal(one(tree, "PaymentProofForm").props.method, "CHEQUE");
  // The desk card is the bill sheet's own, with a heading of the caller's for a card that stands for the desk.
  const billSheet = read("src/features/billing/pay-bill-sheet.tsx");
  assert.ok(billSheet.includes('export function DeskTab(')); assert.ok(billSheet.includes('const title = named ?? ('));
});
test("the proof form is the bill claim's own fields, and a bill's claim still goes where it went", async () => {
  const sent = []; const h = harness();
  const real = load(read("src/features/billing/raise-claim-modal.tsx"), { ...h.dependencies, "@expo/vector-icons": { MaterialCommunityIcons: "MaterialCommunityIcons" }, "@/components/app-text-input": { AppTextInput: "AppTextInput" },
    "@/store/services/payment-intent-api": { useRaisePaymentClaimMutation: () => [(payload) => ({ unwrap: async () => { sent.push(payload); } }), { isLoading: false }] } });
  const proofs = [];
  const props = { busy: false, method: "UPI", referenceCode: "BKG-2026-000263", onSubmit: (proof) => proofs.push(proof), submitLabel: "Record token paid", skipLabel: "Skip and record" };
  let tree = h.render(real.PaymentProofForm, props);
  // No back arrow without somewhere to go back to, and the method is still named.
  const headingOf = (from) => { const found = one(from, "PaymentProofHeading"); return real.PaymentProofHeading(found.props); };
  let heading = headingOf(tree);
  assert.equal(nodes(heading, "AnimatedPressable").length, 0); assert.equal(nodes(heading, "MaterialCommunityIcons").length, 1);
  assert.ok(nodes(heading, "Text").some((text) => text.props.children === "UPI"));
  // The method's own reference field, and a photo, as a bill's claim asks.
  const field = one(tree, "AppTextInput"); assert.equal(field.props.maxLength, 12); assert.equal(one(tree, "MultiImageField").props.max, 2);
  button(tree, "Skip and record").props.onPress();
  field.props.onChangeText("1234 5678 9012"); tree = h.render(real.PaymentProofForm, props);
  button(tree, "Record token paid").props.onPress();
  assert.deepEqual(proofs.map((proof) => ({ ...proof, proofImageUrls: [...proof.proofImageUrls] })), [{ proofImageUrls: [], referenceText: null }, { proofImageUrls: [], referenceText: "123456789012" }]);
  // Named by a picker above: no method line at all. Blocked: nothing can be sent.
  const hidden = harness(); tree = hidden.render(real.PaymentProofForm, { ...props, hideMethod: true, disabled: true });
  assert.equal(nodes(tree, "PaymentProofHeading").length, 0); assert.equal(button(tree, "Skip and record").props.disabled, true);

  // Cash, for a token handed over at the desk: nothing to type, a receipt to photograph, and still optional.
  const cash = harness(); const cashSent = [];
  tree = cash.render(real.PaymentProofForm, { ...props, method: "CASH", onSubmit: (proof) => cashSent.push(proof) });
  assert.equal(nodes(tree, "AppTextInput").length, 0); assert.equal(one(tree, "MultiImageField").props.label, "Photo of the receipt, if you were given one");
  assert.equal(nodes(tree, "Text").some((text) => text.props.children === "or"), false);
  button(tree, "Skip and record").props.onPress(); assert.equal(cashSent[0].referenceText, null);
  // Every other way keeps its own reference field and the "or" before the photo.
  tree = harness().render(real.PaymentProofForm, { ...props, method: "CHEQUE" });
  assert.equal(nodes(tree, "AppTextInput").length, 1); assert.ok(nodes(tree, "Text").some((text) => text.props.children === "or"));

  // The bill's claim card is that form with a back arrow, its own words, and the bill's request.
  const bill = harness(); tree = bill.render(real.RaiseClaimCard, { billingCycleId: "cycle-1", billVersion: 4, method: "BANK_TRANSFER", onBack() {}, onSent() {}, referenceCode: "BIL-1" });
  const form = one(tree, "PaymentProofForm").props; assert.equal(typeof form.onBack, "function"); assert.equal(form.submitLabel, undefined); assert.equal(form.method, "BANK_TRANSFER"); assert.equal(form.boxedProof, true);
  const drawn = bill.render(real.PaymentProofForm, form);
  heading = headingOf(drawn);
  assert.equal(one(heading, "AnimatedPressable").props.accessibilityLabel, "Back to payment methods"); assert.ok(nodes(heading, "Text").some((text) => text.props.children === "Bank transfer"));
  button(drawn, "Skip and send");
  form.onSubmit({ proofImageUrls: ["x"], referenceText: "UTR1" }); await settle();
  assert.deepEqual({ ...sent[0], proofImageUrls: [...sent[0].proofImageUrls] }, { billingCycleId: "cycle-1", version: 4, method: "BANK_TRANSFER", proofImageUrls: ["x"], referenceText: "UTR1" });
});

test("proof fields share a grey panel below the ID for every method, while an optional plain layout remains available", () => {
  const dependencies = { ...harness().dependencies,
    "@/components/app-text-input": { AppTextInput: "AppTextInput" },
    "@/store/services/payment-intent-api": { useRaisePaymentClaimMutation: () => [] },
  };
  const real = load(read("src/features/billing/raise-claim-modal.tsx"), dependencies);
  for (const method of ["UPI", "BANK_TRANSFER", "CASH", "CARD", "CHEQUE"]) {
    for (const hideMethod of [false, true]) {
      const h = harness();
      const tree = h.render(real.PaymentProofForm, { boxedProof: true, busy: false, hideMethod, method, referenceCode: "BKG-1", onSubmit() {} });
      const panel = one(tree, "View", (node) => node.props.style?.padding === spacing.md
        && node.props.style.backgroundColor === themes.light.surfaceSunken);
      assert.equal(panel.props.style.borderRadius, radii.card);
      assert.equal(one(panel, "MultiImageField").props.max, 2);
      assert.equal(one(panel, "MultiImageField").props.target, "PAYMENT_PROOF");
      assert.equal(nodes(panel, "ReceiptText").length, 0, "booking ID remains outside the grey panel");
      assert.equal(nodes(panel, "ActionButton").length, 0, "submit button remains outside the grey panel");
      const fields = nodes(panel, "AppTextInput");
      assert.equal(fields.length, method === "CASH" ? 0 : 1);
      if (fields.length) assert.equal(fields[0].props.style.backgroundColor, themes.light.surface);
      const children = tree.props.children.filter(Boolean);
      const panelIndex = children.indexOf(panel);
      assert.ok(panelIndex > 0);
      assert.equal(one(children[panelIndex - 1], "Text").props.children, "BKG-1");
    }
  }
  const tree = harness().render(real.PaymentProofForm, { busy: false, method: "UPI", referenceCode: "BIL-1", onSubmit() {} });
  const plain = one(tree, "View", (node) => node.props.style?.padding === 0 && nodes(node, "MultiImageField").length === 1);
  assert.equal(plain.props.style.backgroundColor, undefined);
  assert.equal(one(plain, "AppTextInput").props.style.backgroundColor, undefined);
});

test("every bill raise-claim method uses the grey proof panel and preserves the claim request", async () => {
  for (const method of ["UPI", "BANK_TRANSFER", "CARD", "CHEQUE"]) {
    const h = harness();
    const sent = [];
    let wentBack = 0;
    let completed = 0;
    const real = load(read("src/features/billing/raise-claim-modal.tsx"), { ...h.dependencies,
      "@/components/app-text-input": { AppTextInput: "AppTextInput" },
      "@/store/services/payment-intent-api": { useRaisePaymentClaimMutation: () => [
        (payload) => ({ unwrap: async () => { sent.push(payload); } }), { isLoading: false },
      ] },
    });
    const tree = h.render(real.RaiseClaimCard, {
      billingCycleId: "cycle-1", billVersion: 4, method, referenceCode: "BIL-1",
      onBack: () => wentBack++, onSent: () => completed++,
    });
    const form = one(tree, "PaymentProofForm").props;
    assert.equal(form.boxedProof, true);
    assert.equal(form.method, method);
    assert.equal(form.referenceCode, "BIL-1");
    assert.equal(form.submitLabel, undefined, "bill claim keeps its existing submit labels");
    assert.equal(form.requireProof, undefined, "bill claim still permits no evidence");
    assert.equal(form.showOptionalHint, undefined, "bill claim keeps its optional information row");
    form.onBack();
    assert.equal(wentBack, 1);
    form.onSubmit({ proofImageUrls: ["receipt"], referenceText: "REF1" });
    await settle();
    assert.deepEqual({ ...sent[0], proofImageUrls: [...sent[0].proofImageUrls] }, {
      billingCycleId: "cycle-1", version: 4, method, referenceText: "REF1", proofImageUrls: ["receipt"],
    });
    assert.equal(completed, 1);
  }
});

test("required payment proof accepts reference or photo, never blanks, and hides the optional information row", () => {
  for (const method of ["UPI", "BANK_TRANSFER", "CARD", "CHEQUE"]) {
    const h = harness();
    const submitted = [];
    const real = load(read("src/features/billing/raise-claim-modal.tsx"), { ...h.dependencies,
      "@/components/app-text-input": { AppTextInput: "AppTextInput" },
      "@/store/services/payment-intent-api": { useRaisePaymentClaimMutation: () => [] },
    });
    const props = { boxedProof: true, busy: false, method, referenceCode: "BKG-1", requireProof: true,
      showOptionalHint: false, submitLabel: "Submit payment proof", onSubmit: (proof) => submitted.push(proof) };
    let tree = h.render(real.PaymentProofForm, props);
    assert.equal(nodes(tree, "Info").length, 0);
    assert.equal(nodes(tree, "Text").some((node) => node.props.children === "Optional, but helps find your payment faster."), false);
    assert.equal(nodes(tree, "Text").some((node) => node.props.children === "Enter a transaction reference or upload a payment photo."), false);
    assert.equal(button(tree, "Submit payment proof").props.disabled, true);
    button(tree, "Submit payment proof").props.onPress();
    assert.equal(submitted.length, 0);
    one(tree, "AppTextInput").props.onChangeText("  \t ");
    one(tree, "MultiImageField").props.onChange(["", "  "]);
    tree = h.render(real.PaymentProofForm, props);
    assert.equal(button(tree, "Submit payment proof").props.disabled, true);
    button(tree, "Submit payment proof").props.onPress();
    assert.equal(submitted.length, 0);
    one(tree, "MultiImageField").props.onChange(["https://img/proof"]);
    tree = h.render(real.PaymentProofForm, props);
    assert.equal(button(tree, "Submit payment proof").props.disabled, false);
    button(tree, "Submit payment proof").props.onPress();
    assert.equal(submitted[0].referenceText, null);
    assert.deepEqual([...submitted[0].proofImageUrls], ["https://img/proof"]);
    one(tree, "MultiImageField").props.onChange([]);
    tree = h.render(real.PaymentProofForm, props);
    assert.equal(button(tree, "Submit payment proof").props.disabled, true);
    one(tree, "AppTextInput").props.onChangeText("123456789012");
    tree = h.render(real.PaymentProofForm, props);
    assert.equal(button(tree, "Submit payment proof").props.disabled, false);
    button(tree, "Submit payment proof").props.onPress();
    assert.equal(submitted[1].referenceText, "123456789012");
    assert.deepEqual([...submitted[1].proofImageUrls], []);
    const blocked = h.render(real.PaymentProofForm, { ...props, disabled: true });
    button(blocked, "Submit payment proof").props.onPress();
    assert.equal(submitted.length, 2);
  }
});

test("only booking Cash at desk can skip receipt proof, with no optional information icon", async () => {
  const props = { booking: record({ allowedTokenActions: ["CLAIM_PAID"] }), onClose() {}, onDone() {} };
  for (const method of ["CASH", "CARD", "UPI", "CHEQUE"]) {
    const h = harness({ payQuery: { currentData: tokenPay() } });
    let tree = h.render(h.paid.BookingTokenPaidSheet, props);
    picked(tree).onChange("DESK"); tree = h.render(h.paid.BookingTokenPaidSheet, props);
    button(tree, "Submit payment proof").props.onPress(); tree = h.render(h.paid.BookingTokenPaidSheet, props);
    picked(tree).onChange(method); tree = h.render(h.paid.BookingTokenPaidSheet, props);
    const form = one(tree, "PaymentProofForm").props;
    assert.equal(form.requireProof, method !== "CASH");
    assert.equal(form.showOptionalHint, false);
    form.onSubmit({ referenceText: " \t ", proofImageUrls: [" "] }); await settle();
    assert.equal(h.writes.length, method === "CASH" ? 1 : 0);
    if (method === "CASH") {
      assert.equal(h.writes[0].payload.reference, null);
      assert.deepEqual([...h.writes[0].payload.proofImageUrls], []);
    }
  }
  const h = harness();
  const submitted = [];
  const real = load(read("src/features/billing/raise-claim-modal.tsx"), { ...h.dependencies,
    "@/components/app-text-input": { AppTextInput: "AppTextInput" },
    "@/store/services/payment-intent-api": { useRaisePaymentClaimMutation: () => [] },
  });
  const tree = h.render(real.PaymentProofForm, { boxedProof: true, busy: false, method: "CASH", referenceCode: "BKG-1",
    requireProof: false, showOptionalHint: false, skipLabel: "Submit without proof", onSubmit: (proof) => submitted.push(proof) });
  assert.equal(nodes(tree, "Info").length, 0);
  assert.equal(nodes(tree, "AppTextInput").length, 0);
  assert.equal(button(tree, "Submit without proof").props.disabled, false);
  button(tree, "Submit without proof").props.onPress();
  assert.equal(submitted[0].referenceText, null);
  assert.deepEqual([...submitted[0].proofImageUrls], []);
});

test("a refused payment claim displays the property's reason", () => {
  const h = harness();
  const tree = h.render(h.detailModule.Claims, { token: { claims: [{ sequence: 1, method: "UPI", claimedAt: "2026-10-10T12:00:00Z", answer: "NOT_RECEIVED", answerReason: "Check the destination UPI ID.", reference: "reference-1" }] } });
  assert.equal(one(tree, "NoticeBar").props.message, "Check the destination UPI ID.");
});

test("the tenant uses the shared claims layout with the owner artwork and can open the submitted proof", () => {
  const h = harness();
  const claim = { sequence: 1, method: "UPI", reference: "123456789012", proofImageUrls: ["proof-1", "proof-2"], claimedAt: "2026-10-11T08:00:00Z", answer: null, answerReason: null, answeredAt: null };
  const tree = h.render(h.detailModule.Claims, { token: { claims: [claim] } });
  assert.equal(h.detailModule.Claims, h.dependencies["@/features/booking/booking-payment-claims"].BookingPaymentClaims);
  assert.equal(one(tree, "PaymentClaimsIcon").props.size, 27);
  assert.equal(one(tree, "PaymentMethodIcon").props.method, "UPI");
  assert.deepEqual([...one(tree, "TokenProofImages").props.urls], ["proof-1", "proof-2"]);
  assert.equal(one(tree, "Text", (node) => node.props.children === "123456789012").props.selectable, true);
});

test("a pending claim removes the tenant's paid chip and running deadline and shows only the paused-window notice", () => {
  const h = harness();
  const booking = record({ status: "AWAITING_TOKEN", tokenRequired: true, tokenDueAt: "2026-10-12T22:20:00Z", token: { status: "CLAIMED", amountPaise: 50000, claimWaiting: true, claims: [] } });
  const tree = h.render(h.detailModule.Summary, { booking });
  assert.equal(nodes(tree, "StatusPill").length, 0);
  assert.equal(nodes(tree, "BookingInfoBand").some((node) => node.props.tone === "warning"), false);
  const notice = one(tree, "NoticeBar", (node) => node.props.title === "Payment window paused").props;
  assert.equal(notice.tone, "info");
  assert.equal(notice.message, "The token payment window has been paused until the token payment claim is verified.");
  assert.equal(read("app/my-booking-detail.tsx").includes("A claim is not yet a receipt"), false);
});

test("a converted booking opens the existing tenant agreement flow", () => {
  const h = harness();
  const tree = h.render(h.detailModule.Summary, { booking: record({ tenancyId: "stay-1", status: "CONFIRMED", allowedActions: [] }) });
  button(tree, "Open my tenancy").props.onPress();
  assert.equal(h.routes[0], "/(tabs)/tenancy");
});

test("a person's phone is shown with a gap after the country code on every screen that names one", () => {
  const display = load(read("src/features/owner/phone-display.ts"));
  assert.equal(display.formatIndianPhone("+919876543210"), "+91 98765 43210"); assert.equal(display.formatIndianPhone("9876543210"), "+91 98765 43210");
  const shown = { "app/booking-request.tsx": 2, "app/account-settings.tsx": 4, "app/owner-concern-detail.tsx": 1, "app/owner-tenant-bills.tsx": 1, "app/owner-enquiries.tsx": 1, "src/features/food/owner-food-subscribers.tsx": 1, "src/features/owner/staff-workspace.tsx": 3, "src/features/owner/tenancy-list.tsx": 1, "src/features/property/property-contacts-section.tsx": 2, "src/features/discovery/components/property-profile.tsx": 1, "src/store/services/enquiry-api.ts": 1 };
  for (const [file, uses] of Object.entries(shown)) {
    const source = read(file);
    assert.equal(source.split("formatIndianPhone(").length - 1, uses, file);
    // And no bare number left beside it in the text a person reads. A number handed on as a prop is not text.
    assert.equal(/(?<!=)\{(person\.tenantPhone|employment\.phone|assignment\.managerPhone|manager\.managerPhone|contact\.phone|person\.phone|phone)\}/.test(source), false, file);
  }
});

test("a room card is chosen by a pale blue fill, with no blue border and no radio", () => {
  const h = harness(); const light = themes.light;
  const props = { room: room({ amenities: ["CUPBOARD", "TV"], customAmenities: ["Balcony"] }), status: form.bookingRoomStatus(options(), room()), onPress() {} };
  const chosen = h.parts.RoomChoiceCard({ ...props, selected: true }); const plain = h.parts.RoomChoiceCard({ ...props, selected: false });
  assert.equal(chosen.props.style.backgroundColor, light.primarySoft); assert.equal(plain.props.style.backgroundColor, light.surface);
  // The border is the same plain one either way, never the blue.
  assert.equal(chosen.props.style.borderColor, plain.props.style.borderColor); assert.notEqual(chosen.props.style.borderColor, light.primary);
  assert.equal(chosen.props.style.borderWidth, plain.props.style.borderWidth);
  assert.equal(nodes(chosen, "RadioMark").length, 0);
  // The vacancy chip is the first thing after the number, on its line, and the amenities are drawn with their glyphs.
  const top = chosen.props.children[0].props.children[0].props.children;
  assert.equal(top[1].type.name, "VacancyChip"); assert.equal(top[1].props.label, "1 bed available now"); assert.equal(top[1].props.tone, "success");
  const amenities = one(chosen, "RoomAmenityRow"); assert.equal("words" in amenities.props, false);
  const drawn = h.parts.RoomAmenityRow(amenities.props);
  assert.deepEqual(nodes(drawn, "CupboardIcon").length + nodes(drawn, "TelevisionIcon").length, 2);
  assert.ok(nodes(drawn, "Text").some((text) => text.props.children === "Balcony"));
  // A chip's words are set in the heavier face a control's label uses, not the tracked pill.
  const chip = h.parts.VacancyChip({ label: "1 bed available now", tone: "success" });
  assert.equal(nodes(chip, "StatusPill").length, 0); assert.equal(one(chip, "Text").props.children, "1 bed available now");
  const source = read("src/features/booking/booking-form-parts.tsx");
  assert.equal(source.includes("StatusPill"), false); assert.ok(source.split("fonts.displaySoft, fontSize: 12.5").length - 1 >= 1);
});
test("the Room number tab filters by floor from inside the search box, and a one-floor property has no picker", () => {
  const rooms = [room(), room({ roomId: "room-2", roomNumber: "201", floor: "2" }), room({ roomId: "room-3", roomNumber: "001", floor: "0" })];
  const props = { ...formProps, options: options({ rooms }) };
  const h = harness(); h.render(h.formModule.Form, props); h.values[0] = 1;
  const listOf = () => { const list = one(h.render(h.formModule.Form, props), "RoomList"); return list.type(list.props); };
  let drawn = listOf();
  const trigger = one(drawn, "SearchField").props.trailing;
  assert.equal(trigger.props.accessibilityLabel, "Filter rooms by floor"); assert.equal(one(trigger, "Text").props.children, "All floors");
  // Closed until asked for. Its list opens in place, under the box, in the order a building has its floors.
  assert.equal(nodes(drawn, "PickerOptionRow").length, 0);
  trigger.props.onPress(); drawn = listOf();
  assert.deepEqual(nodes(drawn, "PickerOptionRow").map((row) => row.props.label), ["All floors", "Ground floor", "Floor 1", "Floor 2"]);
  assert.equal(nodes(drawn, "SheetShell").length, 0);
  nodes(drawn, "PickerOptionRow")[3].props.onPress(); drawn = listOf();
  assert.deepEqual(nodes(drawn, "RoomChoiceCard").map((card) => card.props.room.roomNumber), ["201"]);
  assert.equal(nodes(drawn, "PickerOptionRow").length, 0); assert.equal(one(one(drawn, "SearchField").props.trailing, "Text").props.children, "Floor 2");
  // The floor does not narrow the other tab.
  h.values[9] = "TYPE"; assert.equal(nodes(listOf(), "RoomChoiceCard").length, 3);
  const flat = harness(); flat.render(flat.formModule.Form, formProps); flat.values[0] = 1;
  const single = one(flat.render(flat.formModule.Form, formProps), "RoomList");
  assert.equal(one(single.type(single.props), "SearchField").props.trailing, undefined);
});

test("a chosen room opens a card of its room type's photos under it, on both tabs", () => {
  const photographed = room({ imageUrls: ["https://img.example/a.jpg", "https://img.example/b.jpg"] });
  const props = { ...formProps, options: options({ rooms: [photographed, room({ roomId: "room-2", roomNumber: "102" })] }) };
  const h = harness(); h.render(h.formModule.Form, props); h.values[0] = 1;
  const listOf = () => { const list = one(h.render(h.formModule.Form, props), "RoomList"); return list.type(list.props); };
  // Nothing chosen, nothing opened.
  assert.equal(nodes(listOf(), "RoomPhotosCard").length, 0);
  nodes(listOf(), "RoomChoiceCard")[0].props.onPress();
  for (const tab of ["NUMBER", "TYPE"]) {
    h.values[9] = tab;
    const opened = nodes(listOf(), "RoomPhotosCard");
    assert.equal(opened.length, 1, tab); assert.equal(opened[0].props.room.roomId, "room-1", tab);
  }
  // The card is a carousel of the type's photos in the owner's order, and says whose photos they are.
  const card = h.parts.RoomPhotosCard({ room: photographed });
  const window = one(card, "RoomPhotosWindow");
  assert.deepEqual(Array.from(window.props.images), ["https://img.example/a.jpg", "https://img.example/b.jpg"]);
  assert.equal(h.parts.RoomPhotosWindow(window.props).type, "ImageCarousel");
  assert.ok(nodes(card, "Text").some((text) => [].concat(text.props.children).join("").includes("These show the room type, AC · 2 sharing.")));
  // A type nobody has photographed keeps the same window, with a no-photos mark in it (user, 2026-10-10).
  const bare = h.parts.RoomPhotosCard({ room: room() });
  const empty = h.parts.RoomPhotosWindow(one(bare, "RoomPhotosWindow").props);
  assert.equal(nodes(empty, "ImageCarousel").length, 0); assert.equal(empty.type, "View");
  // Short when empty, on the list and beside the room alike, and full height only for real photos.
  assert.equal(empty.props.style.height, 84); assert.equal(h.parts.RoomPhotosWindow({ height: 136, images: [] }).props.style.height, 84);
  assert.equal(h.parts.RoomPhotosWindow(window.props).props.height, 260);
  assert.ok(nodes(bare, "Text").some((text) => text.props.children === "Photos for this room"));
  assert.equal(read("src/features/booking/booking-form-parts.tsx").includes("Room type photos"), false);
  assert.equal(nodes(empty, "ImageOff").length, 1); assert.equal(one(empty, "Text").props.children, "No photos yet");
  // Choosing the other room moves the card to it.
  h.values[9] = "NUMBER"; nodes(listOf(), "RoomChoiceCard")[1].props.onPress();
  assert.deepEqual(nodes(listOf(), "RoomPhotosCard").map((opened) => opened.props.room.roomId), ["room-2"]);
});

test("Your room shows the room type's photos, and both bed rows whether or not they have a bed", () => {
  const photographed = room({ imageUrls: ["https://img.example/a.jpg"] });
  const props = { ...formProps, options: options({ rooms: [photographed] }) };
  const h = harness(); h.render(h.formModule.Form, props); h.values[0] = 1; h.values[1] = draft(); h.values[8] = true;
  const tree = h.render(h.formModule.Form, props);
  assert.equal(one(tree, "ScreenHeader").props.title, "Your");
  // The room's kind and its floor are on lines of their own (user, 2026-10-11).
  const roomLines = nodes(tree, "Text").map((text) => [].concat(text.props.children).join(""));
  assert.ok(roomLines.includes("AC · 2 sharing")); assert.ok(roomLines.includes("Floor 1"));
  assert.equal(roomLines.some((line) => line.includes("sharing · ")), false);
  // The photos sit beside the room. A room with none gets the same window with its mark.
  assert.deepEqual(Array.from(one(tree, "RoomPhotosWindow").props.images), ["https://img.example/a.jpg"]);
  // The window is as tall as the room's own lines, number to rent, with photos or without (user, 2026-10-10).
  const lines = one(tree, "View", (node) => typeof node.props.onLayout === "function");
  assert.equal(one(lines, "RoomRent").props.paise, 950000);
  lines.props.onLayout({ nativeEvent: { layout: { height: 127.6 } } });
  const measured = one(h.render(h.formModule.Form, props), "RoomPhotosWindow").props;
  assert.equal(measured.height, 128); assert.equal(measured.emptyHeight, 128);
  assert.equal(h.parts.RoomPhotosWindow({ ...measured, images: [] }).props.style.height, 128);
  // The row does not stretch the lines to the window, or the two would hold each other tall.
  assert.equal(one(tree, "View", (node) => nodes(node.props.children, "RoomPhotosWindow").length === 1 && node.props.style?.flexDirection === "row").props.style.alignItems, "flex-start");
  // A bed free now and nothing being vacated: Future vacancy is still listed, at 0 beds and greyed.
  const rows = nodes(tree, "BedChoiceRow");
  assert.deepEqual(rows.map((row) => [row.props.title, row.props.count, Boolean(row.props.disabled), row.props.selected]), [["Current vacancy", "1 bed", false, true], ["Future vacancy", "0 beds", true, false]]);
  const greyed = h.parts.BedChoiceRow(rows[1].props); const chosen = h.parts.BedChoiceRow(rows[0].props);
  assert.equal(greyed.props.style.opacity, 0.6); assert.equal(chosen.props.style.opacity, 1);
  // A chosen bed has no blue border. Its radio and its chip say it is chosen.
  assert.equal(chosen.props.style.borderColor, greyed.props.style.borderColor); assert.notEqual(chosen.props.style.borderColor, themes.light.primary);
  assert.equal(chosen.props.style.borderWidth, 1);
  assert.equal(one(chosen, "RadioMark").props.checked, true); assert.equal(one(chosen, "VacancyChip").props.tone, "primary");
});

test("secondary lines on the booking screens are set in the app's description type", () => {
  // The tenant property board's own style, one for the whole app (typography.ts). Asked for on the booking screens by the user, 2026-10-11.
  const typography = read("src/theme/typography.ts");
  assert.match(typography, /description: \{\s+fontFamily: fonts\.sans,\s+fontSize: 12,\s+lineHeight: 16,/);
  for (const file of ["app/booking-request.tsx", "src/features/booking/booking-form-parts.tsx", "app/my-bookings.tsx", "app/my-booking-detail.tsx", "app/owner-booking-detail.tsx", "app/owner-booking-settings.tsx", "src/features/booking/booking-request-list.tsx", "src/features/booking/book-a-stay-entry.tsx", "src/features/booking/booking-access-list.tsx", "src/features/booking/booking-date-field.tsx"]) {
    const source = read(file);
    assert.ok(source.includes("type.description, { color: colors.muted"), file);
    // No muted caption left behind, and no size of its own to undo the type.
    assert.equal(source.includes("type.caption, { color: colors.muted"), false, file);
    assert.equal(/\[type\.description, \{[^}\n]*fontSize/.test(source), false, file);
  }
});

test("a second tap on a chosen room lets it go, and its photos close with it", () => {
  const h = harness(); h.render(h.formModule.Form, formProps); h.values[0] = 1;
  const listOf = () => { const list = one(h.render(h.formModule.Form, formProps), "RoomList"); return list.type(list.props); };
  for (const tab of ["NUMBER", "TYPE"]) {
    h.values[9] = tab;
    nodes(listOf(), "RoomChoiceCard")[0].props.onPress();
    assert.equal(h.values[1].roomId, "room-1", tab); assert.equal(nodes(listOf(), "RoomPhotosCard").length, 1, tab);
    nodes(listOf(), "RoomChoiceCard")[0].props.onPress();
    assert.equal(h.values[1].roomId, "", tab); assert.equal(h.values[1].exitRequestId, null, tab); assert.equal(h.values[1].moveInDate, "", tab);
    assert.equal(nodes(listOf(), "RoomPhotosCard").length, 0, tab);
    assert.equal(nodes(listOf(), "RoomChoiceCard")[0].props.selected, false, tab);
    // With nothing chosen there is nothing to continue with.
    assert.equal(button(h.render(h.formModule.Form, formProps), "Continue").props.disabled, true, tab);
  }
});
test("the date field opens the system calendar itself on Android, with no sheet behind it", () => {
  const fieldOn = (os) => {
    const h = harness(); const picked = [];
    const field = load(read("src/features/booking/booking-date-field.tsx"), { ...h.dependencies, "react-native": { Platform: { OS: os }, Text: "Text", View: "View" }, "@react-native-community/datetimepicker": { __esModule: true, default: "DateTimePicker" } });
    const props = { label: "Move-in date", value: "2026-10-18", minimum: "2026-10-18", maximum: "2026-10-31", onChange: (iso) => picked.push(iso) };
    return { h, picked, draw: () => h.render(field.BookingDateField, props) };
  };
  const android = fieldOn("android");
  assert.equal(nodes(android.draw(), "DateTimePicker").length, 0);
  one(android.draw(), "AnimatedPressable").props.onPress();
  let tree = android.draw();
  // The calendar, and nothing around it for it to open over.
  assert.equal(nodes(tree, "SheetShell").length, 0); assert.equal(nodes(tree, "ActionButton").length, 0);
  const calendar = one(tree, "DateTimePicker");
  // A day picked is taken at once, and the calendar is gone.
  calendar.props.onChange({ type: "set" }, new Date(2026, 9, 24, 12));
  assert.deepEqual(android.picked, ["2026-10-24"]); assert.equal(nodes(android.draw(), "DateTimePicker").length, 0);
  // Dismissed, it changes nothing. A day outside the bed's dates is not taken.
  one(android.draw(), "AnimatedPressable").props.onPress(); one(android.draw(), "DateTimePicker").props.onChange({ type: "dismissed" }, undefined);
  one(android.draw(), "AnimatedPressable").props.onPress(); one(android.draw(), "DateTimePicker").props.onChange({ type: "set" }, new Date(2026, 10, 5, 12));
  assert.deepEqual(android.picked, ["2026-10-24"]);
  // The web has no system calendar, so it keeps its sheet with a typed date.
  const web = fieldOn("web"); one(web.draw(), "AnimatedPressable").props.onPress(); tree = web.draw();
  assert.equal(nodes(tree, "SheetShell").length, 1); assert.equal(nodes(tree, "DateTimePicker").length, 0); button(tree, "Use this date");
});

test("the tenant's accept is the Confirm booking sheet from the image, in the tenant's words", () => {
  const h = harness();
  const tree = h.render(h.detailModule.Decision, decisionProps("ACCEPT", record({ tokenRequired: false, agreementMonths: 3 })));
  assert.equal(tree.type, "SheetShell"); assert.equal(tree.props.title, "");
  const body = one(tree, "BookingConfirmBody").props;
  assert.equal(body.place, "Sample PG · Room " + record().roomNumber); assert.equal(body.rentPaise, 900000); assert.equal(body.moveInDate, "2026-10-22"); assert.equal(body.agreementMonths, 3);
  assert.equal(body.notice, "Accepting this offer confirms the booking and keeps one bed reserved.");
  // The small "This does not start your tenancy" line is gone (user, 2026-10-11).
  assert.equal("finePrint" in body, false);
  assert.equal(button(tree, "Not now").props.variant, "primaryQuiet"); button(tree, "Confirm booking");
  // No second line of where it is, and no generic notice, around the body.
  assert.equal(nodes(tree, "NoticeBar").length, 0);
  // With a token still to be paid it does not claim to confirm. A sheet keeps the booking it was opened on, so this is a sheet of its own.
  const owed = harness();
  const token = one(owed.render(owed.detailModule.Decision, decisionProps("ACCEPT", record({ tokenRequired: true }))), "BookingConfirmBody").props;
  assert.match(token.notice, /After the token is received, the property must confirm your booking/);
  // The other decisions keep their own sheets.
  const other = harness();
  const counter = other.render(other.detailModule.Decision, decisionProps("COUNTER"));
  assert.notEqual(counter.props.title, ""); assert.equal(nodes(counter, "BookingConfirmBody").length, 0); button(counter, "Confirm");
});

test("each section of the booking view has a bold subheading, and the offer is four grey boxes with gaps between", () => {
  const h = harness(); const tree = h.render(h.detailModule.Summary, { booking: record() });
  // Section names are set as headings, not as small grey labels (user's image, 2026-10-11).
  const styleOf = (said) => Object.assign({}, ...[].concat(one(tree, "Text", (node) => node.props.children === said).props.style));
  // Darkest ink, the heading face, and a step above the person's name under "Your details" (user, 2026-10-11).
  for (const said of ["Your details", "Offer", "Token amount", "Activity"]) { assert.equal(styleOf(said).fontSize, 20, said); assert.equal(styleOf(said).color, themes.light.ink, said); }
  assert.equal(styleOf(record().tenantName).fontSize, 18);
  // The reference keeps its small label: it names a value, not a section.
  assert.equal(styleOf("Ref").fontSize, 12);
  // Two rows of two boxes, each on the soft grey, with the same gap across and down.
  const parts = h.dependencies["@/features/booking/tenant-booking-parts"];
  const box = parts.BookingFactBox({ children: null });
  assert.equal(box.props.style.backgroundColor, themes.light.neutralSoft); assert.equal(box.props.style.flex, 1);
  const grid = one(tree, "View", (node) => node.props.style?.gap === 8 && !node.props.style?.flexDirection && nodes(node.props.children, "BookingFactBox").length === 4);
  const rows = grid.props.children.filter(Boolean);
  assert.equal(rows.length, 2);
  for (const row of rows) { assert.equal(row.props.style.flexDirection, "row"); assert.equal(row.props.style.gap, 8); assert.equal(nodes(row, "BookingFactBox").length, 2); }
  const labels = nodes(tree, "BookingFactBox").map((cell) => nodes(cell, "Text")[0].props.children);
  assert.deepEqual(labels.slice(1), ["Listed rent", "Deposit", "Due at move-in"]);
});

test("the tenant's token that is due: no Due chip, the due line in yellow, and a rupee in a circle on the status chip", () => {
  const h = harness();
  const due = record({ status: "AWAITING_TOKEN", tokenRequired: true, tokenDueAt: "2026-10-12T22:20:00Z", token: { status: "DUE", amountPaise: 50000, claims: [], claimWaiting: false } });
  const tree = h.render(h.detailModule.Summary, { booking: due });
  // Said once, by the yellow line with the day and time. The chip that only said "Due" is gone (user, 2026-10-11).
  assert.equal(nodes(tree, "StatusPill").length, 0);
  const band = one(tree, "BookingInfoBand", (node) => node.props.tone === "warning");
  const said = Object.assign({}, ...[].concat(one(band, "Text").props.style));
  assert.equal(said.color, themes.light.warningText);
  assert.ok([].concat(one(band, "Text").props.children).join("").startsWith("Due "));
  const drawn = h.dependencies["@/features/booking/tenant-booking-parts"].BookingInfoBand(band.props);
  assert.equal(drawn.props.style.backgroundColor, themes.light.warningSoft); assert.equal(one(drawn, "Clock3").props.color, themes.light.warningText);
  // The clock sits under the card's rupee mark, on one centre line, with the small gap before "Due" (user, 2026-10-11).
  const head = one(tree, "View", (node) => node.props.style?.flexDirection === "row" && nodes(node.props.children, "BookingTokenAmountIcon").length === 1);
  const markCentre = head.props.style.paddingLeft + one(head, "BookingTokenAmountIcon").props.size / 2;
  const clockCentre = drawn.props.style.paddingLeft + one(drawn, "Clock3").props.size / 2;
  assert.equal(clockCentre, markCentre); assert.equal(drawn.props.style.gap, 6);
  // Every other band keeps its usual inset.
  assert.equal(h.dependencies["@/features/booking/tenant-booking-parts"].BookingInfoBand({ children: null }).props.style.paddingLeft, spacing.md);
  // Every other state of a token keeps its chip.
  const other = harness();
  const received = record({ status: "CONFIRMED", tokenRequired: true, tokenDueAt: null, token: { status: "RECEIVED", amountPaise: 50000, claims: [], claimWaiting: false, receivedAt: "2026-10-11T10:00:00Z" } });
  assert.equal(nodes(other.render(other.detailModule.Summary, { booking: received }), "StatusPill").length, 0);
  // The status chip: a rupee in a circle, the same mark the property's chip has, and no wallet.
  const chip = h.dependencies["@/features/booking/tenant-booking-parts"].TenantBookingStatus({ status: "AWAITING_TOKEN" });
  assert.equal(nodes(chip, "BookingTokenStatusIcon").length, 1); assert.equal(nodes(chip, "Wallet").length, 0);
  assert.equal(read("src/features/booking/tenant-booking-parts.tsx").includes("Wallet"), false);
});

test("a received token awaits property confirmation without a Due/Received chip, and its receipt and cancellation policy remain visible", () => {
  const h = harness();
  const received = record({ status: "TOKEN_RECEIVED", agreedAt: "2026-10-11T08:00:00Z", tokenRequired: true,
    tokenRefundable: true, tokenDueAt: "2026-10-11T09:00:00Z", allowedActions: ["CANCEL"],
    token: { status: "RECEIVED", amountPaise: 50000, receiptCode: "TKN-2026-000264", receivedAt: "2026-10-11T08:30:00Z", claims: [], claimWaiting: false } });
  const tree = h.render(h.detailModule.Summary, { booking: received });
  assert.equal(one(tree, "TenantBookingStatus").props.status, "TOKEN_RECEIVED");
  assert.equal(nodes(tree, "StatusPill").length, 0);
  assert.equal(nodes(tree, "BookingInfoBand").some((node) => node.props.tone === "warning"), false);
  const notice = one(tree, "NoticeBar", (node) => node.props.title === "Token received");
  assert.match(notice.props.message, /awaiting final confirmation/);
  const receipt = one(tree, "Text", (node) => [].concat(node.props.children).join("") === "Receipt TKN-2026-000264");
  assert.equal(receipt.props.style[0].fontSize, 12);
  const marks = h.dependencies["@/features/booking/tenant-booking-parts"];
  one(marks.TenantBookingStatus({ status: "TOKEN_RECEIVED" }), "CircleCheck");
  one(marks.TenantBookingStatus({ status: "FUTURE_BACKEND_STATUS" }), "Clock3");
  const cancel = harness(); const sheet = cancel.render(cancel.detailModule.Decision, { booking: received, action: "CANCEL", onClose() {}, onDone() {} });
  assert.ok(nodes(sheet, "Text").some((node) => typeof node.props.children === "string" && node.props.children.includes("recorded token is owed back")));
});
