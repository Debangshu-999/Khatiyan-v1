import type {
  BookingActionType,
  BookingEndCause,
  BookingParty,
  BookingStatus,
  BookingTokenStatus,
} from "@/store/services/booking-api";

type PillTone = "warning" | "primary" | "success" | "danger" | "neutral";

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: PillTone }> = {
  AWAITING_HANDLER: { label: "Awaiting handler", tone: "warning" },
  AWAITING_TENANT: { label: "Awaiting tenant", tone: "primary" },
  AWAITING_TOKEN: { label: "Token due", tone: "warning" },
  TOKEN_RECEIVED: { label: "Token received", tone: "success" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  MOVED_IN: { label: "Moved in", tone: "success" },
};

/** The two lists a property reads: what is still going, and what is over. */
export const OPEN_BOOKING_STATUSES: BookingStatus[] = ["AWAITING_HANDLER", "AWAITING_TENANT", "AWAITING_TOKEN", "TOKEN_RECEIVED", "CONFIRMED"];
export const PAST_BOOKING_STATUSES: BookingStatus[] = ["CANCELLED", "EXPIRED", "MOVED_IN"];

/** Where a token stands, in words. Never the stored name. */
export const BOOKING_TOKEN_STATUS: Record<BookingTokenStatus, { label: string; tone: PillTone }> = {
  NOT_REQUIRED: { label: "Not required", tone: "neutral" },
  DUE: { label: "Due", tone: "warning" },
  CLAIMED: { label: "Tenant says paid", tone: "warning" },
  NOT_RECEIVED: { label: "Not received", tone: "danger" },
  RECEIVED: { label: "Received", tone: "success" },
  // Refunds are not followed, so a token ends one of these ways (user, 2026-10-28).
  ADJUSTED: { label: "Adjusted", tone: "success" },
  KEPT: { label: "Kept", tone: "neutral" },
  REFUND_DUE: { label: "Refundable", tone: "neutral" },
  DECISION_PENDING: { label: "Pending", tone: "warning" },
};

/** One step in a booking's history, as a person would say it. */
export const BOOKING_EVENT: Record<BookingActionType, string> = {
  SUBMITTED: "Request sent",
  EXPIRED: "Request expired",
  ASSIGNED: "Handler assigned",
  UNASSIGNED: "Handler removed",
  COUNTERED: "Counter offer",
  FINAL_OFFER: "Final offer",
  AGREED: "Terms agreed",
  CONFIRMED: "Booking confirmed",
  CANCELLED: "Cancelled",
  WITHDRAWN: "Withdrawn",
  TOKEN_LAPSED: "Token not paid in time",
  TOKEN_CLAIMED: "Tenant says the token is paid",
  TOKEN_RECEIVED: "Token received",
  TOKEN_NOT_RECEIVED: "Token not received",
  TOKEN_WAIVED: "Token waived",
  TOKEN_REFUND_SENT: "Refund sent",
  TOKEN_REFUND_CONFIRMED: "Tenant received the refund",
  TOKEN_REFUND_DISPUTED: "Tenant says the refund has not arrived",
  TOKEN_REFUND_OWED: "Token marked refundable",
  TOKEN_KEPT: "Token kept",
  CONVERTED: "Stay created",
  MOVED_IN: "Moved in",
  DATE_PUSHED: "Move-in date moved",
  BED_OFFERED: "Another bed offered",
  BED_OFFER_ACCEPTED: "Tenant took the other bed",
  BED_OFFER_DECLINED: "Tenant declined the other bed",
  BED_MOVED: "Moved to another room",
};

/** Why a booking ended. */
export const BOOKING_END_CAUSE: Record<BookingEndCause, string> = {
  MOVED_IN: "The tenant moved in.",
  TENANT_CANCELLED: "The tenant cancelled.",
  TENANT_DID_NOT_SIGN: "The tenant did not sign the agreement in time.",
  TENANT_DID_NOT_ARRIVE: "The tenant did not arrive.",
  BOOKED_ELSEWHERE: "The tenant confirmed a booking somewhere else.",
  MANAGEMENT_CANCELLED: "The property cancelled.",
  BED_NOT_READY: "The bed was not free in time.",
  PROPERTY_CANNOT_HOST: "The property could not host the tenant.",
};

/** Which side did something. Nothing for a step the system took itself. */
export function bookingPartyLabel(party: BookingParty | null) {
  return party === "TENANT" ? "Tenant" : party === "MANAGEMENT" ? "Property" : null;
}

/** ISO civil dates stay in India's date, including on web in another timezone. */
export function bookingDateLabel(value: string, withTime = false) {
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00+05:30`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}

/** "17 Oct", for a pill or a line that already says the year elsewhere. */
export function bookingDayLabel(value: string) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+05:30` : value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

/** Compact India-local timestamp for the single-line Requested / Expires strip. */
/**
 * A request's clock on a list card: "Expires in 6 days at 3:30 pm" (user,
 * 2026-10-11). Days are India's calendar days, so "in 1 day" is tomorrow
 * whatever the hour, and the day itself reads "today". Once past, "Expired".
 */
export function bookingExpiresInLabel(expiresAt: string, now: number = Date.now()) {
  const at = new Date(expiresAt);
  if (!Number.isFinite(at.getTime())) return "Expires soon";
  if (at.getTime() <= now) return "Expired";
  const dayOf = (value: Date) => {
    const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(value).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const days = Math.round((dayOf(at) - dayOf(new Date(now))) / 86_400_000);
  const time = at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).replace(":00", "").replace(/\s+/g, " ").toLowerCase();
  return `Expires ${days <= 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} at ${time}`;
}

export function bookingMomentLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const day = date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  const time = date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).replace(":00", "").replace(/\s+/g, "").toLowerCase();
  return `${day}, ${time}`;
}

/** "17–28 Oct 2026", or "29 Oct – 3 Nov 2026" across a month. One day reads as that day. */
export function bookingRangeLabel(from: string, to: string) {
  if (from === to) return bookingDateLabel(from);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8, 10))}–${bookingDateLabel(to)}`;
  return `${from.slice(0, 4) === to.slice(0, 4) ? bookingDayLabel(from) : bookingDateLabel(from)} – ${bookingDateLabel(to)}`;
}

export function parseBookingRent(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}
