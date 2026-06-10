import { PropsWithChildren, useRef } from "react";
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";

type AnimatedPressableProps = PropsWithChildren<
  Omit<PressableProps, "style"> & {
    style?: StyleProp<ViewStyle>;
  }
>;

// The Pressable itself is the animated, styled box. Earlier this wrapped
// children in an Animated.View — which didn't reliably stretch inside flex
// containers, making buttons render at content-width even when the tap
// target was full-width. Animating the Pressable directly makes the styled
// surface the tap target.
const AnimatedPressableImpl = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ children, onPressIn, onPressOut, style, ...props }: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <AnimatedPressableImpl
      {...props}
      onPressIn={(event) => {
        Animated.spring(scale, {
          friction: 7,
          tension: 140,
          toValue: 0.98,
          useNativeDriver: true,
        }).start();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        Animated.spring(scale, {
          friction: 7,
          tension: 140,
          toValue: 1,
          useNativeDriver: true,
        }).start();
        onPressOut?.(event);
      }}
      style={[{ transform: [{ scale }] }, style]}
    >
      {children}
    </AnimatedPressableImpl>
  );
}
