import { useState } from "react";
import { View } from "react-native";
import Svg, { G, Line, Path, Text as SvgText } from "react-native-svg";

import { axisScale, rampIndexes, roundedTopBarPath } from "@/features/analytics/chart-math";
import { useChartPalette } from "@/theme/chart-colors";
import { TapSlots } from "@/components/charts/tap-slots";
import { useTheme } from "@/theme/use-theme";

export type ColumnBucket = { key: string; label: string; value: number };

/**
 * Ordered buckets (ageing, tenure, durations) on the blue ramp: darker is older
 * or longer. Tap a column to print its exact figure above it.
 */
export function OrderedColumns({
  accessibilityLabel,
  buckets,
  formatTick,
  formatValue,
  integer,
}: {
  accessibilityLabel: string;
  buckets: ColumnBucket[];
  formatTick: (value: number) => string;
  formatValue: (value: number) => string;
  integer: boolean;
}) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const height = 150;
  const left = 40;
  const top = 18;
  const bottom = 26;
  const baseline = height - bottom;
  const plot = baseline - top;
  const max = Math.max(0, ...buckets.map((bucket) => bucket.value));
  const { ceiling, ticks } = axisScale(max, integer);
  const fills = rampIndexes(buckets.length, palette.ramp.length).map((index) => palette.ramp[index]);
  const slot = buckets.length > 0 ? (width - left) / buckets.length : 0;
  const barWidth = Math.min(36, slot * 0.6);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      style={{ height }}
    >
      {width > 0 ? (
        <Svg height={height} width={width}>
          {ticks.map((tick) => {
            const y = baseline - (tick / ceiling) * plot;
            return (
              <G key={`tick-${tick}`}>
                <Line stroke={tick === 0 ? palette.baseline : palette.grid} strokeWidth={tick === 0 ? 1 : 0.6} x1={left} x2={width} y1={y} y2={y} />
                <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} textAnchor="end" x={left - 6} y={y + 4}>
                  {formatTick(tick)}
                </SvgText>
              </G>
            );
          })}
          {buckets.map((bucket, index) => {
            const x = left + index * slot + (slot - barWidth) / 2;
            const barHeight = ceiling > 0 ? (bucket.value / ceiling) * plot : 0;
            return (
              <G key={bucket.key}>
                <Path d={roundedTopBarPath(x, baseline, barWidth, barHeight)} fill={fills[index]} />
                <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} textAnchor="middle" x={x + barWidth / 2} y={baseline + 17}>
                  {bucket.label}
                </SvgText>
                {selected === bucket.key ? (
                  <SvgText fill={colors.ink} fontFamily={fonts.sansSemiBold} fontSize={11} textAnchor="middle" x={x + barWidth / 2} y={baseline - barHeight - 5}>
                    {formatValue(bucket.value)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      ) : null}
      {width > 0 ? (
        <TapSlots
          height={plot}
          onPress={(key) => setSelected((current) => (current === key ? null : key))}
          slots={buckets.map((bucket, index) => ({ key: bucket.key, label: `${bucket.label} ${formatValue(bucket.value)}`, width: slot, x: left + index * slot }))}
          top={top}
        />
      ) : null}
    </View>
  );
}
