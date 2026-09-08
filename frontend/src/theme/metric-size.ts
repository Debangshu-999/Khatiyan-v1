/**
 * How big a metric's number should be, from how long it is.
 *
 * <p>
 * <b>Not {@code adjustsFontSizeToFit}.</b> That prop shrinks text on native but
 * is a no-op on React Native Web, so a figure that fitted on a phone ellipsised
 * in the browser — "₹51,001" became "₹51,0…", which is not a number. Measuring
 * the string gives the same answer on both, and it is deterministic: the same
 * value is the same size on every card that shows it.
 *
 * <p>
 * Four steps, because that is what these figures actually span: a count ("12"),
 * a fraction or short amount ("4/28", "₹1,200"), a full rupee figure
 * ("₹51,001"), and a long one ("₹12,45,001"). Anything longer than that wants a
 * compact format rather than a smaller font.
 *
 * <p>
 * The base is the card's own scale — 23 in a metric tile, 28 for a card's
 * headline — so a big card stays bigger than a small one at every length.
 */
export function metricFontSize(value: string, base: number) {
  const length = value.trim().length;
  if (length <= 4) {
    return base;
  }
  if (length <= 7) {
    return Math.round(base * 0.87);
  }
  if (length <= 10) {
    return Math.round(base * 0.74);
  }
  return Math.round(base * 0.62);
}
