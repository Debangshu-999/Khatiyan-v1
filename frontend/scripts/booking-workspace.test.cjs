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
  vm.runInNewContext(outputText, { exports, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const ui = load(read("src/features/booking/booking-ui.ts"));
const { spacing } = load(read("src/theme/spacing.ts"));
const { themes } = load(read("src/theme/colors.ts"));
function nodes(tree, type) {
  const found = [];
  function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== "object") return; if (node.type === type || node.type?.name === type) found.push(node); walk(node.props?.children); walk(node.props?.headingNode); }
  walk(tree); return found;
}
const one = (tree, type, predicate = () => true) => { const found = nodes(tree, type).find(predicate); assert.ok(found, `Missing ${type}`); return found; };
const button = (tree, label) => one(tree, "ActionButton", (node) => node.props.label === label);
// The screens run in their own context, so a list they made is compared as a list made here.
const local = (list) => Array.from(list);
const record = (overrides = {}) => ({ id: "request-1", propertyId: "property-1", propertyName: "Sample PG", referenceCode: "BKG-2026-000001", tenantName: "Sample visitor", tenantPhone: "+919000000000", tenantGender: "FEMALE", tenantDateOfBirth: "2000-01-01", roomNumber: "101", status: "AWAITING_HANDLER", moveInDate: "2026-10-20", submittedAt: "2026-10-10T10:00:00Z", expiresAt: "2026-10-17T10:00:00Z", listedRentPaise: 950000, currentRentPaise: 880000, currentOfferBy: "TENANT", currentOfferSequence: 3, handlerName: null, version: 12, agreedAt: null, token: null, history: [], offers: [], allowedActions: ["ACCEPT", "COUNTER", "CANCEL"], ...overrides });
const page = (overrides = {}) => ({ items: [record()], page: 0, totalPages: 2, totalElements: 22, hasNext: true, hasPrevious: false, ...overrides });
// Any icon is its own name. The screens choose the glyphs, and a test should not have to list them.
const icons = new Proxy({}, { get: (_, name) => name, has: () => true });

test("Action center booking queues query all handlers on the server and do not show misleading assignment tabs", () => {
  for (const attention of ["RESPONSE", "TOKEN_CLAIMS", "CONFIRMATION", "MOVE_IN"]) {
    const h = harness({ params: { attention } });
    const root = h.render(h.workspace.default);
    const screen = h.render(h.workspace.Workspace, root.props);
    const list = one(screen, "BookingRequestList").props;
    assert.equal(list.attention, attention);
    const inner = harness();
    const tree = inner.render(inner.list.BookingRequestList, list);
    const asked = inner.listArguments.at(-1);
    assert.equal(asked.attention, attention); assert.equal(asked.mine, false); assert.equal(asked.unassigned, false);
    assert.equal(asked.status, null);
    assert.equal(nodes(tree, "SelectionTabs").length, 0);
    assert.equal(nodes(tree, "FilteredQueue").length, 0);
    assert.equal(nodes(tree, "SearchField").length, 1);
  }
});

test("the action center's deep link starts the token ledger at the tokens waiting on a decision", () => {
  const h = harness({ params: { status: "DECISION_PENDING" } });
  const props = one(h.render(h.tokensScreen.default), "BookingTokenList").props;
  assert.equal(props.initialStatus, "DECISION_PENDING");
  const inner = harness();
  inner.render(inner.tokenList.BookingTokenList, props);
  assert.equal(inner.tokenArguments.at(-1).status, "DECISION_PENDING");
});

function harness(options = {}) {
  let cursor = 0;
  const values = [];
  const effects = [];
  const writes = [];
  const listArguments = [];
  const settingsOptions = [];
  const tokenArguments = [];
  const tokenRefreshes = [];
  const routes = [];
  const accumulatedKeys = [];
  const scopes = { property: { id: "property-1", name: "Sample PG" }, canView: true, owner: true, loading: false, retry() {}, ...options.scope };
  const dependencies = {
    "@/components/modal-title": { ModalTitle: "Text" },
    "@/components/add-record-card": { AddRecordCard: "AddRecordCard" },
    "@/components/artwork-icon": { PaymentClaimsIcon: "PaymentClaimsIcon" },
    "@/components/billing-vector-icons": { PaymentSetupIcon: "PaymentSetupIcon" },
    "@/features/billing/payment-method-toggle": { PaymentMethodIcon: "PaymentMethodIcon" },
    react: {
      useState: (initial) => { const at = cursor++; if (!(at in values)) values[at] = typeof initial === "function" ? initial() : initial; return [values[at], (next) => { values[at] = typeof next === "function" ? next(values[at]) : next; }]; },
      useRef: (initial) => { const at = cursor++; if (!(at in values)) values[at] = { current: initial }; return values[at]; },
      useEffect: (fn) => effects.push(fn),
      useMemo: (fn) => fn(),
    },
    "react-native": { ActivityIndicator: "ActivityIndicator", Text: "Text", View: "View", Switch: "Switch", Image: "Image" },
    "expo-router": { useLocalSearchParams: () => ({ propertyId: "property-1", requestId: "request-1", ...options.params }) },
    "lucide-react-native": icons,
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" },
    "@/features/booking/booking-ui": ui,
    "@/features/booking/booking-attention": load(read("src/features/booking/booking-attention.ts")),
    "@/features/property/property-control-icons": { BookingsIcon: "BookingsIcon" },
    "@/components/booking-vector-icons": { BookingAwaitingHandlerIcon: "BookingAwaitingHandlerIcon", BookingAwaitingTenantIcon: "BookingAwaitingTenantIcon", BookingTokenDueIcon: "BookingTokenDueIcon", BookingConfirmedIcon: "BookingConfirmedIcon", BookingHistoryIcon: "BookingHistoryIcon", BookingConfirmedListIcon: "BookingConfirmedListIcon", BookingTokenAmountIcon: "BookingTokenAmountIcon", BookingTokenStatusIcon: "BookingTokenStatusIcon" },
    "../assets/icons/home-tools/bookings.png": "booking-module-artwork",
    "@/features/booking/use-booking-property": { useBookingProperty: () => scopes },
    // The typing pause is the hook's own business. Here a search is asked for as soon as it is typed.
    "@/features/discovery/use-debounced-value": { useDebouncedValue: (value) => value },
    "@/features/enquiry/enquiry-tags": { CountPill: "CountPill", InitialsAvatar: "InitialsAvatar", StateChip: "StateChip" },
    // The owner's detail is drawn with the tenant detail's own pieces (user, 2026-10-11).
    "@/features/account/gender-picker": { GENDER_LABELS: { MALE: "Male", FEMALE: "Female", TRANSGENDER: "Transgender", OTHER: "Others", UNDECLARED: "Undeclared" } },
    "@/features/billing/payment-methods": load(read("src/features/billing/payment-methods.ts")),
    "@/components/image-carousel": { Lightbox: "Lightbox" },
    "@/features/booking/booking-form-parts": { RoomRent: "RoomRent", roomKindLabel: (room) => `${room.conditioning === "AC" ? "AC" : "Non-AC"} · ${room.capacity} sharing` },
    "@/features/booking/owner-booking-status": { OwnerBookingStatus: "OwnerBookingStatus", OwnerTokenStatus: "OwnerTokenStatus" },
    "@/features/booking/booking-confirm-body": { BookingConfirmBody: "BookingConfirmBody" },
    // One page in, one page out. Adding pages together is the hook's own business.
    "@/hooks/use-accumulated-pages": { useAccumulatedPages: (key, response) => { accumulatedKeys.push(key); return response; } },
    "@/features/analytics/period": { istToday: () => "2026-10-27" },
    "@/features/booking/use-open-booking-chat": { useOpenBookingChat: () => async () => {} },
    "@/features/booking/tenant-booking-parts": { BookingCardRule: "BookingCardRule", BookingFactBox: "BookingFactBox", BookingFactPair: "BookingFactPair", BookingInfoBand: "BookingInfoBand", BookingInitialsAvatar: "BookingInitialsAvatar", BookingRoomAmenities: "BookingRoomAmenities", BookingRoomPhoto: "BookingRoomPhoto" },
    "@/features/forms/server-error": { errorMessage: () => "Please refresh and try again." },
    "@/features/owner/phone-display": { formatIndianPhone: (phone) => phone },
    "@/theme/spacing": { spacing, radii: { card: 10 } },
    "@/theme/use-theme": { useTheme: () => ({ colors: themes.light, type: { description: { fontSize: 12, lineHeight: 16 } }, fonts: { sansBold: "bold", sansMedium: "medium" } }) },
    "@/features/owner/owner-ui": { ActionButton: "ActionButton", ConfirmDialog: "ConfirmDialog", FormInput: "FormInput", IconButton: "IconButton", NoticeBar: "NoticeBar", formatMoneyPaise: (amount) => `Rs ${amount / 100}`, humanizeToken: (value) => value },
    "@/navigation/use-guarded-router": { useGuardedRouter: () => ({ push: (route) => routes.push(route) }) },
    "@/components/toast": { useToast: () => ({ success() {} }) },
    "@/components/pinned-footer": { PinnedFooter: "PinnedFooter", PINNED_FOOTER_CLEARANCE: 104 },
    "@/components/skeletons/primitives": { Skeleton: "Skeleton", SkeletonList: "SkeletonList", SkeletonTiles: "SkeletonTiles" },
    "@/components/skeletons/booking/workspace": { BookingWorkspaceSkeleton: "BookingWorkspaceSkeleton", BookingDetailSkeleton: "BookingDetailSkeleton" },
  };
  const invalidated = [];
  const dispatch = (action) => { invalidated.push(action); };
  dependencies["@/store/hooks"] = { useAppDispatch: () => dispatch };
  const mutate = (kind) => (payload) => ({ unwrap: async () => { writes.push({ kind, ...payload }); if (options.writeError) throw options.writeError; return record(); } });
  const open = mutate("open");
  dependencies["@/store/services/booking-api"] = {
    bookingApi: { util: { upsertQueryData() {}, invalidateTags: (tags) => ({ invalidate: tags }) } },
    useGetPropertyBookingRequestsQuery: (args) => { listArguments.push(args); return { currentData: page(), isSuccess: true, refetch() {}, ...options.listQuery }; },
    useGetPropertyBookingCountsQuery: () => ({ currentData: { awaitingHandler: 4, awaitingTenant: 3, awaitingToken: 2, confirmed: 1, tokenReceived: 0 }, ...options.countsQuery }),
    useGetPropertyBookingTokensQuery: (args, config) => { tokenArguments.push({ ...args, ...config }); return { currentData: { summary: { collectedPaise: 150000 }, tokens: page({ items: [] }) }, isError: false, refetch: () => tokenRefreshes.push(args.propertyId), ...options.tokenQuery }; },
    useGetBookingSettingsQuery: (id, config) => { settingsOptions.push({ id, ...config }); return { currentData: config?.skip ? undefined : { configured: true, ...options.settings } }; },
    useOpenPropertyBookingRequestMutation: () => [open],
    useGetPropertyBookingRequestQuery: (args, config) => ({ currentData: config.skip ? undefined : record(), refetch() {}, ...options.detailQuery }),
    useAcceptBookingOfferForPropertyMutation: () => [mutate("accept")],
    useConfirmBookingForPropertyMutation: () => [mutate("confirm")],
    useOfferBookingRentMutation: () => [mutate("offer")],
    useCancelBookingForPropertyMutation: () => [mutate("cancel")],
    useMarkBookingTokenReceivedMutation: () => [mutate("tokenReceived")],
    useMarkBookingTokenNotReceivedMutation: () => [mutate("tokenNotReceived")],
    useRefundBookingTokenMutation: () => [mutate("refundToken")],
    useKeepBookingTokenMutation: () => [mutate("keepToken")],
    RECEIVED_TOKEN_STATUSES: ["RECEIVED", "DECISION_PENDING", "REFUND_DUE", "KEPT", "ADJUSTED"],
  };
  dependencies["@/features/billing/pay-bill-sheet"] = { PaymentMethodDropdown: "PaymentMethodDropdown", payMethodOptions: (methods) => methods.map((value) => ({ label: value, value })) };
  dependencies["@/features/billing/raise-claim-modal"] = { PaymentProofForm: "PaymentProofForm" };
  for (const [module, name] of [["animated-pressable", "AnimatedPressable"], ["alert-modal", "AlertModal"], ["how-it-works-sheet", "HowItWorksSheet"], ["card", "Card"], ["empty-state", "EmptyState"], ["filtered-queue", "FilteredQueue"], ["metric-tile", "MetricTile"], ["pagination-bar", "PaginationBar"], ["screen-header", "ScreenHeader"], ["screen-scroll-view", "ScreenScrollView"], ["search-field", "SearchField"], ["section", "Section"], ["status-pill", "StatusPill"], ["sheet-shell", "SheetShell"], ["tab-switcher", "TabSwitcher"], ["selection-tabs", "SelectionTabs"], ["list-end", "ListEnd"]]) dependencies[`@/components/${module}`] = { [name]: name };
  const list = load(read("src/features/booking/booking-request-list.tsx"), dependencies);
  dependencies["@/features/booking/booking-request-list"] = list;
  const workspace = load(`${read("app/owner-bookings.tsx")}\nexports.Workspace = BookingWorkspace; exports.HistoryCard = BookingHistoryCard; exports.PaymentCard = BookingPaymentSetupCard; exports.RecordCard = BookingTokenRecordCard; exports.ConfirmedCard = BookingConfirmedCard;`, dependencies);
  const history = load(read("app/owner-booking-history.tsx"), dependencies);
  const confirmed = load(read("app/owner-booking-confirmed.tsx"), dependencies);
  const tokenList = load(read("src/features/booking/booking-token-list.tsx"), dependencies);
  dependencies["@/features/booking/booking-token-list"] = tokenList;
  const tokensScreen = load(read("app/owner-booking-tokens.tsx"), dependencies);
  // The handler's answer to a recorded token is the real sheet.
  const verify = load(read("src/features/booking/token-verify-sheet.tsx"), dependencies);
  dependencies["@/features/booking/token-verify-sheet"] = verify;
  dependencies["@/features/booking/booking-payment-claims"] = load(read("src/features/booking/booking-payment-claims.tsx"), dependencies);
  const detail = load(`${read("app/owner-booking-detail.tsx")}\nexports.Detail = BookingDetailPage; exports.Claims = BookingTokenClaims; exports.Decision = BookingDecisionSheet; exports.Details = BookingDetails;`, dependencies);
  return { list, workspace, history, confirmed, detail, verify, tokenList, tokensScreen, dependencies, writes, listArguments, settingsOptions, tokenArguments, tokenRefreshes, routes, invalidated, accumulatedKeys, render: (component, props) => { cursor = 0; effects.length = 0; const tree = component(props); return tree; }, flushEffects: () => effects.splice(0).map((fn) => fn()) };
}
const workspaceProps = { propertyId: "property-1", propertyName: "Sample PG", owner: true };
const listProps = (overrides = {}) => ({ propertyId: "property-1", filter: "OPEN", owner: true, onOpen() {}, ...overrides });
const decisionProps = (action, booking = record()) => ({ action, booking, onClose() {}, onDone() {} });
const token = (overrides = {}) => ({ requestId: "request-1", bookingReferenceCode: "BKG-2026-000001", receiptCode: "TKN-2026-000007", tenantName: "Sample visitor", roomNumber: "101", moveInDate: "2026-10-20", amountPaise: 200000, status: "REFUND_DUE", receivedMethod: "UPI", receivedReference: null, receivedAt: "2026-10-09T08:00:00Z", bookingStatus: "CANCELLED", endCause: "MANAGEMENT_CANCELLED", refundDueSince: "2026-10-10T08:00:00Z", canDecide: false, version: 9, ...overrides });
const ledger = (items, overrides = {}) => ({ currentData: { summary: { collectedPaise: 150000 }, tokens: page({ items, totalElements: items.length, totalPages: 1, hasNext: false, ...overrides }) } });

