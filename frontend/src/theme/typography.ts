import { Platform, type TextStyle } from "react-native";

// System-font stack — zero new packages, safe on Expo 56. Display is a
// characterful serif (Georgia on iOS/web, Noto Serif via "serif" on Android)
// to match the ledger / property-deed aesthetic. Mono is for tabular numerals
// — money, distances, OTPs — so figures line up like a printed ledger.
const displayFamily =
  Platform.select({
    ios: "Georgia",
    android: "serif",
    web: "Georgia, 'Times New Roman', serif",
    default: "serif",
  }) ?? "serif";

const sansFamily =
  Platform.select({
    ios: "System",
    android: "Roboto",
    web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    default: "System",
  }) ?? "System";

const monoFamily =
  Platform.select({
    ios: "Menlo",
    android: "monospace",
    web: "Menlo, Consolas, 'SF Mono', monospace",
    default: "monospace",
  }) ?? "monospace";

export const fonts = {
  display: displayFamily,
  sans: sansFamily,
  mono: monoFamily,
};

// Reusable text style fragments. Compose with color in the consumer:
//   <Text style={[type.display, { color: colors.ink }]}>Khatiyan</Text>
export const type = {
  display: {
    fontFamily: fonts.display,
    fontWeight: "500",
    letterSpacing: -0.4,
  } satisfies TextStyle,
  displayItalic: {
    fontFamily: fonts.display,
    fontStyle: "italic",
    fontWeight: "400",
    letterSpacing: -0.3,
  } satisfies TextStyle,
  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
  } satisfies TextStyle,
  bodyStrong: {
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  } satisfies TextStyle,
  caption: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.1,
    lineHeight: 17,
  } satisfies TextStyle,
  label: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  } satisfies TextStyle,
  mono: {
    fontFamily: fonts.mono,
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,
};
