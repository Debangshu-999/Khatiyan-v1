import { Platform, Text, type TextProps, type TextStyle } from "react-native";

/**
 * Hyphenation on the web. RN-web passes these through as CSS, and the page's
 * `lang` lets the browser pick where a word may break.
 */
const WEB_WRAP = { hyphens: "auto", overflowWrap: "break-word", wordBreak: "normal" } as unknown as TextStyle;

/**
 * A card's title, a dish, a place or a facility (user, 2026-11-07): the full name at
 * full size, wrapping onto the next line as food apps title a dish, a word split with
 * a hyphen only when it cannot fit. Never a marquee, never shrunk.
 *
 * <p>A person's name is the exception and stays one line (`FitText`, `cardName`).
 */
export function WrapTitle({ style, ...props }: TextProps) {
  return (
    <Text
      android_hyphenationFrequency="normal"
      textBreakStrategy="highQuality"
      {...props}
      style={[Platform.OS === "web" ? WEB_WRAP : null, style]}
    />
  );
}
