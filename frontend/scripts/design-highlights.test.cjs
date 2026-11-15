const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const jsx = (type, props) => ({ type, props });
const colors = new Proxy({}, { get: (_, key) => key });
const theme = { colors, fonts: { display: "Display", sans: "Sans", sansMedium: "Medium", sansSemiBold: "Semi", sansBold: "Bold" }, type: {} };
const spacing = { xxs: 4, xs: 6, sm: 10, md: 14, lg: 18 };
const labels = { BREAKFAST: "Breakfast", LUNCH: "Lunch", EVENING_SNACKS: "Evening snacks", DINNER: "Dinner" };
function load(file, names, bindings = {}) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const definitions = names.map((name) => {
    const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) ? node.name?.text === name : ts.isVariableStatement(node) && node.declarationList.declarations.some((entry) => entry.name.getText(source) === name));
    assert.ok(declaration, `Missing ${name} in ${file}`);
    return declaration.getText(source);
  });
  const exports = {};
  const code = ts.transpileModule(`${definitions.join("\n")}\n${names.map((name) => `exports.${name} = ${name};`).join("\n")}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, {
    exports, useTheme: () => theme, spacing, radii: { card: 10, pill: 999 }, softShadow: () => ({}), cardShadow: () => ({}),
    View: "View", Text: "Text", FitText: "FitText", Card: "Card", Image: "Image", LinearGradient: "Gradient",
    HighlightPanel: "HighlightPanel", HighlightCard: "HighlightCard", MealGlassPanel: "Glass", MealPassSheet: "MealPassSheet",
    MealGlyph: "MealGlyph", MaterialCommunityIcons: "Icon", AnimatedPressable: "Button", ActionButton: "ActionButton",
    Svg: "Svg", Circle: "Circle", Path: "Path", StyleSheet: { absoluteFill: { position: "absolute" } },
    StatusPill: "Status", CalendarDays: "Calendar", DoorOpen: "Door", DelayedChip: "DelayedChip",
    ModalTitle: "ModalTitle", ModalTitleRule: "Rule", BottomSheetModal: "Modal", SheetCloseButton: "SheetCloseButton", ScrollView: "Scroll",
    QRCode: "QR", SkeletonBoundary: "Skeleton", GhostBlock: "Ghost", MoneyText: "Money", ProgressBar: "Progress",
    useSafeAreaInsets: () => ({ top: 0, bottom: 20 }), useState: (value) => [value, () => {}],
    MEAL_LABEL: labels, formatMealWindow: (a, b) => `${a} - ${b}`, foodIcon: (icon) => icon,
    formatMealTime: (time) => time, formatMealMoment: (time) => time, formatPassCode: (code) => code,
    formatBulkQuantity: (amount, unit) => `${amount} ${unit}`, bookingDateLabel: (date) => date,
    formatMoneyPaise: (amount) => `INR ${amount}`, QR_SIZE: 190, QR_CARD_WIDTH: 220,
    require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx, Fragment: "Fragment" }; },
    ...bindings,
  });
  return exports;
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return tree && typeof tree === "object" ? [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)] : [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" ? text(tree.props?.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
const highlights = load("src/components/highlight-card.tsx", ["highlightPalette", "HighlightPanel", "HighlightCard", "HighlightArtwork"]);
const highlightPalette = highlights.highlightPalette;
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
for (const [variant, palette] of Object.entries(highlightPalette)) {
  test(`${variant}: text remains readable at every gradient stop`, () => {
    for (const background of palette.gradient) for (const foreground of [palette.ink, palette.muted]) {
      const values = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
      assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${variant}: ${foreground} on ${background}`);
    }
  });
  test(`${variant}: artwork is decorative, non-interactive, and clipped`, () => {
    const art = highlights.HighlightArtwork({ variant });
    assert.equal(art.props.pointerEvents, "none");
    assert.equal(art.props.accessibilityElementsHidden, true);
    assert.equal(art.props.importantForAccessibility, "no-hide-descendants");
    const panel = highlights.HighlightPanel({ variant, children: "Content" });
    assert.equal([].concat(panel.props.style).flat(Infinity).filter(Boolean).reduce((all, part) => ({ ...all, ...part }), {}).overflow, "hidden");
    assert.equal(text(panel), "Content");
  });
}