test("Home contains a Bookings tile beside VMS in both loading and loaded layouts", () => {
  const home = read("app/(tabs)/index.tsx");
  assert.equal((home.match(/label="Bookings"/g) ?? []).length, 2);
  assert.equal((home.match(/label="VMS"[\s\S]*?onPress=\{\(\) => onNavigate\("\/owner-visits"\)\}[\s\S]*?HOME_TOOL_ARTWORK\.bookings/g) ?? []).length, 2);
  assert.match(read("src/features/owner/route-gates.tsx"), /"\/owner-bookings": \{ label: "Bookings", resource: "BOOKINGS" \}/);
  const png = fs.readFileSync(path.join(__dirname, "..", "assets/icons/home-tools/bookings.png"));
  assert.equal(png[25], 6, "RGBA asset preserves transparency");
});

// ---- The Bookings screen (user, 2026-10-10) --------------------------------------------

test("the screen is four half cards, two to a row, then one list, with no count tiles", () => {
  const h = harness();
  const tree = h.render(h.workspace.Workspace, workspaceProps);
  // The four tiles on top are gone (user, 2026-10-11). The list's own filter carries those counts.
  assert.equal(nodes(tree, "MetricTile").length, 0);
  assert.doesNotMatch(read("app/owner-bookings.tsx"), /MetricTile|useGetPropertyBookingCountsQuery|SkeletonTiles/);
  // The property is named once, in the header. A card repeating it is gone.
  assert.equal(nodes(tree, "Card").length, 0);
  assert.match(one(tree, "ScreenHeader").props.subtitle, /Sample PG/);
  assert.doesNotMatch(read("app/owner-bookings.tsx"), /selection-tabs/);
  // In the order they are read: two rows of two doors, then the working list.
  // They sit in one wrapper, which is what greys them out while bookings are not set up.
  const body = one(tree, "ScreenScrollView").props.children.flat(Infinity).filter(Boolean).at(-1);
  const order = local(body.props.children.flat(Infinity).filter(Boolean).map((node) => node.type?.name ?? node.type));
  // Create external booking under the four cards (user, 2026-10-19).
  assert.deepEqual(order, ["View", "View", "AddRecordCard", "Section"]);
  const [compactRow, secondRow, externalCard] = body.props.children;
  assert.equal(externalCard.props.label, "Create external booking");
  assert.equal(compactRow.props.style.flexDirection, "row"); assert.equal(secondRow.props.style.flexDirection, "row");
  assert.deepEqual(local(compactRow.props.children.filter(Boolean).map((node) => node.type.name)), ["BookingPaymentSetupCard", "BookingTokenRecordCard"]);
  // Booking history is a half card now, paired with Confirmed bookings (user, 2026-10-11).
  assert.deepEqual(local(secondRow.props.children.filter(Boolean).map((node) => node.type.name)), ["BookingHistoryCard", "BookingConfirmedCard"]);
  assert.equal(body.props.style.opacity, 1); assert.equal(body.props.pointerEvents, "auto");
  one(one(tree, "Section"), "BookingRequestList", (node) => node.props.filter === "OPEN");
});

test("payment setup is a half-width icon/title-only card above history, and stays owner-only", () => {
  const h = harness();
  const tree = h.render(h.workspace.Workspace, workspaceProps);
  one(tree, "BookingPaymentSetupCard").props.onPress();
  assert.deepEqual(h.routes, ["/owner-booking-payment-setup"]);
  let pressed = false;
  const card = h.render(h.workspace.PaymentCard, { onPress() { pressed = true; } });
  assert.equal(card.type, "AnimatedPressable"); assert.equal(card.props.accessibilityRole, "button");
  assert.equal(card.props.style.flexGrow, 1); card.props.onPress(); assert.equal(pressed, true);
  assert.equal(one(card, "PaymentSetupIcon").props.size, 38);
  assert.deepEqual(local(nodes(card, "Text").map((node) => node.props.children)), ["Payment setup"]);
  assert.equal(nodes(card, "ActionButton").length, 0);
  const manager = h.render(h.workspace.Workspace, { ...workspaceProps, owner: false });
  assert.equal(nodes(manager, "BookingPaymentSetupCard").length, 0);
  assert.equal(nodes(manager, "BookingTokenRecordCard").length, 1);
  assert.match(read("app/_layout.tsx"), /<Stack\.Screen name="owner-booking-payment-setup"/);
  assert.match(read("src/features/owner/route-gates.tsx"), /"\/owner-booking-payment-setup": \{ label: "Booking payment setup", resource: "BOOKINGS" \}/);
});

test("Token record is a drawing and a name like Payment setup, with no amount on it, and the Bookings screen reads no ledger", () => {
  const h = harness();
  const tree = h.render(h.workspace.Workspace, workspaceProps);
  // Named Token record, with nothing counted on it (user, 2026-10-11: "remove the amount from the card").
  assert.deepEqual(Object.keys(one(tree, "BookingTokenRecordCard").props), ["onPress"]);
  assert.equal(h.tokenArguments.length, 0, "The total is not shown, so the ledger is not read here");
  const card = h.render(h.workspace.RecordCard, { onPress() {} });
  const setup = h.render(h.workspace.PaymentCard, { onPress() {} });
  assert.equal(card.type, "AnimatedPressable"); assert.equal(card.props.accessibilityLabel, "Token record");
  assert.equal(one(card, "Card").props.style.minHeight, 100);
  const icon = one(card, "BookingTokenAmountIcon").props;
  assert.equal(icon.color, themes.light.primary); assert.notEqual(icon.color, themes.light.successText);
  assert.equal(icon.size, 38);
  // One line, set as Payment setup's own title is.
  assert.deepEqual(local(nodes(card, "Text").map((node) => node.props.children)), ["Token record"]);
  const styleOf = (tree) => Object.assign({}, ...[].concat(one(tree, "Text").props.style));
  assert.deepEqual(styleOf(card), styleOf(setup));
  assert.equal(nodes(card, "Skeleton").length, 0);
  assert.doesNotMatch(read("app/owner-bookings.tsx"), /Token collected|formatMoneyPaise|useGetPropertyBookingTokensQuery/);
});


test("workspace skeleton stands in for the two rows of half cards", () => {
  const h = harness();
  const skeleton = load(read("src/components/skeletons/booking/workspace.tsx"), { ...h.dependencies,
    "@/components/skeletons/primitives": { SkeletonCard: "SkeletonCard", SkeletonForm: "SkeletonForm", SkeletonList: "SkeletonList", SkeletonPills: "SkeletonPills", SkeletonTiles: "SkeletonTiles" },
  });
  const tree = h.render(skeleton.BookingWorkspaceSkeleton);
  // No row of four count tiles: the screen it stands in for has none (user, 2026-10-11).
  // Two rows of two half cards, as the screen has.
  assert.deepEqual(local(nodes(tree, "SkeletonTiles").map((node) => node.props.count)), [2, 2]);
  assert.deepEqual(local(tree.props.children.slice(0, 3).map((node) => node.type)), ["SkeletonTiles", "SkeletonTiles", "SkeletonPills"]);
});

test("Booking history and Confirmed bookings are half cards like Payment setup, each opening a list of its own", () => {
  const h = harness();
  const tree = h.render(h.workspace.Workspace, workspaceProps);
  one(tree, "BookingHistoryCard").props.onPress(); one(tree, "BookingConfirmedCard").props.onPress();
  assert.deepEqual(h.routes, ["/owner-booking-history", "/owner-booking-confirmed"]);
  // Neither card carries a count, so the screen reads no list for one.
  assert.equal(h.listArguments.length, 0);
  const setup = h.render(h.workspace.PaymentCard, { onPress() {} });
  const styleOf = (tree) => Object.assign({}, ...[].concat(one(tree, "Text").props.style));
  for (const [card, label, icon] of [[h.workspace.HistoryCard, "Booking history", "BookingHistoryIcon"], [h.workspace.ConfirmedCard, "Confirmed bookings", "BookingConfirmedListIcon"]]) {
    let pressed = 0;
    const drawn = h.render(card, { onPress() { pressed += 1; } });
    assert.equal(drawn.type, "AnimatedPressable"); assert.equal(drawn.props.accessibilityRole, "button"); assert.equal(drawn.props.accessibilityLabel, label);
    // The same half card: the same width, the same size of drawing, the same title.
    assert.deepEqual({ ...drawn.props.style }, { ...setup.props.style });
    assert.deepEqual({ ...one(drawn, "Card").props.style }, { ...one(setup, "Card").props.style });
    assert.equal(one(drawn, icon).props.size, one(setup, "PaymentSetupIcon").props.size);
    assert.deepEqual(local(nodes(drawn, "Text").map((node) => node.props.children)), [label]);
    assert.deepEqual(styleOf(drawn), styleOf(setup));
    assert.equal(nodes(drawn, "ActionButton").length, 0); assert.equal(nodes(drawn, "Image").length, 0);
    drawn.props.onPress(); assert.equal(pressed, 1);
  }
  // The confirmed drawing is the history's own calendar, with a tick in its circle where the clock's hands are (user, 2026-10-11).
  const vectors = read("src/components/booking-vector-icons.tsx");
  const drawing = (name) => vectors.slice(vectors.indexOf(`export function ${name}`)).split("\n}")[0];
  for (const name of ["BookingHistoryIcon", "BookingConfirmedListIcon"]) {
    assert.ok(drawing(name).includes('<Path d="M18 6v10M39 6v10M7 24h43M16 33h12M16 42h8" />'), name);
    assert.ok(drawing(name).includes('<Circle cx={45} cy={44} r={15} fill="#FFFFFF" />'), name);
    assert.ok(drawing(name).includes('stroke="#4775C5"'), name);
  }
  assert.ok(drawing("BookingHistoryIcon").includes('<Path d="M45 35v10l7 4" />'));
  assert.equal(drawing("BookingConfirmedListIcon").includes("M45 35v10l7 4"), false);
  assert.ok(drawing("BookingConfirmedListIcon").includes('<Path d="m38 44.5 5 5 9-10.5" />'));
  for (const route of ["owner-booking-history", "owner-booking-confirmed"]) {
    assert.ok(read("app/_layout.tsx").includes(`<Stack.Screen name="${route}"`), route);
    assert.ok(read("src/features/owner/route-gates.tsx").includes(`"/${route}": { label: "Bookings", resource: "BOOKINGS" }`), route);
  }
});

test("the four doors are the same width, and Token record opens the Token record screen", () => {
  const h = harness();
  const tree = h.render(h.workspace.Workspace, workspaceProps);
  one(tree, "BookingTokenRecordCard").props.onPress();
  assert.deepEqual(h.routes, ["/owner-booking-tokens"]);
  let opened = 0;
  const record = h.render(h.workspace.RecordCard, { onPress() { opened += 1; } });
  const setup = h.render(h.workspace.PaymentCard, { onPress() {} });
  // Each starts from no width and grows by the same share (user, 2026-10-11: "should be equal width").
  assert.deepEqual({ ...record.props.style }, { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 });
  assert.deepEqual({ ...record.props.style }, { ...setup.props.style });
  assert.equal(record.props.accessibilityRole, "button");
  record.props.onPress(); assert.equal(opened, 1);
  assert.match(read("app/_layout.tsx"), /<Stack\.Screen name="owner-booking-tokens"/);
  assert.match(read("src/features/owner/route-gates.tsx"), /"\/owner-booking-tokens": \{ label: "Bookings", resource: "BOOKINGS" \}/);
});

// ---- The Tokens screen (user, 2026-10-11) -----------------------------------------------

test("the Tokens screen is every token of the property in one list, and a token opens its booking", () => {
  const h = harness({ tokenQuery: ledger([token()]) });
  const tree = h.render(h.tokensScreen.default);
  const header = one(tree, "ScreenHeader").props;
  assert.equal(`${header.title} ${header.italicTail}`, "Token record."); assert.match(header.subtitle, /Sample PG/);
  assert.equal(header.eyebrow, undefined);
  const list = one(tree, "BookingTokenList");
  assert.equal(list.props.propertyId, "property-1");
  list.props.onOpenBooking(token());
  assert.deepEqual(JSON.parse(JSON.stringify(h.routes)), [{ pathname: "/owner-booking-detail", params: { propertyId: "property-1", requestId: "request-1" } }]);
  // Someone with no bookings access is told so, and the list is never read for them.
  const shut = harness({ scope: { canView: false } });
  assert.equal(nodes(shut.render(shut.tokensScreen.default), "BookingTokenList").length, 0);
  assert.equal(one(shut.render(shut.tokensScreen.default), "EmptyState").props.title, "Bookings access needed");
});

