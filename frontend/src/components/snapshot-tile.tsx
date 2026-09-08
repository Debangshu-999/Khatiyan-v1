import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideProps } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
import { metricFontSize } from "@/theme/metric-size";
import { useTheme } from "@/theme/use-theme";

type SnapshotTone = "default" | "primary" | "danger";

export type SnapshotDelta = {
  current: number;
  previous: number;
};

type SnapshotTileProps = {
  icon: ComponentType<LucideProps>;
  label: string;
  /** Single formatted value (e.g. a money string or plain count). */
  value?: string;
  /** Fraction numerator. When provided with {@link total}, renders `count/total`. */
  count?: number;
  /** Fraction denominator. */
  total?: number;
  /** Month-over-month comparison; renders a small up/down delta chip. */
  delta?: SnapshotDelta;
  /**
   * Colours a FALL green instead of red — for metrics where less is better.
   *
   * <p>The arrow still points the way the number moved; only the meaning
   * changes. Fewer tenancies ending than last month is good news, and painting
   * it red because the line went down tells the owner the opposite.
   */
  lowerIsBetter?: boolean;
  tone?: SnapshotTone;
};

/**
 * One figure inside a dashboard snapshot, in the app's one metric-card shape.
 *
 * <p>
 * A 38pt ink glyph in a 44-wide rail, then the label, the number and any delta
 * stacked beside it. The same card the billing summary, the concern overview
 * and the tenancy snapshot use — before this it was the odd one out: centred,
 * glyph on top, everything middle-aligned, so the same kind of statistic looked
 * like a different kind of thing depending on which screen you met it on.
 *
 * <p>
 * The glyph is ink whatever the tone. Tone lives in the NUMBER, which is what
 * gets read; a red icon beside a red figure says the same thing twice and a
 * blue one beside a black figure competes with it.
 */
export function SnapshotTile({ count, delta, icon: Icon, label, lowerIsBetter, tone = "default", total, value }: SnapshotTileProps) {
  const { colors, fonts, type } = useTheme();
  const valueColor = tone === "danger" ? colors.danger : colors.ink;
  const isFraction = typeof count === "number" && typeof total === "number";
  // Current count stays faded until the stay/cycle is full, then it matches the
  // dark total — a quick visual cue that there is no remaining headroom.
  const currentColor = isFraction && count! >= total! && total! > 0 ? colors.ink : colors.muted;

  // Sized by how long the figure is — see metricFontSize.
  const valueSize = metricFontSize(isFraction ? `${count}/${total}` : value ?? "", 23);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        // Centred, because tiles in a row stretch to the tallest of them. A tile
        // with no delta — On notice has no previous-month figure to compare
        // against — is shorter than its neighbour, and top-aligned its glyph and
        // number sat against the ceiling with the spare height below.
        justifyContent: "center",
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        {/* Glyph only. The tile is already a bounded surface; a tinted square
            inside it reads as a second, competing container. */}
        <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
          <Icon color={colors.ink} size={38} strokeWidth={1.75} />
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={2} style={[type.caption, { color: colors.muted, fontSize: 13, lineHeight: 17 }]}>
            {label}
          </Text>

          {isFraction ? (
            <Text style={{ fontFamily: fonts.display, fontSize: valueSize, fontVariant: ["tabular-nums"], lineHeight: valueSize + 5 }}>
              <Text style={{ color: currentColor }}>{count}</Text>
              <Text style={{ color: colors.ink }}>/{total}</Text>
            </Text>
          ) : (
            <Text
              numberOfLines={1}
              style={{ color: valueColor, fontFamily: fonts.display, fontSize: valueSize, fontVariant: ["tabular-nums"], lineHeight: valueSize + 5 }}
            >
              {value}
            </Text>
          )}

        </View>
      </View>

      {/* Under the row, on the tile's full width. In the column beside a 38pt
          glyph the phrase had about half a tile and wrapped to two lines, which
          made one tile taller than the one next to it. */}
      {delta ? (
        <View style={{ marginTop: spacing.xs }}>
          <DeltaChip current={delta.current} lowerIsBetter={lowerIsBetter} previous={delta.previous} />
        </View>
      ) : null}
    </View>
  );
}

function DeltaChip({ current, lowerIsBetter, previous }: SnapshotDelta & { lowerIsBetter?: boolean }) {
  const { colors, fonts } = useTheme();
  const percent = deltaPercent(current, previous);
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  // The arrow follows the number; the colour follows whether that is good.
  const good = lowerIsBetter ? direction === "down" : direction === "up";
  const color = direction === "flat" ? colors.muted : good ? colors.successText : colors.danger;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 3 }}>
      <Icon color={color} size={13} strokeWidth={2.6} style={{ marginTop: 1 }} />
      {/* flexShrink so the phrase wraps inside the column rather than running
          past the tile's edge — the rail leaves it about half a tile's width. */}
      <Text style={{ color, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 15 }}>
        {Math.abs(percent)}% vs last month
      </Text>
    </View>
  );
}

function deltaPercent(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return Math.round(((current - previous) / previous) * 100);
}
