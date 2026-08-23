import type { ComponentType } from "react";
import { Text, type ViewStyle } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type IconButtonProps = {
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
  ghost?: boolean;
  style?: ViewStyle;
};

export function IconButton({
  disabled = false,
  ghost = false,
  icon: Icon,
  label,
  muted = false,
  onPress,
  style,
}: IconButtonProps) {
  const { colors, fonts } = useTheme();
  // "muted" is white with a hairline and blue lettering — never the pale blue
  // fill it used to carry. A tinted block inside a card reads as a second
  // surface rather than a control, and a card with two of them is a band of
  // blue louder than its own content.
  const backgroundColor = ghost || muted ? "transparent" : colors.primary;
  const textColor = ghost ? colors.ink : muted ? colors.primary : colors.onPrimary;
  const borderColor = ghost ? colors.border : muted ? colors.borderStrong : "transparent";
  const borderWidth = ghost || muted ? 1 : 0;

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor,
        borderRadius: 12,
        borderWidth,
        flexDirection: "row",
        gap: spacing.sm,
        justifyContent: "center",
        minHeight: 46,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        ...style,
      }}
    >
      <Icon color={textColor} size={17} strokeWidth={2.2} />
      <Text
        style={{
          color: textColor,
          fontFamily: fonts.sansBold,
          fontSize: 14,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
