const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const screen = read("app/owner-meal-ratings.tsx");
const aiStyle = read("src/components/ai-style.tsx");
const rating = read("src/features/food/meal-rating.tsx");

// Meal ratings (user, 2026-11-01). The rules live on the server and are tested
// there. These pin what the screens promise.

test("rating the last meal is a button on Home's meals card, above Meals and plan (2026-11-10)", () => {
  const home = read("app/(tabs)/index.tsx");
  assert.match(home, /<MealRatingButton skip=\{!moduleEnabled\} \/>[\s\S]{0,200}accessibilityLabel="Meals and plan"/);
  assert.doesNotMatch(home, /MealRatingHomeCard/);
  assert.match(rating, /export function MealRatingButton/);
});

test("a rating is whole stars, one dish is enough, and the review is optional and capped", () => {
  assert.match(rating, /\[1, 2, 3, 4, 5\]\.map/);
  assert.match(rating, /Rate at least one dish\./);
  assert.match(rating, /Add a review, optional/);
  assert.match(rating, /REVIEW_LIMIT = 300/);
  assert.match(rating, /Your name is not shown to the owner\./);
});

test("the owner's screen is gated, registered, and opened from the Meals overview", () => {
  assert.match(read("src/features/owner/route-gates.tsx"), /"\/owner-meal-ratings": \{[^}]*resource: "FOOD"/);
  assert.match(read("app/_layout.tsx"), /name="owner-meal-ratings"/);
  assert.match(read("app/owner-food.tsx"), /<MealRatingsLink propertyId=\{propertyId\} \/>/);
});

test("the overview's card shows the rating in its colour: red under 2.5, yellow to 3.9, green from 4", () => {
  const tone = read("src/features/food/meal-rating-tone.ts");
  assert.match(tone, /shown < 2\.5/);
  assert.match(tone, /shown < 4 \? "YELLOW" : "GREEN"/);
  assert.match(read("src/features/food/meal-attendance-ui.tsx"), /ratingColor\(rating, colors\)/);
});

