import { Text, View, type ViewStyle } from "react-native";

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
          paddingHorizontal: spacing.sm,
          paddingVertical: 5,
        },
        style,
      ]}
    >
      <Text
        style={[
          type.eyebrow,
          {
            color: selected.text,
            fontSize: 10.5,
            letterSpacing: 1.2,
          },
        ]}
        selectable
      >
        {label}
      </Text>
    </View>
  );
}
