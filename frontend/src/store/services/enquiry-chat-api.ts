import { api, ifMatch } from "@/store/api";

/** What the person reading is to the enquiry. */
export type EnquiryParty = "ENQUIRER" | "ACTING_MANAGEMENT" | "OTHER_MANAGEMENT" | "OUTSIDER";

/** The handler's reading of the enquirer. Never sent to the enquirer. */
export type EnquirySentiment = "INTERESTED" | "NOT_INTERESTED";

export type Visit = {
  id: string;
  /** The short code shown to people, never the id. */
  referenceCode: string;
  leadId: string;
  enquiryId: string | null;
  /** YYYY-MM-DD. */
  date: string;
  /** HH:mm:ss, the start of the property's slot. */
  slotStart: string;
  slotEnd: string;
  status: "SCHEDULED" | "CANCELLED" | "VISITED" | "NOT_VISITED";
  bookedBy: "TENANT" | "HANDLER";
  /** Still to happen. False once its date has passed. */
  upcoming: boolean;
  /** Its date passed without them coming. Moving it is the second chance. */
  missed: boolean;
  /** How many more times the prospect may move it themselves. */
  tenantReschedulesLeft: number;
  /** Whether the person reading may move it now. The property: until two hours before its slot. */
  canReschedule: boolean;
  /** Why not, in words to show. Null when they may. */
  rescheduleRefusal: string | null;
  /** Whether the person reading may cancel it. The visitor until it is done, the property until two hours before its slot. */
  canCancel: boolean;
  /** Sent back as If-Match when moving it. */
  version: number;
};

/**
 * Everything the bar above an enquiry chat's message box shows.
 *
 * <p>Every "can" is decided by the server. The bar draws what it is told and
 * works no rule out for itself, so it never offers what would be refused.
 */
export type EnquiryChatActions = {
  enquiryId: string;
  propertyId: string;
  viewer: EnquiryParty;
  /** Whether the enquirer has been reached. The bar appears from then. */
  answered: boolean;
  /** Whether the conversation is over, by hand or by the enquiry's date. */
  ended: boolean;
  sentiment: EnquirySentiment | null;
  canSetSentiment: boolean;
  canScheduleVisit: boolean;
  canEndConversation: boolean;
  /** The enquirer changed their mind once, so Not interested, from either side, now closes the enquiry. */
  notInterestedCloses: boolean;
  /** The visit still to happen, if one is booked. */
  visit: Visit | null;
  /** Sent back as If-Match with the sentiment and with ending. */
  enquiryVersion: number;
};

export type VisitSlotAvailability = {
  startTime: string;
  endTime: string;
  capacity: number;
  /** At 0 the slot is full and cannot be picked. */
  spotsLeft: number;
};

export type VisitAvailability = {
  propertyId: string;
  /** False when the owner has not set any visit slots yet. */
  configured: boolean;
  /** From tomorrow to 30 days ahead, never past the enquiry's end. Only dates the property offers a slot on. */
  days: { date: string; slots: VisitSlotAvailability[] }[];
};

/**
 * What a visit card says about its visit. A cancelled one is never listed.
 * RESCHEDULED is only on the list of the day a visit was moved off: the visit
 * itself is in Upcoming, as SCHEDULED.
 */
export type VisitCardState = "SCHEDULED" | "VISITED" | "MISSED" | "RESCHEDULED";

/** The visit that stands on one of the property's enquiries: booked, attended or missed. */
export type BookedVisit = {
  enquiryId: string;
  visitId: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  upcoming: boolean;
  missed: boolean;
  state: VisitCardState;
  /** Moved on or after the day it was due: the card reads "Visit rescheduled". */
  rescheduled: boolean;
  /** Whether the property may still move or cancel it: until two hours before its slot. */
  managementMayChange: boolean;
};

export type VisitImpression = "LIKED" | "OKAY" | "DISLIKED";

