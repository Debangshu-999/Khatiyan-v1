import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { FoodMenuSkeleton } from "@/components/skeletons";
import { NoticeBar } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  DAY_LABEL,
  DayStrip,
  FoodItemThumb,
  MEAL_ICON,
  MEAL_LABEL,
  MEAL_ORDER,
  foodIcon,
  formatQuantity,
  todayInIst,
  weekFrom,
  weekdayOf,
} from "@/features/food/food-ui";
import { useGetMyFoodProfileMenuQuery, type DayOfWeek } from "@/store/services/food-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * One meal plan's week, for a tenant deciding whether to take it.
 *
 * <p>Reachable for any published profile, not only the one they are on — the
 * whole point of a plan list is choosing between them, and a name plus a line
 * of description is not enough to choose on.
 *
 * <p>Entries whose meal the property has stopped serving are left out. The
 * owner can see and clear those on their own menu screen; a tenant would only
 * be told about food that is never cooked.
 */
export default function TenancyFoodMenuScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  const query = useGetMyFoodProfileMenuQuery(profileId ?? "", { skip: !profileId });

  const today = useMemo(() => todayInIst(), []);
  const week = useMemo(() => weekFrom(today), [today]);
  const [day, setDay] = useState<DayOfWeek>(() => weekdayOf(today));

  const entries = (query.data?.entries ?? []).filter(
    (entry) => entry.dayOfWeek === day && entry.mealStillServed,
  );

  if (!query.data && query.isFetching) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <ScreenHeader
          eyebrow="Food preference"
          italicTail="menu."
          subtitle="Meal plan"
          title="Weekly"
        />
        <FoodMenuSkeleton />
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView
      onRefresh={profileId ? async () => void (await query.refetch()) : undefined}
      safeAreaEdges={["top", "bottom"]}
    >
      <ScreenHeader
        eyebrow="Food preference"
        italicTail="menu."
        subtitle={query.data?.profile.name ?? "Meal plan"}
        title="Weekly"
      />

      <DayStrip onSelect={setDay} selected={day} week={week} />

      {query.isError ? (
        <EmptyState
          compact
          description="Pull down to try again."
          icon={foodIcon("alert-circle-outline")}
          title="Could not load this menu"
        />
      ) : null}

      {!query.isFetching && !query.isError && entries.length === 0 ? (
        <EmptyState
          compact
          description={`Your property has not planned anything for ${DAY_LABEL[day]} yet.`}
          icon={foodIcon("calendar-blank-outline")}
          title="Nothing planned"
        />
      ) : null}

      {MEAL_ORDER.map((meal) => {
        const rows = entries
          .filter((entry) => entry.mealType === meal)
          .sort((a, b) => a.displayOrder - b.displayOrder);
        if (rows.length === 0) {
          return null;
        }
        return (
          <View
            key={meal}
            style={{
              borderColor: colors.border,
              borderRadius: radii.card,
              borderWidth: 1,
              gap: spacing.sm,
              padding: spacing.md,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
              <MaterialCommunityIcons color={colors.ink} name={MEAL_ICON[meal]} size={17} />
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 15 }}>
                {MEAL_LABEL[meal]}
              </Text>
            </View>
            {rows.map((entry, index) => (
              <View
                key={entry.id}
                style={{
                  alignItems: "center",
                  borderTopColor: colors.border,
                  borderTopWidth: index === 0 ? 0 : 1,
                  flexDirection: "row",
                  gap: spacing.sm,
                  paddingTop: index === 0 ? 0 : spacing.sm,
                }}
              >
                <FoodItemThumb imageUrl={entry.itemImageUrl} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, fontSize: 13.5 }]}>
                    {entry.itemName}
                  </Text>
                  <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5 }}>
                    {formatQuantity(entry.baseQuantityPerSubscriber, entry.quantityUnit)} per person
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}

      <NoticeBar
        message="Your property sets these items and portions, and they can change with what is available."
        title="About this menu"
        tone="info"
      />
    </ScreenScrollView>
  );
}
