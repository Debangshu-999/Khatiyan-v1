import { forwardRef, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

// Strip characters that need 4-byte UTF-8 — the astral plane (code points
// >= U+10000), which is where essentially all emoji live. This keeps stored text
// within the 3-byte UTF-8 range the backend expects. Intentionally BMP-safe: it
// does NOT touch 3-byte joiners/marks (e.g. U+200D ZWJ) that Indic scripts rely
// on for conjuncts, so Indian names are never corrupted.
const DISALLOWED = /[\u{10000}-\u{10FFFF}]/gu;

export function sanitizeInputText(value: string): string {
  return value.replace(DISALLOWED, "");
}

export type AppTextInputProps = TextInputProps & {
  /**
   * When a single-line placeholder is too long to fit, scroll it back and
   * forth (marquee) instead of ellipsising it. On by default; set false to keep
   * the static ellipsised placeholder (used by the map picker's search box).
   */
  marqueePlaceholder?: boolean;
};

// Layout props are lifted onto the relative wrapper so the animated placeholder
// overlay can anchor to the field; everything visual stays on the TextInput.
const OUTER_STYLE_KEYS = new Set<string>([
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "marginHorizontal", "marginVertical", "marginStart", "marginEnd",
  "flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf",
  "width", "minWidth", "maxWidth",
]);

const num = (value: unknown): number => (typeof value === "number" ? value : 0);

// Marquee timing.
const END_GAP = 24; // trailing breathing room so the last glyph isn't flush at the clip edge
const HOLD_MS = 900; // pause at each end before reversing
const MIN_SCROLL_MS = 1400;
const MS_PER_PX = 16;
const OVERFLOW_SLOP = 6; // ignore sub-pixel/tiny overflow — not worth animating

/**
 * App-wide text input. Behaviours applied to every field:
 *  - emoji / 4-byte characters are stripped from input (see {@link sanitizeInputText});
 *  - single-line fields keep placeholders on ONE line: Android (notably MIUI)
 *    wraps long hint text downward and clips it regardless of numberOfLines.
 *    The placeholder's true rendered width is MEASURED via an invisible clone
 *    (correct across font scale / display zoom / letter spacing);
 *  - when a placeholder genuinely overflows, it SCROLLS back and forth (marquee)
 *    so the full text is readable — the native placeholder can't be animated, so
 *    it's suppressed and an Animated overlay draws the scrolling copy. Reduce-
 *    motion and `marqueePlaceholder={false}` both fall back to a static ellipsis.
 * All other TextInput props pass straight through.
 */
export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(function AppTextInput(
  {
    defaultValue,
    marqueePlaceholder = true,
    multiline,
    numberOfLines,
    onBlur,
    onChangeText,
    onFocus,
    onLayout,
    placeholder,
    placeholderTextColor,
    style,
    value,
    ...rest
  },
  ref,
) {
  const [fieldWidth, setFieldWidth] = useState(0);
  const [placeholderWidth, setPlaceholderWidth] = useState<number | null>(null);
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [focused, setFocused] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

  // Re-measure whenever the placeholder text changes.
  useEffect(() => {
    setPlaceholderWidth(null);
  }, [placeholder]);

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

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const measureFont = {
    fontFamily: flat.fontFamily,
    fontSize: typeof flat.fontSize === "number" ? flat.fontSize : 14,
    fontWeight: flat.fontWeight,
    letterSpacing: flat.letterSpacing,
  } as const;

  // Content box: field width minus the field's own padding + border.
  const padLeft = num(flat.paddingLeft) || num(flat.paddingHorizontal) || num(flat.padding);
  const padRight = num(flat.paddingRight) || num(flat.paddingHorizontal) || num(flat.padding);
  const borderLeft = num(flat.borderLeftWidth) || num(flat.borderWidth);
  const borderRight = num(flat.borderRightWidth) || num(flat.borderWidth);
  const available = fieldWidth - padLeft - padRight - borderLeft - borderRight;

  const measured = !multiline && Boolean(placeholder) && fieldWidth > 0 && placeholderWidth != null;
  const overflows = measured && (placeholderWidth as number) > available + OVERFLOW_SLOP;

  const currentValue = value !== undefined ? value : internalValue;
  const isEmpty = (currentValue ?? "").length === 0;

  // The placeholder disappears the moment the field is FOCUSED (not on first
  // keystroke): tapping a field signals intent, so the hint yields immediately.
  const marqueeActive = Boolean(placeholder) && overflows && isEmpty && !focused && marqueePlaceholder && !reduceMotion;
  const travel = marqueeActive ? (placeholderWidth as number) - available + END_GAP : 0;

  // Static ellipsis — used when overflow can't/shouldn't animate (reduce motion,
  // marquee disabled, or the field is non-empty and the placeholder is hidden).
  let fittedPlaceholder = placeholder;
  if (overflows && !marqueeActive && placeholder) {
    const fitChars = Math.max(3, Math.floor(placeholder.length * (available / (placeholderWidth as number))) - 1);
    if (fitChars < placeholder.length) {
      fittedPlaceholder = placeholder.slice(0, fitChars).trimEnd() + "…";
    }
  }

  // Drive the back-and-forth scroll while active.
  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (!marqueeActive || travel <= 0) {
      return;
    }
    const scrollMs = Math.max(MIN_SCROLL_MS, Math.round(travel * MS_PER_PX));
    const loop = Animated.loop(
      Animated.sequence([
        // Hold at the start so the beginning is readable...
        Animated.delay(HOLD_MS),
        // ...scroll once to reveal the whole text end-to-end...
        Animated.timing(translateX, {
          toValue: -travel,
          duration: scrollMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // ...hold at the end, then jump straight back to the start (NO reverse
        // scroll) and repeat.
        Animated.delay(HOLD_MS),
        Animated.timing(translateX, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [marqueeActive, travel, translateX]);

  // Split layout props onto the wrapper; keep visual props on the field.
  const outerStyle: Record<string, unknown> = { position: "relative" };
  const innerStyle: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(flat)) {
    if (OUTER_STYLE_KEYS.has(key)) {
      outerStyle[key] = val;
    } else {
      innerStyle[key] = val;
    }
  }
  innerStyle.width = "100%";

  const needsMeasure = !multiline && Boolean(placeholder);

  const handleChangeText = (text: string) => {
    const clean = sanitizeInputText(text);
    if (value === undefined) {
      setInternalValue(clean);
    }
    onChangeText?.(clean);
  };

  return (
    <View style={outerStyle as ViewStyle}>
      <TextInput
        ref={ref}
        {...rest}
        defaultValue={defaultValue}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : 1}
        onChangeText={handleChangeText}
        onLayout={(event: LayoutChangeEvent) => {
          setFieldWidth(event.nativeEvent.layout.width);
          onLayout?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholder={marqueeActive || focused ? "" : fittedPlaceholder}
        placeholderTextColor={placeholderTextColor}
        style={innerStyle as TextStyle}
        value={value}
      />
      {needsMeasure && placeholderWidth == null ? (
        // Invisible measuring clone: absolutely positioned (no layout impact),
        // wide enough that the text takes its intrinsic width.
        <View pointerEvents="none" style={{ left: 0, opacity: 0, overflow: "hidden", position: "absolute", top: 0, width: 1200 }}>
          <Text
            numberOfLines={1}
            onLayout={(event) => setPlaceholderWidth(event.nativeEvent.layout.width)}
            style={{ alignSelf: "flex-start", ...measureFont }}
          >
            {placeholder}
          </Text>
        </View>
      ) : null}
      {marqueeActive ? (
        // Scrolling placeholder overlay. Clipped to the field's content box and
        // non-interactive so taps/focus fall through to the TextInput beneath.
        <View
          pointerEvents="none"
          style={{
            alignItems: "flex-start",
            bottom: 0,
            justifyContent: "center",
            left: padLeft + borderLeft,
            overflow: "hidden",
            position: "absolute",
            right: padRight + borderRight,
            top: 0,
          }}
        >
          {/* Fix the scrolling text to its measured intrinsic width: inside the
              fixed-width clip box RN would otherwise ellipsize a numberOfLines=1
              Text to the box width, so it could never reveal the whole message. */}
          <Animated.View style={{ transform: [{ translateX }], width: placeholderWidth ?? undefined }}>
            <Text numberOfLines={1} style={{ color: placeholderTextColor as string | undefined, ...measureFont }}>
              {placeholder}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
});
