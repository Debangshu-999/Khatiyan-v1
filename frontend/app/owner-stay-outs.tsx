import { useMemo, useState } from "react";
import { EmptyStayOut } from "@/components/empty-art";
import { Text, View } from "react-native";

import { Card } from "@/components/card";
import { cardText, smallerCardText } from "@/components/card-name-row";
import { EmptyState } from "@/components/empty-state";
import { CountTabPills } from "@/components/filter-bubbles";
import { FitText } from "@/components/fit-text";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { StayOutEmptyIcon } from "@/components/stay-out-icon";
import { MEAL_ORDER } from "@/features/food/food-ui";
import {
  StayOutReasonBox,
  StayOutSpanPanel,
  StayOutStateChip,
  type StayOutChipState,
} from "@/features/tenancy/stay-out-card";
import { cardName } from "@/lib/person-name";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { useGetStayOutBoardQuery, type StayOutBoardEntry } from "@/store/services/stay-out-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Filter = "all" | "away" | "back" | "upcoming" | "past";
type Row = { entry: StayOutBoardEntry; state: StayOutChipState };

/**
 * Stay outs (user, 2026-11-08): who has told the property they are away.
 * All, away tonight, back today and leaving in the next 30 days, as the
 * app's count pills over cards built like the tenant's own stay-out card.
 *
 * <p>Read only. The tenant declares and changes their own stay outs, and the
 * meal forecast and roster already leave them out.
 */
export default function OwnerStayOutsScreen() {
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const property =
    properties.find((candidate) => candidate.id === selectedPropertyId) ??
    (properties.length === 1 ? properties[0] : null);
  const propertyId = property?.id ?? "";
  const boardQuery = useGetStayOutBoardQuery(propertyId, { skip: !propertyId });
  const board = boardQuery.data;
  const [filter, setFilter] = useState<Filter>("all");

  const meals = useMemo(
    () => (property?.foodIncluded ? MEAL_ORDER.filter((meal) => property.includedMeals.includes(meal)) : []),
    [property],
  );
  const rows = useMemo<Row[]>(() => {
    if (!board) return [];
    const away = board.awayTonight.map((entry) => ({ entry, state: "AWAY" as const }));
    const back = board.backToday.map((entry) => ({ entry, state: "BACK_TODAY" as const }));
    const upcoming = board.upcoming.map((entry) => ({ entry, state: "UPCOMING" as const }));
    // Ended stay outs (user, 2026-11-14): their own filter, and at the end of All.
    const past = (board.past ?? []).map((entry) => ({ entry, state: "DONE" as const }));
    if (filter === "past") return past;
    if (filter === "away") return away;
    if (filter === "back") return back;
    if (filter === "upcoming") return upcoming;
    return [...away, ...back, ...upcoming, ...past];
  }, [board, filter]);

  const loadFailed = loadFailure(propertiesQuery, boardQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }
  const loading = boardQuery.isLoading || !board;
  const total = board ? board.awayTonight.length + board.backToday.length + board.upcoming.length + (board.past ?? []).length : undefined;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="outs."
        subtitle={property ? `Tenants at ${property.name} who said they are away.` : undefined}
        title="Stay"
      />

      <CountTabPills
        onChange={setFilter}
        options={[
          { count: total, label: "All", value: "all" },
          { count: board?.awayTonight.length, label: "Away tonight", value: "away" },
          { count: board?.backToday.length, label: "Back today", value: "back" },
          { count: board?.upcoming.length, label: "Upcoming", value: "upcoming" },
          { count: board ? (board.past ?? []).length : undefined, label: "Past", value: "past" },
        ]}
        value={filter}
      />

      {loading ? <OwnerDataListSkeleton bodyLines={2} rows={3} /> : null}

      {!loading && rows.length === 0 ? (
        <EmptyState
          artworkNode={<EmptyStayOut size={120} />}
          title={
            filter === "away"
              ? "Nobody away tonight"
              : filter === "back"
                ? "Nobody back today"
                : filter === "upcoming"
                  ? "No stay outs coming up"
                  : filter === "past"
                    ? "No stay outs in the last 30 days"
                    : "No stay outs"
          }
        />
      ) : null}

      {loading ? null : rows.map((row) => <StayOutCard key={row.entry.id} meals={meals} row={row} />)}
    </ScreenScrollView>
  );
}

function StayOutCard({ meals, row }: { meals: typeof MEAL_ORDER; row: Row }) {
  const { colors, fonts, type } = useTheme();
  const { entry, state } = row;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: cardText(18) }}>
              {cardName(entry.tenantName?.trim() || "Unnamed tenant")}
            </FitText>
            {/* The stay's code, then the room, on one line (user, 2026-11-08). */}
            {entry.tenancyReferenceCode || entry.roomNumber ? (
              <Text style={[smallerCardText(type.caption), { color: colors.muted }]}>
                {[entry.tenancyReferenceCode, entry.roomNumber ? `Room ${entry.roomNumber}` : null].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          <StayOutStateChip state={state} />
        </View>
        <StayOutSpanPanel
          firstMealBack={entry.firstMealBack}
          lastMealHere={entry.lastMealHere}
          leaveDate={entry.leaveDate}
          meals={meals}
          returnDate={entry.returnDate}
        />
        {entry.reason ? <StayOutReasonBox reason={entry.reason} /> : null}
      </View>
    </Card>
  );
}
