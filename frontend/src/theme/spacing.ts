export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radii = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  pill: 999,

  /**
   * Every card's corner, and the only value a card may use.
   *
   * <p>Cards used to round anywhere between 12 and 24 depending on who wrote
   * them, which read as several different surfaces rather than one. This is the
   * rule: a card is a card, and it is this round.
   *
   * <p>The exception is a LONG card that is itself the press target — a
   * property in a list, a room, a bill you tap to open. Those stay more rounded,
   * because the softer corner is what makes a large block read as one tappable
   * object rather than a section of the page. Leave those as they are.
   *
   * <p>Not for modals, dialogs, sheets, inputs, images or pills. A modal is not
   * a card, and each of those already has a corner of its own.
   */
  card: 10,
};

/**
 * How wide a centred dialog may get.
 *
 * <p>Wider than any phone, so on a phone the dialog simply fills the gutter its
 * overlay already leaves — which is what "screen width" means there. The cap
 * only bites on a tablet, where a dialog stretched edge to edge stops reading
 * as a dialog.
 *
 * <p>One number because four hand-picked ones (330, 340, 420, none) made two
 * dialogs opened from the same screen visibly different widths.
 */
export const DIALOG_MAX_WIDTH = 520;

