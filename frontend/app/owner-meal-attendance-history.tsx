import { useEffect, useState } from "react";
import { View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { GhostPill, GhostText, SkeletonBoundary } from "@/components/skeleton-boundary";
import { AttendanceDataSheet, MealRow, type OpenMeal } from "@/features/food/meal-attendance-rows";
import { PersonArt } from "@/features/notifications/notification-art";
import { ActionButton } from "@/features/owner/owner-ui";
import { indiaDate } from "@/features/visits/visit-clock";
import { useAppSelector } from "@/store/hooks";
import { useGetMealAttendanceHistoryQuery, type MealAttendanceDayMeal } from "@/store/services/food-api";
import { useSoftShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type HistoryDay = { date: string; meals: MealAttendanceDayMeal[] };

// Recorded, so a ghost row is not greyed out as one with no scans would be.
const ghostMeal = (mealType: MealAttendanceDayMeal["mealType"]): MealAttendanceDayMeal => ({
  attended: 1,
  expected: 2,
  mealType,
  recorded: true,
  skipped: 0,
  state: "DONE",
  time: null,
});

/** Enough days to fill the screen, and no more. */
const GHOST_DAYS: HistoryDay[] = ["2026-01-05", "2026-01-04", "2026-01-03", "2026-01-02", "2026-01-01"].map((date) => ({
  date,
  meals: [ghostMeal("BREAKFAST"), ghostMeal("LUNCH"), ghostMeal("DINNER")],
}));

function dayName(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
}

function dayDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** A day is history once its last meal is over (user, 2026-11-01). */
function isOver(day: HistoryDay, today: string) {
  return day.date !== today || day.meals.every((meal) => meal.state === "DONE");
}

/**
 * Meal attendance history (user, 2026-11-02): one compact card a day, back to the first day
 * anything was recorded. A meal that was recorded opens who ate in a sheet.
 */
export default function OwnerMealAttendanceHistoryScreen() {
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const [pages, setPages] = useState(1);
  const [open, setOpen] = useState<OpenMeal | null>(null);
  const first = useGetMealAttendanceHistoryQuery({ page: 0, propertyId }, { skip: !propertyId });

  useEffect(() => setPages(1), [propertyId]);

  const failure = loadFailure(first);
  if (failure) {
    return <LoadFailedScreen failure={failure} />;
  }
  const today = indiaDate();
  const hasHistory = (first.data?.days ?? []).some((day) => isOver(day, today));
  return (
    <>
      <ScreenScrollView onRefresh={() => void first.refetch()} safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader italicTail="history." title="Attendance" />
        {first.isLoading || !first.data ? (
          <SkeletonBoundary>
            <View style={{ gap: spacing.sm }}>
              {GHOST_DAYS.map((day) => <DayCard day={day} key={day.date} onOpen={() => undefined} />)}
            </View>
          </SkeletonBoundary>
        ) : !hasHistory ? (
          // The picture account notifications used (user, 2026-11-01).
          <EmptyState artworkNode={<PersonArt size={96} />} title="No meal attendance recorded yet" />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {Array.from({ length: pages }, (_, page) => (
              <HistoryPage
                isLast={page === pages - 1}
                key={page}
                onMore={() => setPages((count) => count + 1)}
                onOpen={setOpen}
                page={page}
                propertyId={propertyId}
                today={today}
              />
            ))}
          </View>
        )}
      </ScreenScrollView>
      {open ? <AttendanceDataSheet onClose={() => setOpen(null)} open={open} /> : null}
    </>
  );
}

function HistoryPage({
  isLast,
  onMore,
  onOpen,
  page,
  propertyId,
  today,
}: {
  isLast: boolean;
  onMore: () => void;
  onOpen: (open: OpenMeal) => void;
  page: number;
  propertyId: string;
  today: string;
}) {
  const query = useGetMealAttendanceHistoryQuery({ page, propertyId });
  if (query.isLoading) {
    return (
      <SkeletonBoundary>
        <DayCard day={GHOST_DAYS[0]} onOpen={() => undefined} />
      </SkeletonBoundary>
    );
  }
  return (
    <>
      {(query.data?.days ?? [])
        .filter((day) => isOver(day, today))
        .map((day) => <DayCard day={day} key={day.date} onOpen={onOpen} />)}
      {isLast && query.data?.hasMore ? (
        <View style={{ flexDirection: "row" }}>
          <ActionButton label="Show earlier days" onPress={onMore} variant="secondary" />
        </View>
      ) : null}
    </>
  );
}

/** One card a day: its name, its date in a blue pill on the right, and a row per meal (user, 2026-11-02). */
function DayCard({ day, onOpen }: { day: HistoryDay; onOpen: (open: OpenMeal) => void }) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xxs,
        ...softShadow(colors.shadow, 4, 12),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.xs }}>
        <GhostText ghostWidth="35%" style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 15 }}>{dayName(day.date)}</GhostText>
        <GhostPill height={22} width={84}>
          <View style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
            <GhostText style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 11.5 }}>{dayDate(day.date)}</GhostText>
          </View>
        </GhostPill>
      </View>
      {day.meals.map((meal) => (
        <MealRow first={false} key={meal.mealType} meal={meal} onOpen={() => onOpen({ date: day.date, meal })} />
      ))}
    </View>
  );
}
