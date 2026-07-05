// Weekday working pattern for daily-wage staff, mirroring the backend WorkingDays
// mask (Mon=bit0 .. Sun=bit6; 127 = every day of the week).

export const ALL_DAYS_MASK = 0b1111111; // 127

export const WEEKDAYS: { bit: number; label: string }[] = [
  { bit: 0, label: "Mon" },
  { bit: 1, label: "Tue" },
  { bit: 2, label: "Wed" },
  { bit: 3, label: "Thu" },
  { bit: 4, label: "Fri" },
  { bit: 5, label: "Sat" },
  { bit: 6, label: "Sun" },
];

export function normalizeMask(mask: number) {
  return mask <= 0 || mask > ALL_DAYS_MASK ? ALL_DAYS_MASK : mask;
}

export function hasDay(mask: number, bit: number) {
  return (normalizeMask(mask) & (1 << bit)) !== 0;
}

export function toggleDay(mask: number, bit: number) {
  return mask ^ (1 << bit);
}

export function weekdaysLabel(mask: number) {
  const effective = normalizeMask(mask);
  if (effective === ALL_DAYS_MASK) return "All week";
  const days = WEEKDAYS.filter((weekday) => hasDay(effective, weekday.bit)).map((weekday) => weekday.label);
  return days.length ? days.join(" ") : "No days";
}

// Number of working days that fall in the current calendar month.
export function workingDaysInCurrentMonth(mask: number) {
  const effective = normalizeMask(mask);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const jsDay = new Date(now.getFullYear(), now.getMonth(), day).getDay(); // 0=Sun..6=Sat
    const bit = jsDay === 0 ? 6 : jsDay - 1; // map to Mon=0..Sun=6
    if (hasDay(effective, bit)) count++;
  }
  return count;
}
