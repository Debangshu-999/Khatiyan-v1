import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { FitText } from "@/components/fit-text";
import { formatMealWindow, MEAL_LABEL, MealGlyph } from "@/features/food/food-ui";
import type { MealType } from "@/store/services/property-api";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Each meal its own sky (user, 2026-11-07): breakfast a blue morning over green trees,
 * lunch a yellow noon, snacks an orange evening and dinner the night. White words on all.
 */
const MEAL_SKY: Record<MealType, { border: string; colors: [string, string, string]; glow: string; muted: string }> = {
  // The first two colours hold the words, so white and the muted line stay readable on them.
  // Deep on the left under the words, bright on the right (user, 2026-11-07: cleaner than
  // the muddy diagonal). The glow is the meal's sun, behind its icon.
  BREAKFAST: { border: "#4F9A86", colors: ["#17467E", "#1F6E80", "#5DAA62"], glow: "rgba(255, 229, 138, 0.3)", muted: "#E3F2FF" },
  LUNCH: { border: "#D9A332", colors: ["#8A5200", "#9A6200", "#F4C542"], glow: "rgba(255, 238, 150, 0.38)", muted: "#FFF8E6" },
  EVENING_SNACKS: { border: "#D9692F", colors: ["#8A2E0A", "#B2461A", "#F5934A"], glow: "rgba(255, 196, 128, 0.34)", muted: "#FFE6D6" },
  DINNER: { border: "#44517F", colors: ["#101B3E", "#24366A", "#4A4278"], glow: "rgba(255, 255, 255, 0.09)", muted: "#D9E2FF" },
};

/** The dark of a meal's sky, for a white button on it: its glyph and words (user, 2026-11-07). */
/** The soft ink for secondary text on a meal's sky. */
export function mealSkyMuted(mealType: MealType): string {
  return (MEAL_SKY[mealType] ?? MEAL_SKY.DINNER).muted;
}

export function mealSkyInk(mealType: MealType): string {
  return (MEAL_SKY[mealType] ?? MEAL_SKY.DINNER).colors[0];
}

/** On Home, on Meal management and at the scanner. */
/**
 * A card on a meal's own sky (user, 2026-11-09): dawn for breakfast, day for
 * lunch, the night for dinner, with that sky's drawings behind the content.
 * The serving-meal card, the tenant's food card and the meal pass all sit on it.
 */
export function MealSkyCard({ children, mealType }: { children: ReactNode; mealType: MealType }) {
  const { colors } = useTheme();
  const sky = MEAL_SKY[mealType] ?? MEAL_SKY.DINNER;
  const night = mealType === "DINNER";
  return (
    <View style={{ borderRadius: radii.card, ...cardShadow(colors.shadow) }}>
      <LinearGradient
        colors={sky.colors}
        end={night ? { x: 1, y: 1 } : { x: 1, y: 0.5 }}
        locations={night ? [0, 0.58, 1] : [0, 0.5, 1]}
        start={night ? { x: 0, y: 0 } : { x: 0, y: 0.5 }}
        style={{
          backgroundColor: sky.colors[0],
          borderColor: sky.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          gap: spacing.md,
          overflow: "hidden",
          padding: spacing.md,
        }}
      >
        {night ? <MealSkyBackdrop /> : <DaySkyBackdrop mealType={mealType} />}
        {children}
      </LinearGradient>
    </View>
  );
}

export function ServingMealCard({ children, meal, glass = false, title, showWindow = true }: {
  children?: ReactNode;
  /** A translucent panel when the page already carries the sky. */
  glass?: boolean;
  meal: { mealType: MealType; startTime: string; endTime: string };
  /** In place of "<Meal>, serving now": the tenant's food card says "up next" (2026-11-09). */
  title?: string;
  /** Off where there is no meal time to give: the day's meals are over. */
  showWindow?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const sky = MEAL_SKY[meal.mealType] ?? MEAL_SKY.DINNER;
  const night = meal.mealType === "DINNER";
  return (
    <View style={{ borderRadius: radii.card, ...cardShadow(colors.shadow) }}>
      <LinearGradient
        colors={glass ? ["rgba(255, 255, 255, 0.11)", "rgba(255, 255, 255, 0.04)"] : sky.colors}
        end={night || glass ? { x: 1, y: 1 } : { x: 1, y: 0.5 }}
        locations={glass ? undefined : night ? [0, 0.58, 1] : [0, 0.5, 1]}
        start={night || glass ? { x: 0, y: 0 } : { x: 0, y: 0.5 }}
        style={{
          backgroundColor: glass ? "transparent" : sky.colors[0],
          borderColor: glass ? "rgba(255, 255, 255, 0.2)" : sky.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          gap: spacing.md,
          overflow: "hidden",
          padding: spacing.md,
        }}
      >
        {glass ? null : meal.mealType === "DINNER" ? <MealSkyBackdrop /> : <DaySkyBackdrop mealType={meal.mealType} />}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
            <Text style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 19, lineHeight: 25 }}>
              {title ?? `${MEAL_LABEL[meal.mealType]}, serving now`}
            </Text>
            {showWindow ? (
              <FitText numberOfLines={1} style={{ color: glass ? "#D9E2FF" : sky.muted, fontFamily: fonts.sansMedium, fontSize: 12.5 }}>
                {formatMealWindow(meal.startTime, meal.endTime)}
              </FitText>
            ) : null}
          </View>
          <View style={{
            alignItems: "center",
            backgroundColor: glass ? "rgba(255, 255, 255, 0.09)" : sky.glow,
            borderColor: night || glass ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.45)",
            borderRadius: 999,
            borderWidth: 1,
            height: 52,
            justifyContent: "center",
            width: 52,
          }}>
            {/* Gold on the night, white on a day sky, where gold vanished into the sun. */}
            <MealGlyph color={meal.mealType === "DINNER" || glass ? "#FFE4AA" : "#FFFFFF"} meal={meal.mealType} size={28} />
          </View>
        </View>
        {children}
      </LinearGradient>
    </View>
  );
}

