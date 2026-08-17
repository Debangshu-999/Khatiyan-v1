import type { ReactNode } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { HeaderNote } from "@/components/header-note";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  italicTail?: string;
  subtitle?: string;
  trailing?: ReactNode;
  // A status that qualifies the whole screen — "View only" is the case. Sits on
  // the TITLE row, right of the title, because that is the screen's name and the
  // badge is a fact about it. Sharing the row with `trailing` is fine: they
  // render side by side.
  badge?: ReactNode;
  // Renders a compact back chip inline on the eyebrow row (left of the kicker)
  // so navigation doesn't cost the screen its own row of white space.
  onBack?: () => void;
  style?: ViewStyle;
};

// Editorial page header: a small uppercase kicker, a serif title with an
// optional italic tail for an editorial flourish, and a muted subtitle.
// A thin rule runs along the kicker row — a letterhead detail that ties
// screens together. The back affordance shares that row instead of sitting
// above the header on its own line.
export function ScreenHeader({ badge, eyebrow, italicTail, onBack, style, subtitle, title, trailing }: ScreenHeaderProps) {
  const { colors, type } = useTheme();

  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {onBack || eyebrow ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          {onBack ? (
            <AnimatedPressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onBack}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.borderStrong,
                borderRadius: 999,
                borderWidth: 1,
                height: 32,
                justifyContent: "center",
                width: 32,
              }}
            >
              <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
            </AnimatedPressable>
          ) : null}
          {eyebrow ? (
            <Text style={[type.eyebrow, { color: colors.accent }]}>
              {eyebrow}
            </Text>
          ) : null}
          <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1, opacity: 0.55 }} />
        </View>
      ) : null}

      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={[type.brand, { color: colors.ink, fontSize: 30, lineHeight: 36 }]}>
            {title}
            {italicTail ? (
              <Text style={[type.brandItalic, { color: colors.accent, fontSize: 30, lineHeight: 36 }]}>
                {" "}
                {italicTail}
              </Text>
            ) : null}
          </Text>
          {subtitle ? <HeaderNote>{subtitle}</HeaderNote> : null}
        </View>

        {badge || trailing ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            {badge}
            {trailing}
          </View>
        ) : null}
      </View>
    </View>
  );
}
