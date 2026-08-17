import { Text, View } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type DiscoverySectionHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

export function DiscoverySectionHeader({ eyebrow, subtitle, title }: DiscoverySectionHeaderProps) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      {eyebrow ? (
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          {eyebrow}
        </Text>
      ) : null}
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.display,
          fontSize: 24,
          letterSpacing: -0.4,
          lineHeight: 28,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={[type.body, { color: colors.muted }]}>
          {subtitle}
        </Text>
      ) : null}
      <View style={{ backgroundColor: colors.border, height: 1, marginTop: spacing.xs }} />
    </View>
  );
}