test("the token list sends its status filter and its search to the server, and each starts again at the first page", () => {
  const h = harness({ tokenQuery: ledger([token()], { hasNext: true, totalPages: 3 }) });
  const props = { propertyId: "property-1", loadMoreRef: { current: null }, onOpenBooking() {} };
  let tree = h.render(h.tokenList.BookingTokenList, props);
  const asked = () => { const { propertyId, page, status, q } = h.tokenArguments.at(-1); return { propertyId, page, status, q }; };
  assert.deepEqual(asked(), { propertyId: "property-1", page: 0, status: null, q: "" });
  const queue = one(tree, "FilteredQueue");
  // Every state a token that arrived can be in, with All first.
  assert.deepEqual(local(queue.props.options.map((option) => option.label)), ["All", "Received", "Pending", "Refundable", "Kept", "Adjusted"]);
  const search = one(tree, "SearchField");
  assert.equal(search.props.placeholder, "Search token ID or booking ID"); assert.equal(search.props.autoCapitalize, "characters");
  // The next page is asked for by the screen's scroll.
  props.loadMoreRef.current(); h.render(h.tokenList.BookingTokenList, props);
  assert.equal(asked().page, 1);
  queue.props.onChange("REFUND_DUE"); h.render(h.tokenList.BookingTokenList, props);
  assert.deepEqual(asked(), { propertyId: "property-1", page: 0, status: "REFUND_DUE", q: "" });
  props.loadMoreRef.current(); h.render(h.tokenList.BookingTokenList, props);
  search.props.onChangeText(" TKN-2026 "); tree = h.render(h.tokenList.BookingTokenList, props);
  assert.deepEqual(asked(), { propertyId: "property-1", page: 0, status: "REFUND_DUE", q: "TKN-2026" });
  // Pages are kept apart by what was asked for, so a new filter never shows the last one's rows.
  assert.equal(h.accumulatedKeys.at(-1), "property-1:REFUND_DUE:TKN-2026");
  assert.doesNotMatch(read("src/features/booking/booking-token-list.tsx"), /\.filter\(\(token\)/, "Nothing is narrowed over one fetched page");
});

test("a token card shows the token's ID and status, the booking's ID and status, and Refund or Keep only where the server allows it", () => {
  const h = harness();
  const drawn = (overrides) => h.render(h.tokenList.BookingTokenCard, { token: token(overrides), onDecide() {}, onOpenBooking() {} });
  const owed = drawn();
  const said = local(nodes(owed, "Text").map((node) => [node.props.children].flat(Infinity).join("")));
  // The token's code alone, as a booking's card shows its own (user, 2026-10-11: "remove Token id from before the id").
  assert.ok(said.includes("TKN-2026-000007")); assert.equal(said.some((line) => /Token ID/.test(line)), false);
  assert.ok(said.includes("Booking ID")); assert.ok(said.includes("BKG-2026-000001"));
  // Amount, date and mode as a tenancy card's facts (user, 2026-10-27).
  const facts = nodes(owed, "TokenFact").map((node) => [node.props.label, node.props.value]);
  assert.deepEqual(facts.map(([label]) => label), ["Amount", "Received on", "Mode"]);
  assert.equal(facts[0][1], "Rs 2000"); assert.equal(facts[2][1], "UPI");
  assert.equal(nodes(owed, "TokenFactDivider").length, 2);
  // The token's status in words, never the stored name. The booking's own status sits with the booking's code.
  assert.equal(one(owed, "OwnerTokenStatus").props.status, "REFUND_DUE"); assert.equal(nodes(owed, "StatusPill").length, 0);
  // The chip is the booking status chip's own drawing, a mark and a word. Received carries a tick (user, 2026-10-11).
  const chips = load(read("src/features/booking/owner-booking-status.tsx"), h.dependencies);
  const received = chips.OwnerTokenStatus({ status: "RECEIVED" });
  const booked = chips.OwnerBookingStatus({ status: "MOVED_IN" });
  assert.equal(received.props.accessibilityLabel, "Token status: Received");
  assert.equal(received.props.children[0].type, "CircleCheck"); assert.equal(received.props.children[1].props.children, "Received");
  assert.deepEqual({ ...received.props.style }, { ...booked.props.style });
  assert.deepEqual({ ...received.props.children[0].props }, { ...booked.props.children[0].props });
  assert.deepEqual({ ...received.props.children[1].props.style }, { ...booked.props.children[1].props.style });
  const word = (status) => chips.OwnerTokenStatus({ status }).props.children[1].props.children;
  // The two ways a token ends, and the wait between (user, 2026-10-28).
  assert.equal(word("REFUND_DUE"), "Refundable"); assert.equal(word("ADJUSTED"), "Adjusted"); assert.equal(word("KEPT"), "Kept");
  assert.equal(word("DECISION_PENDING"), "Pending");
  assert.deepEqual({ ...one(owed, "OwnerBookingStatus").props }, { short: true, status: "CANCELLED" });
  assert.ok(said.some((line) => line.startsWith("Refundable since ") && line.endsWith("The property refunds it directly.")));
  assert.equal(one(owed, "BookingInfoBand", (node) => node.props.tone === "neutral" && node.props.icon === "Undo2").props.icon, "Undo2");
  // Refunds are not followed: a refundable token has nothing more to do.
  button(owed, "View booking");
  assert.equal(nodes(owed, "ActionButton").some((node) => /Refund token|Keep token|Mark refund sent/.test(node.props.label)), false);
  // No raw id anywhere on the card.
  assert.equal(said.some((line) => line.includes("request-1")), false);

  // A no-show's token waits: Keep and Refund side by side, where the server allows it.
  const decided = [];
  const pending = h.render(h.tokenList.BookingTokenCard, { token: token({ status: "DECISION_PENDING", endCause: "TENANT_DID_NOT_ARRIVE", refundDueSince: null, canDecide: true }), onDecide: (refund) => decided.push(refund), onOpenBooking() {} });
  assert.ok(nodes(pending, "Text").some((node) => [node.props.children].flat(Infinity).join("") === "The guest did not arrive. Refund the token or keep it."));
  assert.equal(one(pending, "BookingInfoBand", (node) => node.props.tone === "warning").props.icon, "Clock3");
  button(pending, "Keep token").props.onPress(); button(pending, "Refund token").props.onPress();
  assert.deepEqual(decided, [false, true]);
  assert.equal(button(pending, "Keep token").props.variant, "neutral");
  const notMine = drawn({ status: "DECISION_PENDING", refundDueSince: null, canDecide: false });
  assert.equal(nodes(notMine, "ActionButton").some((node) => /Refund token|Keep token/.test(node.props.label)), false);
  // A token still held has nothing to say about a refund.
  const held = drawn({ status: "RECEIVED", bookingStatus: "CONFIRMED", refundDueSince: null });
  // Only the booking's band: the amount is a row of facts now, not a band (user, 2026-10-27).
  assert.equal(nodes(held, "BookingInfoBand").length, 1);
  assert.equal(h.tokenList.tokenRefundLine(token({ status: "KEPT" })), null);
});

test("the token list keeps its skeleton, its failure and its two empty states apart", () => {
  const props = { propertyId: "property-1", onOpenBooking() {} };
  const loading = harness({ tokenQuery: { currentData: undefined, isError: false } });
  const first = loading.render(loading.tokenList.BookingTokenList, props);
  assert.equal(nodes(first, "SkeletonList").length, 1); assert.equal(nodes(first, "EmptyState").length, 0);
  const failed = harness({ tokenQuery: { currentData: undefined, isError: true } });
  const refused = failed.render(failed.tokenList.BookingTokenList, props);
  assert.equal(one(refused, "NoticeBar").props.title, "Could not load tokens"); assert.equal(nodes(refused, "EmptyState").length, 0);
  const none = harness({ tokenQuery: ledger([]) });
  let empty = none.render(none.tokenList.BookingTokenList, props);
  assert.equal(one(empty, "EmptyState").props.title, "No tokens collected yet");
  one(empty, "FilteredQueue").props.onChange("KEPT"); empty = none.render(none.tokenList.BookingTokenList, props);
  assert.equal(one(empty, "EmptyState").props.title, "No matching tokens");
  // A full list ends with the app's own foot.
  const full = harness({ tokenQuery: ledger([token()]) });
  assert.equal(nodes(full.render(full.tokenList.BookingTokenList, props), "ListEnd").length, 1);
});

test("Refund token and Keep token ask first, then send the choice and the loaded version to its booking", async () => {
  const h = harness({ tokenQuery: ledger([token({ status: "DECISION_PENDING", refundDueSince: null, canDecide: true })]) });
  const props = { propertyId: "property-1", onOpenBooking() {} };
  let tree = h.render(h.tokenList.BookingTokenList, props);
  assert.equal(nodes(tree, "ConfirmDialog").length, 0);
  one(tree, "BookingTokenCard").props.onDecide(true); tree = h.render(h.tokenList.BookingTokenList, props);
  const asked = one(tree, "ConfirmDialog").props;
  assert.equal(asked.title, "Refund this token?"); assert.equal(asked.confirmLabel, "Refund token");
  const words = [asked.message.props.children].flat(Infinity).map((part) => typeof part === "string" ? part : [part?.props?.children].flat().join("")).join("");
  assert.match(words, /will be recorded as refundable\. Refund it to them directly\. Khatiyan does not handle refunds\.$/);
  asked.onConfirm(); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes)), [{ kind: "refundToken", propertyId: "property-1", requestId: "request-1", version: 9 }]);

  const keep = harness({ tokenQuery: ledger([token({ status: "DECISION_PENDING", refundDueSince: null, canDecide: true })]) });
  tree = keep.render(keep.tokenList.BookingTokenList, props);
  one(tree, "BookingTokenCard").props.onDecide(false); tree = keep.render(keep.tokenList.BookingTokenList, props);
  const kept = one(tree, "ConfirmDialog").props;
  assert.equal(kept.title, "Keep this token?"); assert.equal(kept.destructive, true);
  kept.onCancel(); tree = keep.render(keep.tokenList.BookingTokenList, props);
  assert.equal(nodes(tree, "ConfirmDialog").length, 0); assert.deepEqual(local(keep.writes), []);

  // A refusal is acknowledged, not left on the card.
  const refused = harness({ writeError: new Error("refused"), tokenQuery: ledger([token({ status: "DECISION_PENDING", refundDueSince: null, canDecide: true })]) });
  tree = refused.render(refused.tokenList.BookingTokenList, props);
  one(tree, "BookingTokenCard").props.onDecide(false); tree = refused.render(refused.tokenList.BookingTokenList, props);
  one(tree, "ConfirmDialog").props.onConfirm(); await settle();
  tree = refused.render(refused.tokenList.BookingTokenList, props);
  assert.equal(nodes(tree, "AlertModal").length, 1);
});

test("the filter shares the search row and there is no request-count pill, even while loading", () => {
  for (const listQuery of [
    ...[0, 1, 6].map((count) => ({ currentData: page({ items: [], totalElements: count }) })),
    { currentData: undefined, data: page(), isFetching: true },
  ]) {
    const h = harness({ listQuery });
    const tree = h.render(h.list.BookingRequestList, listProps());
    const queue = one(tree, "FilteredQueue").props;
    assert.equal(queue.headingNode.type, "SearchField");
    assert.equal(queue.headingNode.props.placeholder, "Search by name, booking code or room");
    assert.equal(queue.count, undefined);
    assert.equal(nodes(tree, "SearchField").length, 1);
    assert.equal(nodes(tree, "CountPill").length, 0);
    assert.equal(nodes(tree, "Skeleton").length, 0);
  }
});

test("the history screen is the same list read from the history, with nobody's to handle", () => {
  const h = harness();
  const screen = h.render(h.history.default);
  const list = one(screen, "BookingRequestList");
  assert.equal(list.props.filter, "HISTORY");
  const tree = h.render(h.list.BookingRequestList, listProps({ filter: "HISTORY" }));
  assert.equal(nodes(tree, "SelectionTabs").length, 0);
  assert.deepEqual(local(one(tree, "FilteredQueue").props.options.map((option) => option.value)), ["ALL", "CANCELLED", "EXPIRED", "MOVED_IN"]);
  const args = h.listArguments.at(-1);
  assert.equal(args.filter, "HISTORY"); assert.equal(args.mine, false); assert.equal(args.unassigned, false);
});

test("two tabs on the working list: the requests nobody handles yet and the reader's own. Confirmed has a card and a screen of its own", () => {
  const h = harness();
  let tree = h.render(h.list.BookingRequestList, listProps());
  // Being assigned takes a request out of All requests (user, 2026-10-11), so the tab asks for the unassigned ones.
  assert.equal(h.listArguments.at(-1).unassigned, true); assert.equal(h.listArguments.at(-1).mine, false);
  const tabs = one(tree, "SelectionTabs").props;
  // Confirmed was a third tab until it got its own card (user, 2026-10-11: "Remove Confirmed from the tabs").
  assert.deepEqual(local(tabs.options.map((option) => option.label)), ["All requests", "Assigned to me"]);
  assert.equal(tabs.compact, true); assert.ok(tabs.options.every((option) => option.label.length <= 14));
  // The rule under them runs to both edges of the screen, past the page margin, as on the meal screen.
  assert.equal(tabs.bleed, spacing.lg);
  assert.equal(tabs.distributed, true); assert.equal(tabs.active, "ALL"); assert.equal(nodes(tree, "TabSwitcher").length, 0);
  assert.deepEqual(local(one(tree, "FilteredQueue").props.options.map((option) => option.value)), ["ALL", "AWAITING_HANDLER", "AWAITING_TENANT", "AWAITING_TOKEN", "TOKEN_RECEIVED", "CONFIRMED"]);
  // The property's counts are of every open request, which this list no longer is, so none is shown beside it.
  assert.deepEqual(local(one(tree, "FilteredQueue").props.options.map((option) => option.count)), [undefined, undefined, undefined, undefined, undefined, undefined]);
  assert.doesNotMatch(read("src/features/booking/booking-request-list.tsx"), /useGetPropertyBookingCountsQuery/);
  // Assigned to me is the reader's own, whoever else is waiting.
  tabs.onChange("MINE"); tree = h.render(h.list.BookingRequestList, listProps());
  assert.equal(h.listArguments.at(-1).unassigned, false); assert.equal(h.listArguments.at(-1).mine, true);
});

test("workspace, list and counts never call first-view open", () => {
  const screen = harness();
  screen.render(screen.workspace.Workspace, workspaceProps);
  assert.equal(screen.writes.length, 0);
  const h = harness();
  h.render(h.list.BookingRequestList, listProps());
  assert.equal(h.writes.length, 0);
  assert.equal(h.listArguments.at(-1).filter, "OPEN");
});

test("with nothing in the list the Bookings screen sits still, and scrolls again once there is something", () => {
  // The list says when it starts and stops showing its empty state.
  const empty = harness({ listQuery: { currentData: page({ items: [], totalElements: 0, totalPages: 0, hasNext: false }) } });
  const said = [];
  empty.render(empty.list.BookingRequestList, listProps({ onEmptyChange: (value) => said.push(value) }));
  empty.flushEffects();
  assert.deepEqual(said, [true]);
  const full = harness();
  full.render(full.list.BookingRequestList, listProps({ onEmptyChange: (value) => said.push(value) }));
  full.flushEffects();
  assert.deepEqual(said, [true, false]);
  // While it loads it is not empty: a skeleton is not an empty state.
  const loading = harness({ listQuery: { currentData: undefined, isFetching: true } });
  loading.render(loading.list.BookingRequestList, listProps({ onEmptyChange: (value) => said.push(value) }));
  loading.flushEffects();
  assert.deepEqual(said, [true, false, false]);

  // Every screen now sits still when it fits (user, 2026-10-17), so the Bookings screen asks for nothing of its own.
  const h = harness();
  assert.equal(one(h.render(h.workspace.Workspace, workspaceProps), "ScreenScrollView").props.fitWithoutScroll, undefined);

  // What "fits" means: what is on the page, without the breathing room under it, is no taller than the screen.
  const layout = load(read("src/components/header-scroll-layout.ts"));
  assert.equal(layout.contentFitsWithoutScroll(712, 32, 706), true);
  assert.equal(layout.contentFitsWithoutScroll(760, 32, 706), false);
  // Not measured yet is not known to fit, so nothing is locked on a guess.
  assert.equal(layout.contentFitsWithoutScroll(0, 32, 706), false);
  assert.equal(layout.contentFitsWithoutScroll(500, 32, 0), false);
  // A page that sits still keeps no room for its header to scroll away into, and goes back to its top.
  const scroll = read("src/components/screen-scroll-view.tsx");
  // A page that scrolls keeps the room, however little it overflows, so its header
  // collapses the whole way (user, 2026-10-18), and the fit is judged on the page's
  // own height, which that room does not raise.
  assert.ok(scroll.includes("const resolvedMinHeight = stickyScreenHeader && !fits"));
  assert.ok(scroll.includes("naturalBottom <= viewportHeight + 1"));
  assert.ok(scroll.includes("scrollRef.current?.scrollTo({ animated: false, y: 0 })"));
  // On for every screen, and never while the keyboard is up.
  assert.ok(scroll.includes("fitWithoutScroll = true,"));
  assert.ok(scroll.includes("fitWithoutScroll && keyboardInset === 0"));
  assert.ok(scroll.includes('import { contentFitsWithoutScroll, getHeaderScrollMinHeight } from "@/components/header-scroll-layout";'));
});

