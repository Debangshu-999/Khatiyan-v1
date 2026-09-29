import { Text, View } from "react-native";

import { MarqueeText } from "@/components/marquee-text";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A swatch, its label and its value. Values are always printed, so colour never
 * carries meaning alone. An optional note (a category's change) sits after the
 * value in its own tone.
 */
export function LegendRow({
  color,
  label,
  note,
  noteTone = "neutral",
  value,
}: {
  color: string;
  label: string;
  note?: string | null;
  noteTone?: "good" | "bad" | "neutral";
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const noteColor = noteTone === "good" ? colors.successText : noteTone === "bad" ? colors.danger : colors.muted;
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, minWidth: 0 }}>
      <View style={{ backgroundColor: color, borderRadius: 2, height: 10, width: 10 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <MarqueeText style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{label}</MarqueeText>
      </View>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 12, fontVariant: ["tabular-nums"] }}>{value}</Text>
      {note ? <Text style={{ color: noteColor, fontFamily: fonts.sans, fontSize: 11 }}>{note}</Text> : null}
    </View>
  );
}
