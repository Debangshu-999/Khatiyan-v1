import { PropsWithChildren } from "react";
import { View, type ViewStyle } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type CardProps = PropsWithChildren<{
  tone?: "default" | "sunken" | "raised";
  style?: ViewStyle;
}>;

export function Card({ children, style, tone = "default" }: CardProps) {
  const { colors } = useTheme();
  const backgroundColor =
    tone === "sunken" ? colors.surfaceSunken : tone === "raised" ? colors.surfaceRaised : colors.surface;

  const borderColor = tone === "default" ? colors.borderStrong : colors.border;

  // Default cards lift off the page; sunken and raised tones sit INSIDE another
  // surface, so a shadow there would read as a card floating inside a card. The
  // border stays either way — the shadow gives depth, the hairline still defines
  // the edge on dark backgrounds where a shadow is invisible.
  const elevated = tone === "default";

  return (
    <View
      style={[
        {
          backgroundColor,
          borderColor,
          borderCurve: "continuous",
          borderRadius: 20,
          borderWidth: 1,
          gap: spacing.md,
          padding: spacing.lg,
        },
        elevated
          ? {
              elevation: 3,
              shadowColor: colors.shadow,
              shadowOffset: { height: 4, width: 0 },
              shadowOpacity: 1,
              shadowRadius: 12,
            }
          : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
