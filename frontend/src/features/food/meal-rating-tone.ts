/**
 * A rating's colour (user, 2026-11-02): red under 2.5, yellow from 2.5 to 3.9, green
 * from 4. Read at one place, as it is shown, so a 3.96 on screen as 4.0 is green.
 */
export function ratingBand(rating: number): "RED" | "YELLOW" | "GREEN" {
  const shown = Math.round(rating * 10) / 10;
  if (shown < 2.5) {
    return "RED";
  }
  return shown < 4 ? "YELLOW" : "GREEN";
}

export function ratingColor(rating: number, colors: { danger: string; jade: string; warningText: string }) {
  const band = ratingBand(rating);
  return band === "RED" ? colors.danger : band === "YELLOW" ? colors.warningText : colors.jade;
}

/** The graph's y axis: a rating is always out of 5. */
export const RATING_SCALE = { max: 5, min: 1, ticks: [1, 2, 3, 4, 5] };

/** The same axis for bars, which rise from nothing, so a rating of 1 still has a height. */
export const RATING_BAR_SCALE = { max: 5, min: 0, ticks: [1, 2, 3, 4, 5] };
