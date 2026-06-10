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
  const backgroundColor = ghost
    ? "transparent"
    : muted
      ? colors.primarySoft
      : colors.primary;
  const textColor = ghost ? colors.ink : muted ? colors.primaryDeep : colors.onPrimary;
  const borderColor = ghost ? colors.border : "transparent";
  const borderWidth = ghost ? 1 : 0;

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
          fontFamily: fonts.sans,
          fontSize: 14,
          fontWeight: "700",
          letterSpacing: 0.2,
        }}
        selectable
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