const forecast = { totalSubscribers: 18, consolidatedItems: Array.from({ length: 6 }, (_, index) => ({ itemId: `dish-${index}`, itemName: `Dish ${index}`, targetQuantity: index + 1, quantityUnit: "KG" })) };
const slot = { mealType: "DINNER", startTime: "20:30", endTime: "22:30", status: "UPCOMING", delayMinutes: 0 };
const cooking = load("src/features/food/owner-food-overview.tsx", ["CookingPreview"], { highlightPalette });
test("completed-meals state shares the forecast's warm illustrated card without inventing quantities or actions", () => {
  const completed = load("src/features/food/meal-schedule-ui.tsx", ["MealsDoneForToday"], { highlightPalette });
  const tree = completed.MealsDoneForToday();
  assert.equal(tree.type, "HighlightCard");
  assert.equal(tree.props.variant, "warm");
  assert.match(text(tree), /All meals are done for today/);
  assert.match(text(tree), /Tomorrow's first meal shows after midnight/);
  assert.equal(nodes(tree, "Icon")[0].props.name, "check-circle-outline");
  assert.equal(nodes(tree, "ActionButton").length, 0);
  assert.equal(nodes(tree, "Money").length, 0);
  const title = nodes(tree, "Text")[0];
  assert.equal(title.props.numberOfLines, undefined);
  assert.equal(title.props.style.fontFamily, "Display");
});
test("forecast separates meal/time/headcount from aligned quantities and preserves both actions", () => {
  const calls = [];
  const tree = cooking.CookingPreview({ forecast, slot, onOpenForecast: () => calls.push("forecast"), onDelay: () => calls.push("delay") });
  assert.equal(nodes(tree, "HighlightPanel")[0].props.variant, "warm");
  assert.match(text(tree), /Dinner, up next/);
  assert.match(text(tree), /20:30 - 22:30/);
  assert.match(text(tree), /18People eating6Dishes to prepare/);
  assert.equal(nodes(tree, "FitText").length, 4);
  assert.match(text(tree), /Dish 01 KGDish 12 KG/);
  assert.match(text(tree), /\+2 more in the full forecast/);
  nodes(tree, "ActionButton").forEach((button) => button.props.onPress());
  assert.deepEqual(calls, ["forecast", "delay"]);
});
for (const status of ["SERVING", "DONE"]) test(`forecast handles ${status} and does not expose disallowed Delay`, () => {
  const tree = cooking.CookingPreview({ forecast, slot: { ...slot, status }, onOpenForecast() {} });
  assert.match(text(tree), status === "SERVING" ? /serving now/ : /finished/);
  assert.equal(nodes(tree, "ActionButton").length, 1);
});
test("forecast loading has no stale counts, and empty data never displays undefined", () => {
  const loading = cooking.CookingPreview({ loading: true, forecast, slot, onOpenForecast() {} });
  assert.match(text(loading), /Working out quantities/);
  assert.doesNotMatch(text(loading), /People eating|Dish 0/);
  const empty = cooking.CookingPreview({ forecast: undefined, slot, onOpenForecast() {} });
  assert.match(text(empty), /Nothing to cook/);
  assert.doesNotMatch(text(empty), /undefined/);
});
test("forecast singular labels and delayed indication remain accurate", () => {
  const tree = cooking.CookingPreview({ forecast: { totalSubscribers: 1, consolidatedItems: forecast.consolidatedItems.slice(0, 1) }, slot: { ...slot, delayMinutes: 15 }, onOpenForecast() {} });
  assert.match(text(tree), /1Person eating1Dish to prepare/);
  assert.equal(nodes(tree, "DelayedChip")[0].props.minutes, 15);
});

let pass = null;
const meals = load("src/features/food/meal-pass.tsx", ["MealPassCard", "MealPassSheet"], { highlightPalette, useMyMealPass: () => pass, MealSkyCard: "MealSkyCard", mealSkyMuted: () => "rgba(255, 255, 255, 0.8)" });
test("tenant pass remains hidden without a pass or while upcoming on Home", () => {
  assert.equal(meals.MealPassCard({}), null);
  pass = { ...slot, state: "UPCOMING" };
  assert.equal(meals.MealPassCard({}), null);
  assert.match(text(meals.MealPassCard({ showUpcoming: true })), /Dinner meal pass/);
});
for (const state of ["OPEN", "RECORDED"]) test(`tenant ${state} pass uses the sky without changing its action availability`, () => {
  pass = { ...slot, state, attendedAt: "22:07" };
  const tree = meals.MealPassCard({});
  assert.equal(tree.type, "MealSkyCard");
  assert.equal(tree.props.mealType, slot.mealType);
  assert.equal(nodes(tree, "Button").length, state === "OPEN" ? 1 : 0);
  assert.match(text(tree), state === "OPEN" ? /Dinner, serving now/ : /Dinner recorded/);
});
test("meal QR keeps its white quiet zone and black modules", () => {
  const modal = meals.MealPassSheet({ onClose() {}, pass: { ...slot, token: "meal-token", code: "123456", propertyName: "Example" } });
  const tree = modal.props.children();
  assert.equal(nodes(tree, "HighlightPanel")[0].props.variant, "night");
  const qr = nodes(tree, "QR")[0];
  assert.equal(qr.props.backgroundColor, "#FFFFFF");
  assert.equal(qr.props.color, "#000000");
  assert.equal(qr.props.value, "meal-token");
  assert.match(text(tree), /123456/);
});
test("visitor pass preserves its QR, code, appointment, and reference on the teal surface", () => {
  const data = { propertyName: "Example", token: "visit-token", code: "654321", referenceCode: "VIS-1", date: "2026-11-02", slotStart: "10:00", slotEnd: "11:00" };
  const visitors = load("src/features/visits/visitor-pass-sheet.tsx", ["VisitorPassSheet"], { highlightPalette, useGetVisitPassQuery: () => ({ data }), formatVisitDay: (date) => date, formatSlotRange: (a, b) => `${a}-${b}` });
  const tree = visitors.VisitorPassSheet({ onClose() {}, visitId: "1" }).props.children();
  assert.equal(nodes(tree, "HighlightPanel")[0].props.variant, "visit");
  assert.equal(nodes(tree, "QR")[0].props.backgroundColor, "#FFFFFF");
  assert.equal(nodes(tree, "QR")[0].props.color, "#000000");
  assert.match(text(tree), /10:00-11:00/);
  assert.match(text(tree), /654321/);
  assert.match(text(tree), /VIS-1/);
});

const tickets = load("src/features/booking/confirmed-booking-ticket.tsx", ["reservationPalette", "ConfirmedBookingTicket"], { UserRound: "UserRound" });
test("confirmed booking ticket presents the reference, room, move-in date, and handler", () => {
  const tree = tickets.ConfirmedBookingTicket({ referenceCode: "BOOK-1", roomNumber: "204", moveInDate: "2026-11-03", handlerName: "Sam" });
  assert.equal(tree.type, "Card");
  assert.equal(nodes(tree, "HighlightCard").length, 0);
  assert.deepEqual(Array.from(nodes(tree, "Gradient")[0].props.colors), ["#132F45", "#264D62"]);
  for (const expected of ["BOOK-1", "204", "2026-11-03", "Handled by Sam"]) assert.ok(text(tree).includes(expected));
  assert.equal(nodes(tree, "Status")[0].props.label, "Confirmed");
});
test("move-in date stays prominent at the right edge without a separate filled box", () => {
  const tree = tickets.ConfirmedBookingTicket({ referenceCode: "BOOK-1", roomNumber: "204", moveInDate: "2026-11-03" });
  const datePanel = nodes(tree, "View").find((node) => node.props.style?.marginLeft === "auto");
  assert.ok(datePanel);
  assert.equal(datePanel.props.style.marginLeft, "auto");
  assert.equal(datePanel.props.style.alignItems, "flex-end");
  assert.equal(datePanel.props.style.backgroundColor, "transparent");
  assert.equal(datePanel.props.style.borderWidth, undefined);
  assert.equal(datePanel.props.style.flex, undefined);
  const date = nodes(datePanel, "Text").find((node) => text(node) === "2026-11-03");
  assert.equal(date.props.style.textAlign, "right");
  assert.equal(date.props.style.fontSize, 20);
  assert.equal(date.props.style.fontFamily, "Display");
  assert.equal(date.props.style.color, tickets.reservationPalette.ink);
});
test("reservation summary separates the navy reference header, white facts, and optional handler footer", () => {
  const tree = tickets.ConfirmedBookingTicket({ referenceCode: "BOOK-1", roomNumber: "204", moveInDate: "2026-11-03" });
  const header = nodes(tree, "Gradient")[0];
  assert.match(text(header), /RESERVATIONBOOK-1/);
  assert.doesNotMatch(text(header), /204|2026-11-03/);
  const facts = nodes(tree, "View").find((node) => node.props.style?.backgroundColor === "#FFFFFF");
  assert.match(text(facts), /Room204Move-in2026-11-03/);
  assert.doesNotMatch(text(tree), /Handled by/);
  assert.ok(nodes(tree, "View").some((node) => node.props.style?.backgroundColor === tickets.reservationPalette.gold));
});
test("reservation header and body copy have readable contrast", () => {
  const palette = tickets.reservationPalette;
  for (const [foreground, background] of [
    ...palette.header.flatMap((background) => [[palette.headerInk, background], [palette.headerMuted, background]]),
    [palette.ink, "#FFFFFF"], [palette.muted, "#FFFFFF"], [palette.muted, palette.footer],
  ]) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5);
  }
});
for (const file of ["app/owner-booking-detail.tsx", "app/my-booking-detail.tsx"]) test(`${file}: only CONFIRMED bookings receive a reservation ticket`, () => {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const gates = [];
  function walk(node) {
    if (ts.isConditionalExpression(node) && node.whenTrue.getText(source).startsWith("<ConfirmedBookingTicket")) gates.push(node.condition.getText(source));
    ts.forEachChild(node, walk);
  }
  walk(source);
  assert.deepEqual(gates, ['booking.status === "CONFIRMED"']);
});

