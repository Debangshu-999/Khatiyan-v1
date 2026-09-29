import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";

import { axisScale, roundedTopBarPath } from "@/features/analytics/chart-math";
import { TapSlots } from "@/components/charts/tap-slots";
import { useChartPalette } from "@/theme/chart-colors";
import { useTheme } from "@/theme/use-theme";

export type BudgetMonth = { key: string; label: string; spent: number; budget: number | null };

/**
 * Spend per month as columns, with each month's budget as a dashed mark across
 * its column. A month over budget turns its column red.
 *
 * <p>Tap a month for a small floating callout card, centred over the month,
 * with a leader line from its middle down to the budget line (user,
 * 2026-09-28). The card is a View over the chart, not SVG text, so it can
 * float past the chart's edge instead of being cut off like the old label on
 * the last bar.
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
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  // The callout's own size, measured, so it can be kept inside the chart.
  const [callout, setCallout] = useState<{ height: number; width: number } | null>(null);
  const height = 160;
  const left = 44;
  const top = 20;
  const bottom = 26;
  const baseline = height - bottom;
  const plot = baseline - top;
  const max = Math.max(0, ...months.flatMap((month) => [month.spent, month.budget ?? 0]));
  const { ceiling, ticks } = axisScale(max, false);
  const slot = months.length > 0 ? (width - left) / months.length : 0;
  const barWidth = Math.min(34, slot * 0.5);

  // Where the selected month's callout points and sits. It points at the
  // budget line, or at the top of the column when the month has no budget.
  const selectedIndex = months.findIndex((month) => month.key === selected);
  const selectedMonth = selectedIndex >= 0 ? months[selectedIndex] : null;
  const anchor = selectedMonth
    ? (() => {
        const center = left + selectedIndex * slot + slot / 2;
        const spentTop = baseline - (ceiling > 0 ? (selectedMonth.spent / ceiling) * plot : 0);
        const budgetY = selectedMonth.budget !== null && ceiling > 0
          ? baseline - (selectedMonth.budget / ceiling) * plot
          : null;
        return { x: center, y: budgetY ?? spentTop };
      })()
    : null;
  // Always above its point, centred on it, and free to float past the chart's
  // edges (user, 2026-09-28). It used to drop below the line when the top was
  // tight, which on a device turned a middle month's pointer upside down.
  const cardPlacement = anchor && callout
    ? {
        left: anchor.x - callout.width / 2,
        top: anchor.y - CALLOUT_GAP - callout.height,
      }
    : null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      // Visible overflow, so a callout near the edge floats past it.
      style={{ height, overflow: "visible", zIndex: selected ? 2 : 0 }}
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
          {months.map((month, index) => {
            const center = left + index * slot + slot / 2;
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
                {isSelected && anchor && cardPlacement && callout ? (
                  <G>
                    <Line
                      stroke={colors.ink}
                      strokeWidth={1}
                      x1={anchor.x}
                      x2={anchor.x}
                      y1={cardPlacement.top + callout.height}
                      y2={anchor.y}
                    />
                    <Circle cx={anchor.x} cy={anchor.y} fill={colors.ink} r={3} />
                  </G>
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
          slots={months.map((month, index) => ({
            key: month.key,
            label: `${month.label}: spent ${formatValue(month.spent)}${month.budget !== null ? ` of ${formatValue(month.budget)}` : ""}`,
            width: slot,
            x: left + index * slot,
          }))}
          top={top}
        />
      ) : null}
      {selectedMonth && anchor ? (
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
            left: cardPlacement?.left ?? 0,
            opacity: cardPlacement ? 1 : 0,
            paddingHorizontal: 8,
            paddingVertical: 5,
            position: "absolute",
            shadowColor: colors.shadow,
            shadowOffset: { height: 2, width: 0 },
            shadowOpacity: 0.12,
            shadowRadius: 6,
            top: cardPlacement?.top ?? 0,
          }}
        >
          <Text style={{ color: colors.surface, fontFamily: fonts.sansSemiBold, fontSize: 11.5 }}>
            Spent {formatValue(selectedMonth.spent)}
          </Text>
          <Text style={{ color: colors.surface, fontFamily: fonts.sans, fontSize: 11, opacity: 0.75 }}>
            {selectedMonth.budget !== null ? `Budget ${formatValue(selectedMonth.budget)}` : "No budget set"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
