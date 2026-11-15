import { useState } from "react";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, Switch, Text, View } from "react-native";
import { ChevronRight, CircleHelp, QrCode, Star } from "lucide-react-native";

import { cardShadow, softShadow } from "@/theme/shadows";
import { AnimatedPressable } from "@/components/animated-pressable";
import { HowItWorksSheet, type HowItWorksStep } from "@/components/how-it-works-sheet";
import { ServingMealCard, mealSkyInk } from "@/features/food/serving-meal-card";
import { ratingColor } from "@/features/food/meal-rating-tone";
import { useGetMealAttendanceLiveQuery, useGetMealRatingsSummaryQuery } from "@/store/services/food-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const MEAL_ATTENDANCE_STEPS: HowItWorksStep[] = [
  { body: "Tenants show a meal pass and it is scanned at the counter.", title: "Pass" },
  { body: "Meal attendance must be recorded before serving.", title: "Timing" },
  { body: "The meal pass is only shown to tenants subscribed to a meal.", title: "Who" },
];

/**
 * The switch for meal attendance on the Meals overview, with how it works behind a ?
 * beside the title (user, 2026-11-02). Once on, it also leads to the report. A manager
 * who can only view Meals sees the state and the report, not a live switch.
 */
export function MealAttendanceCard({
  busy,
  enabled,
  onToggle,
  readOnly,
}: {
  busy: boolean;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  readOnly: boolean;
}) {
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.xs,
        padding: spacing.md,
        paddingTop: spacing.sm,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.xs, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 15 }}>
            Record meal attendance
          </Text>
          <AnimatedPressable accessibilityLabel="How meal attendance works" accessibilityRole="button" hitSlop={10} onPress={() => setHelpOpen(true)}>
            <CircleHelp color={colors.muted} size={16} strokeWidth={2.2} />
          </AnimatedPressable>
        </View>
        <Switch
          accessibilityLabel="Record meal attendance"
          disabled={busy || readOnly}
          onValueChange={onToggle}
          // Android's switch is far taller than it looks, which pushed the row and the card's top apart.
          style={Platform.OS === "android" ? { marginVertical: -10 } : undefined}
          thumbColor={colors.surface}
          trackColor={{ false: colors.neutralSoft, true: colors.primary }}
          value={enabled}
        />
      </View>

      {enabled ? (
        <AnimatedPressable accessibilityRole="button" onPress={() => router.push("/owner-meal-attendance")}>
          {/* A gradient edge around a gradient fill, in the blue of the section headings (user, 2026-11-02). */}
          <LinearGradient
            colors={[colors.primary, "#BFD4FF"]}
            end={{ x: 1, y: 0.5 }}
            start={{ x: 0, y: 0.5 }}
            style={{ borderRadius: radii.card, overflow: "hidden", padding: 1.5 }}
          >
            <LinearGradient
              colors={["#EAF2FF", "#FFFFFF"]}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={{ alignItems: "center", borderRadius: radii.card - 1.5, flexDirection: "row", gap: spacing.sm, padding: spacing.sm }}
            >
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13.5 }}>
                See meal attendance
              </Text>
              <ChevronRight color={colors.kicker} size={18} strokeWidth={2.2} />
            </LinearGradient>
          </LinearGradient>
        </AnimatedPressable>
      ) : null}

      {helpOpen ? (
        <HowItWorksSheet eyebrow="Meal attendance" onClose={() => setHelpOpen(false)} steps={MEAL_ATTENDANCE_STEPS} title="How it works" />
      ) : null}
    </View>
  );
}

/** Into the ratings, from the Meals overview, showing the rating in its colour. Ratings do not need attendance to be on. */
export function MealRatingsLink({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const rating = useGetMealRatingsSummaryQuery(propertyId, { skip: !propertyId }).data?.overall.rating ?? null;
  const color = rating == null ? colors.kicker : ratingColor(rating, colors);
  return (
    <AnimatedPressable
      accessibilityLabel={rating == null ? "Meal reviews" : `Meal reviews, ${rating.toFixed(1)} of 5`}
      accessibilityRole="button"
      onPress={() => router.push("/owner-meal-ratings")}
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
        ...cardShadow(colors.shadow),
      }}
    >
      <Star color={color} fill={color} size={20} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14.5 }}>Meal reviews</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>Last 30 days</Text>
      </View>
      {rating == null ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13 }}>No ratings yet</Text>
      ) : (
        <Text style={{ color, fontFamily: fonts.display, fontSize: 22 }}>{rating.toFixed(1)}</Text>
      )}
      <ChevronRight color={colors.kicker} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

/**
 * Home's card while a meal is open for scanning (user, 2026-11-01). Every owner
 * and manager sees it, because anyone can scan: there is no handler. It reads the
 * attendance endpoint, which is open to every manager, and not the meal schedule,
 * which needs the Meals permission. Nothing shows between meals.
 */
export function MealScanHomeCard({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const { fonts } = useTheme();
  const live = useGetMealAttendanceLiveQuery(propertyId, { pollingInterval: 30_000, skip: !propertyId });
  const meal = live.data?.openMeal;
  if (!meal) {
    return null;
  }
  return (
    <ServingMealCard meal={meal}>
        <AnimatedPressable
          accessibilityLabel="Scan meal passes"
          accessibilityRole="button"
          onPress={() => router.push("/owner-meal-scan")}
          style={{
            alignItems: "center",
            backgroundColor: "#FFFFFF",
            borderCurve: "continuous",
            borderRadius: radii.card - 2,
            flexDirection: "row",
            gap: spacing.sm,
            justifyContent: "center",
            minHeight: 44,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <QrCode color={mealSkyInk(meal.mealType)} size={18} strokeWidth={2.2} />
          <Text style={{ color: mealSkyInk(meal.mealType), fontFamily: fonts.sansBold, fontSize: 14 }}>Scan meal passes</Text>
          <ChevronRight color={mealSkyInk(meal.mealType)} size={17} strokeWidth={2.2} />
        </AnimatedPressable>
    </ServingMealCard>
  );
}
