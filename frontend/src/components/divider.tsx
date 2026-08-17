import { Text, View, type ViewStyle } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type DividerProps = {
  label?: string;
  align?: "left" | "center";
  style?: ViewStyle;
};

// Hairline rule used as the visual punctuation throughout — under section
// kickers, between groups, as a decorative letterhead-style break.
export function Divider({ align = "left", label, style }: DividerProps) {
  const { colors, type } = useTheme();

  if (!label) {
    return <View style={[{ backgroundColor: colors.border, height: 1 }, style]} />;
  }

  return (
    <View style={[{ alignItems: "center", flexDirection: "row", gap: spacing.sm }, style]}>
      {align === "center" ? <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} /> : null}
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        {label}
      </Text>
      <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
    </View>
  );
}
