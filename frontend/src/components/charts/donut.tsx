import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { LegendRow } from "@/components/charts/legend";
import { arcPath, donutSegments } from "@/features/analytics/chart-math";
import { useChartPalette } from "@/theme/chart-colors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type DonutSlice = { key: string; label: string; value: number; color: string; valueText: string };

/** Up to five slices plus a grey "Other". The legend beside it prints every value. */
export function Donut({
  accessibilityLabel,
  centerLabel,
  centerValue,
  size = 104,
  slices,
}: {
  accessibilityLabel: string;
  centerLabel: string;
  centerValue: string;
  size?: number;
  slices: DonutSlice[];
}) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const segments = donutSegments(slices.map((slice) => slice.value));

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
      <View accessibilityLabel={accessibilityLabel} accessible style={{ height: size, width: size }}>
        <Svg height={size} width={size}>
          {segments.length === 0 ? (
            <Circle cx={center} cy={center} fill="none" r={radius} stroke={palette.track} strokeWidth={strokeWidth} />
          ) : (
            segments.map((segment) => (
              <Path
                d={arcPath(center, center, radius, segment.start, segment.length)}
                fill="none"
                key={slices[segment.index].key}
                stroke={slices[segment.index].color}
                strokeWidth={strokeWidth}
              />
            ))
          )}
        </Svg>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, fontVariant: ["tabular-nums"] }}>{centerValue}</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11 }}>{centerLabel}</Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
        {slices.map((slice) => (
          <LegendRow color={slice.color} key={slice.key} label={slice.label} value={slice.valueText} />
        ))}
      </View>
    </View>
  );
}
