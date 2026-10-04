import { useEffect, useState } from "react";

const INDIA = "Asia/Kolkata";

/**
 * The time now, read again every so often. A visit card changes what it
 * offers as the slot comes and goes (Mark attendance opens, the pass opens,
 * running late starts), and none of that arrives as new data.
 */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Minutes from midnight in India, whatever zone the phone is set to. */
export function indiaMinutesNow() {
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: INDIA,
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return (hours % 24) * 60 + minutes;
}

/**
 * The date in India as YYYY-MM-DD, whatever zone the phone is set to. A visit's
 * date is a calendar day, so the two are compared as text.
 */
export function indiaDate(at: number = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: INDIA }).format(new Date(at));
}

/** "16:50:00" from minutes after midnight, the shape the server reads a time in. */
export function minutesToTime(minutes: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}:00`;
}

/** Minutes after midnight from "16:50:00". */
export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "482 913": the code on a pass, in two groups so it is easy to read out. */
export function formatPassCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