/** One visit on the Manage Visits screen (2026-10-04). */
export type VisitCard = {
  visitId: string;
  /** The short code shown to people, never the id. */
  referenceCode: string;
  enquiryId: string;
  prospectName: string | null;
  date: string;
  slotStart: string;
  slotEnd: string;
  /** The slot as instants, so Mark attendance opens and closes by this device's own clock. */
  slotStartsAt: string;
  slotEndsAt: string;
  state: VisitCardState;
  checkedInAt: string | null;
  /** Who checked them in, so the card says "you" to that person. */
  checkedInByUserId: string | null;
  checkedInByName: string | null;
  checkInMethod: "QR" | "CODE" | "OWNER" | null;
  /** Past half the slot at check-in. Null until then, and when the owner marked it afterwards. */
  late: boolean | null;
  formCompleted: boolean;
  /** The person reading checked them in, or owns the property: the visit form is theirs. */
  viewerFillsForm: boolean;
  departedAt: string | null;
  partySize: number | null;
  impression: VisitImpression | null;
  handlerUserId: string | null;
  handlerName: string | null;
  noVisitAt: string | null;
  /** When the visitor said they are running late. */
  runningLateAt: string | null;
  /** On a RESCHEDULED card: where the visit went. Its own date and slot are the ones it left. */
  rescheduledToDate: string | null;
  rescheduledToSlotStart: string | null;
  /** When it took the date and slot it has now: booked, or last moved. */
  placedAt: string;
  version: number;
};

/** The Manage Visits screen's three tabs. */
export type PropertyVisits = {
  /** Only the owner marks a missed check-in. */
  viewerIsOwner: boolean;
  /** Every slot the property offers today, in order, whether or not anyone is coming in it. */
  todaySlots: { start: string; end: string; startsAt: string; endsAt: string; capacity: number | null }[];
  today: VisitCard[];
  upcoming: VisitCard[];
  /** No visits whose enquiry is still open. Nothing here can be acted on by the property. */
  missed: VisitCard[];
};

/** One of the visitor's own visits, on My visits (2026-10-04). */
export type MyVisit = {
  visitId: string;
  referenceCode: string;
  enquiryId: string | null;
  propertyId: string;
  propertyName: string;
  /** Google Maps directions to the property, from wherever the visitor is. Null when it has no address or pin. */
  directionsUrl: string | null;
  date: string;
  slotStart: string;
  slotEnd: string;
  state: VisitCardState;
  /** Instants, compared with this device's own clock. */
  passOpensAt: string;
  /** Midnight at the end of the visit's day: the pass shows until then. */
  passClosesAt: string;
  slotStartsAt: string;
  runningLateFrom: string;
  slotEndsAt: string;
  checkedInAt: string | null;
  /** Who received them at the property, once checked in. */
  checkedInByName: string | null;
  checkInMethod: "QR" | "CODE" | "OWNER" | null;
  /** Past half the slot at check-in. Null until then, and when the owner marked it afterwards. */
  late: boolean | null;
  noVisitAt: string | null;
  /** For a No visit: "Are you still interested?" is open until then. */
  answerBy: string | null;
  /** When they said "I'm on my way". The screen stops asking then. */
  runningLateAt: string | null;
  /** Once its enquiry is over, nothing more can be done with the visit. */
  enquiryOpen: boolean;
  version: number;
};

/** The visitor's pass for their slot: what the QR holds, and the code under it. */
export type VisitPass = {
  visitId: string;
  referenceCode: string;
  propertyName: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  token: string;
  code: string;
  validUntil: string;
};

/** Where a visit stands for the visitor, by the clock. */
export type VisitWindow = "BEFORE_DAY" | "DAY_BEFORE_SLOT" | "IN_SLOT" | "RUNNING_LATE" | "MISSED" | "CLOSED";

