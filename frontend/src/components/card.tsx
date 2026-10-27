import { PropsWithChildren } from "react";
import { View, type ViewStyle } from "react-native";

import { useSoftShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type CardProps = PropsWithChildren<{
  tone?: "default" | "sunken" | "raised";
  style?: ViewStyle;
}>;

export function Card({ children, style, tone = "default" }: CardProps) {
  const softShadow = useSoftShadow();
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
          borderRadius: radii.card,
          borderWidth: 1,
          gap: spacing.md,
          padding: spacing.lg,
        },
        elevated
          ? {
              ...softShadow(colors.shadow, 4, 12),
            }
          : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
