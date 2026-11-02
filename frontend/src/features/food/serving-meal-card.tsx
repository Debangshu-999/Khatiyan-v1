import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { FitText } from "@/components/fit-text";
import { formatMealWindow, MEAL_LABEL, MealGlyph } from "@/features/food/food-ui";
import type { MealType } from "@/store/services/property-api";
import { softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** One night-sky treatment for all four services, on Home and at the scanner. */
export function ServingMealCard({ children, meal, glass = false }: {
  children?: ReactNode;
  /** A translucent panel when the page already carries the sky. */
  glass?: boolean;
  meal: { mealType: MealType; startTime: string; endTime: string };
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ borderRadius: radii.card, ...softShadow(colors.shadow, 4, 12) }}>
      <LinearGradient
        colors={glass ? ["rgba(255, 255, 255, 0.11)", "rgba(255, 255, 255, 0.04)"] : ["#101B3E", "#24366A", "#4A4278"]}
        end={{ x: 1, y: 1 }}
        locations={glass ? undefined : [0, 0.58, 1]}
        start={{ x: 0, y: 0 }}
        style={{
          backgroundColor: glass ? "transparent" : "#101B3E",
          borderColor: glass ? "rgba(255, 255, 255, 0.2)" : "#44517F",
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          gap: spacing.md,
          overflow: "hidden",
          padding: spacing.md,
        }}
      >
        {glass ? null : <MealSkyBackdrop />}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
            <Text style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 19, lineHeight: 25 }}>
              {MEAL_LABEL[meal.mealType]}, serving now
            </Text>
            <FitText numberOfLines={1} style={{ color: "#D9E2FF", fontFamily: fonts.sansMedium, fontSize: 12.5 }}>
              {formatMealWindow(meal.startTime, meal.endTime)}
            </FitText>
          </View>
          <View style={{
            alignItems: "center",
            backgroundColor: "rgba(255, 255, 255, 0.09)",
            borderColor: "rgba(255, 255, 255, 0.22)",
            borderRadius: 999,
            borderWidth: 1,
            height: 52,
            justifyContent: "center",
            width: 52,
          }}>
            <MealGlyph color="#FFE4AA" meal={meal.mealType} size={28} />
          </View>
        </View>
        {children}
      </LinearGradient>
    </View>
  );
}

/** The scanner's full-page sky. The panels above it stay translucent and distinct. */
export function MealSkyBackground() {
  return (
    <LinearGradient
      accessible={false}
      colors={["#101B3E", "#24366A", "#4A4278"]}
      end={{ x: 1, y: 1 }}
      locations={[0, 0.58, 1]}
      pointerEvents="none"
      start={{ x: 0, y: 0 }}
      style={StyleSheet.absoluteFill}
    >
      <MealSkyBackdrop />
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
