import type { PeriodPreset } from "@/features/analytics/period";
import { api } from "@/store/api";
import type { Page } from "@/store/pagination";
import type { BookingEndCause, BookingStatus } from "@/store/services/booking-api";
import type { EnquiryEndReason } from "@/store/services/enquiry-api";

/**
 * The leads pipeline, as a property's management reads it.
 *
 * <p>A lead is written by what happens to its enquiry, its visit and its
 * booking, each on its own screen. Nothing here edits one. Even a duplicate
 * or potential spam is marked by a rule on the server (2026-10-17).
 *
 * <p>The server works every reading out: the kind of a record, whether its
 * person came back, and whether it is going cold. A screen shows them and
 * decides none of them for itself.
 */

/** What a record is to the owner. Worked out by the server, never stored. */
export type LeadKind =
  /** Open, not yet a lead. It lives on the Enquiries screen. */
  | "ENQUIRY"
  /** A visit is scheduled. */
  | "EARLY_LEAD"
  /** A visit was attended. A booking request, its counters and a token that is due all sit here. */
  | "ADVANCED_LEAD"
  /** A booking is confirmed. */
  | "BOOKED"
  /** Moved in. The stay is active. */
  | "CONVERTED"
  /** Closed without a move-in, after a visit had been scheduled on it at least once. */
  | "DEAD"
  /** Closed without ever having a visit scheduled. Counted, never listed as a lead. */
  | "LOST_ENQUIRY";

/**
 * A record opened by someone who walked away from earlier ones here (user,
 * 2026-10-17): a duplicate after one or two, potential spam from the third. A
 * mark on a record of any kind, which is still worked like any other.
 */
export type LeadRepeatFlag = "DUPLICATE" | "POTENTIAL_SPAM";

/** Why a record is a duplicate or potential spam. */
export type LeadRepeat = {
  flag: LeadRepeatFlag;
  /** How many of the person's earlier records here ended for their own reason, since they last moved in. */
  earlierLeads: number;
  /** The words to show the owner, as the server writes them. */
  reason: string;
  /** The latest of those earlier records. */
  latest: LeadLink | null;
};

/** The leads still going. What a "Leads" list asks for by default. */
export const LEAD_KINDS_IN_PLAY: LeadKind[] = ["EARLY_LEAD", "ADVANCED_LEAD", "BOOKED"];

export type LeadStage = "ENQUIRED" | "EARLY_LEAD" | "ADVANCED_LEAD" | "BOOKED" | "MOVED_IN";

export type LeadState = "OPEN" | "CLOSED";

export type LeadCloseReason =
  | "NO_REPLY"
  | "NO_VISIT_BOOKED"
  | "NOT_INTERESTED"
  | "NO_ANSWER_AFTER_MISSED_VISIT"
  | "NOT_SURE_EXPIRED"
  | "REVIEW_OVERDUE"
  | "BOOKING_WINDOW_EXPIRED"
  | "NO_LONGER_LOOKING"
  /** No longer written: the owner's old spam and duplicate marks. */
  | "SPAM"
  | "DUPLICATE"
  | "CONVERTED"
  | "VISIT_CANCELLED"
  // What became of a confirmed booking, for a lead that could not book again after it.
  | "BOOKING_CANCELLED_BY_TENANT"
  | "BOOKING_CANCELLED_BY_PROPERTY"
  | "DID_NOT_ARRIVE"
  | "DID_NOT_SIGN"
  | "BOOKED_ELSEWHERE"
  | "BED_NOT_READY"
  | "PROPERTY_COULD_NOT_HOST";

/** Who gave the lead its handler. BOOKING: its live booking's handler, which wins while the booking is live. */
export type LeadHandlerSource = "FIRST_RESPONSE" | "SYSTEM" | "OWNER" | "BOOKING";

export type LeadColdReason =
  /** Their visit was missed, and "still interested?" has under three days left. */
  | "MISSED_VISIT_UNANSWERED"
  /** The days to book after their visit have under five left, and no request is live. */
  | "BOOKING_WINDOW_CLOSING"
  /** Their booking has sat a day waiting on the property: a request, a payment to check, or a booking to confirm. */
  | "BOOKING_WAITING_ON_PROPERTY"
  /** Their token falls due within a day, and they have not said they paid. */
  | "TOKEN_DUE_SOON"
  /** The move-in day has passed, and nobody has onboarded them. */
  | "MOVE_IN_OVERDUE";

