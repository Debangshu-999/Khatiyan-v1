/**
 * How a conversation stamps time.
 *
 * <p>Everything here works in Asia/Kolkata rather than the device's zone, for
 * the same reason the rest of the app does: the server decides what "today"
 * means, and a phone on another clock would draw a day divider in the wrong
 * place.
 */

const IST = "Asia/Kolkata";

/** The IST calendar date of an instant, as `2026-08-23`. */
function istDay(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: IST,
    year: "numeric",
  }).format(value);
}

function istTime(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone: IST,
  })
    .format(value)
    .toLowerCase();
}

/**
 * The stamp on a list row: a time today, a weekday this week, a date beyond.
 *
 * <p>A list is scanned rather than read, so the most recent rows get the most
 * precise label and older ones get the cheapest one that still places them.
 */
export function threadStamp(iso: string | null): string {
  if (!iso) {
    return "";
  }

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return "";
  }

  const now = new Date();
  if (istDay(at) === istDay(now)) {
    return istTime(at);
  }

  const daysApart = Math.round((now.getTime() - at.getTime()) / 86_400_000);
  if (daysApart < 7) {
    return new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short" }).format(at);
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: IST,
  }).format(at);
}

/** The stamp under a message bubble. Always a time — the divider carries the day. */
export function messageStamp(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : istTime(at);
}

/**
 * The divider between days, or null when this message shares a day with the
 * one before it.
 */
export function dayDivider(iso: string, previousIso: string | null): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  if (previousIso && istDay(at) === istDay(new Date(previousIso))) {
    return null;
  }

  const today = istDay(new Date());
  if (istDay(at) === today) {
    return "Today";
  }

  const yesterday = new Date(Date.now() - 86_400_000);
  if (istDay(at) === istDay(yesterday)) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: IST,
    year: at.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(at);
}

/** Two initials for an avatar, from whatever the name turns out to be. */
export function initialsOf(name: string | null | undefined): string {
  const cleaned = (name ?? "").trim();
  if (!cleaned) {
    return "?";
  }

  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
