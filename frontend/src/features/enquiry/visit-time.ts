const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A visit date as the three parts a day chip shows.
 *
 * <p>Read straight off the YYYY-MM-DD text. Going through `new Date("2026-10-05")`
 * would parse it as midnight UTC and can land on the day before in a timezone
 * behind it. A visit date is a calendar day, not an instant.
 */
export function dayParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  // Built from parts, in local time, only to ask which weekday it is.
  const weekday = new Date(year, month - 1, day).getDay();
  return { day, month: MONTHS[month - 1], weekday: WEEKDAYS[weekday] };
}

/** "4:00 pm" from the server's "16:00:00". */
export function formatSlotTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "pm" : "am"}`;
}

/** "10:00 am to 11:00 am". */
export function formatSlotRange(startTime: string, endTime: string) {
  return `${formatSlotTime(startTime)} to ${formatSlotTime(endTime)}`;
}

/** "Sun 5 Oct". */
export function formatVisitDay(date: string) {
  const parts = dayParts(date);
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

/** "Sun 5 Oct, 4:00 pm": the same wording the notifications use. */
export function formatVisitWhen(date: string, slotStart: string) {
  return `${formatVisitDay(date)}, ${formatSlotTime(slotStart)}`;
}

/** "3 spots left", "1 spot left", or "Full". */
export function formatSpotsLeft(spotsLeft: number) {
  if (spotsLeft <= 0) {
    return "Full";
  }
  return spotsLeft === 1 ? "1 spot left" : `${spotsLeft} spots left`;
}
