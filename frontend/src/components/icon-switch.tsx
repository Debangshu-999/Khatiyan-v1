import { useEffect, useRef, type ReactNode } from "react";
import { Animated } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { softShadow } from "@/theme/shadows";
import { useTheme } from "@/theme/use-theme";

/** The sliding switch with a picture on its knob, from Secure Wallet. The caller draws the picture. */
export function IconSwitch({
  accessibilityLabel,
  busy,
  disabled,
  enabled,
  onChange,
  raised = false,
  renderIcon,
}: {
  accessibilityLabel: string;
  busy: boolean;
  disabled?: boolean;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** Faded blue instead of Secure Wallet's red, no border, and a shadow so it stands up (user, 2026-11-01). */
  raised?: boolean;
  renderIcon: (color: string) => ReactNode;
}) {
  const { colors } = useTheme();
  const slide = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  const off = busy || Boolean(disabled);
  useEffect(() => {
    const animation = Animated.timing(slide, { toValue: enabled ? 1 : 0, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [enabled, slide]);
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled: off }}
      disabled={off}
      hitSlop={6}
      onPress={() => onChange(!enabled)}
      style={{
        width: raised ? 50 : 62,
        height: raised ? 28 : 34,
        borderRadius: raised ? 14 : 17,
        opacity: off ? 0.6 : 1,
        ...(raised
          ? {
              backgroundColor: enabled ? colors.primarySoft : colors.borderStrong,
              padding: 3,
              ...softShadow(colors.shadow, 3, 6),
            }
          : { backgroundColor: enabled ? "#FFF0F3" : colors.borderStrong, padding: 4 }),
      }}
    >
      <Animated.View
        style={{
          width: raised ? 22 : 26,
          height: raised ? 22 : 26,
          borderRadius: raised ? 11 : 13,
          backgroundColor: "white",
          justifyContent: "center",
          alignItems: "center",
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, raised ? 22 : 28] }) }],
          ...(raised ? softShadow(colors.shadow, 2, 3) : {}),
        }}
      >
        {renderIcon(raised ? (enabled ? colors.primary : colors.muted) : enabled ? colors.danger : colors.muted)}
      </Animated.View>
    </AnimatedPressable>
  );
}
