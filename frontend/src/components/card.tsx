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

  return (
    <View
      style={[
        {
          backgroundColor,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 14,
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
