import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AiGradient, AiModeToggle, AiReviewCard } from "@/components/ai-style";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ChartDropdown } from "@/components/charts/chart-card";
import { LineChart } from "@/components/charts/line-chart";
import { GroupedColumns } from "@/components/charts/grouped-columns";
import { EmptyState } from "@/components/empty-state";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { GhostBlock, GhostIcon, GhostPill, GhostText, SkeletonBoundary } from "@/components/skeleton-boundary";
import { foodIcon, MEAL_LABEL, MEAL_ORDER } from "@/features/food/food-ui";
import { ratingColor, RATING_BAR_SCALE, RATING_SCALE } from "@/features/food/meal-rating-tone";
import { errorMessage } from "@/features/forms/server-error";
import { useAppSelector } from "@/store/hooks";
import {
  useGenerateMealReviewAnalysisMutation,
  useGetMealRatingsSummaryQuery,
  useGetMealReviewAnalysisQuery,
  type FoodDishType,
  type MealDishRating,
  type MealPlanAnalytics,
  type MealRatingsSummary,
  type MealRatingTrend,
  type MealReviewAnalysis,
  type MealReviewReading,
} from "@/store/services/food-api";
import { useChartPalette } from "@/theme/chart-colors";
import { useSoftShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const one = (value: number) => value.toFixed(1);

function signed(change: number) {
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}`;
}

function dateOf(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function shortDate(iso: string) {
  return dateOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", weekday: "short" });
}

const weekday = (iso: string) => dateOf(iso).toLocaleDateString("en-GB", { weekday: "short" });
const dayMonth = (iso: string) => dateOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const monthName = (iso: string) => dateOf(iso).toLocaleDateString("en-GB", { month: "short" });

type GraphMode = "WEEK" | "MONTH" | "YEAR";

const GRAPH_MODES: { key: GraphMode; label: string }[] = [
  { key: "WEEK", label: "This week" },
  { key: "MONTH", label: "This month" },
  { key: "YEAR", label: "This year" },
];

const GHOST_CELL = [{ date: "2026-01-01", people: 1, rating: 4 }];
const GHOST_TREND: MealRatingTrend = { points: [], rating: 4.1 };
const ghostDish = (itemId: string, name: string): MealDishRating => ({
  itemId,
  lastWeek: 4,
  name,
  thisMonth: { change: 0.2, rating: 4 },
  thisWeek: { change: 0.2, rating: 4 },
  thisYear: { change: 0.2, rating: 4 },
});
const ghostPlan = (profileId: string, name: string): MealPlanAnalytics => ({
  meals: (["BREAKFAST", "LUNCH", "DINNER"] as const).map((mealType) => ({ mealType, thisMonth: GHOST_CELL, thisWeek: GHOST_CELL, thisYear: GHOST_CELL })),
  name,
  profileId,
  ratingLastWeek: 4,
  ratingThisMonth: 4,
  ratingThisWeek: 4,
  ratingThisYear: 4,
});

/** What the screen's bars are drawn from while it loads. Only as far as the fold. */
const GHOST_SUMMARY = {
  dishGroups: [{ dishes: [ghostDish("ghost-1", "Steamed rice"), ghostDish("ghost-2", "Dal tadka")], type: "COMMON" }],
  overall: { changeThisWeek: 0.2, rating: 4.1, thisMonth: GHOST_TREND, thisWeek: GHOST_TREND, thisYear: GHOST_TREND },
  profileAnalytics: [ghostPlan("ghost-plan-1", "Veg meals"), ghostPlan("ghost-plan-2", "Non veg meals")],
} satisfies MealRatingsSummary;

const DISH_GROUP_LABEL: Record<FoodDishType, string> = {
  COMMON: "Common dishes",
  DRINK: "Beverages",
  NON_VEG: "Non Vegeterian",
  VEG: "Vegeterian",
};

/**
 * Meal ratings (user, 2026-11-01). Averages every day, for owners and for managers
 * with Meals. The owner can ask for an AI reading once a week: it sits in each dish's
 * row for the week, then goes. Nobody here ever reads a person's rating or their words.
 */
export default function OwnerMealRatingsScreen() {
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const summaryQuery = useGetMealRatingsSummaryQuery(propertyId, { skip: !propertyId });
  const analysisQuery = useGetMealReviewAnalysisQuery(propertyId, { skip: !propertyId });
  const [generate, generating] = useGenerateMealReviewAnalysisMutation();
  const [refusal, setRefusal] = useState<string | null>(null);
  // On when the button is pressed, and the title's switch takes it off and on again (user, 2026-11-02).
  const [aiMode, setAiMode] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);

  const failure = loadFailure(summaryQuery, analysisQuery);
  if (failure) {
    return <LoadFailedScreen failure={failure} />;
  }
  const summary = summaryQuery.data;
  // A week with nothing written is never stored, so its lines come back from the tap alone.
  const analysis = analysisQuery.data?.current ?? generating.data ?? null;
  const dishReadings = new Map((analysis?.dishes ?? []).map((reading) => [reading.id, reading]));
  const planReadings = new Map((analysis?.plans ?? []).map((reading) => [reading.id, reading]));

  async function runAnalysis() {
    try {
      await generate(propertyId).unwrap();
      setAiMode(true);
    } catch (caught) {
      setRefusal(errorMessage(caught) || "The AI analysis could not run. Try again.");
    }
  }

  const noRatings = summary && summary.overall.thisYear.points.every((point) => point.rating == null);

  // Always there for the owner: once used it stays, faded, saying when it comes back.
  const showButton = !!summary && !noRatings && !!analysisQuery.data?.owner;

  return (
    <>
    <ScreenScrollView
      bottomPaddingCovered={showButton}
      contentContainerStyle={showButton ? { paddingBottom: Math.max(PINNED_FOOTER_CLEARANCE, footerHeight) + spacing.xl } : undefined}
      onRefresh={() => void summaryQuery.refetch()}
      safeAreaEdges={showButton ? ["top"] : ["top", "bottom"]}
    >
      <ScreenHeader
        italicTail="reviews."
        title="Meal"
        trailing={analysis && !generating.isLoading ? <AiModeToggle accessibilityLabel="AI review" enabled={aiMode} onChange={setAiMode} /> : undefined}
      />
      {!summary || generating.isLoading ? (
        // The real sections with sample data, every leaf a bar: the screen itself on first load,
        // and while the AI reads, the shape its reviews are about to take (user, 2026-11-02).
        <SkeletonBoundary>
          <View style={{ gap: spacing.md }}>
            {generating.isLoading ? null : <OverallSection change={GHOST_SUMMARY.overall.changeThisWeek} month={GHOST_SUMMARY.overall.thisMonth} week={GHOST_SUMMARY.overall.thisWeek} year={GHOST_SUMMARY.overall.thisYear} />}
            <ProfileAnalyticsSection aiMode={generating.isLoading} monthWeeks={[]} plans={GHOST_SUMMARY.profileAnalytics} readings={new Map()} />
            <DishesSection aiMode={generating.isLoading} analysis={null} groups={GHOST_SUMMARY.dishGroups} readings={new Map()} />
          </View>
        </SkeletonBoundary>
      ) : noRatings ? (
        <EmptyState icon={foodIcon("silverware-fork-knife")} title="No meal ratings yet" />
      ) : (
        <View style={{ gap: spacing.md }}>
          <OverallSection change={summary.overall.changeThisWeek} month={summary.overall.thisMonth} week={summary.overall.thisWeek} year={summary.overall.thisYear} />
          <ProfileAnalyticsSection aiMode={aiMode} monthWeeks={summary.overall.thisMonth.points.map((point) => point.date)} plans={summary.profileAnalytics} readings={planReadings} />
          <DishesSection aiMode={aiMode} analysis={analysis} groups={summary.dishGroups} readings={dishReadings} />
        </View>
      )}
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </ScreenScrollView>
    {showButton ? (
      <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
        <GenerateAnalysisButton
          availableOn={analysisQuery.data?.current?.expiresOn ?? null}
          // Faded and dated once used, everywhere. Only production also stops the press: on dev the server allows another run.
          canPress={!!analysisQuery.data?.canGenerate}
          isLoading={generating.isLoading}
          onPress={() => void runAnalysis()}
        />
      </PinnedFooter>
    ) : null}
    </>
  );
}

/** The rating over time, on the dashboard's own line. The scale is always 1 to 5, so a small wobble stays small. */
function OverallSection({ change, month, week, year }: { change: number | null; month: MealRatingTrend; week: MealRatingTrend; year: MealRatingTrend }) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  const [mode, setMode] = useState<GraphMode>("WEEK");
  const trend = mode === "WEEK" ? week : mode === "MONTH" ? month : year;
  const label = mode === "WEEK" ? weekday : mode === "MONTH" ? dayMonth : monthName;
  const buckets = trend.points.map((point) => ({ key: point.date, label: label(point.date), value: point.rating }));
  // To the place it is shown at, so a tiny fall reads as no change and never as a red -0.0.
  const shownChange = change == null ? null : Math.round(change * 10) / 10 || 0;
  return (
    <Section title="Overall rating" trailing={<GhostPill height={28} width={88}><ChartDropdown accessibilityLabel="Graph shows" onChange={setMode} options={GRAPH_MODES} value={mode} /></GhostPill>}>
      <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, gap: spacing.sm, padding: spacing.md, ...softShadow(colors.shadow, 4, 12) }}>
        <View style={{ alignItems: "baseline", flexDirection: "row", gap: spacing.sm }}>
          <GhostText ghostWidth={64} style={{ color: trend.rating == null ? colors.muted : ratingColor(trend.rating, colors), fontFamily: fonts.display, fontSize: 22 }}>
            {trend.rating == null ? "No ratings" : `${one(trend.rating)}/5`}
          </GhostText>
          {/* However small, and on every duration: the last 7 days against the 7 before. */}
          {shownChange != null ? (
            <GhostText ghostWidth={92} style={{ color: shownChange > 0 ? colors.jade : shownChange < 0 ? colors.danger : colors.muted, fontFamily: fonts.sansBold, fontSize: 12 }}>
              {`${shownChange === 0 ? "±0.0" : signed(shownChange)} from last week`}
            </GhostText>
          ) : null}
        </View>
        <GhostBlock height={160}>
          <LineChart
            axisWidth={32}
            accessibilityLabel={buckets.map((bucket) => `${bucket.label} ${bucket.value == null ? "no ratings" : one(bucket.value)}`).join(", ")}
            buckets={buckets}
            formatTick={(tick) => String(tick)}
            formatValue={one}
            scale={RATING_SCALE}
          />
        </GhostBlock>
      </View>
    </Section>
  );
}

/** A plan's card: its rating over the duration beside its name, and a bar per meal under it. */
function ProfileAnalyticsSection({ aiMode, monthWeeks, plans, readings }: { aiMode: boolean; monthWeeks: string[]; plans: MealPlanAnalytics[]; readings: Map<string, MealReviewReading> }) {
  const [mode, setMode] = useState<GraphMode>("WEEK");
  const columns = mode === "WEEK"
    ? weekColumns()
    : mode === "MONTH"
      ? monthWeeks.map((key) => ({ key, label: dayMonth(key) }))
      : yearColumns();
  return (
    <Section title="Food profile analytics" trailing={aiMode ? undefined : <GhostPill height={28} width={88}><ChartDropdown accessibilityLabel="Food profiles show" onChange={setMode} options={GRAPH_MODES} value={mode} /></GhostPill>}>
      {plans.map((plan) => (
        <PlanCard aiMode={aiMode} columns={columns} key={plan.profileId} mode={mode} plan={plan} reading={readings.get(plan.profileId)} />
      ))}
    </Section>
  );
}

function PlanCard({ aiMode, columns, mode, plan, reading }: { aiMode: boolean; columns: { key: string; label: string }[]; mode: GraphMode; plan: MealPlanAnalytics; reading?: MealReviewReading }) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const [selected, setSelected] = useState<string | null>(null);
  const rating = aiMode
    ? plan.ratingThisWeek ?? plan.ratingLastWeek ?? plan.ratingThisMonth ?? plan.ratingThisYear
    : mode === "WEEK" ? plan.ratingThisWeek : mode === "MONTH" ? plan.ratingThisMonth : plan.ratingThisYear;
  const lines = plan.meals.map((meal) => {
    const cells = mode === "WEEK" ? meal.thisWeek : mode === "MONTH" ? meal.thisMonth : meal.thisYear;
    const byDate = new Map(cells.map((cell) => [cell.date, cell]));
    const people = cells.reduce((sum, cell) => sum + cell.people, 0);
    return {
      average: people === 0 ? null : cells.reduce((sum, cell) => sum + cell.rating * cell.people, 0) / people,
      // Colour follows the meal, whichever meals this plan has.
      color: palette.series[MEAL_ORDER.indexOf(meal.mealType)] ?? palette.other,
      key: meal.mealType,
      label: MEAL_LABEL[meal.mealType],
      values: columns.map((column) => byDate.get(column.key)?.rating ?? null),
    };
  });
  const hasAny = lines.some((line) => line.average != null);
  const chosen = columns.findIndex((column) => column.key === selected);
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
        ...softShadow(colors.shadow, 4, 12),
      }}
    >
      <View style={{ alignItems: "baseline", flexDirection: "row", gap: spacing.sm }}>
        <GhostText fit={false} ghostWidth={130} numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 16 }}>{plan.name}</GhostText>
        {!aiMode && rating != null ? <GhostText ghostWidth={26} style={{ color: ratingColor(rating, colors), fontFamily: fonts.display, fontSize: 14 }}>{one(rating)}</GhostText> : null}
      </View>
      {aiMode ? null : hasAny ? (
        <>
          <GhostBlock height={160}>
            <GroupedColumns
              accessibilityLabel={lines.map((line) => `${line.label} ${line.average == null ? "no ratings" : one(line.average)}`).join(", ")}
              buckets={columns}
              onSelect={setSelected}
              scale={RATING_BAR_SCALE}
              selected={selected}
              series={lines}
            />
          </GhostBlock>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {lines.map((line) => {
              const value = chosen >= 0 ? line.values[chosen] : line.average;
              return (
                <View key={line.key} style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
                  <GhostPill height={9} width={9}><View style={{ backgroundColor: line.color, borderRadius: 999, height: 9, width: 9 }} /></GhostPill>
                  <GhostText ghostWidth={48} style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 12.5 }}>{line.label}</GhostText>
                  <GhostText ghostWidth={20} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12.5 }}>{value == null ? "–" : one(value)}</GhostText>
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13 }}>No ratings at this time.</Text>
      )}
      {aiMode && rating != null ? <ReadingBlock reading={readingOrRatingLine({ id: plan.profileId, name: plan.name }, rating, "plan", reading)} /> : null}
    </View>
  );
}

function isoOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Today in India. These columns have to agree with the server's days. */
function indiaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date());
  return dateOf(parts);
}

function weekColumns() {
  const today = indiaNow();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = isoOf(date);
    return { key, label: weekday(key) };
  });
}

function yearColumns() {
  const today = indiaNow();
  return Array.from({ length: today.getMonth() + 1 }, (_, index) => {
    const key = `${today.getFullYear()}-${String(index + 1).padStart(2, "0")}-01`;
    return { key, label: monthName(key) };
  });
}

/** The AI's button: white on the coral to purple of the user's reference (2026-11-02), held in the fixed footer. */
function GenerateAnalysisButton({ availableOn, canPress, isLoading, onPress }: { availableOn: string | null; canPress: boolean; isLoading: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const used = availableOn != null;
  return (
    <View style={{ gap: spacing.xs }}>
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ busy: isLoading, disabled: isLoading || !canPress }}
      disabled={isLoading || !canPress}
      onPress={onPress}
      style={{ alignItems: "center", borderCurve: "continuous", borderRadius: 14, flexDirection: "row", gap: spacing.xs, height: 48, justifyContent: "center", opacity: used ? 0.45 : isLoading ? 0.75 : 1, overflow: "hidden" }}
    >
      <AiGradient />
      <View><Sparkles color="#FFFFFF" size={18} strokeWidth={2.2} /></View>
      <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 15 }}>{isLoading ? "Generating" : "Generate AI analysis"}</Text>
    </AnimatedPressable>
    {used ? (
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12.5, textAlign: "center" }}>{`Available again on ${shortDate(availableOn)}`}</Text>
    ) : null}
    </View>
  );
}

/** Once it has run, one line says what the readings under the dishes came from. */
function analysisLine(analysis: MealReviewAnalysis) {
  return analysis.stored && analysis.generatedOn && analysis.expiresOn
    ? `AI analysis from ${analysis.reviewsRead} ${analysis.reviewsRead === 1 ? "review" : "reviews"}, ${shortDate(analysis.generatedOn)}.`
    : "Nobody wrote a review this week, so these lines come from the ratings. This week's turn was not used.";
}

/** A collapsible card per kind of dish, directly under the section's heading (user, 2026-11-02). */
function DishesSection({ aiMode, analysis, groups, readings }: { aiMode: boolean; analysis: MealReviewAnalysis | null; groups: { type: FoodDishType; dishes: MealDishRating[] }[]; readings: Map<string, MealReviewReading> }) {
  const { colors, fonts } = useTheme();
  const [mode, setMode] = useState<GraphMode>("WEEK");
  const [open, setOpen] = useState<FoodDishType[]>(groups.length > 0 ? [groups[0].type] : []);
  return (
    <Section title="Dishes" trailing={aiMode ? undefined : <GhostPill height={28} width={88}><ChartDropdown accessibilityLabel="Dishes show" onChange={setMode} options={GRAPH_MODES} value={mode} /></GhostPill>}>
      {aiMode && analysis ? <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 12.5, lineHeight: 18 }}>{analysisLine(analysis)}</Text> : null}
      {groups.map((group) => (
        <DishGroupCard
          aiMode={aiMode}
          dishes={group.dishes}
          key={group.type}
          mode={mode}
          onToggle={() => setOpen((current) => (current.includes(group.type) ? current.filter((type) => type !== group.type) : [...current, group.type]))}
          open={open.includes(group.type)}
          readings={readings}
          title={DISH_GROUP_LABEL[group.type]}
        />
      ))}
    </Section>
  );
}

function DishGroupCard({ aiMode, dishes, mode, onToggle, open, readings, title }: { aiMode: boolean; dishes: MealDishRating[]; mode: GraphMode; onToggle: () => void; open: boolean; readings: Map<string, MealReviewReading>; title: string }) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, ...softShadow(colors.shadow, 4, 12) }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 50, paddingHorizontal: spacing.md }}
      >
        <GhostText ghostWidth={110} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 14.5 }}>{title}</GhostText>
        <GhostPill height={20} width={56}>
          <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
            <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 11.5 }}>{`${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"}`}</Text>
          </View>
        </GhostPill>
        <View style={{ flex: 1 }} />
        <GhostIcon color={colors.kicker} icon={open ? ChevronUp : ChevronDown} size={18} strokeWidth={2.2} />
      </AnimatedPressable>
      {open ? (
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingBottom: aiMode ? spacing.sm : 0, paddingHorizontal: spacing.md }}>
          {dishes.map((dish, index) => (
            <DishRow aiMode={aiMode} dish={dish} first={index === 0} key={dish.itemId} mode={mode} reading={readings.get(dish.itemId)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Change({ change }: { change: number | null }) {
  const { colors, fonts } = useTheme();
  if (change == null || Math.abs(change) < 0.05) {
    return null;
  }
  return <GhostText ghostWidth={22} style={{ color: change > 0 ? colors.jade : colors.danger, fontFamily: fonts.sansMedium, fontSize: 11 }}>{signed(change)}</GhostText>;
}

function DishRow({ aiMode, dish, first, mode, reading }: { aiMode: boolean; dish: MealDishRating; first: boolean; mode: GraphMode; reading?: MealReviewReading }) {
  const { colors, fonts } = useTheme();
  const period = mode === "WEEK" ? dish.thisWeek : mode === "MONTH" ? dish.thisMonth : dish.thisYear;
  // AI review: this week's rating, or the last one there is, with no change beside it.
  const rating = aiMode ? dish.thisWeek.rating ?? dish.lastWeek ?? dish.thisMonth.rating ?? dish.thisYear.rating : period.rating;
  return (
    <View style={{ borderTopColor: colors.border, borderTopWidth: first ? 0 : 1, gap: 3, paddingVertical: spacing.sm }}>
      <View style={{ alignItems: "baseline", flexDirection: "row", gap: spacing.xs }}>
        <GhostText ghostWidth={aiMode ? 110 : "45%"} numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14, ...(aiMode ? { flexShrink: 1 } : { flex: 1 }) }}>{dish.name}</GhostText>
        {aiMode ? null : (
          <GhostText ghostWidth={26} style={{ color: rating == null ? colors.kicker : ratingColor(rating, colors), fontFamily: fonts.sansBold, fontSize: 14 }}>
            {rating == null ? "–" : one(rating)}
          </GhostText>
        )}
        {aiMode ? null : <Change change={period.change} />}
      </View>
      {aiMode && rating == null ? <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13 }}>No ratings yet.</Text> : null}
      {aiMode && rating != null ? <ReadingBlock reading={readingOrRatingLine({ id: dish.itemId, name: dish.name }, rating, "dish", reading)} /> : null}
    </View>
  );
}

/**
 * Anything rated always has a review card. With no reading (rated in an earlier week), the
 * rating's own line and figure stand in. Same bands as the backend's MealRatingRules.generic.
 */
function readingOrRatingLine(subject: { id: string; name: string }, rating: number, noun: "dish" | "plan", reading?: MealReviewReading): MealReviewReading {
  if (reading?.line) {
    return reading;
  }
  const shown = Math.round(rating * 10) / 10;
  const line =
    shown >= 4.5
      ? `This ${noun} is delightful.`
      : shown >= 4
        ? `This ${noun} is good.`
        : shown >= 2.5
          ? `This ${noun} is average.`
          : `This ${noun} is poor.`;
  return { ...subject, rating: shown, line };
}

/**
 * The AI's review of a dish or a plan (user, 2026-11-02): a soft grey card edged in the AI's
 * gradient, with its own score out of 5 in the corner and one paragraph in plain black with
 * its key words in bold. No sentiment chip and no analytics rating beside it, so the AI's view
 * and the tenants' averages never overlap on screen.
 */
function ReadingBlock({ reading }: { reading: MealReviewReading }) {
  return <AiReviewCard badge={reading.rating != null ? `${one(reading.rating)}/5` : null} text={reading.line ?? ""} />;
}
