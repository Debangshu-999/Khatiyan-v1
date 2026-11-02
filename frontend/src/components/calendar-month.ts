// The calendar's arithmetic. Dates here are "YYYY-MM-DD" strings and months are
// "YYYY-MM", which sort as they read, so a bound is a plain string comparison.

/** Local date parts, never toISOString(): that converts to UTC first, so a date picked in IST before 5:30am comes back as the previous day. */
export function isoOfDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Noon, so no timezone conversion on the way to the server can move it to another day. */
export function dateOfIso(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function stepMonth(month: string, delta: number) {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Six rows of seven from Sunday, with null outside the month. Always 42, so the sheet does not change height between months. */
export function monthCells(month: string): (string | null)[] {
  const [year, index] = month.split("-").map(Number);
  const leading = new Date(year, index - 1, 1).getDay();
  const days = new Date(year, index, 0).getDate();
  return Array.from({ length: 42 }, (_, cell) => {
    const day = cell - leading + 1;
    return day >= 1 && day <= days ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
}

export function dayAllowed(iso: string, minimum?: string, maximum?: string) {
  return (!minimum || iso >= minimum) && (!maximum || iso <= maximum);
}

/** The picked date's month, else the month the caller asked for, else this month, always inside the bounds. */
export function openingMonth({
  initialMonth,
  maximum,
  minimum,
  today,
  value,
}: {
  initialMonth?: string;
  maximum?: string;
  minimum?: string;
  today: string;
  value?: string | null;
}) {
  const month = (value ? value.slice(0, 7) : initialMonth) ?? today.slice(0, 7);
  if (minimum && month < minimum.slice(0, 7)) return minimum.slice(0, 7);
  if (maximum && month > maximum.slice(0, 7)) return maximum.slice(0, 7);
  return month;
}
