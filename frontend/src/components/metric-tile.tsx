import { Text, View } from "react-native";

import { MarqueeText } from "@/components/marquee-text";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type MetricTileProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "danger";
  // Money values shown three-across can be long; dense uses a smaller base size
  // so the amount fits on one line without shrinking as aggressively.
  dense?: boolean;
};

export function MetricTile({ dense = false, hint, label, tone = "default", value }: MetricTileProps) {
  const { colors, fonts, type } = useTheme();
  const accentColor = tone === "danger" ? colors.danger : tone === "primary" ? colors.jade : colors.ink;
  const backgroundColor = tone === "primary" ? colors.jadeSoft : colors.surface;
  const borderColor = tone === "primary" ? colors.jadeSoft : colors.borderStrong;
  const fontSize = dense ? 19 : 28;

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
      {/* A long tile label (e.g. a one-off bill's name) scrolls instead of
          ellipsising, per the app-wide overflow-label rule. */}
      <MarqueeText style={[type.eyebrow, { color: colors.kicker }]}>{label}</MarqueeText>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        numberOfLines={1}
        style={{
          color: accentColor,
          fontFamily: fonts.display,
          fontSize,
          fontVariant: ["tabular-nums"],
          fontWeight: "500",
          letterSpacing: -0.5,
          lineHeight: fontSize + 4,
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
