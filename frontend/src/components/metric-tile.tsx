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
  const { colors, type } = useTheme();
  const accentColor = tone === "danger" ? colors.danger : tone === "primary" ? colors.jade : colors.ink;
  // Every tile is a white card; the tone lives in the number alone. A filled
  // green tile beside a white one read as two different KINDS of statistic
  // rather than the same statistic with a good value, and a row of them turned
  // the summary into the loudest thing on a screen that is mostly a list.
  const backgroundColor = colors.surface;
  const borderColor = colors.borderStrong;
  const fontSize = dense ? 19 : 28;

  return (
    <View
      style={{
        backgroundColor,
        borderColor,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    >
      {/* A long tile label (e.g. a one-off bill's name) scrolls instead of
          ellipsising, per the app-wide overflow-label rule. */}
      <MarqueeText style={[type.eyebrow, { color: colors.kicker }]}>{label}</MarqueeText>
      {/* The family carries the weight — no fontWeight here, or Android
          synthesises a second bolding pass on top of ExtraBold. */}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[
          type.metric,
          {
            color: accentColor,
            fontSize,
            lineHeight: fontSize + 4,
          },
        ]}
      >
        {value}
      </Text>
      {hint ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
