import type { ReactNode } from "react";
import { Text, View, type ViewStyle } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type SectionProps = {
  title: string;
  trailing?: ReactNode;
  /**
   * Puts `trailing` immediately after the title instead of against the right
   * edge. For controls that grow — a collapsible filter row needs somewhere to
   * grow INTO, and pinned right it would have to expand leftward across the
   * title.
   */
  trailingInline?: boolean;
  children?: ReactNode;
  style?: ViewStyle;
};

// Section heading used inside screens — smaller than ScreenHeader, with a
// serif title and an optional trailing action. The rule underneath is a ledger
// "ruled margin": a short accent tick flush-left, then a hairline running
// across — a letterhead detail that ties every section together.
//
// There is deliberately NO eyebrow. Every use had a kicker sitting directly
// above the title saying the same thing in fewer words — "Quick access" over
// "Tools", "Owner actions" over "Workspace" — which read as two headings for
// one section. The title alone is the heading.
export function Section({ children, style, title, trailing, trailingInline }: SectionProps) {
  const { colors, type } = useTheme();

  return (
    <View style={[{ gap: spacing.md }, style]}>
      <View style={{ gap: spacing.xs }}>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: spacing.sm,
            justifyContent: trailingInline ? "flex-start" : "space-between",
          }}
        >
          <Text style={[type.display, { color: colors.ink, fontSize: 21, lineHeight: 26 }]}>
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
