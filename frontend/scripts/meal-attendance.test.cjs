const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("the switch keeps how it works behind a ? and lives on the Meals overview", () => {
  const ui = read("src/features/food/meal-attendance-ui.tsx");
  const food = read("app/owner-food.tsx");
  assert.match(ui, /Record meal attendance/);
  assert.match(ui, /recorded before serving/);
  assert.match(ui, /only shown to tenants subscribed to a meal/);
  assert.match(ui, /scanned at the counter/);
  // How it works keeps its numbers: arrows are for normal modals.
  assert.match(ui, /<HowItWorksSheet [^\n]*title="How it works"/);
  assert.match(ui, /<CircleHelp /);
  assert.doesNotMatch(ui, /ArrowBullet/);
  // See meal attendance is a gradient card with a gradient edge.
  assert.match(ui, /colors=\{\[colors\.primary, "#BFD4FF"\]\}[\s\S]*?colors=\{\["#EAF2FF", "#FFFFFF"\]\}[\s\S]*?See meal attendance/);
  assert.doesNotMatch(ui, /Before you turn this on/);
  assert.match(food, /<MealAttendanceCard\b/);
});

test("the switch moves once: the cached value changes before the server answers, and a refusal undoes it", () => {
  const endpoint = read("src/store/services/food-api.ts").match(/setMealAttendanceEnabled:[\s\S]*?\n    \}\),/)[0];
  assert.match(endpoint, /onQueryStarted/);
  assert.match(endpoint, /updateQueryData\("getFoodOverview", propertyId/);
  assert.match(endpoint, /patch\.undo\(\)/);
});

