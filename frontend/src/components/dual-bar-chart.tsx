import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { Card } from "@/components/card";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// A fixed viewBox the SVG scales to the card's real width, which is what keeps
// the bar spacing even at any screen size — the same approach as PnlTrendChart.
const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 172;
const PAD_TOP = 12;
// Room under the baseline for the month names.
const PAD_BOTTOM = 20;
const PAD_RIGHT = 8;

// The ladders a ceiling is rounded up to. Fine enough that the tallest bar
// always fills at least about three quarters of the chart, coarse enough that
// the number printed on the axis is still a round one.
const STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

export type DualBarChartPoint = {
  label: string;
  primary: number;
  secondary: number;
  /**
   * Optional third value drawn as a line across the bars rather than beside
   * them — a target the bars are read against, not a third thing being
   * compared. Months without one break out of the line rather than plotting
   * zero, because "no budget set" is not "a budget of nothing".
   */
  line?: number | null;
};

type DualBarChartMode = "count" | "money";

/**
 * Two series a month, drawn as a pair of bars per month on a shared scale, with
 * an optional reference line over the top.
 *
 * <p>Sibling to {@link TrendBarChart}, which draws one series. Split rather than
 * folded into it because the second bar changes the geometry: a pair needs a
 * legend, half the width each, and — since one series can go negative where a
 * single trend never does — a zero line that moves.
 *
 * <p>Negative values (a month that overspent its budget) drop below the zero
 * line rather than being clamped to it. A month ₹5,000 over reads as a bar
 * hanging under the line, which is the shape of the fact; clamped at zero it
 * would look identical to a month that broke exactly even.
 */
export function DualBarChart({
  data,
  lineColor,
  lineLabel,
  mode = "count",
  primaryColor,
  primaryLabel,
  secondaryColor,
  secondaryLabel,
  title,
}: {
  data: DualBarChartPoint[];
  lineColor?: string;
  lineLabel?: string;
  mode?: DualBarChartMode;
  primaryColor?: string;
  primaryLabel: string;
  secondaryColor?: string;
  secondaryLabel: string;
  /** Omitted when the caller already sits under a section heading. */
  title?: string;
}) {
  const { colors, fonts, type } = useTheme();
  const rise = primaryColor ?? colors.primary;
  const fall = secondaryColor ?? colors.jade;
  const guide = lineColor ?? colors.primary;
  const hasLine = data.some((point) => typeof point.line === "number");

  const values = data.flatMap((point) => [
    point.primary,
    point.secondary,
    ...(typeof point.line === "number" ? [point.line] : []),
  ]);
  // Rounded UP to a round number rather than sitting exactly on the tallest
  // month. Scaled to the raw peak, the best month always touches the ceiling —
  // so every chart looks equally full, the tallest bar can never be seen to
  // grow, and the axis is labelled with an arbitrary number like ₹47,231.
  const peak = niceCeiling(Math.max(...values, 0), mode);
  const floor = -niceCeiling(Math.abs(Math.min(...values, 0)), mode);
  // Never zero, or every bar divides by nothing and the chart collapses.
  const span = Math.max(peak - floor, 1);

  const padLeft = mode === "money" ? 42 : 24;
  const plotHeight = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotWidth = VIEW_WIDTH - padLeft - PAD_RIGHT;
  const scale = plotHeight / span;
  const zeroY = PAD_TOP + peak * scale;

  const groupWidth = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.min(13, groupWidth / 3.4);
  const centreOf = (index: number) => padLeft + groupWidth * index + groupWidth / 2;

  const linePoints = data
    .map((point, index) => (typeof point.line === "number" ? `${centreOf(index)},${zeroY - point.line * scale}` : null))
    .filter((entry): entry is string => entry !== null)
    .join(" ");

  return (
    <Card>
      {/* Legend under the title, not beside it. Three keys and a serif heading
          on one line left the title truncating and the keys crushed against the
          right edge; stacked, both get the width they need. */}
      <View style={{ gap: 6 }}>
        {title ? (
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.3 }} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Legend color={rise} label={primaryLabel} />
          <Legend color={fall} label={secondaryLabel} />
          {hasLine && lineLabel ? <Legend color={guide} label={lineLabel} line /> : null}
        </View>
      </View>

      <View style={{ marginTop: spacing.sm }}>
        <Svg height={VIEW_HEIGHT} width="100%" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
          {/* The ceiling faint, the baseline solid: with negative months on the
              chart, zero is the reading everything else is against. */}
          {peak > 0 ? (
            <Line stroke={colors.border} strokeWidth={1} x1={padLeft} x2={VIEW_WIDTH - PAD_RIGHT} y1={PAD_TOP} y2={PAD_TOP} />
          ) : null}
          <Line stroke={colors.borderStrong} strokeWidth={1} x1={padLeft} x2={VIEW_WIDTH - PAD_RIGHT} y1={zeroY} y2={zeroY} />

          {peak > 0 ? (
            <SvgText fill={colors.kicker} fontSize={9} textAnchor="end" x={padLeft - 6} y={PAD_TOP + 3}>
              {axisLabel(peak, mode)}
            </SvgText>
          ) : null}
          <SvgText fill={colors.kicker} fontSize={9} textAnchor="end" x={padLeft - 6} y={zeroY + 3}>
            {axisLabel(0, mode)}
          </SvgText>
          {floor < 0 ? (
            <SvgText fill={colors.kicker} fontSize={9} textAnchor="end" x={padLeft - 6} y={VIEW_HEIGHT - PAD_BOTTOM + 3}>
              {axisLabel(floor, mode)}
            </SvgText>
          ) : null}

          {data.map((point, index) => (
            <Bar
              color={rise}
              key={`primary-${point.label}-${index}`}
              scale={scale}
              value={point.primary}
              width={barWidth}
              x={centreOf(index) - barWidth - 2}
              zeroY={zeroY}
            />
          ))}
          {data.map((point, index) => (
            <Bar
              color={fall}
              key={`secondary-${point.label}-${index}`}
              scale={scale}
              value={point.secondary}
              width={barWidth}
              x={centreOf(index) + 2}
              zeroY={zeroY}
            />
          ))}

          {linePoints ? <Polyline fill="none" points={linePoints} stroke={guide} strokeWidth={2} /> : null}
          {/* A dot at each month as well, so a single month with a budget still
              shows one — a polyline of one point draws nothing at all. */}
          {data.map((point, index) =>
            typeof point.line === "number" ? (
              <Circle
                cx={centreOf(index)}
                cy={zeroY - point.line * scale}
                fill={guide}
                key={`line-${point.label}-${index}`}
                r={2.5}
              />
            ) : null,
          )}

          {data.map((point, index) => (
            <SvgText fill={colors.muted} fontSize={9} key={`label-${point.label}-${index}`} textAnchor="middle" x={centreOf(index)} y={VIEW_HEIGHT - 4}>
              {point.label}
            </SvgText>
          ))}
        </Svg>
      </View>
    </Card>
  );
}

