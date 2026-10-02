import { useState } from "react";
import { View } from "react-native";
import Svg, { G, Line, Path, Text as SvgText } from "react-native-svg";

import { LegendRow } from "@/components/charts/legend";
import { PlotScroller } from "@/components/charts/plot-scroller";
import { TapSlots } from "@/components/charts/tap-slots";
import { axisScale, roundedTopBarPath } from "@/features/analytics/chart-math";
import { useChartPalette } from "@/theme/chart-colors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type PairedBucket = { key: string; label: string; a: number; b: number; footer?: string };
export type PairedSeries = { label: string; color: string };

/**
 * Two series over time, a pair of columns per bucket on one shared scale, with
 * an optional line printed under each bucket (a month's net). Tap a pair to see
 * its exact figures. Past five buckets the plot scrolls sideways.
 */
export function PairedColumns({
  accessibilityLabel,
  buckets,
  formatTick,
  formatValue,
  seriesA,
  seriesB,
}: {
  accessibilityLabel: string;
  buckets: PairedBucket[];
  formatTick: (value: number) => string;
  formatValue: (value: number) => string;
  seriesA: PairedSeries;
  seriesB: PairedSeries;
}) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const [selected, setSelected] = useState<string | null>(null);
  const hasFooter = buckets.some((bucket) => bucket.footer);
  const height = hasFooter ? 176 : 160;
  const left = 44;
  const top = 18;
  const bottom = hasFooter ? 42 : 26;
  const baseline = height - bottom;
  const plot = baseline - top;
  const max = Math.max(0, ...buckets.flatMap((bucket) => [bucket.a, bucket.b]));
  const { ceiling, ticks } = axisScale(max, false);
  const tickY = (tick: number) => baseline - (tick / ceiling) * plot;
  const gap = 2;
  const selectedBucket = buckets.find((bucket) => bucket.key === selected);

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <LegendRow color={seriesA.color} label={seriesA.label} value={selectedBucket ? formatValue(selectedBucket.a) : ""} />
        </View>
        <View style={{ flex: 1 }}>
          <LegendRow color={seriesB.color} label={seriesB.label} value={selectedBucket ? formatValue(selectedBucket.b) : ""} />
        </View>
      </View>
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
          const barWidth = Math.min(22, (slot * 0.7) / 2);
          return (
            <>
              <Svg height={height} width={contentWidth}>
                {ticks.map((tick) => (
                  <Line key={`grid-${tick}`} stroke={tick === 0 ? palette.baseline : palette.grid} strokeWidth={tick === 0 ? 1 : 0.6} x1={0} x2={contentWidth} y1={tickY(tick)} y2={tickY(tick)} />
                ))}
                {buckets.map((bucket, index) => {
                  const center = index * slot + slot / 2;
                  const aHeight = ceiling > 0 ? (bucket.a / ceiling) * plot : 0;
                  const bHeight = ceiling > 0 ? (bucket.b / ceiling) * plot : 0;
                  const isSelected = selected === bucket.key;
                  return (
                    <G key={bucket.key}>
                      <Path d={roundedTopBarPath(center - gap / 2 - barWidth, baseline, barWidth, aHeight)} fill={seriesA.color} opacity={selected && !isSelected ? 0.45 : 1} />
                      <Path d={roundedTopBarPath(center + gap / 2, baseline, barWidth, bHeight)} fill={seriesB.color} opacity={selected && !isSelected ? 0.45 : 1} />
                      <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} textAnchor="middle" x={center} y={baseline + 16}>
                        {bucket.label}
                      </SvgText>
                      {bucket.footer ? (
                        <SvgText fill={colors.ink} fontFamily={fonts.sansMedium} fontSize={11} textAnchor="middle" x={center} y={baseline + 32}>
                          {bucket.footer}
                        </SvgText>
                      ) : null}
                    </G>
                  );
                })}
              </Svg>
              <TapSlots
                height={plot}
                onPress={(key) => setSelected((current) => (current === key ? null : key))}
                slots={buckets.map((bucket, index) => ({
                  key: bucket.key,
                  label: `${bucket.label}: ${seriesA.label} ${formatValue(bucket.a)}, ${seriesB.label} ${formatValue(bucket.b)}`,
                  width: slot,
                  x: index * slot,
                }))}
                top={top}
              />
            </>
          );
        }}
      />
    </View>
  );
}
