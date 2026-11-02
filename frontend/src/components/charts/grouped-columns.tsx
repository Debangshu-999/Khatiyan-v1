import Svg, { Line, Path, Text as SvgText } from "react-native-svg";

import { PlotScroller } from "@/components/charts/plot-scroller";
import { TapSlots } from "@/components/charts/tap-slots";
import { useChartPalette } from "@/theme/chart-colors";
import { useTheme } from "@/theme/use-theme";

export type ColumnSeries = { key: string; color: string; values: (number | null)[] };

const MAX_BAR = 12;
const BAR_GAP = 2;

/**
 * Several series side by side in each bucket, on one fixed axis, rising from the
 * baseline with rounded tops. A missing value leaves its place empty, and the plot
 * scrolls sideways past five buckets. Tapping a bucket reports it, so the legend beside
 * the chart can print every series' figure for it, and the other buckets step back.
 */
export function GroupedColumns({
  accessibilityLabel,
  buckets,
  onSelect,
  scale,
  selected,
  series,
}: {
  accessibilityLabel: string;
  buckets: { key: string; label: string }[];
  onSelect: (key: string | null) => void;
  scale: { max: number; min: number; ticks: number[] };
  selected: string | null;
  series: ColumnSeries[];
}) {
  const { fonts } = useTheme();
  const palette = useChartPalette();
  const height = 160;
  const left = 32;
  const top = 12;
  const bottom = 26;
  const baseline = height - bottom;
  const plot = baseline - top;
  const y = (value: number) => baseline - ((value - scale.min) / (scale.max - scale.min || 1)) * plot;

  return (
    <PlotScroller
      accessibilityLabel={accessibilityLabel}
      axisWidth={left}
      bucketCount={buckets.length}
      height={height}
      renderAxis={() => (
        <Svg height={height} width={left}>
          {scale.ticks.map((tick) => (
            <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} key={`tick-${tick}`} textAnchor="end" x={left - 6} y={y(tick) + 4}>
              {String(tick)}
            </SvgText>
          ))}
        </Svg>
      )}
      renderPlot={({ contentWidth, slot }) => {
        const count = Math.max(series.length, 1);
        const bar = Math.min(MAX_BAR, Math.max(3, (slot * 0.76 - BAR_GAP * (count - 1)) / count));
        const group = bar * count + BAR_GAP * (count - 1);
        return (
          <>
            <Svg height={height} width={contentWidth}>
              {scale.ticks.map((tick) => (
                <Line key={`grid-${tick}`} stroke={palette.grid} strokeWidth={0.6} x1={0} x2={contentWidth} y1={y(tick)} y2={y(tick)} />
              ))}
              <Line stroke={palette.baseline} strokeWidth={1} x1={0} x2={contentWidth} y1={baseline} y2={baseline} />
              {buckets.flatMap((bucket, bucketIndex) =>
                series.map((column, seriesIndex) => {
                  const value = column.values[bucketIndex];
                  if (value == null) {
                    return null;
                  }
                  const x = bucketIndex * slot + (slot - group) / 2 + seriesIndex * (bar + BAR_GAP);
                  const rise = y(value);
                  const radius = Math.min(3, bar / 2, baseline - rise);
                  return (
                    <Path
                      d={`M${x} ${baseline}V${rise + radius}Q${x} ${rise} ${x + radius} ${rise}H${x + bar - radius}Q${x + bar} ${rise} ${x + bar} ${rise + radius}V${baseline}Z`}
                      fill={column.color}
                      key={`bar-${column.key}-${bucket.key}`}
                      opacity={selected && selected !== bucket.key ? 0.35 : 1}
                    />
                  );
                }),
              )}
              {buckets.map((bucket, index) => (
                <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} key={`label-${bucket.key}`} textAnchor="middle" x={index * slot + slot / 2} y={baseline + 17}>
                  {bucket.label}
                </SvgText>
              ))}
            </Svg>
            <TapSlots
              height={plot}
              onPress={(key) => onSelect(selected === key ? null : key)}
              slots={buckets.map((bucket, index) => ({ key: bucket.key, label: bucket.label, width: slot, x: index * slot }))}
              top={top}
            />
          </>
        );
      }}
    />
  );
}