function Bar({
  color,
  scale,
  value,
  width,
  x,
  zeroY,
}: {
  color: string;
  scale: number;
  value: number;
  width: number;
  x: number;
  zeroY: number;
}) {
  if (value === 0) {
    return null;
  }

  const height = Math.abs(value) * scale;
  return <Rect fill={color} height={Math.max(height, 1.5)} rx={2} width={width} x={x} y={value >= 0 ? zeroY - height : zeroY} />;
}

function Legend({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
      <View style={{ backgroundColor: color, borderRadius: line ? 999 : 2, height: line ? 3 : 9, width: line ? 13 : 9 }} />
      <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>{label}</Text>
    </View>
  );
}

/**
 * The next round number at or above a value — the chart's ceiling.
 *
 * <p>Climbs from the value's own magnitude rather than from a fixed floor. An
 * earlier version anchored money at ₹1,00,000 and doubled, copying the
 * collection chart — which is right for a month's rent and badly wrong for
 * everything else: a property spending ₹15,000 got a ₹1,00,000 ceiling and six
 * months of bars an eighth of an inch tall.
 */
function niceCeiling(value: number, mode: DualBarChartMode) {
  if (value <= 0) {
    return 0;
  }

  // Start one order of magnitude below the value, so the ladder is walked from
  // just under it rather than from 1.
  let magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (;;) {
    for (const step of STEPS) {
      const candidate = step * magnitude;
      if (value <= candidate) {
        // Counts round up to a whole one: a headcount axis topping out at 1.2
        // is nonsense, and rounding DOWN would put the ceiling under the bar.
        return Math.ceil(candidate);
      }
    }
    magnitude *= 10;
  }
}

function axisLabel(value: number, mode: DualBarChartMode) {
  return mode === "money" ? formatAxisMoney(value) : String(Math.round(value));
}

// Compact rupee label for the y-axis ticks (₹1.4L, -₹50K, ₹2Cr ...).
function formatAxisMoney(paise: number) {
  const rupees = paise / 100;
  const sign = rupees < 0 ? "-" : "";
  const size = Math.abs(rupees);
  if (size >= 1e7) {
    return `${sign}₹${trimUnit(size / 1e7)}Cr`;
  }
  if (size >= 1e5) {
    return `${sign}₹${trimUnit(size / 1e5)}L`;
  }
  if (size >= 1e3) {
    return `${sign}₹${trimUnit(size / 1e3)}K`;
  }
  return `${sign}₹${Math.round(size)}`;
}

function trimUnit(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
