import { PropsWithChildren, useRef } from "react";
import { Animated, GestureResponderEvent, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";

type AnimatedPressableProps = PropsWithChildren<
  Omit<PressableProps, "style"> & {
    style?: StyleProp<ViewStyle>;
    // Minimum gap (ms) before this pressable fires onPress again. Guards against
    // a fast double-tap triggering the action twice — most visibly a card that
    // navigates, which used to push the same screen multiple times and leave a
    // pile of identical back-stack entries. Pass 0 to opt out (rapid steppers).
    tapLockMs?: number;
  }
>;

// The Pressable itself is the animated, styled box. Earlier this wrapped
// children in an Animated.View — which didn't reliably stretch inside flex
// containers, making buttons render at content-width even when the tap
// target was full-width. Animating the Pressable directly makes the styled
// surface the tap target.
const AnimatedPressableImpl = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ children, onPress, onPressIn, onPressOut, style, tapLockMs = 500, ...props }: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const lastPressAt = useRef(0);

  const handlePress = (event: GestureResponderEvent) => {
    if (tapLockMs > 0) {
      const now = Date.now();
      if (now - lastPressAt.current < tapLockMs) {
        return;
      }
      lastPressAt.current = now;
    }
    onPress?.(event);
  };

  return (
    <AnimatedPressableImpl
      {...props}
      onPress={handlePress}
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
