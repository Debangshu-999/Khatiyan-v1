import { useEffect, useRef, type PropsWithChildren } from "react";
import { Animated, type ViewStyle } from "react-native";

type FadeInViewProps = PropsWithChildren<{
  // Stagger index — each unit adds 70ms before the entrance starts.
  index?: number;
  style?: ViewStyle;
}>;

// Mount entrance used across screens: fade + 14px upward drift, staggered by
// index so stacked sections cascade in instead of popping at once.
export function FadeInView({ children, index = 0, style }: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        delay: index * 70,
        duration: 360,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        delay: index * 70,
        friction: 9,
        tension: 60,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}
