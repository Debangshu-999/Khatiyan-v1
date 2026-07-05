import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

import { useTheme } from "@/theme/use-theme";

// Progress track whose fill eases out to its value on mount and glides on
// change — the one moment of motion a summary card needs. Width animation is
// layout-bound (JS driver), fine for a 10px bar.
export function ProgressBar({ color, height = 10, ratio }: { color: string; height?: number; ratio: number }) {
  const { colors } = useTheme();
  const clamped = Math.min(1, Math.max(0, ratio));
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      duration: 650,
      easing: Easing.out(Easing.cubic),
      toValue: clamped,
      useNativeDriver: false,
    }).start();
  }, [clamped, fill]);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height, overflow: "hidden" }}>
      <Animated.View style={{ backgroundColor: color, borderRadius: 999, height, width }} />
    </View>
  );
}
