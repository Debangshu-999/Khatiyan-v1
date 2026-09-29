import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ArrowDownRight, ArrowUpRight } from "lucide-react-native";

import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type Delta = { text: string; direction: "up" | "down"; tone: "good" | "bad" | "neutral" };

function DeltaLine({ delta }: { delta: Delta }) {
  const { colors, fonts } = useTheme();
  const color = delta.tone === "good" ? colors.successText : delta.tone === "bad" ? colors.danger : colors.muted;
  const Icon = delta.direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 2 }}>
      <Icon color={color} size={13} strokeWidth={2.2} />
      <Text style={{ color, fontFamily: fonts.sans, fontSize: 12 }}>{delta.text}</Text>
    </View>
  );
}

/**
 * One number, what it is, and how it moved. Full width by default: tiles stack as
 * rows. Pass {@code style={{ flex: 1 }}} to sit two side by side.
 */
export function StatTile({
  caption,
  danger,
  delta,
  label,
  muted,
  style,
  value,
}: {
  caption?: string;
  /** A figure that is bad in itself, such as a loss: the value turns red. */
  danger?: boolean;
  delta?: Delta | null;
  label: string;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const valueColor = danger ? colors.danger : muted ? colors.muted : colors.ink;
  return (
    <View style={[{ backgroundColor: colors.surfaceRaised, borderRadius: radii.sm, gap: 2, minWidth: 0, padding: spacing.sm }, style]}>
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{label}</Text>
      {/* The change sits on the value's row, pushed right, so a full-width tile
          reads as one line: the figure, then how it moved. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <Text style={{ color: valueColor, fontFamily: fonts.display, fontSize: 18, fontVariant: ["tabular-nums"] }}>{value}</Text>
        {delta ? <DeltaLine delta={delta} /> : null}
      </View>
      {caption ? <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11 }}>{caption}</Text> : null}
    </View>
  );
}

/** The card's lead number: large, with an optional quiet suffix ("due"), and its change just beside it. */
export function HeroFigure({ delta, suffix, value }: { delta?: Delta | null; suffix?: string; value: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", columnGap: spacing.sm, flexDirection: "row", flexWrap: "wrap" }}>
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontVariant: ["tabular-nums"] }}>
        {value}
        {suffix ? <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13 }}>{` ${suffix}`}</Text> : null}
      </Text>
      {delta ? <DeltaLine delta={delta} /> : null}
    </View>
  );
}