const budgets = load("app/owner-expenses.tsx", ["BudgetHero"], { highlightPalette, Plus: "Plus", Wallet: "Wallet" });
for (const spentPaise of [500, 1000, 1500]) test(`budget ${spentPaise}/1000 keeps its remaining/over-budget semantics`, () => {
  const tree = budgets.BudgetHero({ budget: { effectiveBudgetPaise: 1000, spentPaise, remainingPaise: 1000 - spentPaise, raisedThisMonthPaise: 0 }, onRaise() {}, onSetBudget() {} });
  assert.equal(tree.props.variant, "budget");
  assert.equal(nodes(tree, "Progress")[0].props.ratio, Math.min(1, spentPaise / 1000));
  assert.equal(nodes(tree, "Money")[1].props.color, spentPaise > 1000 ? "danger" : "jade");
  assert.match(text(tree), spentPaise > 1000 ? /Over by/ : /Remaining/);
});
test("no-budget state still offers Set budget instead of a misleading progress bar", () => {
  const tree = budgets.BudgetHero({ budget: { effectiveBudgetPaise: null, spentPaise: 0, raisedThisMonthPaise: 0 }, onRaise() {}, onSetBudget() {} });
  assert.equal(nodes(tree, "Progress").length, 0);
  assert.equal(nodes(tree, "ActionButton")[0].props.label, "Set budget");
});

