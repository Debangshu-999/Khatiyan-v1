import { useEffect, useRef, type PropsWithChildren } from "react";
import { Animated, type ViewStyle } from "react-native";

/** How far the view travels in, in points. Short, so it reads as a step. */
const SLIDE_DISTANCE = 28;

/**
 * A mount entrance for a view that replaces another in place, the way a
 * pushed screen would: fade in while sliding a short way from the side it
 * comes from. "right" is going deeper, "left" is coming back; "none" mounts
 * without moving, for a first appearance that is not a step from anywhere.
 */
export function SlideInView({
  children,
  from,
  style,
}: PropsWithChildren<{ from: "left" | "right" | "none"; style?: ViewStyle }>) {
  const still = from === "none";
  const opacity = useRef(new Animated.Value(still ? 1 : 0)).current;
  const translateX = useRef(new Animated.Value(still ? 0 : from === "right" ? SLIDE_DISTANCE : -SLIDE_DISTANCE)).current;

  useEffect(() => {
    if (still) return;
    Animated.parallel([
      Animated.timing(opacity, { duration: 220, toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { friction: 10, tension: 80, toValue: 0, useNativeDriver: true }),
    ]).start();
    // Mount-only: the entrance plays once, as the view arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Animated.View style={[{ flex: 1, opacity, transform: [{ translateX }] }, style]}>{children}</Animated.View>;
}
