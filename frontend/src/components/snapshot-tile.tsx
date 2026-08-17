import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideProps } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
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

export function SnapshotTile({ count, delta, icon: Icon, label, lowerIsBetter, tone = "default", total, value }: SnapshotTileProps) {
  const { colors, fonts, type } = useTheme();
  const accent = tone === "danger" ? colors.danger : tone === "primary" ? colors.primary : colors.primary;
  const accentSoft = tone === "danger" ? colors.dangerSoft : colors.primarySoft;
  const valueColor = tone === "danger" ? colors.danger : colors.ink;
  const isFraction = typeof count === "number" && typeof total === "number";
  // Current count stays faded until the stay/cycle is full, then it matches the
  // dark total — a quick visual cue that there is no remaining headroom.
  const currentColor = isFraction && count! >= total! && total! > 0 ? colors.ink : colors.muted;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.md,
      }}
    >
      {/* Glyph only. The tile is already a bounded surface; a tinted square
          inside it reads as a second, competing container. */}
      <View style={{ alignItems: "center", height: 40, justifyContent: "center", width: 40 }}>
        <Icon color={colors.ink} size={20} strokeWidth={2.2} />
      </View>

      <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]} numberOfLines={1}>
        {label}
      </Text>

      {isFraction ? (
        <Text style={{ fontFamily: fonts.display, fontSize: 24, fontVariant: ["tabular-nums"], letterSpacing: -0.5 }}>
          <Text style={{ color: currentColor }}>{count}</Text>
          <Text style={{ color: colors.ink }}>/{total}</Text>
        </Text>
      ) : (
        <Text
          style={{ color: valueColor, fontFamily: fonts.display, fontSize: 24, fontVariant: ["tabular-nums"], letterSpacing: -0.5, textAlign: "center" }}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}

      {delta ? (
        <DeltaChip current={delta.current} lowerIsBetter={lowerIsBetter} previous={delta.previous} />
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
    <View style={{ alignItems: "center", flexDirection: "row", gap: 2 }}>
      <Icon color={color} size={13} strokeWidth={2.6} />
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: 11, }}>
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
