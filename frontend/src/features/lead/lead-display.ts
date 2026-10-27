import type {
  Lead,
  LeadActivity,
  LeadCloseReason,
  LeadCounts,
  LeadDetail,
  LeadKind,
} from "@/store/services/lead-api";

/**
 * What the Leads screen and the lead details say about a lead (user's design,
 * 2026-10-17). Plain functions over the server's answer, so the two screens
 * say the same thing and a test can read it without drawing anything.
 *
 * <p>The stage the server calls ADVANCED_LEAD is shown as "Strong lead" (user,
 * 2026-10-17). The stored name never changes.
 */

type ChipTone = "primary" | "success" | "danger" | "neutral";

export const LEAD_KIND_LABEL: Record<LeadKind, { label: string; tone: ChipTone }> = {
  ENQUIRY: { label: "Enquiry", tone: "neutral" },
  EARLY_LEAD: { label: "Early lead", tone: "primary" },
  ADVANCED_LEAD: { label: "Strong lead", tone: "primary" },
  BOOKED: { label: "Booked", tone: "success" },
  CONVERTED: { label: "Moved in", tone: "success" },
  DEAD: { label: "Dead lead", tone: "danger" },
  LOST_ENQUIRY: { label: "Lost enquiry", tone: "neutral" },
};

/** The four tabs of the pipeline, in order. Ended leads are reached from the filter. */
export const PIPELINE_TABS: { kind: LeadKind; label: string }[] = [
  { kind: "EARLY_LEAD", label: "Early" },
  { kind: "ADVANCED_LEAD", label: "Strong" },
  { kind: "BOOKED", label: "Booked" },
  { kind: "CONVERTED", label: "Moved in" },
];

export function countOf(counts: LeadCounts | undefined, kind: LeadKind) {
  if (!counts) return null;
  switch (kind) {
    case "ENQUIRY": return counts.enquiries;
    case "EARLY_LEAD": return counts.earlyLeads;
    case "ADVANCED_LEAD": return counts.advancedLeads;
    case "BOOKED": return counts.booked;
    case "CONVERTED": return counts.converted;
    case "DEAD": return counts.dead;
    case "LOST_ENQUIRY": return counts.lostEnquiries;
  }
}

/** The leads still going: what the Property Leads card on Home counts. */
export function leadsInPlay(counts: LeadCounts | undefined) {
  return counts ? counts.earlyLeads + counts.advancedLeads + counts.booked : null;
}

export const CLOSE_REASON_LABEL: Record<LeadCloseReason, string> = {
  NO_REPLY: "No reply",
  NO_VISIT_BOOKED: "No visit booked",
  NOT_INTERESTED: "Not interested",
  NO_ANSWER_AFTER_MISSED_VISIT: "Missed the visit, no answer",
  NOT_SURE_EXPIRED: "Still not sure",
  REVIEW_OVERDUE: "Visit not reviewed",
  BOOKING_WINDOW_EXPIRED: "Days to book ran out",
  NO_LONGER_LOOKING: "No longer looking",
  SPAM: "Marked spam",
  DUPLICATE: "Marked duplicate",
  CONVERTED: "Moved in",
  VISIT_CANCELLED: "Visit cancelled",
  BOOKING_CANCELLED_BY_TENANT: "Cancelled their booking",
  BOOKING_CANCELLED_BY_PROPERTY: "Property cancelled the booking",
  DID_NOT_ARRIVE: "Did not arrive",
  DID_NOT_SIGN: "Did not sign",
  BOOKED_ELSEWHERE: "Booked elsewhere",
  BED_NOT_READY: "Bed not ready",
  PROPERTY_COULD_NOT_HOST: "Property could not host",
};

const BOOKING_END_LABEL: Record<string, string> = {
  TENANT_CANCELLED: "cancelled by them",
  TENANT_DID_NOT_SIGN: "they did not sign",
  TENANT_DID_NOT_ARRIVE: "they did not arrive",
  BOOKED_ELSEWHERE: "they booked elsewhere",
  MANAGEMENT_CANCELLED: "cancelled by the property",
  BED_NOT_READY: "the bed was not ready",
  PROPERTY_CANNOT_HOST: "the property could not host",
  CANCELLED: "cancelled",
  EXPIRED: "ran out",
};

const HANDLER_SOURCE_LABEL: Record<string, string> = {
  FIRST_RESPONSE: "first to respond",
  SYSTEM: "auto assigned",
  OWNER: "assigned by the owner",
  BOOKING: "from the booking",
};

// ---- Dates, in India ------------------------------------------------------------

