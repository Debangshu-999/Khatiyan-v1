import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, History } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ChartDropdown } from "@/components/charts/chart-card";
import { GroupedColumns } from "@/components/charts/grouped-columns";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { GhostBlock, GhostIcon, GhostPill, GhostText, SkeletonBoundary } from "@/components/skeleton-boundary";
import { MEAL_LABEL, MEAL_ORDER } from "@/features/food/food-ui";
import { AttendanceDataSheet, MealRow, type OpenMeal } from "@/features/food/meal-attendance-rows";
import { indiaDate } from "@/features/visits/visit-clock";
import { useAppSelector } from "@/store/hooks";
import {
  useGetMealAttendanceAnalyticsQuery,
  useGetMealAttendanceDayQuery,
  useGetMealAttendanceHistoryQuery,
  type MealAttendanceAnalytics,
  type MealAttendanceDayMeal,
  type MealAttendancePlan,
} from "@/store/services/food-api";
import { useChartPalette } from "@/theme/chart-colors";
import { useSoftShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type GraphMode = "WEEK" | "MONTH" | "YEAR";

const GRAPH_MODES: { key: GraphMode; label: string }[] = [
  { key: "WEEK", label: "This week" },
  { key: "MONTH", label: "This month" },
  { key: "YEAR", label: "This year" },
];

const PERCENT_SCALE = { max: 100, min: 0, ticks: [0, 25, 50, 75, 100] };

const dateOf = (iso: string) => new Date(`${iso}T12:00:00`);
const LABEL: Record<GraphMode, (iso: string) => string> = {
  MONTH: (iso) => dateOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  WEEK: (iso) => dateOf(iso).toLocaleDateString("en-GB", { weekday: "short" }),
  YEAR: (iso) => dateOf(iso).toLocaleDateString("en-GB", { month: "short" }),
};

const percent = (attended: number, expected: number) => Math.round((attended / Math.max(expected, 1)) * 100);

const GHOST_CELL = [{ attended: 1, date: "2026-01-01", expected: 2 }];
const ghostMeal = (mealType: MealAttendanceDayMeal["mealType"]): MealAttendanceDayMeal => ({
  attended: 0,
  expected: 0,
  mealType,
  recorded: false,
  skipped: 0,
  state: "UPCOMING",
  time: "8:00 AM to 10:00 AM",
});
const GHOST_MEALS = [ghostMeal("BREAKFAST"), ghostMeal("LUNCH"), ghostMeal("DINNER")];

/** What the bars are drawn from while the screen loads. Only as far as the fold. */
const GHOST_ANALYTICS = {
  monthColumns: [],
  plans: ["ghost-plan-1", "ghost-plan-2"].map((profileId) => ({
    meals: (["BREAKFAST", "LUNCH", "DINNER"] as const).map((mealType) => ({ mealType, thisMonth: GHOST_CELL, thisWeek: GHOST_CELL, thisYear: GHOST_CELL })),
    name: "Veg meals",
    profileId,
  })),
  weekColumns: [],
  yearColumns: [],
} satisfies MealAttendanceAnalytics;

/**
 * Meal attendance (user, 2026-11-02): one screen with no tabs. Today's meals in order with
 * their times, the way into the history, and how many ate over time per food profile. A meal
 * with anyone to list opens who ate in a sheet.
 */
export default function OwnerMealAttendanceScreen() {
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const [open, setOpen] = useState<OpenMeal | null>(null);
  const date = indiaDate();
  const day = useGetMealAttendanceDayQuery({ date, propertyId }, { pollingInterval: 60_000, skip: !propertyId });
  const analytics = useGetMealAttendanceAnalyticsQuery(propertyId, { skip: !propertyId });
  // The history is one tap away, so it is ready before the tap: the route built and its first
  // page in hand, so it opens at once with its days and not after a pause on bars (user, 2026-11-02).
  useGetMealAttendanceHistoryQuery({ page: 0, propertyId }, { skip: !propertyId });
  useEffect(() => {
    router.prefetch("/owner-meal-attendance-history");
  }, []);

  const failure = loadFailure(day, analytics);
  if (failure) {
    return <LoadFailedScreen failure={failure} />;
  }
  return (
    <>
      <ScreenScrollView
        onRefresh={() => {
          void day.refetch();
          void analytics.refetch();
        }}
        safeAreaEdges={["top", "bottom"]}
      >
        <ScreenHeader italicTail="attendance." title="Meal" />
        {!day.data || !analytics.data ? (
          <SkeletonBoundary>
            <Body analytics={GHOST_ANALYTICS} date={date} meals={GHOST_MEALS} onOpen={() => undefined} />
          </SkeletonBoundary>
        ) : (
          <Body analytics={analytics.data} date={date} meals={day.data.meals} onOpen={setOpen} />
        )}
      </ScreenScrollView>
      {open ? <AttendanceDataSheet onClose={() => setOpen(null)} open={open} /> : null}
    </>
  );
}

function Body({ analytics, date, meals, onOpen }: { analytics: MealAttendanceAnalytics; date: string; meals: MealAttendanceDayMeal[]; onOpen: (open: OpenMeal) => void }) {
  return (
    <View style={{ gap: spacing.md }}>
      <TodaySection date={date} meals={meals} onOpen={onOpen} />
      <HistoryLink />
      <AnalyticsSection analytics={analytics} />
    </View>
  );
}

function TodaySection({ date, meals, onOpen }: { date: string; meals: MealAttendanceDayMeal[]; onOpen: (open: OpenMeal) => void }) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  return (
    <Section title="Today">
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xxs,
          ...softShadow(colors.shadow, 4, 12),
        }}
      >
        {meals.length === 0 ? (
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13, paddingVertical: spacing.sm }}>No meals today.</Text>
        ) : (
          meals.map((meal, index) => (
            <MealRow first={index === 0} key={meal.mealType} meal={meal} onOpen={() => onOpen({ date, meal })} />
          ))
        )}
      </View>
    </Section>
  );
}

