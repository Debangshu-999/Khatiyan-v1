import type { ReactNode } from "react";
import { Text, View, type ViewStyle } from "react-native";

import { HeaderNote } from "@/components/header-note";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  italicTail?: string;
  subtitle?: string;
  trailing?: ReactNode;
  style?: ViewStyle;
};

// Editorial page header: a small uppercase kicker, a serif title with an
// optional italic tail for an editorial flourish, and a muted subtitle.
// A thin terracotta rule sits between the kicker and the title — a
// letterhead detail that ties screens together.
export function ScreenHeader({ eyebrow, italicTail, style, subtitle, title, trailing }: ScreenHeaderProps) {
  const { colors, type } = useTheme();

  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {eyebrow ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.accent }]} selectable>
            {eyebrow}
          </Text>
          <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1, opacity: 0.55 }} />
        </View>
      ) : null}

      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={[type.display, { color: colors.ink, fontSize: 30, lineHeight: 36 }]} selectable>
            {title}
            {italicTail ? (
              <Text style={[type.displayItalic, { color: colors.accent, fontSize: 30, lineHeight: 36 }]} selectable>
                {" "}
                {italicTail}
              </Text>
            ) : null}
          </Text>
          {subtitle ? <HeaderNote>{subtitle}</HeaderNote> : null}
        </View>

        {trailing ? <View style={{ alignItems: "flex-end" }}>{trailing}</View> : null}
      </View>
    </View>
  );
}
