import { useState } from "react";
import { Text } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";

import { PlotScroller } from "@/components/charts/plot-scroller";
import { TapSlots } from "@/components/charts/tap-slots";
import { lineSegments, signedScale } from "@/features/analytics/chart-math";
import { useChartPalette } from "@/theme/chart-colors";
import { useTheme } from "@/theme/use-theme";

export type LineBucket = { key: string; label: string; value: number | null };

/**
 * One series over time: a 2px line with 8px markers and the last value printed
 * beside it. A missing value (a month with no income has no margin) breaks the
 * line instead of drawing a slope through nothing. Tap a point for its figure.
 *
 * <p>Each point sits at the middle of its bucket, so the first one stands clear
 * of the axis labels. Past five buckets the plot scrolls sideways.
 */
export function LineChart({
  accessibilityLabel,
  buckets,
  color: lineColor,
  formatTick,
  formatValue,
  reference,
}: {
  accessibilityLabel: string;
  buckets: LineBucket[];
  /** The series' own colour when a card switches between series. Defaults to the first series colour. */
  color?: string;
  formatTick: (value: number) => string;
  formatValue: (value: number) => string;
  /**
   * A dashed line across the chart with its label at the right, e.g. the
   * period's average, so a point's own figure is not mistaken for it.
   */
  reference?: { label: string; value: number };
}) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const [selected, setSelected] = useState<string | null>(null);
  const height = 160;
  const left = 44;
  const top = 22;
  const bottom = 26;
  const baseline = height - bottom;
  const plot = baseline - top;
  const values = buckets.map((bucket) => bucket.value);
  const { max, min, ticks } = signedScale([...values.filter((value): value is number => value !== null), ...(reference ? [reference.value] : [])]);
  const span = max - min || 1;
  const y = (value: number) => baseline - ((value - min) / span) * plot;
  const lastIndex = values.reduce<number>((last, value, index) => (value !== null ? index : last), -1);
  const color = lineColor ?? palette.series[0];

  return (
    <PlotScroller
      accessibilityLabel={accessibilityLabel}
      axisWidth={left}
      bucketCount={buckets.length}
      height={height}
      renderAxis={() => (
        <Svg height={height} width={left}>
          {ticks.map((tick) => (
            <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} key={`tick-${tick}`} textAnchor="end" x={left - 6} y={y(tick) + 4}>
              {formatTick(tick)}
            </SvgText>
          ))}
        </Svg>
      )}
      // Held at the right of what shows, not at the end of the plot, where it
      // would be out of sight until the last month is scrolled to.
      renderOverlay={() =>
        reference ? (
          <Text
            pointerEvents="none"
            style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 10, position: "absolute", right: 0, top: y(reference.value) + 3 }}
          >
            {reference.label}
          </Text>
        ) : null
      }
      renderPlot={({ contentWidth, slot }) => {
        const x = (index: number) => index * slot + slot / 2;
        const segments = lineSegments(values, x, y);
        return (
          <>
            <Svg height={height} width={contentWidth}>
              {ticks.map((tick) => (
                <Line key={`grid-${tick}`} stroke={tick === 0 ? palette.baseline : palette.grid} strokeWidth={tick === 0 ? 1 : 0.6} x1={0} x2={contentWidth} y1={y(tick)} y2={y(tick)} />
              ))}
              {reference ? (
                <Line stroke={colors.ink} strokeDasharray="4 3" strokeWidth={1.2} x1={0} x2={contentWidth} y1={y(reference.value)} y2={y(reference.value)} />
              ) : null}
              {segments.map((segment) =>
                segment.length > 1 ? (
                  <Polyline
                    fill="none"
                    key={`line-${segment[0].index}`}
                    points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
                    stroke={color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                ) : null,
              )}
              {segments.flat().map((point) => (
                <Circle
                  cx={point.x}
                  cy={point.y}
                  fill={color}
                  key={`point-${point.index}`}
                  r={4}
                  stroke={colors.surface}
                  strokeWidth={2}
                />
              ))}
              {segments.flat().map((point) =>
                point.index === lastIndex || selected === buckets[point.index].key ? (
                  <SvgText fill={colors.ink} fontFamily={fonts.sansSemiBold} fontSize={11} key={`value-${point.index}`} textAnchor="middle" x={point.x} y={point.y - 9}>
                    {formatValue(values[point.index] as number)}
                  </SvgText>
                ) : null,
              )}
              {buckets.map((bucket, index) => (
                <G key={`label-${bucket.key}`}>
                  <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} textAnchor="middle" x={x(index)} y={baseline + 17}>
                    {bucket.label}
                  </SvgText>
                </G>
              ))}
            </Svg>
            <TapSlots
              height={plot}
              onPress={(key) => setSelected((current) => (current === key ? null : key))}
              slots={buckets.map((bucket, index) => ({
                key: bucket.key,
                label: `${bucket.label} ${bucket.value === null ? "no value" : formatValue(bucket.value)}`,
                width: slot,
                x: index * slot,
              }))}
              top={top}
            />
          </>
        );
      }}
    />
  );
}
