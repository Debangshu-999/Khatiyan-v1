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
  /** Inter SemiBold — the weight all-caps labels are set in. See `type.eyebrow`. */
  sansSemiBold: "Inter_600SemiBold",
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
  /**
   * The app's ONE uppercase style — eyebrows, status pills, overlines, tab
   * labels. Everything set in caps goes through here.
   *
   * <p>Set the way product UI conventionally sets caps micro-labels: a neutral
   * grotesque at SemiBold with roughly 0.08em of tracking. Both halves of that
   * are a change from what this was.
   *
   * <p>WEIGHT — 600, not 700. Capitals carry more ink than lowercase at the
   * same size, so a weight that looks right in a sentence looks blunt in caps;
   * dropping one step keeps the label reading as a label rather than as a
   * heading competing with the title under it.
   *
   * <p>TRACKING — caps need positive tracking because they lack the ascenders
   * and descenders that space lowercase for you, but 1.8 at 11px is ~0.16em,
   * roughly double the convention, and at that width a two-word eyebrow stops
   * reading as one phrase. 0.9 is ~0.08em.
   *
   * <p>Both numbers were also drifting: six hand-rolled copies of this style
   * across the app ran tracking at 1.8, 1.6, 1.2, 1.0, 0.9, 0.8 and 0.6. They
   * now all defer here.
   */
  eyebrow: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  } satisfies TextStyle,
  /**
   * Terms of an agreement, in the owner's own words: the penalty for leaving
   * early, the premature-exit policy, what rent and the damage schedule are
   * bound to.
   *
   * <p>The SERIF, not the UI sans. These sentences are the document itself
   * rather than chrome describing it, and setting them in the same face as the
   * buttons around them let a term someone is agreeing to read as a hint. The
   * serif is already the app's deed voice — this is the one body-copy use of
   * it.
   *
   * <p>Also carries the message on a nudge and the body of an enquiry: someone
   * else's words, quoted, rather than the app talking.
   *
   * <p>No negative tracking, unlike `type.brand`: that is tightened for
   * headline sizes and would crowd a paragraph.
   *
   * <p>`fontWeight` works here, unlike everywhere else in this file: the note
   * at the top applies to the LOADED families, where each weight is its own
   * file and the family name carries it. The serif is the platform’s own
   * (Georgia / Noto Serif), so the system picks the face.
   *
   * <p>700, not 600. React Native resolves a named Android family through
   * `Typeface.create(family, style)`, whose style is a two-state bold flag —
   * anything under 700 lands on NORMAL and renders identically to unweighted
   * text. 600 looked correct in the style object and changed nothing on screen.
   */
  policy: {
    fontFamily: fonts.brand,
    fontSize: 14,
    // The KEYWORD, not 700. React Native maps "bold" straight onto
    // Typeface.BOLD; a numeric weight goes through a resolver that, for a
    // platform family name like "serif", has repeatedly come back NORMAL. 600
    // and 700 both looked right in the style object and rendered unweighted.
    fontWeight: "bold",
    lineHeight: 21,
  } satisfies TextStyle,
  /**
   * Someone else's words, quoted: the message on a nudge, the body of an
   * enquiry.
   *
   * <p>The same serif as `type.policy` and deliberately NOT bold. Both are
   * voices other than the app's, which is why they share a face — but a term
   * being agreed to should carry more weight than a message being passed
   * along, and setting a nudge in the same bold made every one of them read
   * like a demand.
   */
  quote: {
    fontFamily: fonts.brand,
    fontSize: 14,
    lineHeight: 21,
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
  /**
   * A small action label — the text inside a pill button or an inline control.
   *
   * <p>Title case in Plus Jakarta, NOT the uppercase Inter of `type.eyebrow`.
   * An eyebrow names a section you are about to read; this names something you
   * are about to DO, and setting the two identically made every button look like
   * a heading that had wandered into the wrong row.
   */
  action: {
    fontFamily: fonts.displaySoft,
    fontSize: 12.5,
    letterSpacing: 0,
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
