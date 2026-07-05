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

  // Flat, borderless-of-shadow surfaces: a clear 1px border defines the card
  // against the near-white page instead of a drop shadow. Sunken/raised tones
  // sit inside other surfaces so they keep the softer hairline border.
  const borderColor = tone === "default" ? colors.borderStrong : colors.border;

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
        style,
      ]}
    >
      {children}
    </View>
  );
}