export type LeadGoingCold = {
  reason: LeadColdReason;
  /** ISO instant. When it began waiting. Null where the reason is only a deadline coming up. */
  since: string | null;
  /** ISO instant. When it runs out. Null where nothing ends it by itself and somebody has to act. */
  by: string | null;
};

/** Another lead this one points at, by the short code people are shown. */
export type LeadLink = {
  id: string;
  referenceCode: string;
};

/** A lead's visit, in as much as the lead shows of it. Acted on from Manage Visits. */
export type LeadVisit = {
  /** Where its latest move took it from, and when it moved. Null for a visit never moved. */
  movedFromDate: string | null;
  movedFromSlotStartMinute: number | null;
  movedAt: string | null;
  id: string;
  /** The short code shown to people, never the id. */
  referenceCode: string;
  enquiryId: string | null;
  /** YYYY-MM-DD. */
  visitDate: string;
  /** Minutes from midnight. */
  slotStartMinute: number;
  slotEndMinute: number;
  status: "SCHEDULED" | "CANCELLED" | "VISITED" | "NOT_VISITED";
  checkedInAt: string | null;
  /** For a missed visit: until when the visitor may still say they are interested by moving it. */
  stillInterestedUntil: string | null;
};

/** A lead's booking, in as much as the lead shows of it. No money: acted on from Bookings. */
export type LeadBooking = {
  id: string;
  referenceCode: string;
  enquiryId: string;
  /** The room asked for. */
  roomNumber: string | null;
  status: BookingStatus;
  /** Why it ended, for one that is over. */
  endCause: BookingEndCause | null;
  /** YYYY-MM-DD. */
  moveInDate: string;
  submittedAt: string;
  confirmedAt: string | null;
  endedAt: string | null;
  /** When a request still being answered runs out. */
  expiresAt: string | null;
  /** While the token is owed. */
  tokenDueAt: string | null;
  /** The tenant says they paid, and the property has not answered. */
  tokenClaimWaiting: boolean;
  /** The stay it became, once the property onboarded them. */
  tenancyId: string | null;
};

export type Lead = {
  id: string;
  /** The short code shown to people, never the id. */
  referenceCode: string;
  propertyId: string;
  prospectUserId: string;
  prospectName: string | null;
  /** The enquiry that opened it. */
  enquiryId: string | null;
  kind: LeadKind;
  /** The furthest it is at now. A dead lead keeps the stage it died at. */
  stage: LeadStage;
  state: LeadState;
  closeReason: LeadCloseReason | null;
  closedAt: string | null;
  handlerUserId: string | null;
  handlerName: string | null;
  handlerAssignedBy: LeadHandlerSource | null;
  handlerAssignedAt: string | null;
  enquiredAt: string | null;
  respondedAt: string | null;
  /** The first time a visit was scheduled. Null for one that never was a lead. */
  becameLeadAt: string | null;
  earlyLeadAt: string | null;
  advancedLeadAt: string | null;
  bookedAt: string | null;
  movedInAt: string | null;
  convertedTenancyId: string | null;
  /** This person came back: after an earlier record here ended, or by "Changed your mind?". */
  resumed: boolean;
  /** The earlier record, where this is a new one. */
  resumedFrom: LeadLink | null;
  /** When "Changed your mind?" opened this same record again. */
  reopenedAt: string | null;
  /** Null unless the person walked away from earlier records here. */
  repeat: LeadRepeat | null;
  /** Null unless something on an open lead runs out soon or waits on the property. */
  goingCold: LeadGoingCold | null;
  /** Its latest visit, if it has had one. */
  visit: LeadVisit | null;
  /** When the days to ask for a booking after the attended visit run out. Null unless still open. */
  bookingWindowEndsAt: string | null;
  /** The enquiry still open to follow up on, the latest if more than one. Null when none is. */
  followUpEnquiryId: string | null;
  /** Whether the person reading may follow up on it: the owner, its handler, or anyone while it has none. */
  viewerMayFollowUp: boolean;
  /** Its live booking, or else the last one it had. */
  booking: LeadBooking | null;
  /** Sent back as If-Match when the owner sets it aside. */
  version: number;
  /** Someone recorded outside the app: no account, nothing sent to them (2026-10-19). */
  external: boolean;
};

