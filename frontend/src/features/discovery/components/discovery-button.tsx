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
        backgroundColor: muted ? colors.primarySoft : colors.primary,
        borderRadius: 14,
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
        selectable
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
