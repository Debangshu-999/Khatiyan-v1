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
// serif title and an optional eyebrow / trailing action. The hairline rule
// underneath gives every section a printed-document feel.
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

        <View style={{ backgroundColor: colors.border, height: 1, marginTop: spacing.xxs }} />
      </View>

      {children ? <View style={{ gap: spacing.md }}>{children}</View> : null}
    </View>
  );
}
