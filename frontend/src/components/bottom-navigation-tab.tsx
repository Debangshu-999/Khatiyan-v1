import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme/use-theme";

/** Stable tab geometry with a native-driven outline/solid and label cross-fade. */
export function BottomNavigationTab({ disabled, focused, label, onPress, reduceMotion, renderIcon }: {
  disabled: boolean;
  focused: boolean;
  label: string;
  onPress: () => void;
  reduceMotion: boolean;
  renderIcon?: (props: { color: string; focused: boolean; size: number }) => ReactNode;
}) {
  const { colors, fonts } = useTheme();
  const [selection] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      selection.stopAnimation();
      selection.setValue(focused ? 1 : 0);
      return;
    }
    const transition = Animated.timing(selection, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
    });
    transition.start();
    // Retarget from the current value when tabs are tapped again mid-transition.
    return () => transition.stop();
  }, [focused, reduceMotion, selection]);

  const inactiveOpacity = selection.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: "clamp" });
  const iconLayer = { alignItems: "center", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 } as const;
  const labelStyle = { fontSize: 9, letterSpacing: 0, lineHeight: 12, textAlign: "center" } as const;

  return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled, selected: focused }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ alignItems: "center", flex: 1, gap: 3, height: "100%", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.75 : 1, paddingHorizontal: 2 })}>
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ height: 24, width: 24 }}>
      <Animated.View style={[iconLayer, { opacity: inactiveOpacity }]}>{renderIcon?.({ color: colors.kicker, focused: false, size: 22 })}</Animated.View>
      <Animated.View style={[iconLayer, { opacity: selection, transform: [
        { scale: selection.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08], extrapolate: "clamp" }) },
        { translateY: selection.interpolate({ inputRange: [0, 1], outputRange: [0, -1], extrapolate: "clamp" }) },
      ] }]}>{renderIcon?.({ color: colors.ink, focused: true, size: 22 })}</Animated.View>
    </View>
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ alignSelf: "stretch", height: 12 }}>
      <Animated.View style={{ left: 0, opacity: inactiveOpacity, position: "absolute", right: 0, top: 0 }}>
        <Text numberOfLines={1} style={[labelStyle, { color: colors.kicker, fontFamily: fonts.sansMedium }]}>{label}</Text>
      </Animated.View>
      <Animated.View style={{ left: 0, opacity: selection, position: "absolute", right: 0, top: 0 }}>
        <Text numberOfLines={1} style={[labelStyle, { color: colors.ink, fontFamily: fonts.sansBold }]}>{label}</Text>
      </Animated.View>
    </View>
  </Pressable>;
}