function at(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+05:30` : value);
}

/** "30 Oct". */
export function leadDay(value: string) {
  const date = at(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

/** "30 Oct, 4:30 pm". */
export function leadMoment(value: string) {
  const date = at(value);
  if (!Number.isFinite(date.getTime())) return value;
  const time = date
    .toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s+/g, " ")
    .toLowerCase();
  return `${leadDay(value)}, ${time}`;
}

/** A slot's start, from minutes after midnight: "4:00 pm". */
export function slotTime(minute: number) {
  const hour = Math.floor(minute / 60);
  const rest = minute % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(rest).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

// ---- A card ----------------------------------------------------------------------

export type LeadFact = { label: string; value: string };
export type LeadBand = { tone: "warning" | "neutral"; text: string; strong?: string };

/** Who handles it, then the one fact its stage turns on. */
export function leadFacts(lead: Lead): LeadFact[] {
  const facts: LeadFact[] = [{ label: "Handler", value: lead.handlerName ?? "Nobody yet" }];
  switch (lead.kind) {
    case "EARLY_LEAD":
      if (lead.visit) facts.push({ label: "Visit", value: `${leadDay(lead.visit.visitDate)}, ${slotTime(lead.visit.slotStartMinute)}` });
      break;
    case "ADVANCED_LEAD":
      if (lead.visit?.checkedInAt) facts.push({ label: "Visited", value: leadMoment(lead.visit.checkedInAt) });
      // A stay booked straight from the property page has no visit: when they asked instead (2026-10-17).
      else if (lead.booking) facts.push({ label: "Requested", value: leadDay(lead.booking.submittedAt) });
      break;
    case "BOOKED":
      if (lead.bookedAt) facts.push({ label: "Booked", value: leadDay(lead.bookedAt) });
      if (lead.booking?.roomNumber) facts.push({ label: "Room", value: lead.booking.roomNumber });
      break;
    case "CONVERTED":
      if (lead.movedInAt) facts.push({ label: "Moved in", value: leadDay(lead.movedInAt) });
      break;
    case "DEAD":
    case "LOST_ENQUIRY":
      if (lead.closedAt) facts.push({ label: "Ended", value: leadDay(lead.closedAt) });
      break;
    case "ENQUIRY":
      if (lead.enquiredAt) facts.push({ label: "Enquired", value: leadDay(lead.enquiredAt) });
      break;
  }
  return facts;
}

/**
 * The line under the facts: what comes next, or what is running out. Amber
 * when something runs out or waits on the property, grey otherwise. Null
 * when there is nothing to say.
 */
export function leadBand(lead: Lead): LeadBand | null {
  const cold = lead.goingCold;
  if (cold) {
    switch (cold.reason) {
      case "MISSED_VISIT_UNANSWERED":
        return { tone: "warning", text: "Missed the visit, lead closes on", strong: cold.by ? leadDay(cold.by) : undefined };
      case "BOOKING_WINDOW_CLOSING":
        return { tone: "warning", text: "Booking window ends", strong: cold.by ? leadDay(cold.by) : undefined };
      case "TOKEN_DUE_SOON":
        return { tone: "warning", text: "Token due", strong: cold.by ? leadMoment(cold.by) : undefined };
      case "BOOKING_WAITING_ON_PROPERTY":
        return { tone: "warning", text: "Booking waits on you since", strong: cold.since ? leadDay(cold.since) : undefined };
      case "MOVE_IN_OVERDUE":
        return { tone: "warning", text: "Move-in day passed on", strong: cold.since ? leadDay(cold.since) : undefined };
    }
  }
  const booking = lead.booking;
  switch (lead.kind) {
    case "EARLY_LEAD":
      if (lead.visit?.status === "NOT_VISITED" && lead.visit.stillInterestedUntil) {
        return { tone: "warning", text: "Missed the visit, lead closes on", strong: leadDay(lead.visit.stillInterestedUntil) };
      }
      return lead.visit ? { tone: "neutral", text: "Visit on", strong: `${leadDay(lead.visit.visitDate)}, ${slotTime(lead.visit.slotStartMinute)}` } : null;
    case "ADVANCED_LEAD":
      if (booking?.status === "AWAITING_HANDLER") return { tone: "warning", text: "Booking request waits on you" };
      if (booking?.status === "AWAITING_TENANT") return { tone: "neutral", text: "Offer sent, waiting on them" };
      if (booking?.status === "AWAITING_TOKEN") return { tone: "neutral", text: "Terms agreed, token due", strong: booking.tokenDueAt ? leadDay(booking.tokenDueAt) : undefined };
      if (booking?.status === "TOKEN_RECEIVED") return { tone: "warning", text: "Token received, confirm the booking" };
      return lead.bookingWindowEndsAt ? { tone: "warning", text: "Booking window ends", strong: leadDay(lead.bookingWindowEndsAt) } : null;
    case "BOOKED":
      return booking?.moveInDate ? { tone: "neutral", text: "Move-in", strong: leadDay(booking.moveInDate) } : null;
    case "DEAD":
    case "LOST_ENQUIRY":
      return lead.closeReason ? { tone: "neutral", text: CLOSE_REASON_LABEL[lead.closeReason] } : null;
    default:
      return null;
  }
}

// ---- The timeline ----------------------------------------------------------------

/**
 * @param noteIsVisitDay the note is the visit's own day and slot, not when the
 *                       step happened. It is drawn with a calendar beside it, or
 *                       "Visit cancelled" above "Wed 7 Oct" reads as cancelled on
 *                       the 7th (user, 2026-10-17)
 */
export type LeadTimelineEntry = {
  key: string;
  title: string;
  at: string;
  by: string | null;
  note: string | null;
  noteIsVisitDay: boolean;
};

const VISIT_STEPS = new Set(["VISIT_SCHEDULED", "VISIT_RESCHEDULED", "VISIT_CANCELLED", "VISIT_ATTENDED", "VISIT_MISSED"]);

/** The lead's steps, oldest first, as booking details draws its own. */
export function leadTimeline(detail: LeadDetail): LeadTimelineEntry[] {
  return [...detail.timeline]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .map((activity) => ({
      key: activity.id,
      at: activity.occurredAt,
      ...describe(activity),
      noteIsVisitDay: VISIT_STEPS.has(activity.type) && Boolean(activity.detail),
    }));
}

function describe(activity: LeadActivity): { title: string; by: string | null; note: string | null } {
  const detail = activity.detail;
  const actor = activity.actorName;
  switch (activity.type) {
    case "ENQUIRY_RAISED": return { title: "Enquiry raised", by: null, note: null };
    case "ENQUIRY_JOINED": return { title: "Asked again", by: null, note: null };
    case "HANDLER_ASSIGNED": return {
      title: "Handler assigned",
      by: [activity.subjectName, detail ? HANDLER_SOURCE_LABEL[detail] ?? null : null].filter(Boolean).join(" · ") || null,
      note: null,
    };
    case "RESPONDED": return { title: "Reached them", by: actor, note: null };
    case "CLOSED": return { title: "Ended", by: actor, note: detail && detail in CLOSE_REASON_LABEL ? CLOSE_REASON_LABEL[detail as LeadCloseReason] : detail };
    case "VISIT_SCHEDULED": return { title: "Visit scheduled", by: actor, note: detail };
    case "VISIT_RESCHEDULED": return { title: "Visit moved", by: actor, note: detail };
    case "VISIT_CANCELLED": return { title: "Visit cancelled", by: actor, note: detail };
    case "REOPENED": return { title: "Changed their mind", by: null, note: null };
    case "VISIT_ATTENDED": return { title: "Visited, now a strong lead", by: actor, note: detail };
    case "VISIT_MISSED": return { title: "Visit missed", by: null, note: detail };
    case "BOOKING_REQUESTED": return { title: "Booking requested", by: null, note: detail };
    case "BOOKING_AGREED": return { title: "Terms agreed", by: null, note: detail };
    case "BOOKING_CONFIRMED": return { title: "Booking confirmed, now booked", by: null, note: detail };
    case "BOOKING_ENDED": return { title: "Booking ended", by: null, note: bookingEnded(detail) };
    case "MOVED_IN": return { title: "Moved in", by: null, note: detail };
    case "RESUMED": return { title: "Came back", by: null, note: detail ? `After ${detail}` : null };
    case "MARKED_DUPLICATE": return { title: "Marked duplicate", by: null, note: detail ? `After ${detail}` : null };
    case "MARKED_SPAM": return { title: "Marked potential spam", by: null, note: detail ? `After ${detail}` : null };
  }
}

/** "BKG-2026-000019: TENANT_CANCELLED" reads "BKG-2026-000019, cancelled by them". */
function bookingEnded(detail: string | null) {
  if (!detail) return null;
  const [code, cause] = detail.split(": ");
  if (!cause) return detail;
  return `${code}, ${BOOKING_END_LABEL[cause] ?? cause.toLowerCase().replace(/_/g, " ")}`;
}
