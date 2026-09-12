/**
 * A floor is a number, and 0 is the ground floor.
 *
 * <p>It used to be free text, with "Ground, 1, 2…" as the placeholder, so the
 * same building could end up holding "Ground", "ground", "G", "GF" and "0" as
 * five different floors — and every screen that groups rooms by floor groups on
 * the raw string, so each spelling opened its own section. Making the input
 * numeric removes the problem at the source rather than teaching each reader to
 * fold the spellings back together.
 *
 * <p>Ground is entered as 0 and rendered as "Ground floor". Storing the word
 * would only recreate the free-text problem with extra steps.
 */

/** What owners wrote before the field was numeric, all meaning floor 0. */
const GROUND_SPELLINGS = new Set(["g", "gf", "ground", "ground floor", "0"]);

/** Longest floor we accept. Three digits is already a building nobody has. */
export const MAX_FLOOR_DIGITS = 3;

/** Shown in every floor input. Matches the other numeric fields, which show
 * the shape of the answer rather than a sentence about it. */
export const FLOOR_PLACEHOLDER = "0";

/**
 * What the field is allowed to contain while it is being typed.
 *
 * <p>Digits only, and a leading zero is dropped as soon as a second digit
 * arrives — "01" is the first floor, not a floor of its own. A lone "0" stays,
 * because that is the ground floor.
 */
export function sanitizeFloorInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, MAX_FLOOR_DIGITS);
  if (digits.length <= 1) {
    return digits;
  }
  return digits.replace(/^0+/, "") || "0";
}

/**
 * How a stored floor reads on screen.
 *
 * <p>Handles the free text still sitting in older rooms. The spellings that
 * meant floor 0 are folded into "Ground floor" so those rooms read the same as
 * new ones, and anything else — "Terrace", "Annexe" — is shown as written.
 */
export function formatFloor(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "Unassigned";
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) === 0 ? "Ground floor" : `Floor ${Number(trimmed)}`;
  }

  // Everything below is free text from before floors were numbers.
  const lowered = trimmed.toLowerCase();
  if (GROUND_SPELLINGS.has(lowered)) {
    return "Ground floor";
  }
  // "Terrace", "Annexe", "Block B" — read as written. Prefixing these produced
  // "Floor Terrace", so nothing that is not a number gets a prefix.
  return trimmed;
}

/**
 * Orders floors the way a building does.
 *
 * <p>Numbers ascend numerically, so floor 10 comes after floor 2 rather than
 * after floor 1, which is where sorting them as text put it. Anything
 * non-numeric sorts after the numbers, alphabetically among itself.
 */
export function compareFloors(left: string, right: string) {
  const leftNumber = /^\d+$/.test(left.trim()) ? Number(left.trim()) : null;
  const rightNumber = /^\d+$/.test(right.trim()) ? Number(right.trim()) : null;
  if (leftNumber != null && rightNumber != null) {
    return leftNumber - rightNumber;
  }
  if (leftNumber != null) {
    return -1;
  }
  if (rightNumber != null) {
    return 1;
  }
  return left.localeCompare(right);
}
