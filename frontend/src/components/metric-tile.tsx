import { Text, View } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type MetricTileProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "danger";
};

export function MetricTile({ hint, label, tone = "default", value }: MetricTileProps) {
  const { colors, fonts, type } = useTheme();
  const accentColor = tone === "danger" ? colors.danger : tone === "primary" ? colors.jade : colors.ink;
  const backgroundColor = tone === "primary" ? colors.jadeSoft : colors.surface;
  const borderColor = tone === "primary" ? colors.jadeSoft : colors.border;

  return (
    <View
      style={{
        backgroundColor,
        borderColor,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {label}
      </Text>
      <Text
        style={{
          color: accentColor,
          fontFamily: fonts.display,
          fontSize: 28,
          fontVariant: ["tabular-nums"],
          fontWeight: "500",
          letterSpacing: -0.5,
          lineHeight: 32,
        }}
        selectable
      >
        {value}
      </Text>
      {hint ? (
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
