import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";

import { PlotScroller } from "@/components/charts/plot-scroller";
import { axisScale, roundedTopBarPath } from "@/features/analytics/chart-math";
import { TapSlots } from "@/components/charts/tap-slots";
import { useChartPalette } from "@/theme/chart-colors";
import { useTheme } from "@/theme/use-theme";

export type BudgetMonth = { key: string; label: string; spent: number; budget: number | null };

/**
 * Spend per month as columns, with each month's budget as a dashed mark across
 * its column. A month over budget turns its column red. Past five months the
 * plot scrolls sideways.
 *
 * <p>Tap a month for a small floating callout card, centred over the month,
 * with a leader line from its middle down to the budget line (user,
 * 2026-09-28). The card is a View over the chart, not SVG text, so it can
 * float past the chart's edge instead of being cut off like the old label on
 * the last bar. It is drawn over the scroll, not inside it, for the same
 * reason, and it goes away when the plot is moved, because it names a place.
 */

/** Gap between the callout card and the point it names. */
const CALLOUT_GAP = 26;
export function BudgetColumns({
  accessibilityLabel,
  formatTick,
  formatValue,
  months,
}: {
  accessibilityLabel: string;
  formatTick: (value: number) => string;
  formatValue: (value: number) => string;
  months: BudgetMonth[];
}) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const [selected, setSelected] = useState<string | null>(null);
  // The callout's own size, measured, so it can be centred on its month.
  const [callout, setCallout] = useState<{ height: number; width: number } | null>(null);
  const height = 160;
  const left = 44;
  const top = 20;
  const bottom = 26;
  const baseline = height - bottom;
  const plot = baseline - top;
  const max = Math.max(0, ...months.flatMap((month) => [month.spent, month.budget ?? 0]));
  const { ceiling, ticks } = axisScale(max, false);
  const tickY = (tick: number) => baseline - (tick / ceiling) * plot;

  // Where the selected month's callout points. It points at the budget line, or
  // at the top of the column when the month has no budget.
  const selectedIndex = months.findIndex((month) => month.key === selected);
  const selectedMonth = selectedIndex >= 0 ? months[selectedIndex] : null;
  const anchorY = selectedMonth
    ? (() => {
        const spentTop = baseline - (ceiling > 0 ? (selectedMonth.spent / ceiling) * plot : 0);
        const budgetY = selectedMonth.budget !== null && ceiling > 0
          ? baseline - (selectedMonth.budget / ceiling) * plot
          : null;
        return budgetY ?? spentTop;
      })()
    : null;
  // Always above its point (user, 2026-09-28). It used to drop below the line
  // when the top was tight, which on a device turned a middle month's pointer
  // upside down.
  const cardTop = anchorY !== null && callout ? anchorY - CALLOUT_GAP - callout.height : null;

  return (
    <PlotScroller
      accessibilityLabel={accessibilityLabel}
      axisWidth={left}
      bucketCount={months.length}
      height={height}
      onScroll={() => setSelected(null)}
      raised={selected !== null}
      renderAxis={() => (
        <Svg height={height} width={left}>
          {ticks.map((tick) => (
            <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} key={`tick-${tick}`} textAnchor="end" x={left - 6} y={tickY(tick) + 4}>
              {formatTick(tick)}
            </SvgText>
          ))}
        </Svg>
      )}
      renderOverlay={({ scrollX, slot }) =>
        selectedMonth && anchorY !== null ? (
          <View
            onLayout={(event) => {
              const next = {
                height: Math.round(event.nativeEvent.layout.height),
                width: Math.round(event.nativeEvent.layout.width),
              };
              setCallout((current) =>
                current && current.height === next.height && current.width === next.width ? current : next,
              );
            }}
            pointerEvents="none"
            // A dark card with light text, so it stands off the chart
            // (user, 2026-09-28). `ink` and `surface` swap in dark mode, so it
            // stays the inverse of the page either way.
            style={{
              backgroundColor: colors.ink,
              borderRadius: 8,
              // Centred on its month, and free to float past the chart's edges.
              left: callout ? left + selectedIndex * slot + slot / 2 - scrollX - callout.width / 2 : 0,
              opacity: callout ? 1 : 0,
              paddingHorizontal: 8,
              paddingVertical: 5,
              position: "absolute",
              shadowColor: colors.shadow,
              shadowOffset: { height: 2, width: 0 },
              shadowOpacity: 0.12,
              shadowRadius: 6,
              top: cardTop ?? 0,
            }}
          >
            <Text style={{ color: colors.surface, fontFamily: fonts.sansSemiBold, fontSize: 11.5 }}>
              Spent {formatValue(selectedMonth.spent)}
            </Text>
            <Text style={{ color: colors.surface, fontFamily: fonts.sans, fontSize: 11, opacity: 0.75 }}>
              {selectedMonth.budget !== null ? `Budget ${formatValue(selectedMonth.budget)}` : "No budget set"}
            </Text>
          </View>
        ) : null
      }
      renderPlot={({ contentWidth, slot }) => {
        const barWidth = Math.min(34, slot * 0.5);
        return (
          <>
            <Svg height={height} width={contentWidth}>
              {ticks.map((tick) => (
                <Line key={`grid-${tick}`} stroke={tick === 0 ? palette.baseline : palette.grid} strokeWidth={tick === 0 ? 1 : 0.6} x1={0} x2={contentWidth} y1={tickY(tick)} y2={tickY(tick)} />
              ))}
              {months.map((month, index) => {
                const center = index * slot + slot / 2;
                const spentHeight = ceiling > 0 ? (month.spent / ceiling) * plot : 0;
                const over = month.budget !== null && month.spent > month.budget;
                const budgetY = month.budget !== null && ceiling > 0 ? baseline - (month.budget / ceiling) * plot : null;
                const isSelected = selected === month.key;
                return (
                  <G key={month.key}>
                    <Path d={roundedTopBarPath(center - barWidth / 2, baseline, barWidth, spentHeight)} fill={over ? palette.status.critical : palette.series[0]} />
                    {budgetY !== null ? (
                      <Line stroke={colors.ink} strokeDasharray="4 3" strokeWidth={1.5} x1={center - barWidth / 2 - 6} x2={center + barWidth / 2 + 6} y1={budgetY} y2={budgetY} />
                    ) : null}
                    <SvgText fill={palette.axis} fontFamily={fonts.sans} fontSize={11} textAnchor="middle" x={center} y={baseline + 17}>
                      {month.label}
                    </SvgText>
                    {/* The leader line from the callout card to the point it names. */}
                    {isSelected && anchorY !== null && cardTop !== null && callout ? (
                      <G>
                        <Line stroke={colors.ink} strokeWidth={1} x1={center} x2={center} y1={cardTop + callout.height} y2={anchorY} />
                        <Circle cx={center} cy={anchorY} fill={colors.ink} r={3} />
                      </G>
                    ) : null}
                  </G>
                );
              })}
            </Svg>
            <TapSlots
              height={plot}
              onPress={(key) => setSelected((current) => (current === key ? null : key))}
              slots={months.map((month, index) => ({
                key: month.key,
                label: `${month.label}: spent ${formatValue(month.spent)}${month.budget !== null ? ` of ${formatValue(month.budget)}` : ""}`,
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