const net = load("app/owner-pnl.tsx", ["NetHero"], {
  highlightPalette, PnlSummaryRow: "SummaryRow", CollectionStatus: "CollectionStatus",
  IncomeArt: "IncomeArt", ExpenseArt: "ExpenseArt", NetArt: "NetArt", PnlHeroArt: "PnlHeroArt",
  incomeComposition: () => "Income composition", signedMoney: (amount) => String(amount),
});
for (const amount of [125000, -125000]) test(`P&L ${amount} keeps profit/loss semantics and plain financial rows`, () => {
  const tree = net.NetHero({ statement: { netPaise: amount, netRealizedPaise: amount, totalIncomePaise: 500000, expensePaise: 375000, billUncollectedPaise: 50000 } });
  const panel = nodes(tree, "HighlightPanel")[0];
  assert.equal(panel.props.variant, "finance");
  // No wavy lines, and a drawing for profit or loss (user, 2026-11-14).
  assert.equal(panel.props.motif, false);
  assert.equal(nodes(panel, "PnlHeroArt")[0].props.profit, amount >= 0);
  assert.match(text(panel), amount >= 0 ? /Net profit/ : /Net loss/);
  assert.equal(nodes(panel, "Money")[0].props.color, amount >= 0 ? "#A9E9CE" : "#FFC4CA");
  assert.equal(nodes(panel, "Money")[0].props.symbolColor, nodes(panel, "Money")[0].props.color);
  assert.equal(nodes(panel, "SummaryRow").length, 0);
  assert.equal(nodes(tree, "SummaryRow").length, 3);
  assert.equal(nodes(tree, "CollectionStatus")[0].props.uncollectedPaise, 50000);
});