test("the graph is the dashboard's line, with a dropdown of this week, this month and this year on a 1 to 5 axis", () => {
  assert.match(screen, /<LineChart/);
  assert.match(screen, /scale=\{RATING_SCALE\}/);
  for (const label of ["This week", "This month", "This year"]) assert.ok(screen.includes(`label: "${label}"`), label);
  assert.match(read("src/features/food/meal-rating-tone.ts"), /ticks: \[1, 2, 3, 4, 5\]/);
  assert.match(screen, /title="Overall rating" trailing=\{<GhostPill height=\{28\} width=\{88\}><ChartDropdown /);
  assert.equal(screen.match(/useState<GraphMode>\("WEEK"\)/g).length, 3);
  assert.doesNotMatch(screen, /SelectionTabs/);
});

test("each food profile shows its rating beside its name and a bar per meal, with no table or lines", () => {
  assert.match(screen, /title="Food profile analytics" trailing=\{aiMode \? undefined : <GhostPill height=\{28\} width=\{88\}><ChartDropdown /);
  assert.doesNotMatch(screen, /Yesterday, by plan/);
  assert.match(screen, /mode === "WEEK" \? plan\.ratingThisWeek : mode === "MONTH" \? plan\.ratingThisMonth : plan\.ratingThisYear/);
  assert.match(screen, /<GroupedColumns/);
  assert.match(screen, /scale=\{RATING_BAR_SCALE\}/);
  assert.doesNotMatch(screen, /MultiLineChart/);
  assert.doesNotMatch(screen, /ScrollView horizontal/);
});

test("dishes are four collapsible cards under the heading, with a dropdown, no graphs and no per plan line", () => {
  const section = screen.slice(screen.indexOf("function DishesSection"), screen.indexOf("function readingOrRatingLine"));
  assert.match(section, /<Section title="Dishes" trailing=\{aiMode \? undefined : <GhostPill height=\{28\} width=\{88\}><ChartDropdown /);
  assert.doesNotMatch(section, /Chart /);
  assert.doesNotMatch(section, /byPlan/);
  for (const label of ['COMMON: "Common dishes"', 'DRINK: "Beverages"', 'VEG: "Vegeterian"', 'NON_VEG: "Non Vegeterian"']) assert.ok(screen.includes(label), label);
  assert.match(section, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(section, /`\$\{dishes\.length\} \$\{dishes\.length === 1 \? "dish" : "dishes"\}`/);
  // The change sits after the rating and smaller.
  assert.ok(section.indexOf("one(rating)") < section.indexOf("<Change change={period.change}"));
  assert.match(section, /fontSize: 11 \}\}>\{signed\(change\)\}/);
  assert.match(read("src/features/food/owner-food-items.tsx"), /label="Dish type"/);
});

test("Generate AI analysis is a gradient button in the fixed footer, with no section of its own", () => {
  assert.doesNotMatch(screen, /title="AI analysis"/);
  assert.match(screen, /<PinnedFooter onLayout=\{[^\n]+\}>\s+<GenerateAnalysisButton/);
  // It stays once used, faded and unpressable, saying when it comes back.
  assert.match(screen, /disabled=\{isLoading \|\| !canPress\}/);
  assert.match(screen, /canPress=\{!!analysisQuery\.data\?\.canGenerate\}/);
  assert.match(screen, /opacity: used \? 0\.45/);
  assert.match(screen, /Available again on \$\{shortDate\(availableOn\)\}/);
  assert.match(screen, /fontFamily: fonts\.sansBold, fontSize: 12\.5, textAlign: "center"/);
  assert.match(screen, /<AiGradient \/>/);
  assert.match(aiStyle, /stopColor="#F0405C"/);
  assert.match(aiStyle, /AI_INK = "#A05FC8"/);
  assert.match(screen, /color: "#FFFFFF"/);
});

test("the last dish card keeps its gap above a measured device footer, including safe area and availability text", () => {
  const ts = require("typescript");
  const vm = require("node:vm");
  const parsed = ts.createSourceFile("meal-ratings.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let scroller;
  let footer;
  function visit(node) {
    if (ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText(parsed) === "ScreenScrollView") scroller = node;
      if (node.tagName.getText(parsed) === "PinnedFooter") footer = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const attribute = (node, name) => node.attributes.properties.find((prop) => prop.name?.text === name).initializer.expression.getText(parsed);
  const contentStyle = attribute(scroller, "contentContainerStyle");
  for (const footerHeight of [0, 90, 104, 144, 190]) {
    const style = vm.runInNewContext(`(${contentStyle})`, { showButton: true, footerHeight, PINNED_FOOTER_CLEARANCE: 104, spacing: { xl: 24 } });
    assert.equal(style.paddingBottom, Math.max(104, footerHeight) + 24);
    assert.ok(style.paddingBottom - footerHeight >= 24, "A tall Android safe area or wrapped caption must not consume the last card's gap");
  }
  assert.equal(vm.runInNewContext(`(${contentStyle})`, { showButton: false }), undefined, "No fixed-footer clearance when the button is absent");
  assert.equal(attribute(scroller, "bottomPaddingCovered"), "showButton", "Collapsing the dish cards must not lock scrolling behind the fixed footer");
  let height;
  const measure = vm.runInNewContext(`(${attribute(footer, "onLayout")})`, { setFooterHeight: (value) => height = value });
  measure({ nativeEvent: { layout: { height: 177 } } });
  assert.equal(height, 177);
  assert.match(screen, /ghostWidth=\{110\} style=\{\{ color: colors\.ink, flexShrink: 1, fontFamily: fonts\.sansBold, fontSize: 14\.5 \}\}>\{title\}/);
});

test("the AI's review is a grey card edged in its gradient, with its own score out of 5 and one black paragraph with bold key words", () => {
  const block = aiStyle.slice(aiStyle.indexOf("function AiReviewCard"), aiStyle.indexOf("function AiNoteCard"));
  const frame = aiStyle.slice(aiStyle.indexOf("function AiCardFrame"), aiStyle.indexOf("function AiSparkleDisc"));
  assert.match(frame, /<AiGradient \/>/);
  assert.match(frame, /backgroundColor: colors\.surfaceRaised/);
  assert.match(block, /AI review[\s\S]*\{badge\}/);
  assert.match(screen, /badge=\{reading\.rating != null \? `\$\{one\(reading\.rating\)\}\/5` : null\}/);
  assert.doesNotMatch(screen, /SENTIMENT|\.sentiment/);
  assert.match(block, /<BoldedText text=\{text\}/);
  assert.doesNotMatch(block, /Likes|Dislikes/);
  assert.match(aiStyle, /function BoldedText[\s\S]*?color: colors\.ink/);
  assert.match(aiStyle, /text\.split\("\*\*"\)/);
  // Pinned on four sides: a percent size on Android left the border short.
  assert.match(aiStyle, /bottom: 0, left: 0, position: "absolute", right: 0, top: 0/);
});

test("AI review mode comes on with the button, has a gradient switch by the title, and swaps graphs and changes for the review", () => {
  assert.match(screen, /await generate\(propertyId\)\.unwrap\(\);\s+setAiMode\(true\);/);
  assert.match(screen, /useState\(false\)/);
  assert.match(screen, /trailing=\{analysis && !generating\.isLoading \? <AiModeToggle accessibilityLabel="AI review" enabled=\{aiMode\} onChange=\{setAiMode\} \/> : undefined\}/);
  const toggle = aiStyle.slice(aiStyle.indexOf("function AiModeToggle"));
  assert.match(toggle, /enabled \? <AiGradient \/> : null/);
  assert.match(screen, /aiMode \? null : hasAny \? \(/);
  assert.match(screen, /aiMode\s+\? plan\.ratingThisWeek \?\? plan\.ratingLastWeek/);
  assert.match(screen, /aiMode \? dish\.thisWeek\.rating \?\? dish\.lastWeek/);
  assert.match(screen, /aiMode \? null : <Change /);
  // The analytics rating stays off AI mode, beside plans and dishes alike.
  assert.match(screen, /!aiMode && rating != null \? <GhostText/);
  assert.match(screen, /\{aiMode \? null : \(\s+<GhostText ghostWidth=\{26\} style=\{\{ color: rating == null/);
  // Anything rated gets a card, written or not, on plans and dishes alike.
  assert.equal(screen.match(/aiMode && rating != null \? <ReadingBlock reading=\{readingOrRatingLine/g).length, 2);
  assert.equal(screen.match(/trailing=\{aiMode \? undefined : <GhostPill height=\{28\} width=\{88\}><ChartDropdown/g).length, 2);
});

test("a dish's reading sits in its own row, under its rating, once there is one", () => {
  const row = screen.slice(screen.indexOf("function DishRow"), screen.indexOf("function readingOrRatingLine"));
  assert.ok(row.indexOf("one(rating)") < row.indexOf("<ReadingBlock"));
});

test("the screen and its API have no way to read a review or a person", () => {
  const api = read("src/store/services/food-api.ts");
  const types = api.slice(api.indexOf("export type MealRatingTrend"), api.indexOf("export type MealReviewReading"));
  assert.doesNotMatch(types, /tenant|userId|tenancyId|review/i);
  assert.doesNotMatch(screen, /tenantName|userId|tenancyId/);
});

test("no semicolons in the copy", () => {
  for (const source of [screen, rating]) {
    assert.deepEqual(source.match(/>\s*[A-Z][^<>{}]*;[^<>{}]*</g) ?? [], []);
  }
});

test("Discover's smart search wears the AI's card, toggle and button", () => {
  const card = read("src/features/discovery/components/discovery-search-card.tsx");
  assert.match(card, /<AiModeToggle accessibilityLabel="Smart search" disabled=\{aiBusy\} enabled=\{aiOn\}/);
  assert.doesNotMatch(card, /<Switch|aiOn \? colors\.primarySoft/);
  // The gradient edge stays with the toggle off, and only the button changes with it.
  assert.match(card, /<AiGradient \/>\s+<View\s+style=\{\{\s+backgroundColor: colors\.surface,/);
  assert.match(card, /label="Search"\r?\n/);
  assert.doesNotMatch(card, /Search with AI/);
  // Each property's explanation is the meal reviews' card with no title: the mark and its words.
  const listing = read("src/features/discovery/components/property-listing-card.tsx");
  assert.match(listing, /<AiNoteCard text=\{reason\} \/>/);
  assert.doesNotMatch(aiStyle.slice(aiStyle.indexOf("function AiNoteCard"), aiStyle.indexOf("function AiCardFrame")), /AI review/);
  assert.doesNotMatch(listing, /ReasonLine/);
  // A shadow a phone draws too, and a red pin with a white centre.
  assert.match(listing, /<Card style=\{\{ gap: 0, padding: spacing\.md, \.\.\.cardShadow\(colors\.shadow\) \}\}>/);
  assert.match(listing, /fill=\{colors\.danger\}[\s\S]{0,80}<Circle cx=\{12\} cy=\{10\} fill="#FFFFFF"/);
  // Measured, as a percent Svg on a phone kept its first size and left gaps when a card grew.
  assert.match(aiStyle, /onLayout=/);
  assert.match(aiStyle, /<Svg height=\{size\.height\} width=\{size\.width\}>/);
  assert.match(card, /aiGradient=\{aiOn\}/);
  // The sort sheet: no line under its title, and the groups' headings already say rent or deposit.
  const sortSheet = read("src/features/discovery/components/listing-sort.tsx");
  assert.doesNotMatch(sortSheet, /comes first by default|come first by default|type\.eyebrow/);
  assert.match(sortSheet, /RENT_LOW: "Low to high"/);
  assert.match(sortSheet, /\{BUTTON_LABELS\[option\]\}/);
  // The answer's header: no sparkle, gradient text, and white bubbles with a gradient edge.
  const results = read("src/features/discovery/components/ai-results.tsx");
  assert.doesNotMatch(results, /Sparkles|primarySoft/);
  assert.match(results, /spans=\{aiGradientSpans\(foundLine\)\}/);
  assert.match(results, /cardShadow\(colors\.shadow\)[\s\S]*?<AiGradient \/>[\s\S]*?backgroundColor: colors\.surface/);
  // Related results: the AI review card's heading, with no line under it.
  assert.match(results, /fontFamily: fonts\.display, fontSize: 15[^>]*>\s+Related results/);
  assert.doesNotMatch(results, /Each one says what it does not/);
  // The sort button: small and blue-edged with a shadow, and never in the AI theme.
  assert.match(results, /<ListingSortButton onPress/);
  assert.match(sortSheet, /borderColor: colors\.primary,[\s\S]*?cardShadow\(colors\.shadow\)/);
  assert.doesNotMatch(sortSheet, /AiGradient|AI_INK|neutralSoft/);
  // The pill says just Searching while it runs, then the place, in both modes.
  assert.match(card, /searchStatus === "searching"\s+\? "Searching"\s+: `Searched/);
  assert.doesNotMatch(card, /AI searching/);
  assert.match(read("app/(tabs)/discovery.tsx"), /: selectedArea \|\| listingAreaLabel;/);
  // No pencil, and a gradient Clear button beside Search, with no icon.
  assert.doesNotMatch(card, /Pencil|AI_CLEAR_OVERHANG/);
  assert.match(card, /<DiscoveryButton aiGradient label="Clear" onPress=\{onAiClear\}/);
  assert.match(read("app/(tabs)/discovery.tsx"), /aiOn\s+\? aiResult\?\.resolvedLocation\?\.locality\?\.trim\(\)/);
  assert.match(read("src/features/discovery/components/discovery-button.tsx"), /aiGradient \? <AiGradient \/> : null/);
});

test("the screen ghosts as itself on first load and as the AI's cards while it generates", () => {
  assert.match(screen, /italicTail="reviews\."/);
  assert.match(screen, /\{!summary \|\| generating\.isLoading \? \(/);
  // The review card's gradient edge is barely there while the screen loads.
  assert.match(aiStyle, /opacity: skeleton \? 0\.12 : 1/);
  assert.match(screen, /<SkeletonBoundary>[\s\S]*generating\.isLoading \? null : <OverallSection[\s\S]*<ProfileAnalyticsSection aiMode=\{generating\.isLoading\}[\s\S]*<DishesSection aiMode=\{generating\.isLoading\}[\s\S]*<\/SkeletonBoundary>/);
  assert.match(screen, /satisfies MealRatingsSummary/);
  assert.doesNotMatch(screen, /SkeletonCard/);
  // Every leaf is a Ghost: no plain text in the sections the boundary draws.
  for (const [from, to] of [["function PlanCard", "function isoOf"], ["function DishGroupCard", "function readingOrRatingLine"]]) {
    const body = screen.slice(screen.indexOf(from), screen.indexOf(to));
    assert.doesNotMatch(body.replace(/<GhostPill[\s\S]*?<\/GhostPill>/g, ""), /<Text style=\{\{ color: colors\.(ink|inkSoft)/);
  }
  assert.match(aiStyle, /useIsSkeleton\(\)/);
});

test("the overall rating is a smaller n/5 with the change from last week beside it, over a graph starting at its left", () => {
  const section = screen.slice(screen.indexOf("function OverallSection"), screen.indexOf("function ProfileAnalyticsSection"));
  assert.match(section, /fontSize: 22 \}\}>\s+\{trend\.rating == null \? "No ratings" : `\$\{one\(trend\.rating\)\}\/5`\}/);
  assert.doesNotMatch(section, / of 5|on last week|space-between/);
  assert.match(section, /\{shownChange != null \? \(/);
  // No change is a grey +-0.0, never a red -0.0.
  assert.match(section, /Math\.round\(change \* 10\) \/ 10 \|\| 0/);
  assert.match(section, /shownChange === 0 \? "±0\.0" : signed\(shownChange\)\} from last week/);
  assert.match(section, /shownChange > 0 \? colors\.jade : shownChange < 0 \? colors\.danger : colors\.muted/);
  assert.match(section, /axisWidth=\{32\}/);
  assert.match(read("src/components/charts/line-chart.tsx"), /const left = axisWidth/);
});

test("the words for a rating: delightful, good, average and poor, on the screen as on the server", () => {
  const line = screen.slice(screen.indexOf("function readingOrRatingLine"));
  assert.match(line, /shown >= 4\.5\s+\? `This \$\{noun\} is delightful\.`\s+: shown >= 4\s+\? `This \$\{noun\} is good\.`\s+: shown >= 2\.5\s+\? `This \$\{noun\} is average\.`\s+: `This \$\{noun\} is poor\.`/);
});

test("Manage listing can show the meal rating, and the profile's Food card carries it", () => {
  const listing = read("app/owner-property.tsx");
  assert.match(listing, /Show meal rating/);
  assert.match(listing, /showMealRating: next/);
  assert.match(listing, /mealRating == null \?[\s\S]{0,80}No ratings yet/);
  const profile = read("src/features/discovery/components/property-profile.tsx");
  assert.match(profile, /label="Food" rating=\{property\.mealRating\}/);
  assert.match(profile, /rating != null \?[\s\S]{0,300}color=\{ratingColor\(rating, colors\)\} name="star"[\s\S]{0,200}rating\.toFixed\(1\)\}\/5/);
});

test("Manage listing previews the property from a fixed footer, without counting as a profile view", () => {
  const manage = read("app/owner-manage-listing.tsx");
  assert.match(manage, /<PinnedFooter>[\s\S]{0,160}label="Show listing preview"/);
  assert.match(manage, /router\.push\("\/owner-listing-preview"\)/);
  // Without this the page counts as fitting and locks, with its last button under the footer.
  assert.match(manage, /bottomPaddingCovered=\{canPreview\}/);
  const preview = read("app/owner-listing-preview.tsx");
  assert.match(preview, /useGetListingPreviewQuery/);
  assert.doesNotMatch(preview, /useProfileView|useProfileActions/);
  assert.match(read("app/_layout.tsx"), /name="owner-listing-preview"/);
});

test("the profile's room cards show amenities the way Rooms & beds does, icons then +n", () => {
  const showcase = read("src/features/discovery/components/room-type-showcase.tsx");
  assert.match(showcase, /<RoomAmenityStrip amenities=\{room\.amenities\} custom=\{room\.customAmenities\} small tiles \/>/);
  assert.doesNotMatch(showcase, /AMENITY_LABELS|customAmenities\.map/);
});
