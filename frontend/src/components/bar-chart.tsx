import { Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type BarChartDatum = {
  label: string;
  value: number;
};

type BarChartProps = {
  data: BarChartDatum[];
  height?: number;
  // Formats the y-axis tick labels (defaults to the raw rounded number).
  formatTick?: (value: number) => string;
};

// Reference-style bar chart: each column has a full-height soft track with a
// gradient bar rising from the bottom. Pure SVG fills inside fixed-height
// Views, so no measurement pass is needed.
export function BarChart({ data, formatTick, height = 150 }: BarChartProps) {
  const { colors, type } = useTheme();
  const max = Math.max(1, ...data.map((datum) => datum.value));
  const ticks = [1, 0.66, 0.33, 0];
  const format = formatTick ?? ((value: number) => String(Math.round(value)));
  const barWidth = 26;

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <View style={{ height, justifyContent: "space-between", paddingBottom: 18 }}>
        {ticks.map((tick) => (
          <Text key={tick} style={[type.caption, { color: colors.kicker, fontSize: 10 }]} selectable>
            {format(max * tick)}
          </Text>
        ))}
      </View>

      <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between" }}>
        {data.map((datum, index) => {
          const barHeight = Math.max(6, Math.round((datum.value / max) * (height - 18)));
          return (
            <View key={`${datum.label}-${index}`} style={{ alignItems: "center", gap: 6 }}>
              <View
                style={{
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: barWidth / 2,
                  height: height - 18,
                  justifyContent: "flex-end",
                  overflow: "hidden",
                  width: barWidth,
                }}
              >
                <Svg height={barHeight} width={barWidth}>
                  <Defs>
                    <LinearGradient id={`bar-${index}`} x1="0" x2="0" y1="0" y2="1">
                      <Stop offset="0" stopColor={colors.primary} stopOpacity="0.45" />
                      <Stop offset="1" stopColor={colors.primary} stopOpacity="1" />
                    </LinearGradient>
                  </Defs>
                  <Rect fill={`url(#bar-${index})`} height={barHeight} rx={barWidth / 2} width={barWidth} x="0" y="0" />
                </Svg>
              </View>
              <Text style={[type.caption, { color: colors.muted, fontSize: 10.5 }]} selectable>
                {datum.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
