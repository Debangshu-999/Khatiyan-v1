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
          borderRadius: 20,
          borderWidth: 1,
          elevation: tone === "default" ? 1 : 0,
          gap: spacing.md,
          padding: spacing.lg,
          shadowColor: colors.shadow,
          shadowOffset: { height: 6, width: 0 },
          shadowOpacity: tone === "default" ? 1 : 0,
          shadowRadius: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
