import { Image, View, type ImageSourcePropType } from "react-native";
import type { LucideProps } from "lucide-react-native";

/**
 * Roughly how much of its nominal box a lucide glyph's strokes actually cover.
 *
 * <p>A 24pt lucide icon draws inside a 24 viewBox with about a unit of margin,
 * so the mark itself is ~20 of 24. Artwork is matched to this, which is what
 * makes an illustration and a line icon at {@code size={24}} look like the same
 * size rather than merely occupy the same square.
 */
const LUCIDE_INK = 0.82;

/**
 * An illustration shaped like a lucide icon component.
 *
 * <p>
 * Every card, tab and tile in the app takes {@code icon: ComponentType<LucideProps>}.
 * Wrapping an image in that same shape means a call site swaps
 * {@code icon={Banknote}} for {@code icon={MoneyIcon}} and nothing else changes
 * — no prop-type churn, and a card can carry either without knowing which.
 *
 * <p>
 * <b>{@code color} and {@code strokeWidth} are accepted and ignored.</b> The
 * artwork has its own colours. That is why these belong only where the glyph is
 * drawn in ink at rest — a card's rail, a tab, a dashboard box. Inside a filled
 * button, where the icon must turn white against the fill, or on a control that
 * greys out when disabled, the line icon has to stay.
 *
 * <p>
 * <b>{@code inkFill} is the fix for "why is this one tiny".</b> Two PNGs at the
 * same 72x72 export can hold very different amounts of drawing: money.png's
 * notes span 54px of their canvas, property.png's buildings only 35px. Drawn at
 * the same box the property mark came out barely half the size of everything
 * beside it. So the caller states what fraction of the canvas is actually ink
 * (measure the alpha bounding box), and the image is drawn UP by whatever it
 * takes to land that ink at {@code size}.
 *
 * <p>
 * The wrapper stays exactly {@code size}, so an over-drawn image never pushes
 * its neighbours in a row — the extra width is the file's own transparent
 * padding and hangs harmlessly outside.
 */
export function artworkIcon(source: ImageSourcePropType, inkFill: number) {
  return function ArtworkIcon({ size = 24 }: LucideProps) {
    const box = typeof size === "number" ? size : Number(size) || 24;
    const drawn = Math.round(box * (LUCIDE_INK / inkFill));

    return (
      <View style={{ alignItems: "center", height: box, justifyContent: "center", overflow: "visible", width: box }}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={source}
          style={{ height: drawn, width: drawn }}
        />
      </View>
    );
  };
}

/** Rupee notes — the app's mark for money billed, collected or paid out. */
export const MoneyIcon = artworkIcon(require("../../assets/workspace/money.png"), 0.75);

/**
 * A property, as artwork.
 *
 * <p>Does NOT replace {@code PropertyIcon}, which is drawn as an SVG precisely
 * so it can take the colour of whatever it sits in — a white-on-blue CTA, a
 * tinted filter chip, a role badge. This is for the places the mark stands on
 * its own in ink: the Home selector, the floor picker, the property card, the
 * dashboard box.
 */
export const PropertyArtwork = artworkIcon(require("../../assets/workspace/property.png"), 0.49);

/** A payment claim — a tenant saying they have paid, waiting to be checked. */
export const PaymentClaimsIcon = artworkIcon(require("../../assets/workspace/payment_claims.png"), 0.53);

/**
 * A notice on the property board.
 *
 * <p>The module tile's own artwork, reused at glyph size — 234px of source for
 * a 30pt mark, so there is nothing to gain from a second file.
 */
export const NoticeIcon = artworkIcon(require("../../assets/workspace/notice-module.png"), 0.64);

/** Money going out — the budget and what has been spent against it. */
export const ExpenseIcon = artworkIcon(require("../../assets/workspace/expense_tracker.png"), 0.54);

/**
 * Line art shaped like a lucide icon — and, unlike {@link artworkIcon}, it
 * takes a colour.
 *
 * <p>
 * The source is a black drawing on transparency, so {@code tintColor} repaints
 * every opaque pixel and the anti-aliased edges come along with it. That buys
 * back the two things a coloured illustration cannot do: follow a state (the
 * live-digest tiles turn their glyph blue when the count is non-zero and grey
 * when it is not) and survive dark mode, where a black mark on a dark card is
 * simply not there.
 *
 * <p>
 * Drawn at its true size, not enlarged. Line art already has a lucide glyph's
 * optical weight — that is what it is — so the ink-fill correction the filled
 * illustrations need would make this one too big.
 */
export function lineArtIcon(source: ImageSourcePropType, inkFill: number) {
  return function LineArtIcon({ color, size = 24 }: LucideProps) {
    const box = typeof size === "number" ? size : Number(size) || 24;
    const drawn = Math.round(box * (LUCIDE_INK / inkFill));

    return (
      <View style={{ alignItems: "center", height: box, justifyContent: "center", overflow: "visible", width: box }}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={source}
          style={{ height: drawn, tintColor: color, width: drawn }}
        />
      </View>
    );
  };
}

/**
 * Notes going into a collection box — rent coming in over the month.
 *
 * <p>Distinct from {@link MoneyIcon}, which is a bill: this one is the act of
 * collecting, which is what a collection RATE measures.
 */
export const CollectionIcon = artworkIcon(require("../../assets/workspace/money-collection.png"), 0.69);

/**
 * Two banknotes — money that has actually moved, as opposed to money billed.
 *
 * <p>Background removed from the supplied 192px drawing: the paper became the
 * alpha channel, so the greys along each stroke are partial alpha rather than a
 * white halo waiting to appear on the first non-white card it lands on.
 */
export const CollectedIcon = lineArtIcon(require("../../assets/workspace/money_linedraw.png"), 0.76);