test("a card's shadow is one a phone draws: the new one inside a module, the old one left on the tab screens", () => {
  const drawn = [];
  const shadows = (os, version, segments) => load(read("src/theme/shadows.ts"), {
    "expo-router": { useSegments: () => segments },
    "react-native": { Platform: { OS: os, Version: version } },
  });
  // Inside a module: a box shadow, which a browser and a phone both draw.
  const modern = shadows("android", 34, ["owner-bookings"]);
  assert.deepEqual({ ...modern.softShadow("rgba(15, 23, 42, 0.16)", 4, 12) }, { boxShadow: "0px 4px 12px 0px rgba(15, 23, 42, 0.16)" });
  // Part strength, as shadowOpacity was, weakens the colour itself.
  assert.equal(modern.softShadow("rgba(15, 23, 42, 0.16)", 6, 14, 0.5).boxShadow, "0px 6px 14px 0px rgba(15, 23, 42, 0.08)");
  assert.deepEqual({ ...shadows("web", undefined, []).softShadow("rgba(15, 23, 42, 0.16)", 2, 6) }, { boxShadow: "0px 2px 6px 0px rgba(15, 23, 42, 0.16)" });
  // Android before 9 has no box shadow, so it also gets the system's own.
  assert.equal(shadows("android", 27, []).softShadow("rgba(15, 23, 42, 0.16)", 4, 12).elevation, 3);
  // On a tab screen the shadow stays exactly as it was written (user, 2026-10-11: "not the 5 tabs").
  const tab = shadows("android", 34, ["(tabs)", "owner"]);
  assert.deepEqual(JSON.parse(JSON.stringify(tab.useSoftShadow()("rgba(15, 23, 42, 0.16)", 4, 12))), { shadowColor: "rgba(15, 23, 42, 0.16)", shadowOffset: { height: 4, width: 0 }, shadowOpacity: 1, shadowRadius: 12 });
  assert.equal(tab.useSoftShadow()("x", 4, 12).boxShadow, undefined);
  assert.equal(modern.useSoftShadow()("rgba(15, 23, 42, 0.16)", 4, 12).boxShadow, "0px 4px 12px 0px rgba(15, 23, 42, 0.16)");

  // Every card is drawn by the shared Card, which asks which of the two it is to wear.
  const card = read("src/components/card.tsx");
  assert.ok(card.includes("const softShadow = useSoftShadow();") && card.includes("...softShadow(colors.shadow, 4, 12)"));
  assert.doesNotMatch(card, /shadowOpacity|elevation:/);
  // The tab screens themselves keep the old one, and no file is left writing the kind a phone ignores.
  for (const file of ["app/(tabs)/index.tsx", "app/(tabs)/owner.tsx"]) {
    assert.ok(read(file).includes("...tabShadow(colors.shadow"), file);
    assert.doesNotMatch(read(file), /\.\.\.softShadow\(/, file);
  }
  const walk = (dir) => fs.readdirSync(path.join(__dirname, "..", dir), { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
  for (const file of [...walk("app"), ...walk("src")]) assert.doesNotMatch(read(file), /shadowColor: colors\.shadow/, file);
  assert.equal(drawn.length, 0);
});

test("list paging, status, mine and search are sent to the server, not filtered over one page", () => {
  const h = harness();
  let tree = h.render(h.list.BookingRequestList, listProps());
  one(tree, "SelectionTabs").props.onChange("MINE");
  one(tree, "FilteredQueue").props.onChange("AWAITING_TOKEN");
  one(tree, "SearchField").props.onChangeText("  room 101  ");
  const more = { current: null };
  tree = h.render(h.list.BookingRequestList, listProps({ loadMoreRef: more }));
  more.current();
  tree = h.render(h.list.BookingRequestList, listProps({ loadMoreRef: more }));
  const args = h.listArguments.at(-1);
  assert.equal(args.q, "room 101"); assert.equal(args.mine, true); assert.equal(args.status, "AWAITING_TOKEN"); assert.equal(args.page, 1);
  // Counts of every open request say nothing about a narrowed list, so they are not shown beside it.
  assert.deepEqual(local(one(tree, "FilteredQueue").props.options.map((option) => option.count)), [undefined, undefined, undefined, undefined, undefined, undefined]);
});

test("narrowing the list any way goes back to its first page", () => {
  for (const narrow of [
    (tree) => one(tree, "FilteredQueue").props.onChange("CONFIRMED"),
    (tree) => one(tree, "SelectionTabs").props.onChange("MINE"),
    (tree) => one(tree, "SearchField").props.onChangeText("asha"),
  ]) {
    const h = harness(); const more = { current: null };
    let tree = h.render(h.list.BookingRequestList, listProps({ loadMoreRef: more }));
    more.current();
    tree = h.render(h.list.BookingRequestList, listProps({ loadMoreRef: more }));
    assert.equal(h.listArguments.at(-1).page, 1);
    narrow(tree);
    h.render(h.list.BookingRequestList, listProps());
    assert.equal(h.listArguments.at(-1).page, 0);
  }
});

test("initial list loading has a skeleton and no empty-state flash", () => {
  const h = harness({ listQuery: { currentData: undefined, isSuccess: false, isFetching: true } });
  const tree = h.render(h.list.BookingRequestList, listProps());
  one(tree, "SkeletonList"); assert.equal(nodes(tree, "EmptyState").length, 0); assert.equal(nodes(tree, "ListEnd").length + nodes(tree, "ActivityIndicator").length, 0);
});

test("while the next page loads the last one stays, and cannot be paged again", () => {
  const h = harness({ listQuery: { currentData: undefined, data: page(), isSuccess: false, isFetching: true } }); const more = { current: () => {} };
  const tree = h.render(h.list.BookingRequestList, listProps({ loadMoreRef: more }));
  assert.equal(nodes(tree, "BookingCard").length, 1); assert.equal(nodes(tree, "SkeletonList").length, 0);
  assert.equal(more.current, null);
});

test("a list failure is not described as no requests", () => {
  const h = harness({ listQuery: { currentData: undefined, isSuccess: false, isError: true, error: { status: 500 } } });
  const tree = h.render(h.list.BookingRequestList, listProps());
  one(tree, "NoticeBar", (node) => node.props.title === "Could not load bookings");
  button(tree, "Try again"); assert.equal(nodes(tree, "EmptyState").length, 0);
});

test("an empty list says why, compactly, and carries no button to balloon inside it", () => {
  const empty = { listQuery: { currentData: page({ items: [], totalElements: 0, totalPages: 0, hasNext: false }) } };
  let h = harness(empty);
  let state = one(h.render(h.list.BookingRequestList, listProps()), "EmptyState");
  assert.equal(state.props.title, "No requests waiting"); assert.equal(state.props.compact, true); assert.equal(state.props.action, undefined);
  assert.equal(state.props.description, "A new request waits here until someone responds to it. Yours are under Assigned to me.");
  h = harness(empty);
  one(h.render(h.list.BookingRequestList, listProps()), "SelectionTabs").props.onChange("MINE");
  const mine = one(h.render(h.list.BookingRequestList, listProps()), "EmptyState").props;
  assert.equal(mine.title, "Nothing is assigned to you");
  // The same for the owner and a manager: responding first makes it yours (user, 2026-10-11).
  assert.equal(mine.description, "A request is yours once you respond to it first, or it is assigned to you.");
  h = harness(empty);
  one(h.render(h.list.BookingRequestList, listProps()), "SearchField").props.onChangeText("nobody");
  assert.equal(one(h.render(h.list.BookingRequestList, listProps()), "EmptyState").props.title, "No matching bookings");
  h = harness(empty);
  const pastState = one(h.render(h.list.BookingRequestList, listProps({ filter: "HISTORY" })), "EmptyState").props;
  assert.equal(pastState.title, "No past bookings yet");
  // The history screen is nothing but this list, so its empty state takes the middle of the page.
  assert.equal(pastState.compact, false); assert.equal(pastState.action, undefined);
});

test("every owner booking queue empty state uses the shared 64pt booking vector", () => {
  const empty = { listQuery: { currentData: page({ items: [], totalElements: 0, totalPages: 0, hasNext: false }) } };
  for (const kind of ["OPEN", "HISTORY", "MINE", "SEARCH"]) {
    const h = harness(empty);
    const props = listProps({ filter: kind === "HISTORY" ? "HISTORY" : "OPEN" });
    const tree = h.render(h.list.BookingRequestList, props);
    if (kind === "MINE") one(tree, "SelectionTabs").props.onChange("MINE");
    if (kind === "SEARCH") one(tree, "SearchField").props.onChangeText("nobody");
    const state = one(h.render(h.list.BookingRequestList, props), "EmptyState");
    assert.equal(state.props.artworkNode.type, "BookingsIcon");
    assert.equal(state.props.artworkNode.props.size, 64);
    assert.equal(state.props.icon, undefined);
  }
});

test("a card shows the request's own clock only while it is being answered, and whose it is unless that is the reader", () => {
  const h = harness();
  const words = (props) => nodes(h.render(h.list.BookingCard, { onOpen() {}, ...props }), "Text").map((text) => [].concat(text.props.children).join(""));
  const waiting = words({ item: record({ handlerName: "Ravi" }) });
  assert.ok(waiting.includes(ui.bookingExpiresInLabel(record().expiresAt)));
  assert.ok(waiting.includes("Handled by Ravi"));
  // With nobody handling it the status chip says so, and no line repeats it.
  assert.equal(words({ item: record() }).some((line) => /handle/i.test(line)), false);
  const confirmed = words({ item: record({ status: "CONFIRMED", handlerName: "Ravi" }), showHandler: false });
  assert.equal(confirmed.some((line) => line.startsWith("Expire")), false);
  assert.equal(confirmed.some((line) => /handle/i.test(line)), false);
  assert.equal(button(h.render(h.list.BookingCard, { item: record(), onOpen() {} }), "Review request").props.variant, "primary");
  assert.equal(button(h.render(h.list.BookingCard, { item: record({ status: "AWAITING_TENANT" }), onOpen() {} }), "View booking").props.variant, "secondary");
});

test("manager list has no owner-only settings gear and never reads the owner's settings", () => {
  const h = harness(); const tree = h.render(h.workspace.Workspace, { ...workspaceProps, owner: false });
  assert.equal(one(tree, "ScreenHeader").props.trailing, null);
  assert.equal(h.settingsOptions.at(-1).skip, true);
  assert.equal(nodes(tree, "NoticeBar").length, 0);
});

test("an owner whose bookings are not set up is told so, with the way to the settings", () => {
  const h = harness({ settings: { configured: false } });
  const tree = h.render(h.workspace.Workspace, workspaceProps);
  // Red, and everything under it greyed and out of reach (user, 2026-10-10). The way to the settings stays live.
  assert.equal(one(tree, "NoticeBar", (node) => node.props.title === "Bookings are not set up").props.tone, "danger");
  const parts = one(tree, "ScreenScrollView").props.children.flat(Infinity).filter(Boolean);
  const body = parts.at(-1);
  assert.ok(body.props.style.opacity < 0.6); assert.equal(body.props.pointerEvents, "none"); assert.equal(body.props.accessibilityElementsHidden, true);
  one(body, "BookingTokenRecordCard"); one(body, "BookingHistoryCard"); one(body, "BookingConfirmedCard"); one(body, "Section");
  assert.equal(nodes(body, "NoticeBar").length, 0);
  assert.equal(nodes(body, "ActionButton").some((node) => node.props.label === "Set up bookings"), false);
  button(tree, "Set up bookings").props.onPress();
  assert.deepEqual(h.routes, ["/owner-booking-settings"]);
  assert.equal(nodes(harness().render(harness().workspace.Workspace, workspaceProps), "NoticeBar").length, 0);
});

test("the owner's way to booking settings is the Enquiries screen's own gear", () => {
  const h = harness(); const tree = h.render(h.workspace.Workspace, workspaceProps);
  const gear = one(tree, "ScreenHeader").props.trailing;
  assert.equal(gear.type, "AnimatedPressable"); assert.equal(gear.props.accessibilityLabel, "Booking settings");
  assert.equal(gear.props.children.type, "Ionicons"); assert.equal(gear.props.children.props.name, "settings"); assert.equal(gear.props.children.props.size, 22);
  gear.props.onPress();
  assert.deepEqual(h.routes, ["/owner-booking-settings"]);
  // Letter for letter the glyph on the Enquiries header, and no sliders icon left on this screen.
  const glyph = '<Ionicons color={colors.ink} name="settings" size={22} />';
  assert.ok(read("app/owner-enquiries.tsx").includes(glyph) && read("app/owner-bookings.tsx").includes(glyph));
  assert.equal(read("app/owner-bookings.tsx").includes("Settings2"), false);
});

test("pulling to refresh asks for every booking read again", () => {
  const h = harness(); const tree = h.render(h.workspace.Workspace, workspaceProps);
  one(tree, "ScreenScrollView").props.onRefresh();
  assert.deepEqual(JSON.parse(JSON.stringify(h.invalidated)), [{ invalidate: ["Booking"] }]);
});

// ---- The booking's detail ----------------------------------------------------------------

test("detail first-view opens once across effect replay and refresh renders", async () => {
  const h = harness(); const props = { propertyId: "property-1", requestId: "request-1", owner: false };
  h.render(h.detail.Detail, props);
  const cleanups = h.flushEffects(); cleanups.forEach((fn) => fn?.());
  h.render(h.detail.Detail, props); h.flushEffects(); await settle();
  const tree = h.render(h.detail.Detail, props); h.flushEffects(); await settle();
  assert.equal(h.writes.filter((item) => item.kind === "open").length, 1);
  one(tree, "BookingDetails");
});

test("read-only detail never renders negotiation or cancellation actions", async () => {
  const h = harness({ detailQuery: { currentData: record({ allowedActions: [] }) } });
  const props = { propertyId: "property-1", requestId: "request-1", owner: false };
  h.render(h.detail.Detail, props); h.flushEffects(); await settle();
  const tree = h.render(h.detail.Detail, props);
  assert.equal(nodes(tree, "PinnedFooter").length, 0);
});

test("accept answers the loaded offer and version with no invented confirmation", async () => {
  const h = harness(); const tree = h.render(h.detail.Decision, decisionProps("ACCEPT", record({ tokenRequired: true })));
  // The Confirm booking sheet (user's image, 2026-10-11): no shell title, the body with the terms, and two buttons.
  assert.equal(tree.type, "SheetShell"); assert.equal(tree.props.title, "");
  const body = one(tree, "BookingConfirmBody").props;
  assert.equal(body.place, "Sample PG · Room 101"); assert.equal(body.rentPaise, 880000); assert.equal(body.moveInDate, "2026-10-20"); assert.equal(body.agreementMonths, null);
  // A token is still to be paid here, so it does not claim the booking is confirmed by accepting.
  assert.match(body.notice, /After the token is received, the property must confirm the booking\./);
  // The small "This does not start the tenancy" line is gone (user, 2026-10-11).
  assert.equal("finePrint" in body, false);
  assert.equal(button(tree, "Not now").props.variant, "primaryQuiet"); assert.equal(button(tree, "Confirm booking").props.variant, "primary");
  const free = harness(); const noToken = one(free.render(free.detail.Decision, decisionProps("ACCEPT", record({ tokenRequired: false, agreementMonths: 3 }))), "BookingConfirmBody").props;
  assert.equal(noToken.notice, "Accepting this offer confirms the booking and keeps one bed reserved."); assert.equal(noToken.agreementMonths, 3);
  button(tree, "Confirm booking").props.onPress(); button(tree, "Confirm booking").props.onPress(); await settle();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].version, 12); assert.equal(h.writes[0].offerSequence, 3);
});

test("final offer carries exact rent, non-negotiability, loaded version and offer identity", async () => {
  const h = harness(); const props = decisionProps("COUNTER"); let tree = h.render(h.detail.Decision, props);
  one(tree, "FormInput").props.onChangeText("9200.05"); one(tree, "AnimatedPressable", (node) => node.props.accessibilityRole === "checkbox").props.onPress();
  tree = h.render(h.detail.Decision, props); button(tree, "Send offer").props.onPress(); await settle();
  assert.equal(h.writes[0].rentPaise, 920005); assert.equal(h.writes[0].negotiable, false); assert.equal(h.writes[0].version, 12); assert.equal(h.writes[0].offerSequence, 3);
});

test("a sheet never upgrades its version to silently overwrite a newer offer", async () => {
  const h = harness(); h.render(h.detail.Decision, decisionProps("ACCEPT"));
  const tree = h.render(h.detail.Decision, decisionProps("ACCEPT", record({ version: 13, currentOfferSequence: 4 })));
  assert.equal(button(tree, "Confirm booking").props.disabled, true);
  one(tree, "NoticeBar", (node) => node.props.title === "The request changed");
});

test("management cancellation requires and sends a reason against the loaded version", async () => {
  const h = harness(); const props = decisionProps("CANCEL"); let tree = h.render(h.detail.Decision, props);
  button(tree, "Cancel booking").props.onPress(); await settle(); assert.equal(h.writes.length, 0);
  // Blamed under the field, and the button waits for the field to be corrected.
  tree = h.render(h.detail.Decision, props);
  assert.ok(one(tree, "FormInput").props.error); assert.equal(button(tree, "Cancel booking").props.disabled, true);
  one(tree, "FormInput").props.onChangeText("  Cannot host on these dates  ");
  tree = h.render(h.detail.Decision, props); button(tree, "Cancel booking").props.onPress(); await settle();
  assert.equal(h.writes[0].reason, "Cannot host on these dates"); assert.equal(h.writes[0].version, 12);
});

test("property cancellation matches the reference sheet with a required reason, summary and bed-release warning", () => {
  const h = harness(); const tree = h.render(h.detail.Decision, decisionProps("CANCEL"));
  assert.equal(tree.props.title, "Cancel booking?"); assert.equal(tree.props.closeButtonVariant, "raised");
  assert.equal(nodes(tree, "CircleAlert").length, 1);
  assert.equal(one(tree, "CircleAlert").props.color, themes.light.danger);
  assert.ok(nodes(tree, "Text").some((node) => [].concat(node.props.children).join("") === "Sample visitor · Room 101"));
  assert.ok(nodes(tree, "Text").some((node) => node.props.children === "BKG-2026-000001"));
  const field = one(tree, "FormInput");
  assert.equal(field.props.label, "Reason for cancellation"); assert.equal(field.props.required, true);
  assert.equal(field.props.multiline, true); assert.equal(field.props.maxLength, 500); assert.equal(field.props.value, "");
  assert.equal(field.props.borderOnContainer, true);
  assert.equal(field.props.inputStyle.backgroundColor, themes.light.neutralSoft);
  assert.equal(field.props.labelAccessory, undefined);
  assert.equal(nodes(tree, "Text").some((node) => typeof node.props.children === "string" && node.props.children.startsWith("This reason will be shared")), false);
  const warning = one(tree, "View", (node) => node.props.style?.backgroundColor === themes.light.warningSoft);
  assert.equal(nodes(warning, "AlertTriangle").length, 1);
  const notice = one(warning, "Text", (node) => node.props.children === "The reserved bed will be released.");
  assert.equal(Object.assign({}, ...notice.props.style).fontSize, 12);
  assert.equal(button(tree, "Keep booking").props.variant, "secondary");
  assert.equal(button(tree, "Cancel booking").props.variant, "dangerFilled");
  assert.equal(h.writes.length, 0);
});

test("reason uses the real input's red asterisk and scoped grey styling without changing default inputs", () => {
  const h = harness();
  const ownerUi = load(read("src/features/owner/owner-ui.tsx"), { ...h.dependencies,
    "@/components/app-text-input": { AppTextInput: "AppTextInput" },
    "@/components/status-icon": { statusTonePalette() {} },
    "@/lib/haptics": { tapHaptic() {} },
    "@/components/skeletons": { useIsSkeleton: () => false },
  });
  const sheet = h.render(h.detail.Decision, decisionProps("CANCEL")); const props = one(sheet, "FormInput").props;
  const field = h.render(ownerUi.FormInput, props);
  assert.equal(one(field, "RequiredMark").props.required, true);
  const star = ownerUi.RequiredMark({ required: true });
  assert.equal(star.props.children, " *"); assert.equal(star.props.style.color, themes.light.danger);
  assert.equal(nodes(field, "StatusPill").length, 0);
  const styles = Object.assign({}, ...one(field, "AppTextInput").props.style);
  assert.equal(styles.backgroundColor, "transparent"); assert.equal(styles.minHeight, 88); assert.equal(styles.borderWidth, 0);
  const frame = one(field, "View", (node) => node.props.style?.backgroundColor === themes.light.neutralSoft);
  assert.equal(frame.props.style.borderWidth, 1); assert.equal(frame.props.style.minHeight, 90);
  assert.equal(frame.props.style.minWidth, 0); assert.equal(frame.props.style.overflow, "hidden");
  assert.equal(one(field, "AppTextInput").props.underlineColorAndroid, "transparent");
  const plain = h.render(ownerUi.FormInput, { label: "Name", value: "", placeholder: "Name", onChangeText() {} });
  const normal = Object.assign({}, ...one(plain, "AppTextInput").props.style);
  assert.equal(normal.backgroundColor, themes.light.surface); assert.equal(normal.minHeight, 50);
  const errored = h.render(ownerUi.FormInput, { ...props, error: "Give a reason" });
  const label = one(errored, "Text", (node) => [].concat(node.props.children).includes("Reason for cancellation"));
  assert.equal(Object.assign({}, ...label.props.style).color, themes.light.danger);
  assert.equal(one(errored, "View", (node) => node.props.style?.backgroundColor === themes.light.neutralSoft).props.style.borderColor, themes.light.danger);
});

test("raised close-circle shadow is darker and symmetric, without Android's directional elevation on supported versions", () => {
  const h = harness();
  const shadowFor = (version) => load(`${read("src/components/sheet-shell.tsx")}\nexports.CloseShadow = RAISED_CLOSE_SHADOW;`, { ...h.dependencies,
    "react-native": { Platform: { OS: "android", Version: version } },
    "react-native-gesture-handler": {},
    "react-native-safe-area-context": {},
    "@/components/leave-on-stale": {},
    "@/components/keyboard-intent": { onKeyboardLeaving: () => () => {} },
  }).CloseShadow;
  const shadow = shadowFor(34);
  assert.equal(shadow.boxShadow.length, 1);
  assert.equal(shadow.boxShadow[0].offsetX, 0); assert.equal(shadow.boxShadow[0].offsetY, 0);
  assert.equal(shadow.boxShadow[0].color, "rgba(15, 23, 42, 0.28)");
  assert.equal(shadow.boxShadow[0].blurRadius, 6); assert.equal(shadow.boxShadow[0].spreadDistance, 1);
  assert.equal(shadow.elevation, undefined);
  assert.equal(shadowFor(27).elevation, 5);
});

test("shared top-right sheet close uses a smaller faded-black cross without shrinking its circle or touch target", () => {
  const h = harness();
  const gesture = {};
  for (const method of ["enabled", "activeOffsetY", "failOffsetY", "simultaneousWithExternalGesture", "onBegin", "onUpdate", "onEnd", "runOnJS"]) gesture[method] = () => gesture;
  const shell = load(read("src/components/sheet-shell.tsx"), { ...h.dependencies,
    react: { ...h.dependencies.react, useCallback: (fn) => fn, useMemo: (fn) => fn() },
    "react-native": { ...h.dependencies["react-native"],
      Animated: { Value: class { interpolate() { return 0; } }, View: "AnimatedView" },
      Dimensions: { get: () => ({ height: 800 }) }, Keyboard: { isVisible: () => false },
      KeyboardAvoidingView: "KeyboardAvoidingView", Modal: "Modal",
      PanResponder: { create: () => ({ panHandlers: {} }) }, Platform: { OS: "android", Version: 34 },
    },
    "react-native-gesture-handler": { Gesture: { Pan: () => gesture }, GestureDetector: "GestureDetector", GestureHandlerRootView: "GestureHandlerRootView", ScrollView: "GestureScrollView" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) },
    "@/components/leave-on-stale": { useLeavableSurface() {} },
    "@/components/keyboard-intent": { onKeyboardLeaving: () => () => {} },
  });
  for (const title of ["Cancel booking?", ""]) {
    const tree = h.render(shell.SheetShell, { title, onClose() {}, children: "Body" });
    const close = one(tree, "AnimatedPressable", (node) => node.props.accessibilityLabel === "Close");
    const mark = one(close, "X");
    assert.equal(mark.props.size, 18);
    assert.equal(mark.props.color, "rgba(0, 0, 0, 0.6)");
    assert.equal(close.props.style.backgroundColor, "#FFFFFF");
    assert.equal(close.props.style.height, 32); assert.equal(close.props.style.width, 32);
    assert.equal(close.props.hitSlop, 8);
    assert.equal(close.props.style.boxShadow[0].color, "rgba(15, 23, 42, 0.28)");
  }
  for (const [variant, size, color] of [["circle", 16, themes.light.ink], ["plain", 21, themes.light.muted]]) {
    const tree = h.render(shell.SheetShell, { title: "Other sheet", closeButtonVariant: variant, onClose() {}, children: "Body" });
    const mark = one(tree, "X");
    assert.equal(mark.props.size, size); assert.equal(mark.props.color, color);
  }
});