export type LeadActivityType =
  | "ENQUIRY_RAISED"
  | "ENQUIRY_JOINED"
  | "HANDLER_ASSIGNED"
  | "RESPONDED"
  | "CLOSED"
  | "VISIT_SCHEDULED"
  | "VISIT_RESCHEDULED"
  | "VISIT_CANCELLED"
  | "REOPENED"
  | "VISIT_ATTENDED"
  | "VISIT_MISSED"
  // A booking's steps. Each carries its booking and is written once.
  | "BOOKING_REQUESTED"
  | "BOOKING_AGREED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_ENDED"
  | "MOVED_IN"
  | "RESUMED"
  /** Opened as potential spam. The detail holds the latest earlier record's code. */
  | "MARKED_SPAM"
  /** Opened as a duplicate. The detail holds the latest earlier record's code. */
  | "MARKED_DUPLICATE";

export type LeadActivity = {
  id: string;
  type: LeadActivityType;
  /** Who did it. Null when the system did. */
  actorUserId: string | null;
  actorName: string | null;
  /** Who it was about, when that is a person: the handler it was given to. */
  subjectUserId: string | null;
  subjectName: string | null;
  enquiryId: string | null;
  /** Per type: a close reason, a date and slot, a booking's or a lead's short code. */
  detail: string | null;
  /** The booking this entry is a step of. Null for everything else. */
  bookingRequestId: string | null;
  occurredAt: string;
};

/** One of a lead's enquiries, in a line. It is answered from Enquiries, or from Follow up. */
export type LeadEnquiry = {
  id: string;
  message: string;
  raisedAt: string | null;
  respondedAt: string | null;
  expiresAt: string;
  endedAt: string | null;
  endReason: EnquiryEndReason | null;
  /** Something can still be done with it. */
  open: boolean;
  /** An enquiry, or a visit or stay booked straight from the property profile, which reads as not available. */
  origin: "ENQUIRY" | "DIRECT_VISIT" | "DIRECT_BOOKING";
};

export type LeadDetail = {
  lead: Lead;
  /** Newest entry first. */
  timeline: LeadActivity[];
  /** Every enquiry the person raised under this record, first to last. */
  enquiryIds: string[];
  /** The same enquiries in a line each, first to last. */
  enquiries: LeadEnquiry[];
  /** Newest first. */
  visits: LeadVisit[];
  /** First to last. */
  bookings: LeadBooking[];
  /** The later record this person opened here after this one ended, where they came back. */
  cameBackAs: LeadLink | null;
};

/** How many records a property has of each kind, as of now. */
export type LeadCounts = {
  enquiries: number;
  earlyLeads: number;
  advancedLeads: number;
  booked: number;
  converted: number;
  dead: number;
  lostEnquiries: number;
  /** Leads in play that are duplicates. Counted under their kind as well. */
  duplicates: number;
  /** Leads in play that are potential spam. Counted under their kind as well. */
  potentialSpam: number;
  /** Leads in play whose person came back. */
  resumed: number;
  /** Leads in play with something running out soon or waiting on the property. */
  goingCold: number;
};

/**
 * A property's pipeline for one month. Each step is counted in the month it
 * happened, in IST, so the steps are not one group of people followed through
 * and a later step can be larger than an earlier one. Duplicates and potential
 * spam are in none of it, so a person who keeps coming back is counted once.
 */
export type LeadFunnel = {
  /** YYYY-MM. */
  month: string;
  enquiriesRaised: number;
  /** First successful responses made in the month. */
  enquiriesAnswered: number;
  /** From the enquiry to that first response. Null when none was answered in the month. */
  firstResponseMedianSeconds: number | null;
  /** Nine in ten were answered within this. */
  firstResponseP90Seconds: number | null;
  visitsScheduled: number;
  visitsAttended: number;
  visitsMissed: number;
  bookingRequests: number;
  bookingsConfirmed: number;
  moveIns: number;
  /** Leads that ended in the month without a move-in, by the stage they died at and why. */
  deadLeads: { stage: LeadStage; reason: LeadCloseReason; total: number }[];
  /** Records that closed in the month without ever having a visit scheduled, by why. */
  lostEnquiries: { reason: LeadCloseReason; total: number }[];
  /** People who came back in the month. */
  resumedLeads: number;
  /** How many of those have moved in since. */
  resumedConverted: number;
  /** As of now, whatever the month asked for. */
  goingCold: number;
};

