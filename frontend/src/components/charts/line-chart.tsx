import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";

import { TapSlots } from "@/components/charts/tap-slots";
import { lineSegments, signedScale } from "@/features/analytics/chart-math";
import { useChartPalette } from "@/theme/chart-colors";
import { useTheme } from "@/theme/use-theme";

export type LineBucket = { key: string; label: string; value: number | null };

/**
 * One series over time: a 2px line with 8px markers and the last value printed
 * beside it. A missing value (a month with no income has no margin) breaks the
 * line instead of drawing a slope through nothing. Tap a point for its figure.
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
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const height = 160;
  const left = 44;
  const right = 18;
  const top = 22;
  const bottom = 26;
  const baseline = height - bottom;
  const plot = baseline - top;
  const values = buckets.map((bucket) => bucket.value);
  const { max, min, ticks } = signedScale([...values.filter((value): value is number => value !== null), ...(reference ? [reference.value] : [])]);
  const span = max - min || 1;
  const step = buckets.length > 1 ? (width - left - right) / (buckets.length - 1) : 0;
  const x = (index: number) => (buckets.length > 1 ? left + index * step : left + (width - left - right) / 2);
  const y = (value: number) => baseline - ((value - min) / span) * plot;
  const segments = width > 0 ? lineSegments(values, x, y) : [];
  const lastIndex = values.reduce<number>((last, value, index) => (value !== null ? index : last), -1);
  const color = lineColor ?? palette.series[0];

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
          {ticks.map((tick) => (
            <G key={`tick-${tick}`}>
              <Line stroke={tick === 0 ? palette.baseline : palette.grid} strokeWidth={tick === 0 ? 1 : 0.6} x1={left} x2={width} y1={y(tick)} y2={y(tick)} />
              <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} textAnchor="end" x={left - 6} y={y(tick) + 4}>
                {formatTick(tick)}
              </SvgText>
            </G>
          ))}
          {reference ? (
            <G>
              <Line stroke={colors.ink} strokeDasharray="4 3" strokeWidth={1.2} x1={left} x2={width - right} y1={y(reference.value)} y2={y(reference.value)} />
              <SvgText fill={colors.ink} fontFamily={fonts.sansSemiBold} fontSize={10} textAnchor="end" x={width - right} y={y(reference.value) + 13}>
                {reference.label}
              </SvgText>
            </G>
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
            <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} key={`label-${bucket.key}`} textAnchor="middle" x={x(index)} y={baseline + 17}>
              {bucket.label}
            </SvgText>
          ))}
        </Svg>
      ) : null}
      {width > 0 ? (
        <TapSlots
          height={plot}
          onPress={(key) => setSelected((current) => (current === key ? null : key))}
          slots={buckets.map((bucket, index) => {
            const slotWidth = buckets.length > 1 ? step : width - left - right;
            return {
              key: bucket.key,
              label: `${bucket.label} ${bucket.value === null ? "no value" : formatValue(bucket.value)}`,
              width: slotWidth,
              x: x(index) - slotWidth / 2,
            };
          })}
          top={top}
        />
      ) : null}
    </View>
  );
}
