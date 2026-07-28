import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
} from "react-native";

// Marquee timing — kept in step with the placeholder marquee in app-text-input.
const END_GAP = 24; // trailing breathing room so the last glyph isn't flush at the clip edge
const HOLD_MS = 900; // pause at each end before reversing
const MIN_SCROLL_MS = 1400;
const MS_PER_PX = 16;
const OVERFLOW_SLOP = 4; // ignore sub-pixel/tiny overflow — not worth animating

export type MarqueeTextProps = {
  children: string;
  style?: StyleProp<TextStyle>;
  // Set false to keep a static single-line ellipsis instead of scrolling.
  animate?: boolean;
  accessibilityLabel?: string;
};

/**
 * Single-line label that SCROLLS back and forth (marquee) when the text is too
 * wide for its container, and renders statically otherwise. The label analog of
 * the placeholder marquee in {@link AppTextInput} — use it for any label that can
 * overflow its box (tiles, chips, tight rows). Reduce-motion falls back to a
 * static ellipsis. The width comes from the parent, so give it a bounded box.
 */
export function MarqueeText({ accessibilityLabel, animate = true, children, style }: MarqueeTextProps) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [textWidth, setTextWidth] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

  // Re-measure whenever the text changes.
  useEffect(() => {
    setTextWidth(null);
  }, [children]);

  // Honour the OS "reduce motion" accessibility setting.
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const overflows = textWidth != null && boxWidth > 0 && textWidth > boxWidth + OVERFLOW_SLOP;
  const marqueeActive = overflows && animate && !reduceMotion;
  const travel = marqueeActive ? (textWidth as number) - boxWidth + END_GAP : 0;

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (!marqueeActive || travel <= 0) {
      return;
    }
    const scrollMs = Math.max(MIN_SCROLL_MS, Math.round(travel * MS_PER_PX));
    const loop = Animated.loop(
      Animated.sequence([
        // Single direction: hold, scroll once to reveal the whole label, hold,
        // then jump straight back to the start (no reverse scroll) and repeat.
        Animated.delay(HOLD_MS),
        Animated.timing(translateX, { toValue: -travel, duration: scrollMs, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(HOLD_MS),
        Animated.timing(translateX, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [marqueeActive, travel, translateX]);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setBoxWidth(event.nativeEvent.layout.width)}
      style={{ overflow: "hidden", width: "100%" }}
    >
      {/* Base copy: establishes line height, and is shown as-is when not scrolling.
          Made invisible (but kept for height) while the scrolling overlay runs. */}
      <Text
        accessibilityLabel={accessibilityLabel ?? children}
        numberOfLines={1}
        style={[style, marqueeActive ? { opacity: 0 } : null]}
      >
        {children}
      </Text>
      {marqueeActive ? (
        <View
          pointerEvents="none"
          style={{ alignItems: "flex-start", bottom: 0, justifyContent: "center", left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 }}
        >
          {/* Fixed to the measured intrinsic width so RN can't ellipsize the
              single-line text to the clip box and hide part of the label. */}
          <Animated.View style={{ transform: [{ translateX }], width: textWidth ?? undefined }}>
            <Text numberOfLines={1} style={[style, { textAlign: "left" }]}>
              {children}
            </Text>
          </Animated.View>
        </View>
      ) : null}
      {textWidth == null ? (
        // Invisible measuring clone: absolutely positioned (no layout impact),
        // wide enough that the text takes its intrinsic width.
        <View pointerEvents="none" style={{ left: 0, opacity: 0, overflow: "hidden", position: "absolute", top: 0, width: 4000 }}>
          <Text
            numberOfLines={1}
            onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
            style={[style, { alignSelf: "flex-start", textAlign: "left" }]}
          >
            {children}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
