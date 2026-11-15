import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/theme/use-theme";

/** The thick blue dash every subheading starts with. */
export function SubheadingDash() {
  const { colors } = useTheme();
  return <View style={{ alignSelf: "center", backgroundColor: colors.primary, borderCurve: "continuous", borderRadius: 3, height: 20, width: 5 }} />;
}

/**
 * The app's subheading (user, 2026-11-14, from Account settings): the title as
 * plain display text with a thick blue dash before it, no band behind it.
 * `bleed` is kept for callers written for the old full-width band; it no longer
 * does anything.
 */
export function SectionHeading({ dash = true, title, trailing, leading, trailingInline = false }: {
  /** Off for a title that heads a card rather than a section (the board's categories). */
  dash?: boolean;
  title: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  trailingInline?: boolean;
  bleed?: number;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 10, justifyContent: trailingInline ? "flex-start" : "space-between" }}>
      {dash ? <SubheadingDash /> : null}
      {leading}
      <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, ...(!trailingInline ? { flex: 1 } : { flexShrink: 1 }) }}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}
