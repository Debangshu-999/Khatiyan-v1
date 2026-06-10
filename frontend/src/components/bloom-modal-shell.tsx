import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useRouter } from "expo-router";

import { useTheme } from "@/theme/use-theme";

type BloomModalShellProps = {
  children: (close: () => void) => ReactNode;
};

export function BloomModalShell({ children }: BloomModalShellProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    Animated.timing(progress, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  function close() {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;

    Animated.timing(progress, {
      duration: 150,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(() => router.back());
  }

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 0],
  });

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: progress,
          transform: [{ translateX }, { translateY }, { scale }],
        }}
      >
        {children(close)}
      </Animated.View>
    </View>
  );
}
