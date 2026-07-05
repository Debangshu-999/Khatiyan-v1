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
export function ScreenHeader({ eyebrow, italicTail, onBack, style, subtitle, title, trailing }: ScreenHeaderProps) {
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
            <Text style={[type.eyebrow, { color: colors.accent }]} selectable>
              {eyebrow}
            </Text>
          ) : null}
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
