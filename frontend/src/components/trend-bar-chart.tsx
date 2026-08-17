import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronDown } from "lucide-react-native";

import { Card } from "@/components/card";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CHART_HEIGHT = 156;
// Gridline / axis tick positions as a fraction of the chart ceiling.
const AXIS_FRACTIONS = [1, 0.7, 0.5, 0.1];
// Money charts start with a ₹1,00,000 ceiling and double it every time a
// month's value reaches the current ceiling, so tall months keep headroom.
const MONEY_FLOOR = 100000;

export type TrendBarChartPoint = {
  label: string;
  value: number;
};

type TrendBarChartMode = "percent" | "money";

/**
 * Month-wise bar chart with gradient bars and a static "Monthly" period chip.
 *
 * - `mode="percent"` (default): values are whole percentages (0..100) and the
 *   y-axis is fixed at 100%.
 * - `mode="money"`: values are whole rupees and the y-axis ceiling is dynamic —
 *   it starts at ₹1,00,000 and doubles whenever a month reaches the ceiling, so
 *   the chart compares collection against a self-adjusting money target.
 */
export function TrendBarChart({ data, mode = "percent", title }: { data: TrendBarChartPoint[]; mode?: TrendBarChartMode; title: string }) {
  const { colors, fonts, type } = useTheme();
  const scaleMax = mode === "money" ? moneyCeiling(data) : 100;
  const axisWidth = mode === "money" ? 46 : 34;

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.3 }}>
          {title}
        </Text>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            flexDirection: "row",
            gap: spacing.xs,
            paddingHorizontal: spacing.sm,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 12, }}>
            Monthly
          </Text>
          <ChevronDown color={colors.muted} size={14} strokeWidth={2.4} />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.md }}>
        <View style={{ height: CHART_HEIGHT, width: axisWidth }}>
          {AXIS_FRACTIONS.map((fraction) => (
            <Text
              key={fraction}
              style={{
                color: colors.kicker,
                fontFamily: fonts.sansBold,
                fontSize: 10,
                position: "absolute",
                right: 0,
                top: Math.max(0, (1 - fraction) * CHART_HEIGHT - 6),
              }}
            >
              {mode === "money" ? formatAxisMoney(fraction * scaleMax) : `${Math.round(fraction * 100)}%`}
            </Text>
          ))}
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ height: CHART_HEIGHT, position: "relative" }}>
            {AXIS_FRACTIONS.map((fraction) => (
              <View
                key={fraction}
                style={{
                  backgroundColor: colors.border,
                  height: 1,
                  left: 0,
                  opacity: 0.6,
                  position: "absolute",
                  right: 0,
                  top: (1 - fraction) * CHART_HEIGHT,
                }}
              />
            ))}

            <View style={{ alignItems: "flex-end", bottom: 0, flexDirection: "row", left: 0, position: "absolute", right: 0, top: 0 }}>
              {data.map((point, index) => {
                const clamped = Math.min(100, Math.max(0, (point.value / scaleMax) * 100));
                return (
                  <View key={`${point.label}-${index}`} style={{ alignItems: "center", flex: 1, height: "100%", justifyContent: "flex-end", paddingHorizontal: 5 }}>
                    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 8, height: "100%", justifyContent: "flex-end", overflow: "hidden", width: "100%" }}>
                      <LinearGradient
                        colors={[`${colors.primary}59`, colors.primary]}
                        end={{ x: 0, y: 1 }}
                        start={{ x: 0, y: 0 }}
                        style={{ borderRadius: 8, height: `${clamped}%`, minHeight: clamped > 0 ? 4 : 0, width: "100%" }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={{ flexDirection: "row", marginTop: spacing.xs }}>
            {data.map((point, index) => (
              <Text
                key={`${point.label}-label-${index}`}
                style={[type.caption, { color: colors.muted, flex: 1, textAlign: "center" }]}
              >
                {point.label}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </Card>
  );
}

// The dynamic money ceiling: start at ₹1,00,000 and double until the tallest
// month sits below it (a month exactly touching the ceiling doubles it too).
function moneyCeiling(data: TrendBarChartPoint[]) {
  const peak = data.reduce((max, point) => Math.max(max, point.value), 0);
  let ceiling = MONEY_FLOOR;
  while (peak >= ceiling) {
    ceiling *= 2;
  }
  return ceiling;
}

// Compact rupee label for the y-axis ticks (₹1.4L, ₹50K, ₹2Cr ...).
function formatAxisMoney(rupees: number) {
  if (rupees >= 1e7) {
    return `₹${trimUnit(rupees / 1e7)}Cr`;
  }
  if (rupees >= 1e5) {
    return `₹${trimUnit(rupees / 1e5)}L`;
  }
  if (rupees >= 1e3) {
    return `₹${trimUnit(rupees / 1e3)}K`;
  }
  return `₹${Math.round(rupees)}`;
}

function trimUnit(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