test("cancellation preserves a received token's refund warning and blocks stale decisions", async () => {
  const h = harness(); const booked = record({ status: "CONFIRMED", token: { amountPaise: 200000, status: "RECEIVED", receivedAt: "2026-10-11T10:00:00Z" } });
  let tree = h.render(h.detail.Decision, decisionProps("CANCEL", booked));
  // The property cancelling must refund a received token, and the app takes no part in it (user, 2026-10-28).
  const said = nodes(tree, "Text").map((node) => [node.props.children].flat().filter((part) => typeof part === "string").join(""));
  assert.ok(said.some((line) => line.startsWith("The token of ") && line.includes(" already received must be refunded to ") && line.endsWith(". It will be recorded as refundable.")));
  assert.ok(said.includes("Khatiyan does not handle refunds. Refunding the token is solely the property's responsibility."));
  one(tree, "FormInput").props.onChangeText("Maintenance");
  tree = h.render(h.detail.Decision, decisionProps("CANCEL", { ...booked, version: 13 }));
  assert.equal(button(tree, "Cancel booking").props.disabled, true);
  button(tree, "Cancel booking").props.onPress(); await settle(); assert.equal(h.writes.length, 0);
});

test("Keep booking dismisses without cancelling and other decision sheets retain their existing layout", () => {
  const h = harness(); let closed = 0;
  const tree = h.render(h.detail.Decision, { ...decisionProps("CANCEL"), onClose: () => closed++ });
  button(tree, "Keep booking").props.onPress(); assert.equal(closed, 1); assert.equal(h.writes.length, 0);
  const other = harness(); const counter = other.render(other.detail.Decision, decisionProps("COUNTER"));
  assert.equal(counter.props.title, "Counter offer"); assert.equal(counter.props.closeButtonVariant, "raised");
  // The white circle with a shadow is the shell's own close now, for every sheet built on it (user, 2026-10-11).
  assert.ok(read("src/components/sheet-shell.tsx").includes('closeButtonVariant = "raised",'));
  assert.equal(nodes(counter, "CircleAlert").length, 0); assert.equal(one(counter, "FormInput").props.label, "Monthly rent");
});

test("cancellation rejects a reason beyond the server limit and prevents double submit or closing while saving", async () => {
  const h = harness(); let closed = 0;
  const props = { ...decisionProps("CANCEL"), onClose: () => closed++ }; let tree = h.render(h.detail.Decision, props);
  one(tree, "FormInput").props.onChangeText("x".repeat(501));
  tree = h.render(h.detail.Decision, props); button(tree, "Cancel booking").props.onPress(); await settle();
  assert.equal(h.writes.length, 0);
  tree = h.render(h.detail.Decision, props); assert.equal(one(tree, "FormInput").props.error, "Keep the reason within 500 characters.");
  one(tree, "FormInput").props.onChangeText("  Cannot host on these dates  ");
  tree = h.render(h.detail.Decision, props);
  button(tree, "Cancel booking").props.onPress(); button(tree, "Cancel booking").props.onPress(); button(tree, "Keep booking").props.onPress(); tree.props.onClose();
  assert.equal(closed, 0); await settle(); assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].reason, "Cannot host on these dates");
});

test("a refused decision is acknowledged in a dialog and what was typed is kept", async () => {
  const h = harness({ writeError: { status: 409 } }); const props = decisionProps("COUNTER"); let tree = h.render(h.detail.Decision, props);
  one(tree, "FormInput").props.onChangeText("9100");
  tree = h.render(h.detail.Decision, props); button(tree, "Send offer").props.onPress(); await settle();
  tree = h.render(h.detail.Decision, props);
  assert.equal(one(tree, "AlertModal").props.message, "Please refresh and try again.");
  assert.equal(nodes(tree, "NoticeBar").filter((node) => node.props.tone === "danger").length, 0);
  assert.equal(one(tree, "FormInput").props.value, "9100");
  one(tree, "AlertModal").props.onClose();
  assert.equal(nodes(h.render(h.detail.Decision, props), "AlertModal").length, 0);
});

test("a derived expiry disables a decision even before the server increments the row version", () => {
  const h = harness(); h.render(h.detail.Decision, decisionProps("ACCEPT"));
  const tree = h.render(h.detail.Decision, decisionProps("ACCEPT", record({ status: "EXPIRED", allowedActions: [] })));
  assert.equal(button(tree, "Confirm booking").props.disabled, true);
});

// ---- Words and numbers ---------------------------------------------------------------------

test("rent and civil date presentation do not silently round or shift dates", () => {
  assert.equal(ui.parseBookingRent("10.01"), 1001);
  assert.equal(ui.parseBookingRent("10.001"), null);
  assert.match(ui.bookingDateLabel("2026-10-10"), /10.*Oct.*2026/);
});

