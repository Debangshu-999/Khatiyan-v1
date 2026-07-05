import type { ReactNode } from "react";
import { Text, View, type ViewStyle } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type SectionProps = {
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
  children?: ReactNode;
  style?: ViewStyle;
};

// Section heading used inside screens — smaller than ScreenHeader, with a
// serif title and an optional eyebrow / trailing action. The rule underneath is
// a ledger "ruled margin": a short accent tick flush-left, then a hairline
// running across — a letterhead detail that ties every section together.
export function Section({ children, eyebrow, style, title, trailing }: SectionProps) {
  const { colors, type } = useTheme();

  return (
    <View style={[{ gap: spacing.md }, style]}>
      <View style={{ gap: spacing.xs }}>
        {eyebrow ? (
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            {eyebrow}
          </Text>
        ) : null}

        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={[type.display, { color: colors.ink, fontSize: 21, lineHeight: 26 }]} selectable>
            {title}
          </Text>
          {trailing}
        </View>

        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xxs }}>
          <View style={{ backgroundColor: colors.accent, borderRadius: 2, height: 2.5, width: 24 }} />
          <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1, opacity: 0.5 }} />
        </View>
      </View>

      {children ? <View style={{ gap: spacing.md }}>{children}</View> : null}
    </View>
  );
}
