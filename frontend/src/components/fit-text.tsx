import { Text, type TextProps } from "react-native";

export type FitTextProps = Omit<TextProps, "adjustsFontSizeToFit"> & {
  /** The smallest the text may get, as a share of its own size. Below that it ends in an ellipsis. */
  minimumFontScale?: number;
};

/**
 * Text that gets smaller to fit its space instead of spilling over or being
 * cut (user, 2026-10-28: "on every card app wide make the font size dynamic").
 * One line unless told otherwise. On a phone this is the platform's own
 * fitting. The browser has none, so `fit-text.web.tsx` measures instead.
 *
 * <p>It only ever changes the size of its own text, never the layout: it
 * shrinks within the space its style already gives it. A name that should
 * give way beside a chip says so itself (`flex: 1`, `minWidth: 0`).
 */
export function FitText({ minimumFontScale = 0.7, numberOfLines = 1, style, ...props }: FitTextProps) {
  return <Text {...props} adjustsFontSizeToFit minimumFontScale={minimumFontScale} numberOfLines={numberOfLines} style={style} />;
}