/** The same presets as every other Insights screen (2026-10-18). */
export type LeadInsightsPeriod = PeriodPreset;

export type LeadJourneyStep = "OPENED" | "GOT_IN_TOUCH" | "ANSWERED" | "VISITED" | "BOOKED" | "MOVED_IN";

export type LeadProfileAction = "BOOKING_REQUESTED" | "VISIT_SCHEDULED" | "ENQUIRED" | "CALLED" | "NONE";

/**
 * The Leads insights screen, for one period (2026-10-18). The funnel follows
 * the same people from opening the listing; the activity counts everything
 * that happened in the period. See `ListingJourneyResponse` on the server.
 */
export type LeadInsights = {
  period: LeadInsightsPeriod;
  from: string;
  to: string;
  /** When the property joined: where "All time" starts. */
  dataSince: string;
  steps: { key: LeadJourneyStep; people: number }[];
  biggestDrop: { fromStep: LeadJourneyStep; toStep: LeadJourneyStep; lost: number; percent: number } | null;
  actions: {
    opened: number;
    acted: number;
    /** Each person once, by the furthest thing they did. Adds up to `opened`. */
    byFurthest: { action: LeadProfileAction; people: number }[];
    /** Everyone who did each, so one person can count twice. */
    individual: { action: LeadProfileAction; people: number }[];
  };
  profileTime: {
    views: number;
    people: number;
    viewsWithLength: number;
    medianSeconds: number | null;
    quickExitPercent: number | null;
    readPercent: number | null;
    cameBack: number;
  };
  rates: {
    enquiries: number;
    responseRatePercent: number | null;
    medianResponseSeconds: number | null;
    dropAfterAnswerPercent: number | null;
    enquiryToMoveInPercent: number | null;
  };
  activity: LeadFunnel;
  charts: {
    /** How the over-time points are grouped. */
    bucket: "DAY" | "WEEK" | "MONTH";
    overTime: { from: string; opened: number; gotInTouch: number }[];
    /** Weekday 1 is Monday. Quarter 0 is midnight to 6 am. */
    whenTheyLook: { weekday: number; quarter: number; views: number }[];
    timeSpent: { key: string; count: number }[];
    foundFrom: { key: string; count: number }[];
    answerSpeed: { key: string; count: number }[];
    visitOutcomes: { attended: number; missed: number; cancelled: number };
  };
};

export type LeadListQuery = {
  propertyId: string;
  /** The kinds wanted. Left out or empty, every record. */
  kinds?: LeadKind[];
  /** Only the people who came back. */
  resumed?: boolean;
  /** Only the leads going cold, the one that runs out soonest first. */
  goingCold?: boolean;
  /** Only the duplicates, the potential spam, or both. */
  repeat?: LeadRepeatFlag[];
  /** Only the leads the reader handles. */
  mine?: boolean;
  /** Part of the person's name or of the short code. */
  search?: string;
  page: number;
  /** At most 50. */
  size?: number;
};

function leadListUrl({ goingCold, kinds, mine, page, propertyId, repeat, resumed, search, size = 20 }: LeadListQuery) {
  const params = [`page=${page}`, `size=${size}`];
  if (kinds && kinds.length > 0) params.push(`kind=${kinds.join(",")}`);
  if (resumed) params.push("resumed=true");
  if (goingCold) params.push("goingCold=true");
  if (mine) params.push("mine=true");
  if (repeat && repeat.length > 0) params.push(`repeat=${repeat.join(",")}`);
  if (search && search.trim()) params.push(`q=${encodeURIComponent(search.trim())}`);
  return `/api/v1/properties/${propertyId}/leads?${params.join("&")}`;
}

// A lead is made of its enquiry, its visit and its booking, so a step on any
// of them is a reason to read it again. The lead catches up a moment after
// that step, on the server: a screen showing leads also refetches on focus.
const READ_TAGS = ["Lead", "Enquiry", "EnquiryChat", "Booking"] as const;