/** Where a visit may be moved to right now. The screen offers exactly these. */
export type VisitMoveOptions = {
  visitId: string;
  window: VisitWindow;
  /** Why it cannot be moved, in words to show. Null when it can. */
  refusal: string | null;
  /** Why it cannot go to another day, when only its own day is left to it. Null when another day is on offer. */
  anotherDayRefusal: string | null;
  /** A slot on the visit day itself costs the visitor nothing. */
  todayIsFree: boolean;
  reschedulesLeft: number;
  days: { date: string; slots: VisitSlotAvailability[] }[];
};

export const enquiryChatApi = api.injectEndpoints({
  endpoints: (builder) => ({
    /** What the Enquiries cards read to say "Manage visit" instead of "Schedule visit". */
    getBookedVisits: builder.query<BookedVisit[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/booked-visits`,
      providesTags: ["EnquiryChat"],
    }),

    getEnquiryChatActions: builder.query<EnquiryChatActions, string>({
      query: (enquiryId) => `/api/v1/enquiries/${enquiryId}/chat-actions`,
      providesTags: ["EnquiryChat"],
    }),

    /** The Manage Visits screen: today, upcoming and missed, in one read. */
    getPropertyVisits: builder.query<PropertyVisits, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/visits`,
      providesTags: ["EnquiryChat"],
    }),

    /** The visitor's own visits, at any property. */
    getMyVisits: builder.query<MyVisit[], void>({
      query: () => "/api/v1/visits/mine",
      providesTags: ["EnquiryChat"],
    }),

    /** The visitor's own pass. Refused until an hour before the slot. */
    getVisitPass: builder.query<VisitPass, string>({
      query: (visitId) => `/api/v1/visits/${visitId}/pass`,
      providesTags: ["EnquiryChat"],
    }),

    getVisitMoveOptions: builder.query<VisitMoveOptions, string>({
      query: (visitId) => `/api/v1/visits/${visitId}/move-options`,
      providesTags: ["EnquiryChat"],
    }),

    /** Marks attendance with the scanned pass or the code on it. */
    checkInVisit: builder.mutation<VisitCard, { visitId: string; token?: string; code?: string }>({
      query: ({ code, token, visitId }) => ({
        body: { code: code ?? null, token: token ?? null },
        method: "POST",
        url: `/api/v1/visits/${visitId}/check-in`,
      }),
      invalidatesTags: ["EnquiryChat", "Enquiry"],
    }),

    /** The owner marks a visitor nobody scanned, after the slot and before midnight. */
    markMissedCheckIn: builder.mutation<VisitCard, string>({
      query: (visitId) => ({ method: "POST", url: `/api/v1/visits/${visitId}/missed-check-in` }),
      invalidatesTags: ["EnquiryChat", "Enquiry"],
    }),

    /** Each part is optional. What is left out stays blank, and the leaving time becomes the slot's end overnight. */
    completeVisitForm: builder.mutation<
      VisitCard,
      { visitId: string; departedAt: string | null; partySize: number | null; impression: VisitImpression | null }
    >({
      query: ({ departedAt, impression, partySize, visitId }) => ({
        body: { departedAt, impression, partySize },
        method: "PUT",
        url: `/api/v1/visits/${visitId}/form`,
      }),
      invalidatesTags: ["EnquiryChat"],
    }),

    /** "I'm on my way", past half the slot: the owner and every manager are told, once. */
    markRunningLate: builder.mutation<void, string>({
      query: (visitId) => ({ method: "POST", url: `/api/v1/visits/${visitId}/running-late` }),
      invalidatesTags: ["EnquiryChat"],
    }),

    /** "Are you still interested?" answered No: the enquiry expires. */
    declineMissedVisit: builder.mutation<void, string>({
      query: (visitId) => ({ method: "POST", url: `/api/v1/visits/${visitId}/not-interested` }),
      invalidatesTags: ["EnquiryChat", "Enquiry"],
    }),

    /**
     * Open slots for a visit from this enquiry: only those before the enquiry
     * ends (2026-10-07), since a visit has to happen inside its 30 days.
     */
    getVisitAvailability: builder.query<VisitAvailability, { propertyId: string; enquiryId: string }>({
      query: ({ propertyId, enquiryId }) =>
        `/api/v1/properties/${propertyId}/visit-availability?enquiryId=${encodeURIComponent(enquiryId)}`,
      providesTags: ["EnquiryChat"],
    }),

    setEnquirySentiment: builder.mutation<
      unknown,
      { enquiryId: string; sentiment: EnquirySentiment; version: number }
    >({
      query: ({ enquiryId, sentiment, version }) => ({
        body: { sentiment },
        headers: ifMatch(version),
        method: "PUT",
        url: `/api/v1/enquiries/${enquiryId}/sentiment`,
      }),
      invalidatesTags: ["EnquiryChat", "Enquiry"],
    }),

    /** "Not decided": clears the reading, and with it the visit or end action it offered. */
    clearEnquirySentiment: builder.mutation<unknown, { enquiryId: string; version: number }>({
      query: ({ enquiryId, version }) => ({
        headers: ifMatch(version),
        method: "DELETE",
        url: `/api/v1/enquiries/${enquiryId}/sentiment`,
      }),
      invalidatesTags: ["EnquiryChat", "Enquiry"],
    }),

    /** Closes the chat for both sides, so the thread itself has to be read again. */
    endEnquiryConversation: builder.mutation<unknown, { enquiryId: string; version: number }>({
      query: ({ enquiryId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/enquiries/${enquiryId}/end`,
      }),
      invalidatesTags: ["EnquiryChat", "Enquiry", "Chat"],
    }),

    scheduleVisit: builder.mutation<
      EnquiryChatActions,
      { enquiryId: string; date: string; slotStart: string }
    >({
      query: ({ date, enquiryId, slotStart }) => ({
        body: { date, slotStart },
        method: "POST",
        url: `/api/v1/enquiries/${enquiryId}/visits`,
      }),
      invalidatesTags: ["EnquiryChat", "Enquiry"],
    }),

    /** Frees the place and puts them back at Enquired. They may book again while the enquiry is open. */
    /** Still interested or not, and why, both required (2026-10-03). */
    cancelVisit: builder.mutation<
      Visit,
      { reason: string; stillInterested: boolean; visitId: string; version: number }
    >({
      query: ({ reason, stillInterested, version, visitId }) => ({
        body: { reason, stillInterested },
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/visits/${visitId}/cancel`,
      }),
      invalidatesTags: ["EnquiryChat", "Enquiry"],
    }),

    rescheduleVisit: builder.mutation<
      Visit,
      { visitId: string; date: string; slotStart: string; version: number }
    >({
      query: ({ date, slotStart, version, visitId }) => ({
        body: { date, slotStart },
        headers: ifMatch(version),
        method: "PATCH",
        url: `/api/v1/visits/${visitId}/reschedule`,
      }),
      invalidatesTags: ["EnquiryChat", "Enquiry"],
    }),
  }),
  overrideExisting: true,
});

export const {
  useCancelVisitMutation,
  useCheckInVisitMutation,
  useCompleteVisitFormMutation,
  useDeclineMissedVisitMutation,
  useEndEnquiryConversationMutation,
  useGetMyVisitsQuery,
  useGetPropertyVisitsQuery,
  useGetVisitMoveOptionsQuery,
  useGetVisitPassQuery,
  useMarkMissedCheckInMutation,
  useMarkRunningLateMutation,
  useGetBookedVisitsQuery,
  useGetEnquiryChatActionsQuery,
  useGetVisitAvailabilityQuery,
  useRescheduleVisitMutation,
  useScheduleVisitMutation,
  useSetEnquirySentimentMutation,
  useClearEnquirySentimentMutation,
} = enquiryChatApi;
