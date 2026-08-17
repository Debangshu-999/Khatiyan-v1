import { Platform, type TextStyle } from "react-native";

// Three faces, three jobs.
//
// BRAND is the original characterful serif (Georgia on iOS/web, Noto Serif via
// "serif" on Android) — the ledger / property-deed voice. It is deliberately
// narrow in scope: screen headers, the wordmark, the auth and get-started
// heroes. Nothing else.
//
// DISPLAY is Plus Jakarta Sans ExtraBold — every card title, metric value and
// section heading. It used to point at the serif, which is why numbers in the
// metric tiles read like a 1993 web page. A geometric extra-bold gives those
// surfaces the weight and presence they were missing.
//
// SANS is Inter, for body copy, labels and data. It is the de-facto product-UI
// face: it holds up at the 12px captions this app leans on heavily, and its
// tabular numerals keep money columns aligned.
//
// Loaded by `useAppFonts` in the root layout. Each name below must match a key
// passed to `useFonts` there, or the text silently falls back to the system
// face — which looks like nothing happened rather than like an error.
const brandFamily =
  Platform.select({
    ios: "Georgia",
    android: "serif",
    web: "Georgia, 'Times New Roman', serif",
    default: "serif",
  }) ?? "serif";

const monoFamily =
  Platform.select({
    ios: "Menlo",
    android: "monospace",
    web: "Menlo, Consolas, 'SF Mono', monospace",
    default: "monospace",
  }) ?? "monospace";

export const fonts = {
  /** Plus Jakarta Sans ExtraBold — cards, tiles, metric values. */
  display: "PlusJakartaSans_800ExtraBold",
  /** Plus Jakarta Sans Bold — a step down from display, for card subtitles. */
  displaySoft: "PlusJakartaSans_700Bold",
  /** Inter — body, labels, captions, data. */
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansBold: "Inter_700Bold",
  /** The serif. Screen headers and brand moments only. */
  brand: brandFamily,
  mono: monoFamily,
};

// Reusable text style fragments. Compose with color in the consumer:
//   <Text style={[type.display, { color: colors.ink }]}>Khatiyan</Text>
//
// NOTE ON WEIGHT: with a loaded font family, fontWeight is not what makes text
// bold — the family name is. Each weight is its own file. Leaving a stale
// fontWeight alongside an ExtraBold family is harmless on iOS but makes Android
// synthesise a second bolding pass, so the weights below are deliberately
// omitted where the family already carries them.
export const type = {
  display: {
    fontFamily: fonts.display,
    letterSpacing: -0.4,
  } satisfies TextStyle,
  /** The serif, for screen headers and brand moments. */
  brand: {
    fontFamily: fonts.brand,
    fontWeight: "500",
    letterSpacing: -0.4,
  } satisfies TextStyle,
  brandItalic: {
    fontFamily: fonts.brand,
    fontStyle: "italic",
    fontWeight: "400",
    letterSpacing: -0.3,
  } satisfies TextStyle,
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  } satisfies TextStyle,
  bodyStrong: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 22,
  } satisfies TextStyle,
  caption: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.1,
    lineHeight: 17,
  } satisfies TextStyle,
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    letterSpacing: 0.1,
  } satisfies TextStyle,
  /** Numbers on a metric tile: extra-bold, tight, and column-aligned. */
  metric: {
    fontFamily: fonts.display,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.6,
  } satisfies TextStyle,
  mono: {
    fontFamily: fonts.mono,
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,
};

// Kept as an alias so the many `type.display` call sites that meant "the serif"
// in a brand context can be migrated one at a time rather than in one sweep.
export const displayItalic = type.brandItalic;
