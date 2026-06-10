// Time-of-day greeting in IST. "Good morning" / "Good afternoon" /
// "Good evening" / "Good night" — chosen by the user's IST hour so the
// greeting matches their local sense of day even if their device clock
// is in another zone.
//
// Boundaries:
//   05:00 - 11:59 -> morning
//   12:00 - 16:59 -> afternoon
//   17:00 - 20:59 -> evening
//   21:00 - 04:59 -> night
export type GreetingTone = "morning" | "afternoon" | "evening" | "night";

const HOUR_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

export function getGreetingTone(now: Date = new Date()): GreetingTone {
  // Intl reliably returns an hour even on RN — we use it instead of any
  // string-locale tricks so the boundary checks stay deterministic.
  const parts = HOUR_FORMATTER.formatToParts(now);
  const hourPart = parts.find((part) => part.type === "hour")?.value ?? "0";
  const istHour = Number.parseInt(hourPart, 10);

  if (istHour >= 5 && istHour < 12) {
    return "morning";
  }
  if (istHour >= 12 && istHour < 17) {
    return "afternoon";
  }
  if (istHour >= 17 && istHour < 21) {
    return "evening";
  }
  return "night";
}

const GREETING_BY_TONE: Record<GreetingTone, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Good night",
};

export function getGreeting(now: Date = new Date()): string {
  return GREETING_BY_TONE[getGreetingTone(now)];
}