export const leadApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPropertyLeads: builder.query<Page<Lead>, LeadListQuery>({
      query: leadListUrl,
      providesTags: [...READ_TAGS],
    }),

    getPropertyLeadCounts: builder.query<LeadCounts, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/leads/counts`,
      providesTags: [...READ_TAGS],
    }),

    /** `month` is YYYY-MM. Left out, the month it is now in India. */
    getPropertyLeadFunnel: builder.query<LeadFunnel, { propertyId: string; month?: string }>({
      query: ({ month, propertyId }) =>
        `/api/v1/properties/${propertyId}/leads/funnel${month ? `?month=${month}` : ""}`,
      providesTags: [...READ_TAGS],
    }),

    /** Everything on the Leads insights screen (2026-10-18). */
    getLeadInsights: builder.query<LeadInsights, { propertyId: string; period: LeadInsightsPeriod; from?: string; to?: string }>({
      query: ({ from, period, propertyId, to }) => ({
        params: { period, ...(period === "CUSTOM" && from && to ? { from, to } : {}) },
        url: `/api/v1/properties/${propertyId}/leads/insights`,
      }),
      providesTags: [...READ_TAGS],
    }),

    getLead: builder.query<LeadDetail, string>({
      query: (leadId) => `/api/v1/leads/${leadId}`,
      providesTags: [...READ_TAGS],
    }),

    /** Someone who walked in and saw the place (2026-10-19). */
    recordExternalVisit: builder.mutation<ExternalRecord, { propertyId: string; body: RecordExternalVisit }>({
      query: ({ body, propertyId }) => ({ body, method: "POST", url: `/api/v1/properties/${propertyId}/external-visits` }),
      invalidatesTags: ["Lead", "EnquiryChat"],
    }),

    getExternalBookingOptions: builder.query<ExternalBookingOptions, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/external-bookings/options`,
      providesTags: ["Booking"],
    }),

    /** Someone who booked in person or by phone, saved as confirmed (2026-10-19). */
    createExternalBooking: builder.mutation<ExternalRecord, { propertyId: string; body: CreateExternalBooking }>({
      query: ({ body, propertyId }) => ({ body, method: "POST", url: `/api/v1/properties/${propertyId}/external-bookings` }),
      invalidatesTags: ["Lead", "Booking"],
    }),
  }),
  // As every other service has it, so a changed endpoint takes effect on hot reload.
  overrideExisting: __DEV__ ? true : "throw",
});

export const {
  useCreateExternalBookingMutation,
  useGetExternalBookingOptionsQuery,
  useRecordExternalVisitMutation,
  useGetLeadInsightsQuery,
  useGetPropertyLeadsQuery,
  useGetPropertyLeadCountsQuery,
  useGetPropertyLeadFunnelQuery,
  useGetLeadQuery,
} = leadApi;

// ---- External visits and bookings (2026-10-19) ------------------------------

export type VisitImpression = "LIKED" | "OKAY" | "DISLIKED";
export type VisitInterest = "YES" | "NOT_SURE" | "NO";
export type ReachedVia = "WALKED_IN" | "PHONE_CALL";

export type RecordExternalVisit = {
  name: string;
  phone: string;
  /** YYYY-MM-DD, today or an earlier day in the last 30. */
  visitedOn: string;
  /** "HH:mm", the slot they came in, with slotEnd. Both null for the whole day, when the day has no slots. */
  slotStart: string | null;
  slotEnd: string | null;
  impression: VisitImpression;
  /** Why they did not like it: required with DISLIKED, null otherwise. */
  dislikedReason: string | null;
  interest: VisitInterest;
  wantedSharing: string | null;
  budgetPaise: number | null;
  note: string | null;
};

export type CreateExternalBooking = {
  name: string;
  phone: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth: string;
  reachedVia: ReachedVia;
  roomId: string;
  moveInDate: string;
  monthlyRentPaise: number | null;
  depositPaise: number | null;
  agreementMonths: number | null;
  tokenPaise: number | null;
  tokenMethod: string | null;
  tokenReference: string | null;
};

export type ExternalBookingRoom = {
  roomId: string;
  roomNumber: string;
  floor: string | null;
  roomType: string | null;
  conditioning: string | null;
  capacity: number;
  freeBeds: number;
  rentPaise: number;
};

export type ExternalBookingOptions = {
  open: boolean;
  whyNot: string | null;
  earliestMoveInDate: string | null;
  latestMoveInDate: string | null;
  depositPaise: number;
  tokenRequired: boolean;
  tokenAmountPaise: number;
  rooms: ExternalBookingRoom[];
};

export type ExternalRecord = {
  leadId: string;
  leadReferenceCode: string;
  leadStage: string;
  leadState: string;
  visitId: string | null;
  visitReferenceCode: string | null;
  bookingId: string | null;
};
