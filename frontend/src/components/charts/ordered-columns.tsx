import { useState } from "react";
import Svg, { G, Line, Path, Text as SvgText } from "react-native-svg";

import { PlotScroller } from "@/components/charts/plot-scroller";
import { axisScale, rampIndexes, roundedTopBarPath } from "@/features/analytics/chart-math";
import { useChartPalette } from "@/theme/chart-colors";
import { TapSlots } from "@/components/charts/tap-slots";
import { useTheme } from "@/theme/use-theme";

export type ColumnBucket = { key: string; label: string; value: number };

/**
 * Ordered buckets (ageing, tenure, durations) on the blue ramp: darker is older
 * or longer. Tap a column to print its exact figure above it. Past five buckets
 * the plot scrolls sideways, like the over-time charts.
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
  const [selected, setSelected] = useState<string | null>(null);
  const height = 150;
  const left = 40;
  const top = 18;
  const bottom = 26;
  const baseline = height - bottom;
  const plot = baseline - top;
  const max = Math.max(0, ...buckets.map((bucket) => bucket.value));
  const { ceiling, ticks } = axisScale(max, integer);
  const tickY = (tick: number) => baseline - (tick / ceiling) * plot;
  const fills = rampIndexes(buckets.length, palette.ramp.length).map((index) => palette.ramp[index]);

  return (
    <PlotScroller
      accessibilityLabel={accessibilityLabel}
      axisWidth={left}
      bucketCount={buckets.length}
      height={height}
      renderAxis={() => (
        <Svg height={height} width={left}>
          {ticks.map((tick) => (
            <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} key={`tick-${tick}`} textAnchor="end" x={left - 6} y={tickY(tick) + 4}>
              {formatTick(tick)}
            </SvgText>
          ))}
        </Svg>
      )}
      renderPlot={({ contentWidth, slot }) => {
        const barWidth = Math.min(36, slot * 0.6);
        return (
          <>
            <Svg height={height} width={contentWidth}>
              {ticks.map((tick) => (
                <Line key={`grid-${tick}`} stroke={tick === 0 ? palette.baseline : palette.grid} strokeWidth={tick === 0 ? 1 : 0.6} x1={0} x2={contentWidth} y1={tickY(tick)} y2={tickY(tick)} />
              ))}
              {buckets.map((bucket, index) => {
                const x = index * slot + (slot - barWidth) / 2;
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
            <TapSlots
              height={plot}
              onPress={(key) => setSelected((current) => (current === key ? null : key))}
              slots={buckets.map((bucket, index) => ({ key: bucket.key, label: `${bucket.label} ${formatValue(bucket.value)}`, width: slot, x: index * slot }))}
              top={top}
            />
          </>
        );
      }}
    />
  );
}