function HistoryLink() {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => router.push("/owner-meal-attendance-history")}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.md,
        ...softShadow(colors.shadow, 4, 12),
      }}
    >
      <GhostIcon color={colors.ink} icon={History} size={18} strokeWidth={2.2} />
      <GhostText ghostWidth="60%" style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>Meal attendance history</GhostText>
      <GhostIcon color={colors.kicker} icon={ChevronRight} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function AnalyticsSection({ analytics }: { analytics: MealAttendanceAnalytics }) {
  const { colors, fonts } = useTheme();
  const [mode, setMode] = useState<GraphMode>("WEEK");
  const columns = (mode === "WEEK" ? analytics.weekColumns : mode === "MONTH" ? analytics.monthColumns : analytics.yearColumns)
    .map((key) => ({ key, label: LABEL[mode](key) }));
  return (
    <Section
      title="Attendance analytics"
      trailing={<GhostPill height={28} width={88}><ChartDropdown accessibilityLabel="Attendance shows" onChange={setMode} options={GRAPH_MODES} value={mode} /></GhostPill>}
    >
      {analytics.plans.length === 0 ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13 }}>No meals recorded yet.</Text>
      ) : (
        analytics.plans.map((plan) => <PlanCard columns={columns} key={plan.profileId} mode={mode} plan={plan} />)
      )}
    </Section>
  );
}

/** A food profile's card: a bar per meal over the duration, with each meal's percentage in the legend. */
function PlanCard({ columns, mode, plan }: { columns: { key: string; label: string }[]; mode: GraphMode; plan: MealAttendancePlan }) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const [selected, setSelected] = useState<string | null>(null);
  const lines = plan.meals.map((meal) => {
    const cells = mode === "WEEK" ? meal.thisWeek : mode === "MONTH" ? meal.thisMonth : meal.thisYear;
    const byDate = new Map(cells.map((cell) => [cell.date, cell]));
    const expected = cells.reduce((sum, cell) => sum + cell.expected, 0);
    return {
      average: expected === 0 ? null : percent(cells.reduce((sum, cell) => sum + cell.attended, 0), expected),
      // Colour follows the meal, whichever meals this plan has.
      color: palette.series[MEAL_ORDER.indexOf(meal.mealType)] ?? palette.other,
      key: meal.mealType,
      label: MEAL_LABEL[meal.mealType],
      values: columns.map((column) => {
        const cell = byDate.get(column.key);
        return cell ? percent(cell.attended, cell.expected) : null;
      }),
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
      <GhostText ghostWidth={130} numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{plan.name}</GhostText>
      {hasAny ? (
        <>
          <GhostBlock height={160}>
            <GroupedColumns
              accessibilityLabel={lines.map((line) => `${line.label} ${line.average == null ? "not recorded" : `${line.average}%`}`).join(", ")}
              buckets={columns}
              onSelect={setSelected}
              scale={PERCENT_SCALE}
              selected={selected}
              series={lines}
            />
          </GhostBlock>
          {/* Up to three share one row, each with an equal part, and four are rows of two: a long
              name shrinks to its place rather than pushing the row onto a second line (user, 2026-11-02). */}
          <View style={{ columnGap: spacing.sm, flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs }}>
            {lines.map((line) => {
              const value = chosen >= 0 ? line.values[chosen] : line.average;
              return (
                <View key={line.key} style={{ alignItems: "center", flexDirection: "row", gap: 4, minWidth: 0, ...(lines.length === 4 ? { width: "47%" } : { flex: 1 }) }}>
                  <GhostPill height={9} width={9}><View style={{ backgroundColor: line.color, borderRadius: 999, height: 9, width: 9 }} /></GhostPill>
                  <GhostText ghostWidth={44} numberOfLines={1} style={{ color: colors.inkSoft, flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 12 }}>{line.label}</GhostText>
                  <GhostText ghostWidth={24} numberOfLines={1} style={{ color: colors.ink, flexShrink: 0, fontFamily: fonts.sansBold, fontSize: 12 }}>{value == null ? "–" : `${value}%`}</GhostText>
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13 }}>No meals recorded at this time.</Text>
      )}
    </View>
  );
}
