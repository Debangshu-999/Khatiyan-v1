import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Compact screen-section band; content remains aligned with the page gutter. */
export function SectionHeading({ title, trailing, leading, trailingInline = false, bleed = spacing.lg }: {
  title: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  trailingInline?: boolean;
  bleed?: number;
}) {
  const { colors, fonts } = useTheme();
  return <LinearGradient colors={["#EAF2FF", "#FFFFFF"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ marginHorizontal: -bleed, paddingHorizontal: bleed, paddingVertical: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: trailingInline ? "flex-start" : "space-between" }}>
      {leading}
      <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, lineHeight: 22, ...(!trailingInline ? { flex: 1 } : { flexShrink: 1 }) }}>{title}</Text>
      {trailing}
    </View>
  </LinearGradient>;
}
