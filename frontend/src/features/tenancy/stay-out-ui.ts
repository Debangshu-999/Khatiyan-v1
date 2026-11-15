import { MEAL_LABEL, MEAL_ORDER } from "@/features/food/food-ui";
import type { MealType } from "@/store/services/property-api";

/** Declared stay outs' words, shared by the tenant's and the owner's screens (2026-11-08). */

/** "Fri 14 Nov" for a "YYYY-MM-DD" day, in IST. */
export function stayOutDay(value: string) {
  const date = new Date(`${value}T12:00:00+05:30`);
  if (!Number.isFinite(date.getTime())) return value;
  // Built from parts: the locale puts a comma after the weekday ("Mon, 9 Nov").
  const parts = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata", weekday: "short" })
    .formatToParts(date);
  const part = (kind: Intl.DateTimeFormatPartTypes) => parts.find((piece) => piece.type === kind)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/** "9 Nov" for a "YYYY-MM-DD" day, in IST: a card title that needs no weekday. */
export function stayOutShortDay(value: string) {
  const date = new Date(`${value}T12:00:00+05:30`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** "after lunch" / "before breakfast". Nothing where the property serves no food. */
export function leavingPart(lastMealHere: MealType | null, meals: MealType[]) {
  if (meals.length === 0) return "";
  return lastMealHere ? `after ${MEAL_LABEL[lastMealHere].toLowerCase()}` : `before ${MEAL_LABEL[meals[0]].toLowerCase()}`;
}

/** "for dinner" / "after dinner". Nothing where the property serves no food. */
export function returnPart(firstMealBack: MealType | null, meals: MealType[]) {
  if (meals.length === 0) return "";
  return firstMealBack
    ? `for ${MEAL_LABEL[firstMealBack].toLowerCase()}`
    : `after ${MEAL_LABEL[meals[meals.length - 1]].toLowerCase()}`;
}

/**
 * Whether the stay out takes its tenant off {@code meal} on {@code day}, by the
 * server's rule (StayOut.isAwayFor): the leaving day keeps meals up to the last
 * one here, the return day starts again at the first one back.
 */
export function awayFor(
  stay: { leaveDate: string; lastMealHere: MealType | null; returnDate: string; firstMealBack: MealType | null },
  day: string,
  meal: MealType,
) {
  if (day < stay.leaveDate || day > stay.returnDate) return false;
  const rank = MEAL_ORDER.indexOf(meal);
  if (day === stay.leaveDate) return stay.lastMealHere == null || rank > MEAL_ORDER.indexOf(stay.lastMealHere);
  if (day === stay.returnDate) return stay.firstMealBack == null || rank < MEAL_ORDER.indexOf(stay.firstMealBack);
  return true;
}

/** Each day of the stay out with the served meals it takes off, for the summary line. */
export function mealsOff(
  stay: { leaveDate: string; lastMealHere: MealType | null; returnDate: string; firstMealBack: MealType | null },
  meals: MealType[],
): { day: string; meals: MealType[] }[] {
  const days: { day: string; meals: MealType[] }[] = [];
  if (!stay.leaveDate || !stay.returnDate || stay.returnDate <= stay.leaveDate || meals.length === 0) return days;
  for (let day = stay.leaveDate; day <= stay.returnDate; day = nextDay(day)) {
    const off = meals.filter((meal) => awayFor(stay, day, meal));
    if (off.length) days.push({ day, meals: off });
    if (days.length > 70) break;
  }
  return days;
}

export function nextDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
