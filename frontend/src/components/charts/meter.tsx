import { Text, View } from "react-native";

import { useChartPalette } from "@/theme/chart-colors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** A ratio against its limit. The track is grey, never pale blue. */
export function Meter({
  caption,
  fraction,
  label,
  trailingCaption,
  trailingTone = "neutral",
  valueText,
}: {
  caption?: string;
  fraction: number;
  label: string;
  trailingCaption?: string | null;
  trailingTone?: "good" | "bad" | "neutral";
  valueText: string;
}) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const clamped = Math.max(0, Math.min(1, fraction));
  const trailingColor = trailingTone === "good" ? colors.successText : trailingTone === "bad" ? colors.danger : colors.muted;
  return (
    <View accessibilityLabel={`${label} ${valueText}`} accessible style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>{valueText}</Text>
      </View>
      <View style={{ backgroundColor: palette.track, borderRadius: 4, height: 10, overflow: "hidden" }}>
        <View style={{ backgroundColor: palette.series[0], borderRadius: 4, height: 10, width: `${clamped * 100}%` }} />
      </View>
      {caption || trailingCaption ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>{caption ?? ""}</Text>
          {trailingCaption ? <Text style={{ color: trailingColor, fontFamily: fonts.sans, fontSize: 12 }}>{trailingCaption}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
