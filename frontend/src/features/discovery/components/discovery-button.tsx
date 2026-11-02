import type { ReactNode } from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";

import { AiGradient } from "@/components/ai-style";
import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type DiscoveryButtonProps = {
  label: string;
  /** Drawn to the left of the label. */
  icon?: ReactNode;
  onPress: () => void;
  muted?: boolean;
  /** Filled with the AI's gradient, for an action the AI carries out. */
  aiGradient?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function DiscoveryButton({ label, icon, onPress, muted = false, aiGradient = false, disabled = false, style, textStyle }: DiscoveryButtonProps) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        // Muted is white with a hairline and blue lettering, never a pale blue
        // fill: a tinted block reads as a surface rather than a button.
        backgroundColor: muted || aiGradient ? "transparent" : colors.primary,
        // White buttons are blue-bordered, app wide (user, 2026-10-17).
        borderColor: muted ? colors.primary : "transparent",
        borderRadius: 14,
        borderWidth: muted ? 1 : 0,
        justifyContent: "center",
        minHeight: 46,
        opacity: disabled ? 0.55 : 1,
        overflow: aiGradient ? "hidden" : undefined,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...style,
      }}
    >
      {aiGradient ? <AiGradient /> : null}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xxs }}>
        {icon}
        <Text
          style={{
            color: muted ? colors.primary : colors.onPrimary,
            fontWeight: "900",
            ...textStyle,
          }}
        >
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