test("every status, token state, history step and ending has words of its own, never the stored name", () => {
  const api = read("src/store/services/booking-api.ts");
  const names = (type) => [...api.match(new RegExp(`export type ${type} =([\\s\\S]*?);`))[1].matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
  for (const [type, words] of [["BookingStatus", ui.BOOKING_STATUS], ["BookingTokenStatus", ui.BOOKING_TOKEN_STATUS], ["BookingActionType", ui.BOOKING_EVENT], ["BookingEndCause", ui.BOOKING_END_CAUSE]]) {
    const known = names(type);
    assert.ok(known.length > 3, type);
    assert.deepEqual(Object.keys(words).sort(), [...known].sort(), type);
    for (const name of known) {
      const said = typeof words[name] === "string" ? words[name] : words[name].label;
      assert.ok(said && !/[A-Z]{2}|_/.test(said), `${type}.${name}: ${said}`);
    }
  }
  assert.deepEqual([...ui.OPEN_BOOKING_STATUSES, ...ui.PAST_BOOKING_STATUSES].sort(), names("BookingStatus").sort());
  assert.equal(ui.bookingPartyLabel("TENANT"), "Tenant"); assert.equal(ui.bookingPartyLabel("MANAGEMENT"), "Property"); assert.equal(ui.bookingPartyLabel(null), null);
});

test("no booking screen writes a semicolon into its copy or shows a raw id", () => {
  for (const file of ["app/owner-bookings.tsx", "app/owner-booking-history.tsx", "app/owner-booking-tokens.tsx", "app/owner-booking-confirmed.tsx", "app/owner-booking-detail.tsx", "app/owner-booking-settings.tsx", "src/features/booking/booking-request-list.tsx", "src/features/booking/booking-token-list.tsx", "src/features/booking/booking-access-list.tsx", "src/features/booking/booking-ui.ts"]) {
    const source = read(file);
    for (const [, text] of source.matchAll(/(?:title|label|message|description|placeholder|subtitle)="([^"]*)"/g)) assert.doesNotMatch(text, /;/, `${file}: ${text}`);
    assert.doesNotMatch(source, />\{(?:item|booking|snapshot|token)\.(?:id|requestId|propertyId|tenancyId|handlerUserId)\}</, file);
  }
});

test("the owner's booking screen is laid out as the tenant's own view of the booking, piece for piece", async () => {
  // The same pieces in the same order in both sources (user, 2026-10-11: "exactly the same but with correct buttons").
  // A change to one layout fails here until the other has it too.
  const pieces = (source, from, to) => [...source.slice(source.indexOf(from), source.indexOf(to)).matchAll(/<(Card|NoticeBar|Booking(?:CardRule|FactBox|FactPair|InfoBand|InitialsAvatar|RoomAmenities|RoomPhoto|TokenAmountIcon)|RoomRent|StatusPill)\b/g)].map((match) => match[1]);
  const tenant = pieces(read("app/my-booking-detail.tsx"), "function TenantBookingSummary(", "function tenantCanDecide(");
  const owner = pieces(read("app/owner-booking-detail.tsx"), "function BookingDetails(", "function BookingDecisionSheet(");
  // One difference, asked for: the property's screen has no "waiting" notice under the reference (user, 2026-10-11).
  // That is the first notice on the tenant's, so the property's is the tenant's list without it.
  const expected = tenant.slice(); expected.splice(expected.indexOf("NoticeBar"), 1);
  assert.ok(tenant.length > 20); assert.deepEqual(owner, expected);
  assert.equal(read("app/owner-booking-detail.tsx").includes("Waiting for the property's answer"), false);

  // The words are the property's, not the tenant's.
  const h = harness();
  const booking = record({ offers: [], roomImageUrls: ["https://img.example/a.jpg"], roomConditioning: "AC", roomCapacity: 2, roomAmenities: ["TV"], roomCustomAmenities: [], depositPaise: 1000000, dueAtMoveInPaise: 1880000, tokenRequired: true, tokenPaise: 200000, tokenRefundable: false, futureBed: false, agreementMonths: 3 });
  const tree = h.render(h.detail.Details, { booking, owner: true });
  const words = nodes(tree, "Text").map((text) => [].concat(text.props.children).join(""));
  for (const said of ["Ref", "BKG-2026-000001", "Tenant details", "Sample visitor", "Room 101", "AC · 2 sharing", "One bed held", "Offer", "Token amount", "Activity"]) assert.ok(words.includes(said), said);
  // With no handler the chip says so and no second line repeats it. A handler is named under the reference.
  assert.equal(words.some((line) => /handle/i.test(line)), false);
  const handled = nodes(h.render(h.detail.Details, { booking: { ...booking, handlerName: "Priya Sharma" }, owner: true }), "Text").map((text) => [].concat(text.props.children).join(""));
  assert.ok(handled.includes("Handled by Priya Sharma"));
  assert.equal(words.some((line) => /Your details|held for you|Your proposed|Your offer/.test(line)), false);
  assert.equal(one(tree, "OwnerBookingStatus").props.status, "AWAITING_HANDLER");
  assert.deepEqual(Array.from(one(tree, "BookingRoomPhoto").props.imageUrls), ["https://img.example/a.jpg"]);
  assert.equal(one(tree, "RoomRent").props.paise, 880000);
  // Nothing of the old layout is left behind.
  const source = read("app/owner-booking-detail.tsx");
  for (const gone of ["DetailSection", "InfoLine", "TermRow", "Rent on the table"]) assert.equal(source.includes(gone), false, gone);

  // And the buttons are the property's own three, in the weights the tenant's have.
  const page = harness(); const props = { propertyId: "property-1", requestId: "request-1", owner: true };
  page.render(page.detail.Detail, props); page.flushEffects(); await settle();
  const footer = one(page.render(page.detail.Detail, props), "PinnedFooter");
  assert.deepEqual(nodes(footer, "ActionButton").map((item) => [item.props.label, item.props.variant]), [["Counter offer", "primaryQuiet"], ["Cancel booking", "dangerFilled"], ["Accept Rs 8800", undefined]]);
  // Cancel and Accept share a row, Cancel on the left (user, 2026-10-19).
  assert.equal(nodes(footer, "ActionButton").some((item) => /Withdraw|I've paid|Refund|Move my date/.test(item.props.label)), false);
});

test("the token policy is behind a ? on the Token amount card, in a How it works sheet titled Token policy", () => {
  const h = harness();
  const booking = record({ offers: [], tokenRequired: true, tokenPaise: 50000, tokenRefundable: true });
  let tree = h.render(h.detail.Details, { booking, owner: true });
  // No notice on the card any more, and nothing open until asked.
  assert.equal(nodes(tree, "NoticeBar").some((notice) => notice.props.title === "Token policy"), false);
  assert.equal(nodes(tree, "HowItWorksSheet").length, 0);
  const help = one(tree, "IconButton", (node) => node.props.accessibilityLabel === "Token policy");
  assert.equal(help.props.icon, "CircleHelp");
  help.props.onPress(); tree = h.render(h.detail.Details, { booking, owner: true });
  const sheet = one(tree, "HowItWorksSheet").props;
  assert.equal(sheet.title, "Token policy");
  assert.deepEqual(Array.from(sheet.steps, (step) => step.title), ["Comes off the first bill", "If the tenant cancels", "If the property cancels"]);
  assert.equal(sheet.steps[1].body, "The token is refunded to the tenant.");
  sheet.onClose(); assert.equal(nodes(h.render(h.detail.Details, { booking, owner: true }), "HowItWorksSheet").length, 0);
  // A booking with no token has no policy to explain.
  const free = harness();
  assert.equal(nodes(free.render(free.detail.Details, { booking: record({ offers: [], tokenRequired: false }), owner: true }), "IconButton").length, 0);
  // The tenant's own screen has the same mark and the same sheet, in the tenant's words.
  const tenant = read("app/my-booking-detail.tsx");
  assert.ok(tenant.includes('title="Token policy"')); assert.ok(tenant.includes('accessibilityLabel="Token policy"')); assert.equal(tenant.includes('<NoticeBar title="Token policy"'), false);
});

test("the Confirmed bookings screen is the same list asked for confirmed ones only, with a search and no tabs or status filter", () => {
  const h = harness();
  const screen = h.render(h.confirmed.default);
  const header = one(screen, "ScreenHeader").props;
  assert.equal(`${header.title} ${header.italicTail}`, "Confirmed bookings."); assert.match(header.subtitle, /Sample PG/);
  assert.equal(header.eyebrow, undefined);
  const shown = one(screen, "BookingRequestList").props;
  assert.equal(shown.filter, "OPEN"); assert.equal(shown.confirmedOnly, true);
  shown.onOpen(record());
  assert.deepEqual(JSON.parse(JSON.stringify(h.routes)), [{ pathname: "/owner-booking-detail", params: { propertyId: "property-1", requestId: "request-1" } }]);

  let tree = h.render(h.list.BookingRequestList, listProps({ confirmedOnly: true }));
  // One status and still not the reader's own only.
  const args = h.listArguments.at(-1);
  assert.equal(args.status, "CONFIRMED"); assert.equal(args.mine, false); assert.equal(args.filter, "OPEN"); assert.equal(args.page, 0);
  // Every confirmed booking is listed, whoever handles it.
  assert.equal(args.unassigned, false);
  assert.equal(nodes(tree, "SelectionTabs").length, 0);
  assert.equal(nodes(tree, "FilteredQueue").length, 0);
  assert.equal(nodes(tree, "CountPill").length, 0);
  one(tree, "SearchField").props.onChangeText("Asha"); tree = h.render(h.list.BookingRequestList, listProps({ confirmedOnly: true }));
  assert.equal(h.listArguments.at(-1).q, "Asha"); assert.equal(h.listArguments.at(-1).status, "CONFIRMED");
  // Its pages are kept apart from the working list's.
  assert.match(h.accumulatedKeys.at(-1), /:CONFIRMED:/);
  // Empty, it says what will appear there, in the middle of the page as on the history.
  const empty = harness({ listQuery: { currentData: page({ items: [], totalElements: 0, totalPages: 0, hasNext: false }) } });
  const none = one(empty.render(empty.list.BookingRequestList, listProps({ confirmedOnly: true })), "EmptyState").props;
  assert.equal(none.title, "No confirmed bookings yet"); assert.equal(none.compact, false);
  // Someone with no bookings access is told so, and the list is never read for them.
  const shut = harness({ scope: { canView: false } });
  assert.equal(nodes(shut.render(shut.confirmed.default), "BookingRequestList").length, 0);
});

test("a confirmed booking is opened by its handler alone: anyone else gets the card with no View booking", () => {
  const items = [record({ id: "mine", status: "CONFIRMED", handledByReader: true, handlerName: "Me" }), record({ id: "theirs", status: "CONFIRMED", handledByReader: false, handlerName: "Ravi" })];
  const h = harness({ listQuery: { currentData: page({ items, totalElements: 2, totalPages: 1, hasNext: false }) } });
  const opened = [];
  const cards = nodes(h.render(h.list.BookingRequestList, listProps({ confirmedOnly: true, onOpen: (item) => opened.push(item.id) })), "BookingCard");
  assert.deepEqual(local(cards.map((card) => card.props.canOpen)), [true, false]);
  const [mine, theirs] = cards.map((card) => h.render(h.list.BookingCard, card.props));
  button(mine, "View booking").props.onPress();
  assert.deepEqual(opened, ["mine"]);
  // The other's card says everything a card says, and offers no way in (user, 2026-10-11).
  assert.equal(nodes(theirs, "ActionButton").length, 0);
  assert.equal(nodes(theirs, "AnimatedPressable").length, 0);
  assert.equal(nodes(theirs, "BookingInfoBand").length, nodes(mine, "BookingInfoBand").length);
  assert.ok(nodes(theirs, "Text").some((node) => [].concat(node.props.children).join("") === "Handled by Ravi"));
  // To its own handler it says "you", never their own name back to them (user, 2026-10-11).
  assert.ok(nodes(mine, "Text").some((node) => [].concat(node.props.children).join("") === "Handled by you"));
  assert.equal(nodes(mine, "Text").some((node) => [].concat(node.props.children).join("") === "Handled by Me"), false);
  // On the working list a card always opens: what is listed there is the reader's to take or already theirs.
  const working = harness({ listQuery: { currentData: page({ items: [record({ handledByReader: false })], totalElements: 1, totalPages: 1, hasNext: false }) } });
  assert.equal(one(working.render(working.list.BookingRequestList, listProps()), "BookingCard").props.canOpen, true);
  const past = harness({ listQuery: { currentData: page({ items: [record({ status: "CANCELLED", handledByReader: false })], totalElements: 1, totalPages: 1, hasNext: false }) } });
  assert.equal(one(past.render(past.list.BookingRequestList, listProps({ filter: "HISTORY" })), "BookingCard").props.canOpen, true);
});

test("the list has no pager: the next page is asked for from the screen's scroll, and it ends with the app's list foot", () => {
  const source = read("src/features/booking/booking-request-list.tsx");
  assert.equal(source.includes("PaginationBar"), false);
  // More to come: a spinner under the cards, and a way for the host to ask.
  let h = harness(); let more = { current: null };
  let tree = h.render(h.list.BookingRequestList, listProps({ loadMoreRef: more }));
  assert.equal(nodes(tree, "ActivityIndicator").length, 1); assert.equal(nodes(tree, "ListEnd").length, 0); assert.equal(typeof more.current, "function");
  // Pages read are kept under one key for the question asked. A new tab is a new question.
  const key = h.accumulatedKeys.at(-1);
  one(tree, "SelectionTabs").props.onChange("MINE"); h.render(h.list.BookingRequestList, listProps({ loadMoreRef: more }));
  assert.notEqual(h.accumulatedKeys.at(-1), key);
  // Nothing more: the tick that says so, and nothing to ask for.
  h = harness({ listQuery: { currentData: page({ hasNext: false, totalPages: 1, totalElements: 1 }) } }); more = { current: () => {} };
  tree = h.render(h.list.BookingRequestList, listProps({ loadMoreRef: more }));
  assert.equal(nodes(tree, "ListEnd").length, 1); assert.equal(nodes(tree, "ActivityIndicator").length, 0); assert.equal(more.current, null);

  // Both screens that hold the list pass it their scroll: near the end asks, far from it does not.
  for (const screen of ["workspace", "history"]) {
    const host = harness();
    const page = screen === "workspace" ? host.render(host.workspace.Workspace, workspaceProps) : host.render(host.history.default);
    const scroll = one(page, "ScreenScrollView").props; const held = one(page, "BookingRequestList").props.loadMoreRef;
    let asked = 0; held.current = () => { asked += 1; };
    const at = (offset) => scroll.onScroll({ nativeEvent: { contentOffset: { y: offset }, contentSize: { height: 3000 }, layoutMeasurement: { height: 800 } } });
    at(0); assert.equal(asked, 0, screen);
    at(1990); assert.equal(asked, 1, screen);
    held.current = null; at(2200); assert.equal(asked, 1, screen);
  }
});

test("a card is made as the tenant's My bookings card is, with a short status at the end of the name's row", () => {
  const h = harness();
  const card = h.render(h.list.BookingCard, { item: record({ tenantName: "Debangshu Das" }), onOpen() {} });
  // The same card shell and soft bands as the tenant's.
  assert.equal(card.type, "Card"); assert.equal(card.props.style.padding, spacing.md); assert.equal(card.props.style.gap, spacing.sm);
  assert.equal(nodes(card, "BookingInfoBand").length, 4); assert.equal(nodes(h.render(h.list.BookingCard, { item: record({ handlerName: "Ravi" }), onOpen() {} }), "BookingInfoBand").length, 5);
  assert.equal(nodes(card, "StateChip").length, 0); assert.equal(nodes(card, "StatusPill").length, 0);
  const tenant = read("app/my-bookings.tsx");
  for (const piece of ["BookingInfoBand icon={CalendarDays}", "BookingInfoBand icon={IndianRupee}", "BookingInfoBand icon={Clock3}", "gap: spacing.sm, padding: spacing.md"]) assert.ok(tenant.includes(piece), piece);
  // The name and the booking code keep one line each. The status ends their row in its short form.
  const [header] = card.props.children.filter(Boolean);
  const name = one(header, "Text", (node) => node.props.children === "Debangshu Das").props;
  assert.equal(name.numberOfLines, 1);
  assert.equal(one(header, "Text", (node) => node.props.children === "BKG-2026-000001").props.numberOfLines, 1);
  // The status is the Review booking screen's own chip, last in that row, saying "Awaiting" and not "Awaiting handler" (user, 2026-10-11).
  const chip = header.props.children.filter(Boolean).at(-1);
  assert.equal(chip.type, "OwnerBookingStatus"); assert.equal(chip.props.status, "AWAITING_HANDLER"); assert.equal(chip.props.short, true);
  const drawn = load(read("src/features/booking/owner-booking-status.tsx"), h.dependencies);
  const said = (props) => one(drawn.OwnerBookingStatus(props), "Text").props.children;
  assert.equal(said({ status: "AWAITING_HANDLER", short: true }), "Awaiting"); assert.equal(said({ status: "AWAITING_HANDLER" }), "Awaiting handler");
  assert.equal(said({ status: "CONFIRMED", short: true }), "Confirmed");
  assert.ok(read("app/owner-booking-detail.tsx").includes('from "@/features/booking/owner-booking-status"'));
  assert.equal(read("app/owner-booking-detail.tsx").includes("function OwnerBookingStatus"), false);
  // The room's number is a size down, and the band lines are a weight up from the plain description (user, 2026-10-11).
  const styleOf = (tree, starts) => Object.assign({}, ...[].concat(one(tree, "Text", (node) => [].concat(node.props.children).join("").startsWith(starts)).props.style));
  const handled = h.render(h.list.BookingCard, { item: record({ handlerName: "Ravi" }), onOpen() {} });
  assert.equal(styleOf(handled, "Room ").fontSize, 13); assert.ok(styleOf(handled, "Move-in: ").fontSize === undefined || styleOf(handled, "Move-in: ").fontSize > 13);
  for (const line of ["Room ", "Move-in: ", "Handled by ", "Tenant's offer", "Expire"]) assert.equal(styleOf(handled, line).fontFamily, "medium", line);
  // One full-width button, strong only where the request is waiting on the property.
  assert.equal(button(card, "Review request").props.variant, "primary");
  assert.equal(button(h.render(h.list.BookingCard, { item: record({ status: "CONFIRMED" }), onOpen() {} }), "View booking").props.variant, "secondary");
});

test("a request's clock on a card reads as days from now and the time it ends, on both sides' cards", () => {
  const now = Date.parse("2026-10-11T06:30:00Z");
  // 18 Oct, 12:41 am in India is seven of India's days after 11 Oct, whatever the hour is now.
  assert.equal(ui.bookingExpiresInLabel("2026-10-17T19:11:00Z", now), "Expires in 7 days at 12:41 am");
  assert.equal(ui.bookingExpiresInLabel("2026-10-12T12:30:00Z", now), "Expires in 1 day at 6 pm");
  assert.equal(ui.bookingExpiresInLabel("2026-10-11T12:30:00Z", now), "Expires today at 6 pm");
  assert.equal(ui.bookingExpiresInLabel("2026-10-11T06:00:00Z", now), "Expired");
  // The owner's card and the tenant's card both say it this way, and neither prints the bare date.
  for (const file of ["src/features/booking/booking-request-list.tsx", "app/my-bookings.tsx"]) {
    const source = read(file);
    assert.ok(source.includes("{bookingExpiresInLabel(item.expiresAt)}"), file);
    assert.equal(/(Respond by|Expires) \{bookingDateLabel\(item\.expiresAt/.test(source), false, file);
  }
  const h = harness();
  const words = nodes(h.render(h.list.BookingCard, { item: record({ expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }), onOpen() {} }), "Text").map((text) => [].concat(text.props.children).join(""));
  assert.ok(words.some((line) => /^Expires in 3 days at \d{1,2}(:\d{2})? (am|pm)$/.test(line)), words.join(" | "));
});

test("a request made at the listed rent shows no Counter offer, and the screen says why", async () => {
  // The server leaves COUNTER out of what the property may do (user, 2026-10-11). The screen draws what it is given.
  const atListed = record({ offers: [], currentRentPaise: 950000, listedRentPaise: 950000, currentOfferBy: "TENANT", allowedActions: ["ACCEPT", "CANCEL"] });
  const h = harness({ detailQuery: { currentData: atListed } }); const props = { propertyId: "property-1", requestId: "request-1", owner: true };
  h.render(h.detail.Detail, props); h.flushEffects(); await settle();
  const footer = one(h.render(h.detail.Detail, props), "PinnedFooter");
  assert.deepEqual(nodes(footer, "ActionButton").map((item) => item.props.label), ["Cancel booking", "Accept Rs 9500"]);
  const why = "The tenant asked at the room's listed rent, so there is nothing to counter. Accept the request or cancel it.";
  const linesOf = (booking) => nodes(h.render(h.detail.Details, { booking, owner: true }), "Text").map((text) => [].concat(text.props.children).join(""));
  // Said in the Offer card, with no notice board under the reference.
  assert.ok(linesOf(atListed).includes(why));
  // A small yellow notice with an i: the notice board's colour, the small description type.
  const drawn = h.render(h.detail.Details, { booking: atListed, owner: true });
  const band = one(drawn, "View", (node) => node.props.style?.backgroundColor === themes.light.warningSoft && nodes(node.props.children, "Info").length === 1);
  assert.equal(one(band, "Info").props.color, themes.light.warningText); assert.equal(one(band, "Info").props.size, 18);
  const said = Object.assign({}, ...[].concat(one(band, "Text").props.style));
  assert.equal(said.fontSize, 12); assert.equal(said.color, themes.light.ink); assert.equal([].concat(one(band, "Text").props.children).join(""), why);
  assert.equal(nodes(h.render(h.detail.Details, { booking: atListed, owner: true }), "NoticeBar").length, 0);
  // Below the listed rent it is a bargain, and nothing needs explaining.
  assert.equal(linesOf(record({ offers: [] })).includes(why), false);
});

test("the counter sheet: a blue Use room rent, a square Final counter tick with a ?, and the deadline in yellow", async () => {
  const h = harness(); const props = decisionProps("COUNTER");
  let tree = h.render(h.detail.Decision, props);
  // Nothing under the title: the name and room that used to sit there are gone from this sheet (user, 2026-10-11).
  assert.equal(nodes(tree, "Text").some((text) => [].concat(text.props.children).join("").includes("· Room ")), false);
  // The room's own rent in one tap, as a main action.
  const useRent = button(tree, "Use room rent"); assert.equal(useRent.props.variant, undefined);
  useRent.props.onPress(); tree = h.render(h.detail.Decision, props);
  assert.equal(one(tree, "FormInput").props.value, "9500");
  // A square tick, not a switch, off until chosen. Beside the button, with its ? after it.
  assert.equal(nodes(tree, "Switch").length, 0);
  const row = one(tree, "View", (node) => nodes(node.props.children, "ActionButton").some((item) => item.props.label === "Use room rent") && nodes(node.props.children, "IconButton").length === 1);
  const tick = one(row, "AnimatedPressable", (node) => node.props.accessibilityRole === "checkbox");
  assert.equal(tick.props.accessibilityState.checked, false);
  // On a grey fill, with its ? close against it (user, 2026-10-11).
  assert.equal(tick.props.style.backgroundColor, themes.light.neutralSoft);
  const pair = one(row, "View", (node) => node.props.style?.gap === 2); assert.equal(pair.props.children.at(-1).type, "IconButton");
  const box = tick.props.children[0].props.style; assert.equal(box.borderRadius, 5); assert.equal(box.height, box.width);
  assert.ok(nodes(tick, "Text").some((text) => text.props.children === "Final counter"));
  // First counter of this booking: what the tenant can do is said, with "the booking" in it.
  one(tree, "NoticeBar", (node) => node.props.title === "The tenant can accept, counter or cancel the booking" && node.props.tone === "info");
  // The deadline is its own yellow notice, with the date and time, and is always there.
  const deadline = one(tree, "NoticeBar", (node) => node.props.tone === "warning" && node.props.title.startsWith("Deadline remains "));
  assert.equal(deadline.props.title, `Deadline remains ${ui.bookingDateLabel("2026-10-17T10:00:00Z", true)}`);
  // Ticked: a final counter, the notice follows, and that is what is sent.
  tick.props.onPress(); tree = h.render(h.detail.Decision, props);
  assert.equal(one(tree, "AnimatedPressable", (node) => node.props.accessibilityRole === "checkbox").props.accessibilityState.checked, true);
  one(tree, "NoticeBar", (node) => node.props.title === "The tenant can accept or cancel the booking");
  button(tree, "Send offer").props.onPress(); await settle();
  assert.equal(h.writes[0].negotiable, false); assert.equal(h.writes[0].rentPaise, 950000);
  // The ? opens the How it works sheet, titled Final counter.
  const help = harness(); tree = help.render(help.detail.Decision, props);
  assert.equal(nodes(tree, "HowItWorksSheet").length, 0);
  one(tree, "IconButton", (node) => node.props.icon === "CircleHelp").props.onPress(); tree = help.render(help.detail.Decision, props);
  const sheet = one(tree, "HowItWorksSheet").props; assert.equal(sheet.title, "Final counter"); assert.equal(sheet.steps.length, 3);

  // A later counter on the same booking: the explanation is not shown again. The deadline still is.
  const later = harness();
  const again = later.render(later.detail.Decision, decisionProps("COUNTER", record({ offers: [{ sequence: 2, madeBy: "MANAGEMENT", monthlyRentPaise: 920000, negotiable: true, madeAt: "2026-10-10T11:00:00Z" }] })));
  assert.equal(nodes(again, "NoticeBar").some((node) => node.props.tone === "info"), false);
  one(again, "NoticeBar", (node) => node.props.tone === "warning" && node.props.title.startsWith("Deadline remains "));
});

test("the Confirm booking body is the image's: a tick, the heading, three terms in one ruled box and a blue line", () => {
  const h = harness();
  const real = load(read("src/features/booking/booking-confirm-body.tsx"), { ...h.dependencies, "@/theme/spacing": { spacing, radii: { card: 10 } } });
  const drawn = real.BookingConfirmBody({ place: "Sample PG · Room 101", rentPaise: 920000, moveInDate: "2026-10-21", agreementMonths: 3, notice: "Accepting this offer confirms the booking and keeps one bed reserved." });
  const words = nodes(drawn, "Text").map((text) => [].concat(text.props.children).join(""));
  assert.deepEqual(words, ["Confirm booking?", "Sample PG · Room 101", "Monthly rent", "Rs 9200", "Move-in", ui.bookingDateLabel("2026-10-21"), "Definite agreement", "3 months", "Accepting this offer confirms the booking and keeps one bed reserved."]);
  // The blue band is the last thing in the body: nothing is said under it.
  assert.equal(read("src/features/booking/booking-confirm-body.tsx").includes("does not start"), false);
  assert.equal(one(drawn, "CircleCheck").props.color, themes.light.jade); assert.equal(nodes(drawn, "Info").length, 1);
  // The three terms share one bordered row, with a rule between each.
  const box = one(drawn, "View", (node) => node.props.style?.borderWidth === 1 && node.props.style?.flexDirection === "row");
  assert.equal(box.props.children.filter(Boolean).length, 5);
  // The blue band is a little smaller than a notice board: tight padding, a small mark, small words.
  const band = one(drawn, "View", (node) => node.props.style?.backgroundColor === themes.light.primarySoft).props.style;
  assert.equal(band.paddingVertical, spacing.sm); assert.equal(band.padding, undefined);
  assert.equal(one(drawn, "Info").props.size, 18);
  const said = one(drawn, "Text", (text) => String(text.props.children).startsWith("Accepting this offer")).props.style;
  assert.equal(said.fontSize, 13); assert.equal(said.lineHeight, 18);
  // With no fixed term it says so.
  const open = nodes(real.BookingConfirmBody({ place: "x", rentPaise: 1, moveInDate: "2026-10-21", agreementMonths: null, notice: "n" }), "Text").map((text) => [].concat(text.props.children).join(""));
  assert.ok(open.includes("Agreement") && open.includes("Indefinite"));
});

test("a sheet with no title has no title row: its close floats at the corner and the body starts under the grabber", () => {
  const source = read("src/components/sheet-shell.tsx");
  // No title, no back arrow and nothing under the title: only then.
  assert.ok(source.includes('const untitled = title === "" && !onBack && !belowTitle;'));
  // The title row is not drawn for it, so nothing holds a gap open above the body.
  assert.ok(source.includes("{untitled ? null : <View style={{ alignItems: \"center\", flexDirection: \"row\""));
  // The same close button, placed on the sheet itself so it stays touchable on Android.
  // Unless the sheet asks for no cross at all (user, 2026-10-19, the enquiry sheet).
  assert.ok(source.includes('{untitled && closeInside ? <View style={{ position: "absolute", right: spacing.lg, top: spacing.sm + spacing.xs }}>{closeButton}</View> : null}'));
  assert.equal(source.split("{closeButton}").length - 1, 1); assert.ok(source.includes("{closeInside ? closeButton : null}")); assert.equal(source.split('accessibilityLabel="Close"').length - 1, 1);
  // Both sides' accept is the one sheet that asks for it.
  assert.ok(read("app/my-booking-detail.tsx").includes('title={action === "ACCEPT" ? ""'));
  assert.ok(read("app/owner-booking-detail.tsx").includes('title={action === "ACCEPT" || action === "CONFIRM" ? ""'));
});

test("every booking screen parses: a file the bundler would refuse fails here, not on the phone", () => {
  // The harness transpiles leniently and ran green over a missing brace that stopped the app building (2026-10-11).
  const files = ["app/owner-booking-detail.tsx", "app/my-booking-detail.tsx", "app/owner-bookings.tsx", "app/owner-booking-history.tsx", "app/owner-booking-tokens.tsx", "app/owner-booking-confirmed.tsx", "app/my-bookings.tsx", "app/booking-request.tsx",
    "src/components/sheet-shell.tsx", ...fs.readdirSync(path.join(__dirname, "..", "src/features/booking")).filter((name) => /\.tsx?$/.test(name)).map((name) => `src/features/booking/${name}`)];
  for (const file of files) {
    const { diagnostics } = ts.transpileModule(read(file), { fileName: file, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    assert.deepEqual(diagnostics.map((found) => ts.flattenDiagnosticMessageText(found.messageText, " ")), [], file);
  }
});

test("a token that is due: no Due chip, the due line in yellow, and a rupee in a circle on the status chip", () => {
  const h = harness();
  const due = record({ status: "AWAITING_TOKEN", tokenRequired: true, tokenDueAt: "2026-10-12T22:20:00Z", agreedAt: "2026-10-10T22:20:00Z", agreedRentPaise: 1000000, allowedActions: ["CANCEL"], token: { status: "DUE", amountPaise: 50000, claims: [], claimWaiting: false } });
  const tree = h.render(h.detail.Details, { booking: due, owner: true });
  // The chip that only said "Due" is gone. The line under it says it, in the notice board's yellow, with the day and time.
  assert.equal(nodes(tree, "StatusPill").length, 0);
  const band = one(tree, "BookingInfoBand", (node) => node.props.tone === "warning");
  assert.equal(band.props.icon, "Clock3");
  // The clock (21 wide) sits under the card's rupee mark, on one centre line, with the small gap before "Due" (user, 2026-10-11).
  const head = one(tree, "View", (node) => node.props.style?.flexDirection === "row" && nodes(node.props.children, "BookingTokenAmountIcon").length === 1);
  assert.equal(band.props.iconInset + 21 / 2, head.props.style.paddingLeft + one(head, "BookingTokenAmountIcon").props.size / 2);
  assert.equal(band.props.iconGap, 6);
  // The tenant's screen carries the same two numbers.
  for (const piece of ["paddingLeft: 3 }}>", "iconGap={6} iconInset={6} tone=\"warning\""]) for (const file of ["app/owner-booking-detail.tsx", "app/my-booking-detail.tsx"]) assert.ok(read(file).includes(piece), `${file}: ${piece}`);
  const said = Object.assign({}, ...[].concat(one(band, "Text").props.style));
  assert.equal(said.color, themes.light.warningText);
  assert.equal([].concat(one(band, "Text").props.children).join(""), `Due ${ui.bookingDateLabel("2026-10-12T22:20:00Z", true)}`);
  // Every other state of a token keeps its chip.
  const received = record({ status: "CONFIRMED", tokenRequired: true, tokenDueAt: null, token: { status: "RECEIVED", amountPaise: 50000, claims: [], claimWaiting: false, receivedAt: "2026-10-11T10:00:00Z" } });
  const other = harness();
  assert.equal(nodes(other.render(other.detail.Details, { booking: received, owner: true }), "StatusPill").length, 0);
  // The band is grey unless asked, and yellow when asked.
  const parts = load(read("src/features/booking/tenant-booking-parts.tsx"), new Proxy({}, { has: () => true, get: (_, name) => name === "@/theme/use-theme" ? { useTheme: () => ({ colors: themes.light, fonts: {}, type: {} }) } : name === "@/theme/spacing" ? { spacing, radii: { card: 10 } } : new Proxy({}, { get: (_, key) => key }) }));
  assert.equal(parts.BookingInfoBand({ children: null }).props.style.backgroundColor, themes.light.neutralSoft);
  const yellow = parts.BookingInfoBand({ children: null, icon: "Clock3", tone: "warning" });
  assert.equal(yellow.props.style.backgroundColor, themes.light.warningSoft); assert.equal(one(yellow, "Clock3").props.color, themes.light.warningText);

  // The status chip: a token is a rupee in a circle, and no chip shows a wallet.
  const status = load(read("src/features/booking/owner-booking-status.tsx"), h.dependencies);
  const chip = status.OwnerBookingStatus({ status: "AWAITING_TOKEN" });
  assert.equal(nodes(chip, "BookingTokenStatusIcon").length, 1); assert.equal(nodes(chip, "Wallet").length, 0);
  assert.equal(one(chip, "Text").props.children, "Token due");
  assert.equal(read("src/features/booking/owner-booking-status.tsx").includes("Wallet"), false);
  const icon = read("src/components/booking-vector-icons.tsx"); const drawn = icon.slice(icon.indexOf("export function BookingTokenStatusIcon"));
  assert.ok(drawn.includes('viewBox="0 0 24 24"')); assert.ok(drawn.includes("<Circle cx={12} cy={12} r={10} />")); assert.ok(drawn.includes("stroke={color}"));
});

test("the handler answers a token the tenant recorded as paid: Token received moves the booking on, Not received needs a reason", async () => {
  const claim = { sequence: 1, method: "UPI", reference: "123456789012", proofImageUrls: ["https://img/1", "https://img/2"], claimedAt: "2026-10-11T08:00:00Z", answer: null, answerReason: null, answeredAt: null };
  const claimed = (overrides = {}) => record({ status: "AWAITING_TOKEN", tokenRequired: true, tokenPaise: 50000, agreedAt: "2026-10-10T22:20:00Z", allowedActions: ["CANCEL"], allowedTokenActions: ["MARK_RECEIVED", "MARK_NOT_RECEIVED"], token: { status: "CLAIMED", amountPaise: 50000, claimWaiting: true, claims: [claim] }, ...overrides });
  const page = { propertyId: "property-1", requestId: "request-1", owner: true };

  // The footer leads with the answer, and keeps Cancel booking under it.
  const h = harness({ detailQuery: { currentData: claimed() } });
  h.render(h.detail.Detail, page); h.flushEffects(); await settle();
  let tree = h.render(h.detail.Detail, page);
  assert.deepEqual(nodes(one(tree, "PinnedFooter"), "ActionButton").map((item) => item.props.label), ["Not received", "Token received", "Cancel booking"]);
  assert.equal(nodes(tree, "BookingTokenVerifySheet").length, 0);
  button(tree, "Token received").props.onPress(); tree = h.render(h.detail.Detail, page);
  assert.equal(one(tree, "BookingTokenVerifySheet").props.answer, "RECEIVED");

  // Someone who may not answer it, a manager who is not the handler, is offered neither button.
  const onlooker = harness({ detailQuery: { currentData: claimed({ allowedActions: [], allowedTokenActions: [] }) } });
  onlooker.render(onlooker.detail.Detail, page); onlooker.flushEffects(); await settle();
  assert.equal(nodes(onlooker.render(onlooker.detail.Detail, page), "PinnedFooter").length, 0);
  // Nothing was recorded yet: nothing to answer, even where the property could record a token itself.
  assert.equal(h.verify.canVerifyToken(claimed({ token: { status: "DUE", amountPaise: 50000, claimWaiting: false, claims: [] } })), false);
  assert.equal(h.verify.canVerifyToken(claimed()), true);

  // Received: what was recorded is in front of the reader, with where to look for it, and it is asked for once more.
  const got = harness(); const gotProps = { answer: "RECEIVED", booking: claimed(), onClose() {}, onDone() {} };
  tree = got.render(got.verify.BookingTokenVerifySheet, gotProps);
  assert.equal(one(tree, "SheetShell").props.title, "Token received?");
  const said = nodes(tree, "Text").map((text) => [].concat(text.props.children).map((part) => typeof part === "object" && part ? [].concat(part.props.children).join("") : part).join("")).join(" ");
  assert.ok(said.includes("Sample visitor recorded Rs 500 paid by UPI")); assert.ok(said.includes("Reference 123456789012."));
  const warning = one(tree, "NoticeBar", (node) => node.props.tone === "warning"); assert.equal(warning.props.title, "Record token receipt"); assert.ok(warning.props.message.includes("on your banking or UPI app"));
  assert.equal(nodes(tree, "FormInput").length, 0);
  button(tree, "Confirm received").props.onPress(); await settle();
  // The claim names how it was paid, so no method is sent. The loaded version is.
  assert.deepEqual(got.writes[0], { kind: "tokenReceived", propertyId: "property-1", requestId: "request-1", version: 12 });

  // Not received: a reason, because the tenant is shown it. Without one nothing is sent.
  const not = harness(); const notProps = { answer: "NOT_RECEIVED", booking: claimed(), onClose() {}, onDone() {} };
  tree = not.render(not.verify.BookingTokenVerifySheet, notProps);
  assert.equal(one(tree, "SheetShell").props.title, "Not received?");
  button(tree, "Mark not received").props.onPress(); await settle(); tree = not.render(not.verify.BookingTokenVerifySheet, notProps);
  assert.equal(not.writes.length, 0); assert.equal(one(tree, "FormInput").props.error, "Tell the tenant why it is not counted as received.");
  one(tree, "FormInput").props.onChangeText("  No credit of Rs 500 today.  "); tree = not.render(not.verify.BookingTokenVerifySheet, notProps);
  assert.equal(one(tree, "FormInput").props.error, undefined);
  button(tree, "Mark not received").props.onPress(); await settle();
  assert.deepEqual(not.writes[0], { kind: "tokenNotReceived", propertyId: "property-1", requestId: "request-1", version: 12, reason: "No credit of Rs 500 today." });

  // A booking that moved since the sheet opened is not answered from it.
  const stale = harness(); stale.render(stale.verify.BookingTokenVerifySheet, gotProps);
  tree = stale.render(stale.verify.BookingTokenVerifySheet, { ...gotProps, booking: claimed({ version: 13 }) });
  assert.equal(button(tree, "Confirm received").props.disabled, true); button(tree, "Confirm received").props.onPress(); await settle(); assert.equal(stale.writes.length, 0);

  // A token handed over at the desk says so, on the claim and in the question, and is checked at the desk.
  const deskClaim = { ...claim, method: "CASH", paidAtDesk: true, reference: null, proofImageUrls: [] };
  const atDesk = harness(); const deskProps = { answer: "RECEIVED", booking: claimed({ token: { status: "CLAIMED", amountPaise: 50000, claimWaiting: true, claims: [deskClaim] } }), onClose() {}, onDone() {} };
  tree = atDesk.render(atDesk.verify.BookingTokenVerifySheet, deskProps);
  const deskSaid = nodes(tree, "Text").map((text) => [].concat(text.props.children).map((part) => typeof part === "object" && part ? [].concat(part.props.children).join("") : part).join("")).join(" ");
  assert.ok(deskSaid.includes("recorded Rs 500 paid at the desk by Cash"));
  assert.ok(one(tree, "NoticeBar", (node) => node.props.tone === "warning").props.message.includes("at your desk"));
  button(tree, "Confirm received").props.onPress(); await settle();
  assert.deepEqual(atDesk.writes[0], { kind: "tokenReceived", propertyId: "property-1", requestId: "request-1", version: 12 });
  const deskCard = harness(); tree = deskCard.render(deskCard.detail.Claims, { token: { claims: [deskClaim] } });
  assert.ok(nodes(tree, "Text").some((text) => [].concat(text.props.children).join("") === "Cash at the desk"));
  assert.ok(nodes(deskCard.render(deskCard.detail.Claims, { token: claimed().token }), "Text").some((text) => [].concat(text.props.children).join("") === "UPI"));

  // The proof the tenant sent sits on the claim, each photo opening full screen.
  const claims = harness(); tree = claims.render(claims.detail.Claims, { token: claimed().token });
  assert.deepEqual([...one(tree, "TokenProofImages").props.urls], ["https://img/1", "https://img/2"]);
  const photos = harness(); tree = photos.render(photos.verify.TokenProofImages, { urls: ["https://img/1", "https://img/2"] });
  assert.equal(nodes(tree, "Image").length, 2); assert.equal(nodes(tree, "Lightbox").length, 0);
  nodes(tree, "AnimatedPressable")[1].props.onPress(); tree = photos.render(photos.verify.TokenProofImages, { urls: ["https://img/1", "https://img/2"] });
  assert.equal(one(tree, "Lightbox").props.initialIndex, 1);
});

test("a pending claim replaces the owner token's paid chip and running deadline with the paused-window notice", () => {
  const h = harness();
  const booking = record({ status: "AWAITING_TOKEN", tokenRequired: true, tokenDueAt: "2026-10-12T22:20:00Z", token: { status: "CLAIMED", amountPaise: 50000, claimWaiting: true, claims: [] } });
  const tree = h.render(h.detail.Details, { booking, owner: true });
  assert.equal(nodes(tree, "StatusPill").length, 0);
  assert.equal(nodes(tree, "BookingInfoBand").some((node) => node.props.tone === "warning"), false);
  const notice = one(tree, "NoticeBar", (node) => node.props.title === "Payment window paused").props;
  assert.equal(notice.tone, "info");
  assert.equal(notice.message, "The token payment window has been paused until the token payment claim is verified.");
  assert.equal(read("app/owner-booking-detail.tsx").includes("A claim is not yet a receipt"), false);
});

test("payment claims use the owner's claims artwork and separate method, submission date, reference, proof and answer", () => {
  for (const method of ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE"]) {
    const h = harness();
    const claim = { sequence: 1, method, paidAtDesk: method !== "BANK_TRANSFER", reference: "reference-1", proofImageUrls: ["proof-1"], claimedAt: "2026-10-11T08:00:00Z", answer: null, answerReason: null, answeredAt: null };
    const tree = h.render(h.detail.Claims, { token: { claims: [claim] } });
    assert.equal(one(tree, "PaymentClaimsIcon").props.size, 27);
    assert.equal(one(tree, "PaymentMethodIcon").props.method, method);
    const words = nodes(tree, "Text").map((node) => [].concat(node.props.children).join(""));
    assert.ok(words.includes("Pending")); assert.ok(words.includes("Payment proof"));
    assert.ok(words.some((text) => text.startsWith("Submitted ")));
    assert.equal(one(tree, "Text", (node) => node.props.children === "reference-1").props.selectable, true);
    assert.deepEqual([...one(tree, "TokenProofImages").props.urls], ["proof-1"]);
    one(tree, "View", (node) => node.props.style?.backgroundColor === themes.light.neutralSoft && node.props.style?.padding === spacing.sm);
    assert.equal(nodes(tree, "ActionButton").length, 0, "The claim display does not introduce extra verification actions");
  }
});

test("each payment claim keeps its own verification response and proof, with no invented evidence on cash claims", () => {
  const h = harness();
  const claims = [
    { sequence: 1, method: "UPI", reference: "first-ref", proofImageUrls: ["first-photo"], claimedAt: "2026-10-11T08:00:00Z", answer: "NOT_RECEIVED", answerReason: "Wrong account.", answeredAt: "2026-10-11T09:00:00Z" },
    { sequence: 2, method: "CASH", paidAtDesk: true, reference: null, proofImageUrls: [], claimedAt: "2026-10-11T10:00:00Z", answer: "RECEIVED", answerReason: null, answeredAt: "2026-10-11T11:00:00Z" },
  ];
  const tree = h.render(h.detail.Claims, { token: { claims } });
  const words = nodes(tree, "Text").map((node) => [].concat(node.props.children).join(""));
  assert.ok(words.includes("Token received")); assert.ok(words.includes("Not received"));
  assert.ok(words.some((text) => text.startsWith("Verified "))); assert.ok(words.some((text) => text.startsWith("Checked ")));
  assert.equal(one(tree, "Text", (node) => node.props.children === "Token received").props.style.color, themes.light.successText);
  assert.equal(one(tree, "Text", (node) => node.props.children === "Not received").props.style.color, themes.light.danger);
  assert.equal(one(tree, "NoticeBar").props.message, "Wrong account.");
  assert.equal(nodes(tree, "TokenProofImages").length, 1); assert.equal(nodes(tree, "Text").filter((node) => node.props.children === "first-ref").length, 1);
  assert.equal(h.render(h.detail.Claims, { token: { claims: [] } }), null);
});

test("token received has its own green final-confirmation button and reuses the accept modal without accepting again", async () => {
  const received = record({ status: "TOKEN_RECEIVED", agreedAt: "2026-10-11T08:00:00Z", agreedRentPaise: 880000,
    tokenRequired: true, tokenDueAt: "2026-10-11T09:00:00Z", allowedActions: ["CONFIRM", "CANCEL"], allowedTokenActions: [],
    token: { status: "RECEIVED", amountPaise: 50000, receiptCode: "TKN-2026-000264", claims: [], claimWaiting: false } });
  const h = harness({ detailQuery: { currentData: received } }); const props = { propertyId: "property-1", requestId: "request-1", owner: true };
  h.render(h.detail.Detail, props); h.flushEffects(); await settle(); let tree = h.render(h.detail.Detail, props);
  assert.equal(button(tree, "Confirm booking").props.variant, "success");
  const actionRow = one(tree, "View", (node) => Array.isArray(node.props.children) && node.props.children.some((child) => child?.type === "ActionButton" && child.props.label === "Confirm booking"));
  assert.equal(actionRow.props.style.flexDirection, "row");
  assert.deepEqual(local(actionRow.props.children.filter(Boolean).map((child) => child.props.label)), ["Cancel booking", "Confirm booking"]);
  assert.equal(button(actionRow, "Cancel booking").props.variant, "dangerFilled");
  button(tree, "Confirm booking").props.onPress(); tree = h.render(h.detail.Detail, props);
  assert.equal(one(tree, "BookingDecisionSheet").props.action, "CONFIRM");
  const modal = harness();
  tree = modal.render(modal.detail.Decision, decisionProps("CONFIRM", received));
  assert.equal(tree.props.title, ""); assert.equal(one(tree, "BookingConfirmBody").props.rentPaise, 880000);
  assert.match(one(tree, "BookingConfirmBody").props.notice, /^The token amount of Rs 500 has been received\./);
  assert.equal(button(tree, "Confirm booking").props.variant, "success");
  button(tree, "Confirm booking").props.onPress(); await settle();
  assert.deepEqual(modal.writes.at(-1), { kind: "confirm", propertyId: "property-1", requestId: "request-1", version: 12 });
  assert.equal(modal.writes.some((write) => write.kind === "accept" || write.kind === "tokenReceived"), false);
  const display = harness(); const details = display.render(display.detail.Details, { booking: received, owner: true });
  assert.equal(one(details, "OwnerBookingStatus").props.status, "TOKEN_RECEIVED");
  assert.equal(nodes(details, "StatusPill").length, 0);
  assert.equal(nodes(details, "BookingInfoBand").some((node) => node.props.tone === "warning"), false);
  const receipt = one(details, "Text", (node) => [].concat(node.props.children).join("") === "Receipt TKN-2026-000264");
  assert.equal(receipt.props.selectable, true); assert.equal(receipt.props.style[0].fontSize, 12);
});

test("final confirmation refuses stale versions or revoked capabilities; new and unknown status icons never become undefined", async () => {
  const h = harness(); const received = record({ status: "TOKEN_RECEIVED", allowedActions: ["CONFIRM", "CANCEL"] });
  h.render(h.detail.Decision, decisionProps("CONFIRM", received));
  for (const booking of [{ ...received, version: 13 }, { ...received, allowedActions: ["CANCEL"] }]) {
    const tree = h.render(h.detail.Decision, decisionProps("CONFIRM", booking));
    assert.equal(button(tree, "Confirm booking").props.disabled, true); button(tree, "Confirm booking").props.onPress(); await settle();
  }
  assert.equal(h.writes.length, 0);
  const marks = load(read("src/features/booking/owner-booking-status.tsx"), h.dependencies);
  const current = marks.OwnerBookingStatus({ status: "TOKEN_RECEIVED" }); one(current, "CircleCheck");
  assert.equal(one(current, "Text").props.children, "Token received");
  one(marks.OwnerBookingStatus({ status: "FUTURE_BACKEND_STATUS" }), "Clock3");
  const api = read("src/store/services/booking-api.ts");
  assert.match(api, /confirmBookingForProperty:[\s\S]*?headers: ifMatch\(version\)[\s\S]*?\/confirm/);
  assert.match(api, /useConfirmBookingForPropertyMutation/);
});

// "For confirmed bookings past due show a pale red box under the Agreed rent box" (user, 2026-10-27).
test("a confirmed booking past its move-in day says so in a pale red band under the rent", () => {
  const list = read("src/features/booking/booking-request-list.tsx");
  assert.match(list, /const pastDue = item\.status === "CONFIRMED" && item\.moveInDate < istToday\(\);/);
  const rent = list.indexOf("<BookingInfoBand icon={IndianRupee}>");
  const due = list.indexOf('<BookingInfoBand icon={CalendarX} tone="danger">');
  assert.ok(rent > 0 && due > rent, "under the rent band");
  assert.match(list, />Booking past due<\/Text>/);
  assert.match(read("src/features/booking/tenant-booking-parts.tsx"), /tone === "danger" \? \[colors\.dangerSoft, colors\.danger\]/);
});
