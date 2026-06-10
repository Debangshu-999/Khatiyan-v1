import { Text, View, type ViewStyle } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type StatusPillProps = {
  label: string;
  tone?: "success" | "warning" | "neutral" | "primary" | "accent" | "danger";
  style?: ViewStyle;
  dot?: boolean;
};

// Editorial status chip — tracked-out caps with a tiny color dot, like a
// printed legend in a property document.
export function StatusPill({ dot = true, label, style, tone = "neutral" }: StatusPillProps) {
  const { colors, type } = useTheme();
  const toneColors = {
    success: { background: colors.successSoft, text: colors.successText, dotColor: colors.jade },
    warning: { background: colors.warningSoft, text: colors.warningText, dotColor: colors.accent },
    neutral: { background: colors.neutralSoft, text: colors.neutralText, dotColor: colors.kicker },
    primary: { background: colors.primarySoft, text: colors.primaryDeep, dotColor: colors.primary },
    accent: { background: colors.accentSoft, text: colors.warningText, dotColor: colors.accent },
    danger: { background: colors.dangerSoft, text: colors.danger, dotColor: colors.danger },
  };
  const selected = toneColors[tone];

  return (
    <View
      style={[
        {
          alignItems: "center",
          alignSelf: "flex-start",
          backgroundColor: selected.background,
          borderRadius: 999,
          flexDirection: "row",
          gap: spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: 5,
        },
        style,
      ]}
    >
      {dot ? (
        <View
          style={{
            backgroundColor: selected.dotColor,
            borderRadius: 999,
            height: 6,
            width: 6,
          }}
        />
      ) : null}
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
