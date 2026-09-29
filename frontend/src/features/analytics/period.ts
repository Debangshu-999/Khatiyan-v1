// Period presets and dates as the app shows them. The server is the authority on
// a request's dates (periodLine reads its response). These helpers only write
// the picker's subtitles and check a custom range before sending it.
//
// No imports on purpose: node --test runs this file directly, and Expo's
// tsconfig cannot import a ".ts" path while Node cannot resolve one without it.

export type PeriodPreset = "THIS_MONTH" | "LAST_MONTH" | "LAST_3_MONTHS" | "LAST_6_MONTHS" | "CURRENT_FY" | "CUSTOM" | "ALL_TIME";

export type PeriodResponse = {
  preset: PeriodPreset;
  from: string;
  to: string;
  compareFrom: string | null;
  compareTo: string | null;
  bucket: "NONE" | "MONTH" | "QUARTER" | "YEAR";
  dataSince: string;
};

export const PRESET_ORDER: PeriodPreset[] = ["THIS_MONTH", "LAST_MONTH", "LAST_3_MONTHS", "LAST_6_MONTHS", "CURRENT_FY", "ALL_TIME", "CUSTOM"];
export const DEFAULT_PRESET: PeriodPreset = "LAST_3_MONTHS";
export const PRESET_LABELS: Record<PeriodPreset, string> = {
  ALL_TIME: "All time",
  CURRENT_FY: "Current FY",
  CUSTOM: "Custom range",
  LAST_3_MONTHS: "Last 3 months",
  LAST_6_MONTHS: "Last 6 months",
  LAST_MONTH: "Last month",
  THIS_MONTH: "This month",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthName(month: number): string {
  return MONTHS[month - 1];
}

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { day, month, year };
}

/** "1 Jul – 26 Sep 2026". The year is written once when both ends share it, the month once when they share that too. */
export function formatDateRange(fromIso: string, toIso: string): string {
  const from = dateParts(fromIso);
  const to = dateParts(toIso);
  const end = `${to.day} ${monthName(to.month)} ${to.year}`;
  if (fromIso === toIso) return end;
  if (from.year !== to.year) return `${from.day} ${monthName(from.month)} ${from.year} – ${end}`;
  if (from.month !== to.month) return `${from.day} ${monthName(from.month)} – ${end}`;
  return `${from.day} – ${end}`;
}

/**
 * "Sep 2026", "Jul – Sep 2026", "Nov 2025 – Feb 2026". Months only: the owner
 * asked for no day numbers on the analytics screens, so "this month so far"
 * reads as "Sep 2026" rather than "1 – 26 Sep 2026".
 */
export function formatMonthRange(fromIso: string, toIso: string): string {
  const from = dateParts(fromIso);
  const to = dateParts(toIso);
  const end = `${monthName(to.month)} ${to.year}`;
  if (from.year === to.year && from.month === to.month) return end;
  if (from.year === to.year) return `${monthName(from.month)} – ${end}`;
  return `${monthName(from.month)} ${from.year} – ${end}`;
}

/** A trend bucket's axis label: "Jul", "Apr–Jun", "FY25–26". */
export function bucketLabel(fromIso: string, toIso: string, bucket: PeriodResponse["bucket"]): string {
  const from = dateParts(fromIso);
  const to = dateParts(toIso);
  if (bucket === "QUARTER") return `${monthName(from.month)}–${monthName(to.month)}`;
  if (bucket === "YEAR") {
    const start = from.month >= 4 ? from.year : from.year - 1;
    return `FY${String(start).slice(2)}–${String(start + 1).slice(2)}`;
  }
  return monthName(from.month);
}

/** Today in Asia/Kolkata. IST has no daylight saving, so a fixed offset is exact. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { month: (index % 12) + 1, year: Math.floor(index / 12) };
}

function monthSpan(start: { month: number; year: number }, end: { month: number; year: number }) {
  if (start.year === end.year) return `${monthName(start.month)} – ${monthName(end.month)} ${end.year}`;
  return `${monthName(start.month)} ${start.year} – ${monthName(end.month)} ${end.year}`;
}

export function presetSubtitle(preset: PeriodPreset, todayIso: string, dataSinceIso: string | null): string {
  const today = dateParts(todayIso);
  switch (preset) {
    case "THIS_MONTH":
      return `${monthName(today.month)} ${today.year}, so far`;
    case "LAST_MONTH": {
      const last = shiftMonth(today.year, today.month, -1);
      return `${FULL_MONTHS[last.month - 1]} ${last.year}`;
    }
    case "LAST_3_MONTHS":
      return monthSpan(shiftMonth(today.year, today.month, -2), today);
    case "LAST_6_MONTHS":
      return monthSpan(shiftMonth(today.year, today.month, -5), today);
    case "CURRENT_FY": {
      const start = today.month >= 4 ? today.year : today.year - 1;
      return `FY ${start}–${String(start + 1).slice(2)}, from 1 Apr`;
    }
    case "ALL_TIME": {
      if (!dataSinceIso) return "Since this property joined";
      const since = dateParts(dataSinceIso);
      return `Since ${monthName(since.month)} ${since.year}`;
    }
    case "CUSTOM":
      return "Pick a start and end date";
  }
}

export function periodLine(period: PeriodResponse): string {
  const range = formatMonthRange(period.from, period.to);
  if (!period.compareFrom || !period.compareTo) return range;
  return `${range} vs ${formatMonthRange(period.compareFrom, period.compareTo)}`;
}

export function periodSectionTitle(period: PeriodResponse): string {
  return period.preset === "CUSTOM" ? formatDateRange(period.from, period.to) : PRESET_LABELS[period.preset];
}

/** The same rules and wording as the server's AnalyticsPeriodResolver, so the picker refuses first. */
export function customRangeErrors(
  fromIso: string | null,
  toIso: string | null,
  todayIso: string,
  dataSinceIso: string | null,
): { from?: string; to?: string } {
  const errors: { from?: string; to?: string } = {};
  if (!fromIso) errors.from = "Pick a start date";
  else if (dataSinceIso && fromIso < dataSinceIso) errors.from = `Pick a start date on or after ${formatDateRange(dataSinceIso, dataSinceIso)}`;
  if (!toIso) errors.to = "Pick an end date";
  else if (toIso > todayIso) errors.to = "Pick an end date no later than today";
  else if (fromIso && fromIso > toIso) errors.to = "Pick an end date on or after the start date";
  return errors;
}