/**
 * The scanner's full-page sky, the serving meal's own (user, 2026-11-07): night while
 * nothing is serving. The panels above it stay translucent and distinct.
 */
export function MealSkyBackground({ mealType = "DINNER" }: { mealType?: MealType }) {
  const sky = MEAL_SKY[mealType] ?? MEAL_SKY.DINNER;
  return (
    <LinearGradient
      accessible={false}
      colors={sky.colors}
      end={{ x: 1, y: 1 }}
      locations={mealType === "DINNER" ? [0, 0.58, 1] : [0, 0.62, 1]}
      pointerEvents="none"
      start={{ x: 0, y: 0 }}
      style={StyleSheet.absoluteFill}
    >
      {mealType === "DINNER" ? <MealSkyBackdrop /> : null}
    </LinearGradient>
  );
}

/** A matching glass surface for scanner controls, without repeating the meal heading. */
export function MealGlassPanel({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <LinearGradient
      colors={["rgba(255, 255, 255, 0.11)", "rgba(255, 255, 255, 0.04)"]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={{
        alignItems: compact ? "center" : undefined,
        borderColor: "rgba(255, 255, 255, 0.2)",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: compact ? "row" : undefined,
        gap: spacing.xs,
        justifyContent: compact ? "center" : undefined,
        minHeight: compact ? 36 : undefined,
        paddingHorizontal: compact ? 12 : spacing.md,
        paddingVertical: compact ? 8 : spacing.md,
      }}
    >
      {children}
    </LinearGradient>
  );
}

/**
 * The day skies, drawn like the stars: a sun rising over a hill of trees for breakfast,
 * a high bright sun for lunch, and one setting over soft bands for snacks.
 */
function DaySkyBackdrop({ mealType }: { mealType: MealType }) {
  // Drawn for the card's own shape, wide and short, pinned to its bottom right: the
  // icon's sun sits near (410, 47). A square drawing cut the rays and hid the trees.
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Svg height="100%" preserveAspectRatio="xMaxYMax slice" viewBox="0 0 440 140" width="100%">
        <Circle cx={410} cy={47} fill="#FFFFFF" opacity={0.1} r={62} />
        {mealType === "BREAKFAST" ? (
          <>
            <Path d="M200 140C250 100 320 92 440 104V140Z" fill="#2E7A45" opacity={0.5} />
            {[[270, 96, 30], [306, 84, 38], [348, 90, 34], [392, 82, 40], [236, 108, 22]].map(([x, top, height], index) => (
              <Path d={`M${x} ${top}l${height * 0.4} ${height}h-${height * 0.8}Z`} fill="#1D5A33" key={index} opacity={0.75} />
            ))}
          </>
        ) : mealType === "LUNCH" ? (
          <Path d="M262 58c0-10 8-17 18-15 4-10 18-12 25-4 10-2 20 4 20 14 7 2 11 7 11 12H262Z" fill="#FFFFFF" opacity={0.24} />
        ) : (
          <Path d="M210 108h230M246 122h194M286 136h154" opacity={0.28} stroke="#FFD9B8" strokeLinecap="round" strokeWidth={4} />
        )}
      </Svg>
    </View>
  );
}

/** Static vector stars: no image fetch, animation, hit targets or screen-reader noise. */
function MealSkyBackdrop() {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Svg height="100%" preserveAspectRatio="xMaxYMin slice" viewBox="0 0 440 440" width="100%">
        <Circle cx={402} cy={86} fill="#A5A4FF" opacity={0.06} r={105} />
        <Circle cx={402} cy={86} fill="#C5C1FF" opacity={0.05} r={78} />
        {[
          [23, 19, 1], [77, 67, 0.8], [147, 13, 1], [205, 47, 0.7],
          [237, 18, 1.3], [271, 66, 1], [294, 32, 0.8], [327, 12, 1],
          [352, 76, 0.8], [390, 20, 1.3], [422, 55, 1], [316, 108, 0.8],
          [32, 172, 1], [420, 235, 1], [16, 324, 0.8], [412, 398, 1.2],
        ].map(([cx, cy, r], index) => (
          <Circle cx={cx} cy={cy} fill="#F4F0FF" key={index} opacity={0.55} r={r} />
        ))}
        <Path d="M285 14v6m-3-3h6M421 87v8m-4-4h8M118 48v4m-2-2h4" opacity={0.65} stroke="#DDE5FF" strokeLinecap="round" strokeWidth={1} />
        <Path d="M240 119C309 70 368 91 458 51M259 142C327 98 391 114 453 85" fill="none" opacity={0.08} stroke="#E7DCFF" strokeWidth={1} />
      </Svg>
    </View>
  );
}