class AnimatedValue {
  constructor(value) { this.value = value; }
  interpolate(config) { return config; }
}
const collection = load("app/owner-billing.tsx", ["CollectionSummaryCard"], {
  highlightPalette, useRef: (value) => ({ current: value }), useEffect() {},
  Animated: { Value: AnimatedValue }, AnimatedCircle: "AnimatedCircle", CollectionMoneyIcon: "MoneyIcon", formatMoney: (amount) => String(amount),
});
for (const [billedPaise, collectedPaise, expected] of [[0, 0, 0], [1000, 250, 25], [1000, 1000, 100], [1000, 1200, 100]]) test(`collection ${collectedPaise}/${billedPaise} preserves amounts and clamps its progress`, () => {
  let opened = false;
  const tree = collection.CollectionSummaryCard({ billedPaise, collectedPaise, onPress: () => { opened = true; } });
  assert.equal(nodes(tree, "HighlightPanel")[0].props.variant, "collections");
  assert.equal(nodes(tree, "MoneyIcon").length, 1);
  assert.match(text(tree), new RegExp(`${expected}%`));
  assert.equal(text(nodes(tree, "FitText")[0]), `${collectedPaise} / ${billedPaise}`);
  assert.equal(nodes(tree, "AnimatedCircle")[0].props.stroke, "#FFE4A3");
  tree.props.onPress();
  assert.equal(opened, true);
});

test("collection money mark is a vector banknote with a rupee coin, not a dollar asset", () => {
  const money = load("src/components/billing-vector-icons.tsx", ["CollectionMoneyIcon"]);
  const tree = money.CollectionMoneyIcon({ size: 24 });
  assert.equal(tree.props.accessible, false);
  assert.equal(tree.props.width, 24);
  assert.equal(nodes(tree, "Circle").length, 1);
  assert.equal(nodes(tree, "Path").length, 3);
  assert.ok(nodes(tree, "Path").some((node) => node.props.fillOpacity === 0.12));
});
