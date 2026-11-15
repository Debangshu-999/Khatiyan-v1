import { Text, type TextProps } from "react-native";

export type ModalTitleProps = Omit<TextProps, "adjustsFontSizeToFit" | "numberOfLines"> & {
  minimumFontScale?: number;
  /** A person's name stays on one line and shrinks to fit, never broken across lines. */
  personName?: boolean;
  /**
   * The whole width, for a dialog with no close button beside its title (user,
   * 2026-11-07: "Your session has expired" broke onto two lines with room to spare).
   */
  fullWidth?: boolean;
};

/**
 * A modal heading, inside its own slot so sibling controls keep their room.
 *
 * <p>A title too long for the width wraps onto the next line at its full size, a word
 * split with a hyphen when it must be, as food apps title a dish (user, 2026-11-07).
 * A person's name is the exception: it keeps to one line and shrinks.
 */
export function ModalTitle({ style, fullWidth = false, minimumFontScale = 0.65, personName = false, ...props }: ModalTitleProps) {
  const span = fullWidth ? "100%" : "80%";
  if (personName) {
    return <Text
      accessibilityRole="header"
      {...props}
      adjustsFontSizeToFit
      minimumFontScale={minimumFontScale}
      numberOfLines={1}
      style={[style, { flexShrink: 1, maxWidth: span, minWidth: 0, width: span }]}
    />;
  }
  return <Text
    accessibilityRole="header"
    android_hyphenationFrequency="normal"
    textBreakStrategy="highQuality"
    {...props}
    style={[style, { flexShrink: 1, maxWidth: span, minWidth: 0, width: span }]}
  />;
}
