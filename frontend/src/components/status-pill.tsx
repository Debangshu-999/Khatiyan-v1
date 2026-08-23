import { View, type ViewStyle } from "react-native";

import { MarqueeText } from "@/components/marquee-text";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type StatusPillProps = {
  label: string;
  tone?: "success" | "warning" | "neutral" | "primary" | "accent" | "danger";
  style?: ViewStyle;
};

// Editorial status chip — tracked-out caps on a soft tint. Deliberately plain:
// no dots or icons inside pills, the colour and the word carry the status.
export function StatusPill({ label, style, tone = "neutral" }: StatusPillProps) {
  const { colors, type } = useTheme();
  const toneColors = {
    success: { background: colors.successSoft, text: colors.successText },
    warning: { background: colors.warningSoft, text: colors.warningText },
    neutral: { background: colors.neutralSoft, text: colors.neutralText },
    primary: { background: colors.primarySoft, text: colors.primaryDeep },
    accent: { background: colors.accentSoft, text: colors.warningText },
    danger: { background: colors.dangerSoft, text: colors.danger },
  };
  const selected = toneColors[tone];

  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          backgroundColor: selected.background,
          borderRadius: 999,
          // Never squeeze the sibling title out of a card header: the pill
          // yields instead, and a squeezed label scrolls (marquee) so the full
          // status stays readable.
          flexShrink: 1,
          maxWidth: "100%",
          paddingHorizontal: spacing.sm,
          paddingVertical: 5,
        },
        style,
      ]}
    >
      <MarqueeText
        style={[
          type.eyebrow,
          {
            color: selected.text,
            fontSize: 10.5,
            // Tracking scales with the size so the pill matches every other
            // caps label rather than sitting a touch looser than all of them.
            letterSpacing: 0.85,
          },
        ]}
      >
        {label}
      </MarqueeText>
    </View>
  );
}
