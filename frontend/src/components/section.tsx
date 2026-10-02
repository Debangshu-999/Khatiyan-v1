import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

import { spacing } from "@/theme/spacing";
import { SectionHeading } from "./section-heading";

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

// Screen subsections share a compact full-width gradient heading band.
//
// There is deliberately NO eyebrow. Every use had a kicker sitting directly
// above the title saying the same thing in fewer words — "Quick access" over
// "Tools", "Owner actions" over "Workspace" — which read as two headings for
// one section. The title alone is the heading.
export function Section({ children, style, title, trailing, trailingInline }: SectionProps) {
  return (
    <View style={[{ gap: spacing.md }, style]}>
      <SectionHeading title={title} trailing={trailing} trailingInline={trailingInline} />

      {children ? <View style={{ gap: spacing.md }}>{children}</View> : null}
    </View>
  );
}
