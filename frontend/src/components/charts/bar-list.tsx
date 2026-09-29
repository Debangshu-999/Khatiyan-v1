import { Text, View } from "react-native";

import { MarqueeText } from "@/components/marquee-text";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type BarRow = { key: string; label: string; value: number; valueText: string; color: string };

/**
 * Ranked items with names too long for a legend. Each name has the card's full
 * width on its own line, the amount at its right and the bar beneath, so a long
 * payee reads whole. It used to sit in an 84px column beside the bar, where most
 * names had to scroll and several scrolling at once read as noise. Bars share
 * one scale, anchored left. A name wider than the card still scrolls.
 */
export function BarList({ rows }: { rows: BarRow[] }) {
  const { colors, fonts } = useTheme();
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <View style={{ gap: spacing.md }}>
      {rows.map((row) => (
        <View accessibilityLabel={`${row.label} ${row.valueText}`} accessible key={row.key} style={{ gap: spacing.xxs }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <MarqueeText style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{row.label}</MarqueeText>
            </View>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 12, fontVariant: ["tabular-nums"] }}>{row.valueText}</Text>
          </View>
          <View
            style={{
              backgroundColor: row.color,
              borderBottomRightRadius: 4,
              borderTopRightRadius: 4,
              height: 8,
              width: `${max > 0 ? Math.max((row.value / max) * 100, 2) : 0}%`,
            }}
          />
        </View>
      ))}
    </View>
  );
}
