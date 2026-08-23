import { Text, type TextStyle, type ViewStyle } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type DiscoveryButtonProps = {
  label: string;
  onPress: () => void;
  muted?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function DiscoveryButton({ label, onPress, muted = false, disabled = false, style, textStyle }: DiscoveryButtonProps) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        // Muted is white with a hairline and blue lettering, never a pale blue
        // fill: a tinted block reads as a surface rather than a button.
        backgroundColor: muted ? "transparent" : colors.primary,
        borderColor: muted ? colors.borderStrong : "transparent",
        borderRadius: 14,
        borderWidth: muted ? 1 : 0,
        justifyContent: "center",
        minHeight: 46,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...style,
      }}
    >
      <Text
        style={{
          color: muted ? colors.primary : colors.onPrimary,
          fontWeight: "900",
          ...textStyle,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
