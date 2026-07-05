import { forwardRef, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

// Strip characters that need 4-byte UTF-8 — the astral plane (code points
// >= U+10000), which is where essentially all emoji live. This keeps stored text
// within the 3-byte UTF-8 range the backend expects. Intentionally BMP-safe: it
// does NOT touch 3-byte joiners/marks (e.g. U+200D ZWJ) that Indic scripts rely
// on for conjuncts, so Indian names are never corrupted.
const DISALLOWED = /[\u{10000}-\u{10FFFF}]/gu;

export function sanitizeInputText(value: string): string {
  return value.replace(DISALLOWED, "");
}

/**
 * App-wide text input. Behaviours applied to every field:
 *  - emoji / 4-byte characters are stripped from input (see {@link sanitizeInputText});
 *  - single-line fields keep placeholders on ONE line: Android (notably MIUI)
 *    wraps long hint text downward and clips it regardless of numberOfLines.
 *    The placeholder's true rendered width is MEASURED via an invisible clone
 *    (correct across font scale / display zoom / letter spacing) and the text
 *    is ellipsised only when it genuinely overflows the field.
 * All other TextInput props pass straight through.
 */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(function AppTextInput(
  { multiline, numberOfLines, onChangeText, onLayout, placeholder, ...props },
  ref,
) {
  const [fieldWidth, setFieldWidth] = useState(0);
  const [placeholderWidth, setPlaceholderWidth] = useState<number | null>(null);

  // Re-measure whenever the placeholder text changes.
  useEffect(() => {
    setPlaceholderWidth(null);
  }, [placeholder]);

  const flat = StyleSheet.flatten(props.style) ?? {};
  const measureFont = {
    fontFamily: flat.fontFamily,
    fontSize: typeof flat.fontSize === "number" ? flat.fontSize : 14,
    fontWeight: flat.fontWeight,
    letterSpacing: flat.letterSpacing,
  } as const;

  const horizontalPadding =
    (typeof flat.paddingHorizontal === "number" ? flat.paddingHorizontal * 2 : 0)
    + (typeof flat.paddingLeft === "number" ? flat.paddingLeft : 0)
    + (typeof flat.paddingRight === "number" ? flat.paddingRight : 0);

  let fittedPlaceholder = placeholder;
  if (!multiline && placeholder && fieldWidth > 0 && placeholderWidth != null) {
    const available = fieldWidth - horizontalPadding - 2;
    if (placeholderWidth > available && available > 0) {
      const fitChars = Math.max(3, Math.floor(placeholder.length * (available / placeholderWidth)) - 1);
      if (fitChars < placeholder.length) {
        fittedPlaceholder = placeholder.slice(0, fitChars).trimEnd() + "…";
      }
    }
  }

  const needsMeasure = !multiline && Boolean(placeholder);

  return (
    <>
      <TextInput
        ref={ref}
        {...props}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : 1}
        onChangeText={onChangeText ? (text) => onChangeText(sanitizeInputText(text)) : undefined}
        onLayout={(event) => {
          setFieldWidth(event.nativeEvent.layout.width);
          onLayout?.(event);
        }}
        placeholder={fittedPlaceholder}
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
    </>
  );
});