test("the overview's meal card moves on by itself when a meal ends", () => {
  assert.match(read("app/owner-food.tsx"), /useGetMealScheduleQuery\(propertyId, \{\s*pollingInterval: 30_000/);
});

test("an empty state sits in the middle of the screen itself", () => {
  const empty = read("src/components/empty-state.tsx");
  assert.match(empty, /measureInWindow/);
  assert.match(empty, /screen - 2 \* y/);
  // Above a pinned footer, it centres in the room left over instead.
  assert.match(empty, /screen - footerHeight - y/);
  assert.match(read("app/owner-food.tsx"), /footerHeight=\{notOfferedFooter\}/);
  assert.match(empty, /Math\.max\(floor, centredHeight\)/);
  assert.match(read("app/owner-meal-attendance-history.tsx"), /artworkNode=\{<PersonArt size=\{96\} \/>\}/);
});

test("the visit form is saved with the version its screen loaded", () => {
  const api = read("src/store/services/enquiry-chat-api.ts");
  const endpoint = api.slice(api.indexOf("completeVisitForm: builder.mutation"), api.indexOf("markRunningLate: builder.mutation"));
  assert.match(endpoint, /version: number/);
  assert.match(endpoint, /headers: ifMatch\(version\)/);
  assert.match(read("src/features/visits/complete-visit-sheet.tsx"), /version: visit\.version/);
});

test("the tenancy card shows the tenant's photo, or their initials", () => {
  const list = read("src/features/owner/tenancy-list.tsx");
  assert.match(list, /<TenantAvatar name=\{tenancy\.tenantName\} photoUrl=\{tenancy\.tenantPhotoUrl\} \/>/);
  assert.match(list, /if \(!photoUrl \|\| failed\) \{\s+return <InitialsAvatar name=\{name\} \/>/);
  // The code sits under the name, and End tenancy joins View profile on its right only once it can happen.
  assert.match(list, /\{cardName\(name\)\}\s+<\/FitText>\s+<FitText[^>]*>\s+\{code\}/);
  assert.match(list, /label="View profile"[\s\S]{0,60}\{canEndTenancy && canEnd \? \(\s+<ActionButton[\s\S]{0,120}"End tenancy"/);
  assert.doesNotMatch(list, /Can be ended on/);
});

test("the tenant profile shows the tenant's photo, or their initials", () => {
  const screen = read("app/owner-active-tenancy-detail.tsx");
  assert.match(screen, /<InitialsAvatar name=\{tenantName\} photoUrl=\{tenancy\?\.tenantPhotoUrl \?\? null\} \/>/);
  assert.match(screen, /photoUrl && !failed \? \(\s+<Image/);
});

test("a stay's duration reads in decimal months, never days or years", () => {
  const ts = require("typescript");
  const source = read("app/owner-active-tenancy-detail.tsx");
  const start = source.indexOf("function formatDuration(");
  const body = source.slice(start, source.indexOf("function formatDate(", start));
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const formatDuration = new Function(`${js}; return formatDuration;`)();
  assert.equal(formatDuration("2026-06-07", "2026-11-01"), "4.8 months");
  assert.equal(formatDuration("2026-06-05", "2026-07-05"), "1 month");
  assert.equal(formatDuration("2026-06-05", "2026-06-20"), "0.5 months");
  assert.equal(formatDuration("2025-01-10", "2026-03-10"), "14 months");
  assert.equal(formatDuration("2026-06-05", "2026-06-05"), "0 months");
  assert.equal(formatDuration(null, "2026-06-05"), "-");
});

test("the forecast's chef stands beside the header and his advice opens in a card under him", () => {
  const forecast = read("app/owner-food-forecast.tsx");
  assert.equal((forecast.match(/trailing=\{chef\}/g) ?? []).length, 2);
  assert.doesNotMatch(forecast, /FloatingForecastChef|setViewport/);
  const chef = read("src/features/food/floating-forecast-chef.tsx");
  assert.match(chef, /how-it-works-lightbulb\.png/);
  // A phone flattens the header's parents, so the card must outrank its zIndex to cover the chef.
  assert.match(chef, /StyleSheet\.absoluteFill, \{ zIndex: 10 \}/);
  assert.match(chef, /cardWidth - radii\.card - POINTER_WIDTH/);
  // On release, so the tap that closes it does not reach the chef and open it again.
  assert.match(chef, /<Pressable accessibilityLabel="Close" onPress=\{onClose\}/);
  assert.doesNotMatch(chef, /InfoModal|PanResponder/);
});

test("the forecast is one card of dishes with lines between, under notification-style day bubbles", () => {
  const forecast = read("app/owner-food-forecast.tsx");
  assert.match(forecast, /variant="bubbles"/);
  assert.match(forecast, /first=\{index === 0\}/);
  assert.match(forecast, /borderTopWidth: first \? 0 : 1/);
  assert.match(forecast, /softShadow\(colors\.shadow, 4, 12\)/);
  assert.doesNotMatch(forecast, /type\.metric/);
  const ui = read("src/features/food/food-ui.tsx");
  assert.match(ui, /<FilterBubble[\s\S]{0,160}count=\{showDates \? shortDate\(date\) : undefined\}/);
  // The weekly menu gets the same bubbles, with no dates because it repeats, and shadowed meal cards.
  const menu = read("app/owner-food-menu.tsx");
  assert.match(menu, /<DayStrip onSelect=\{setDay\} selected=\{day\} variant="bubbles" week=\{week\} \/>/);
  assert.match(menu, /softShadow\(colors\.shadow, 4, 12\)/);
  // A meal's dishes share one pale blue card with lines between, and the entry sheet fits what is open.
  assert.match(menu, /backgroundColor: colors\.primarySoft, borderCurve: "continuous", borderRadius: radii\.card/);
  assert.match(menu, /borderTopWidth: index === 0 \? 0 : 1/);
  assert.match(menu, /contentMaxSize="tall"\s+footer=\{/);
  // The dish picker: 65% high, Select all above, a line and a checkbox per dish, and no card.
  assert.match(menu, /size="picker"/);
  assert.match(menu, /accessibilityLabel="Select all"/);
  assert.match(menu, /<SquareCheckbox checked=\{picked\} \/>/);
  assert.doesNotMatch(menu, /tap to pick as many/);
  // A short list of subscribers gets a short sheet.
  assert.match(read("src/features/food/owner-food-subscribers.tsx"), /<SheetShell size="content"/);
});

test("Meals: cards have shadows, the items search docks, and How profiles work sits behind a ?", () => {
  for (const file of ["owner-food-overview", "meal-attendance-ui", "owner-food-items", "owner-food-profiles"]) {
    assert.match(read(`src/features/food/${file}.tsx`), /softShadow\(colors\.shadow, 4, 12\)/, file);
  }
  const screen = read("app/owner-food.tsx");
  assert.match(screen, /stickyHeaderIndices=\{itemSearchDocked \? \[2\] : undefined\}/);
  assert.match(screen, /<FoodItemsSearch\b/);
  // The last card can always scroll clear of the footer.
  assert.match(screen, /bottomPaddingCovered=\{listUnderFooter\}/);
  assert.match(screen, /setFooterRoom\(height \+ spacing\.md\)/);
  assert.match(screen, /managed && tab === "profiles"\s+\? <IconButton accessibilityLabel="How profiles work"/);
  assert.match(screen, /<HowItWorksSheet\b/);
  assert.doesNotMatch(read("src/features/food/owner-food-profiles.tsx"), /How profiles work/);
});

test("every owner and manager is offered the scanner on Home while a meal is on", () => {
  const home = read("app/(tabs)/index.tsx");
  const ui = read("src/features/food/meal-attendance-ui.tsx");
  assert.equal((home.match(/<MealScanHomeCard\b/g) ?? []).length, 2);
  assert.match(ui, /useGetMealAttendanceLiveQuery/);
  assert.match(ui, /\/owner-meal-scan/);
  // Home is open to a manager without the Meals permission, so it must not read the FOOD schedule.
  assert.doesNotMatch(ui, /useGetMealScheduleQuery/);
});

test("the scanner is not gated by the Meals permission, the reports are", () => {
  const gates = read("src/features/owner/route-gates.tsx");
  assert.doesNotMatch(gates, /"\/owner-meal-scan"/);
  assert.match(gates, /"\/owner-meal-attendance": \{[^}]*resource: "FOOD"/);
});

test("the scanner stays open: a read pauses it only until the server answers", () => {
  const scan = read("app/owner-meal-scan.tsx");
  assert.match(scan, /CameraView/);
  assert.match(scan, /onBarcodeScanned/);
  assert.match(scan, /useScanMealPassMutation/);
  assert.match(scan, /alreadyRecorded/);
  assert.match(scan, /6 digit code from meal pass/);
  assert.doesNotMatch(scan, /router\.back\(\)/);
});

test("the scanner shows no running count and verifies a complete manual code automatically", () => {
  const scan = read("app/owner-meal-scan.tsx");
  assert.doesNotMatch(scan, / of \$\{expected\}/);
  assert.doesNotMatch(scan, /PinnedFooter|label="Record attendance"/);
  assert.match(scan, /onChangeText=\{changeCode\}/);
  assert.match(scan, /next\.length < CODE_LENGTH/);
  assert.match(scan, /void submit\(\{ code: next \}\)/);
  // Nor does the Home card that leads to it.
  assert.doesNotMatch(read("src/features/food/meal-attendance-ui.tsx"), /meal\.attended\} of \$\{meal\.expected\} scanned/);
});

test("the pass follows the visitor pass: QR on white, the code under it, and it is kept for a lost signal", () => {
  const pass = read("src/features/food/meal-pass.tsx");
  assert.match(pass, /QRCode backgroundColor="#FFFFFF"/);
  assert.match(pass, /formatPassCode/);
  assert.match(pass, /BottomSheetModal/);
  assert.match(pass, /AsyncStorage/);
  assert.match(read("app/tenancy-food.tsx"), /<MealPassCard\b/);
  assert.match(read("app/(tabs)/index.tsx"), /<MealPassCard\b/);
});

test("a meal nobody scanned reads as not recorded, never as everyone skipping", () => {
  assert.match(read("src/features/food/meal-attendance-rows.tsx"), /Not recorded/);
});

test("attendance is one screen: today's meals in order with their times, the history link, and analytics", () => {
  const screen = read("app/owner-meal-attendance.tsx");
  assert.doesNotMatch(screen, /SelectionTabs|label: "Today"/);
  assert.ok(screen.indexOf("<TodaySection") < screen.indexOf("<HistoryLink"));
  assert.ok(screen.indexOf("<HistoryLink") < screen.indexOf("<AnalyticsSection"));
  assert.match(screen, /<Section title="Today">/);
  assert.match(screen, /router\.push\("\/owner-meal-attendance-history"\)/);
  assert.match(screen, />Meal attendance history</);
  // Today comes from the day's own read, so it is there before anything was ever recorded.
  assert.match(screen, /useGetMealAttendanceDayQuery\(\{ date, propertyId \}, \{ pollingInterval: 60_000/);
  assert.match(read("src/features/food/meal-attendance-rows.tsx"), /meal\.time \?/);
});

test("analytics are bars per food profile with a dropdown, as a percentage of those expected", () => {
  const screen = read("app/owner-meal-attendance.tsx");
  assert.match(screen, /title="Attendance analytics"/);
  assert.match(screen, /label: "This week"[\s\S]*label: "This month"[\s\S]*label: "This year"/);
  assert.match(screen, /<GroupedColumns/);
  assert.match(screen, /scale=\{PERCENT_SCALE\}/);
  assert.match(screen, /attended \/ Math\.max\(expected, 1\)/);
  assert.doesNotMatch(screen, /perMeal|AveragesCard/);
  // Three fit one row, four are rows of two, and a long name shrinks instead of wrapping.
  assert.match(screen, /lines\.length === 4 \? \{ width: "47%" \} : \{ flex: 1 \}/);
  assert.match(screen, /numberOfLines=\{1\} style=\{\{ color: colors\.inkSoft, flexShrink: 1/);
});

test("a meal row says how it went on the right, in one row, and only 1/3 attended", () => {
  const rows = read("src/features/food/meal-attendance-rows.tsx");
  assert.match(rows, /`\$\{count\} attended`/);
  assert.match(rows, /label: "Not recorded"/);
  // Each status has its mark and is bold: a clock, a steaming bowl, a plain bowl.
  assert.match(rows, /<Clock3 [^\n]*label: "Upcoming"/);
  assert.match(rows, /<StatusBowl color=\{colors\.jade\} steam \/>, label: `Serving \$\{count\}`/);
  assert.match(rows, /<StatusBowl color=\{colors\.ink\} steam=\{false\} \/>/);
  assert.match(rows, /color: status\.color, fontFamily: fonts\.sansBold/);
  assert.doesNotMatch(rows, /skipped`|\$\{meal\.skipped\}/);
  assert.match(rows, /disabled=\{!canOpen\}/);
  // Not recorded is greyed out, and a row that opens says so with a chevron.
  assert.match(rows, /notRecorded = meal\.state === "DONE" && !meal\.recorded/);
  assert.match(rows, /opacity: notRecorded \? 0\.45 : 1/);
  assert.match(rows, /canOpen \? <GhostIcon color=\{colors\.kicker\} icon=\{ChevronRight\}[^\n]*\/> : null\}/);
});

test("a meal's names open in a bottom sheet titled with the meal and a smaller grey date, with no screen of their own", () => {
  const rows = read("src/features/food/meal-attendance-rows.tsx");
  assert.equal(fs.existsSync(path.join(__dirname, "..", "app/owner-meal-attendance-meal.tsx")), false);
  assert.doesNotMatch(read("app/_layout.tsx"), /owner-meal-attendance-meal/);
  assert.doesNotMatch(rows, /Attendance data"/);
  assert.match(rows, /title=\{\s+<>\s+\{`\$\{MEAL_LABEL\[open\.meal\.mealType\]\}, `\}\s+<Text style=\{\{ color: colors\.muted[^\n]*\{dayLine\(open\.date\)\}/);
  assert.match(rows, /useGetMealAttendanceMealQuery/);
  for (const file of ["app/owner-meal-attendance.tsx", "app/owner-meal-attendance-history.tsx"]) {
    assert.match(read(file), /\{open \? <AttendanceDataSheet onClose=\{\(\) => setOpen\(null\)\} open=\{open\} \/> : null\}/);
  }
  // Two cards, and an empty side has no card. Skipped once the meal is over.
  assert.match(rows, /query\.data\.attended\.length > 0 \? <PeopleCard/);
  assert.match(rows, /query\.data\.notAttended\.length > 0 \? \(\s+<PeopleCard/);
  assert.match(rows, /title=\{query\.data\.state === "OPEN" \? "Yet to attend" : "Skipped"\}/);
  assert.match(rows, /<TenantAvatar name=\{person\.tenantName\} photoUrl=\{person\.tenantPhotoUrl\} \/>/);
  assert.match(rows, /<PersonFact icon=\{RoomsSummaryIcon\} label=\{`Room \$\{person\.roomNumber\}`\} \/>/);
  assert.match(rows, /person\.profileName/);
});

test("the history is one compact card a day, its date in a blue pill on the right, with a shadow", () => {
  const screen = read("app/owner-meal-attendance-history.tsx");
  assert.match(screen, /function DayCard/);
  assert.doesNotMatch(screen, /"Yesterday"|return "Today"/);
  assert.match(screen, /\{dayName\(day\.date\)\}/);
  assert.match(screen, /backgroundColor: colors\.primary, borderRadius: 999[\s\S]*?\{dayDate\(day\.date\)\}/);
  assert.match(screen, /softShadow\(colors\.shadow, 4, 12\)/);
  // A day moves here once its last meal is over.
  assert.match(screen, /day\.date !== today \|\| day\.meals\.every\(\(meal\) => meal\.state === "DONE"\)/);
});

test("the history is readied before its link is tapped, so it opens at once", () => {
  const main = read("app/owner-meal-attendance.tsx");
  assert.match(main, /router\.prefetch\("\/owner-meal-attendance-history"\)/);
  assert.match(main, /useGetMealAttendanceHistoryQuery\(\{ page: 0, propertyId \}, \{ skip: !propertyId \}\)/);
});

test("both attendance screens load as themselves, filling the screen", () => {
  const main = read("app/owner-meal-attendance.tsx");
  assert.match(main, /!day\.data \|\| !analytics\.data \? \(\s+<SkeletonBoundary>\s+<Body analytics=\{GHOST_ANALYTICS\}/);
  assert.match(main, /plans: \["ghost-plan-1", "ghost-plan-2"\]/);
  const history = read("app/owner-meal-attendance-history.tsx");
  assert.match(history, /<SkeletonBoundary>[\s\S]*GHOST_DAYS\.map/);
  assert.equal(history.match(/"2026-01-0\d"/g).length, 5);
  // Ghost rows are recorded: one with no scans would draw faded.
  assert.match(history, /recorded: true/);
  assert.doesNotMatch(main + history, /SkeletonCard/);
});

test("the new screens are registered", () => {
  const layout = read("app/_layout.tsx");
  for (const name of ["owner-meal-scan", "owner-meal-attendance", "owner-meal-attendance-history"]) {
    assert.match(layout, new RegExp(`name="${name}"`));
  }
});

test("no semicolons in the copy", () => {
  for (const file of [
    "src/features/food/meal-attendance-ui.tsx",
    "src/features/food/meal-pass.tsx",
    "app/owner-meal-scan.tsx",
    "app/owner-meal-attendance.tsx",
    "app/owner-meal-attendance-history.tsx",
    "src/features/food/meal-attendance-rows.tsx",
  ]) {
    const copy = read(file).match(/>\s*[A-Z][^<>{}]*;[^<>{}]*</g) ?? [];
    assert.deepEqual(copy, [], file);
  }
});

test("a name sits below its status chip, and one flag on each of the two changes reverts them", () => {
  const row = read("src/components/card-name-row.tsx");
  assert.match(row, /export const NAME_UNDER_STATUS = true/);
  assert.match(row, /export const CARD_TEXT_SMALLER = true/);
  assert.match(row, /if \(!NAME_UNDER_STATUS\) \{\s+return <View style=\{rowStyle\}>\{children\}<\/View>/);
  for (const file of ["src/features/booking/booking-token-list.tsx", "src/features/booking/booking-request-list.tsx"]) {
    assert.match(read(file), /<CardStatus>/, file);
  }
  assert.match(read("../docs/card-name-row-change.md"), /How to revert/);
});

test("only one line of text is fitted: asked to fit two, Android hid the second word", () => {
  const fit = read("src/components/fit-text.tsx");
  assert.match(fit, /const oneLine = numberOfLines === 1/);
  assert.match(fit, /adjustsFontSizeToFit=\{oneLine\}/);
});

test("every screen has a way back: the property profile and the screens that had no header", () => {
  const layer = read("src/features/discovery/components/property-profile-layer.tsx");
  assert.match(layer, /accessibilityLabel="Back to the list"[\s\S]*?onPress=\{close\}/);
  assert.match(read("app/owner-notice-detail.tsx"), /<ScreenHeader\s+title=\{editing \? "Edit details" : "Notice details"\}/);
  assert.match(read("app/owner-service-balance.tsx"), /<ScreenHeader italicTail="balance\." title="Service" \/>/);
  assert.match(read("app/property-board.tsx"), /<ScreenHeader italicTail="board\." title="Property" \/>/);
});

