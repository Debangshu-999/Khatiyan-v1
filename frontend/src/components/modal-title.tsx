import { Text, type TextProps } from "react-native";

export type ModalTitleProps = Omit<TextProps, "adjustsFontSizeToFit" | "numberOfLines"> & {
  minimumFontScale?: number;
};

/** Keep a modal heading inside its own slot, leaving sibling controls intact. */
export function ModalTitle({ style, minimumFontScale = 0.65, ...props }: ModalTitleProps) {
  return <Text
    accessibilityRole="header"
    {...props}
    adjustsFontSizeToFit
    minimumFontScale={minimumFontScale}
    numberOfLines={1}
    style={[style, { flexShrink: 1, maxWidth: "80%", minWidth: 0, width: "80%" }]}
  />;
}
