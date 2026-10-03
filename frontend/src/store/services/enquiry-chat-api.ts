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
  /** Whether the person reading may move it now: before its day, or after a miss. */
  canReschedule: boolean;
  /** Why not, in words to show. Null when they may. */
  rescheduleRefusal: string | null;
  /** Whether the person reading may cancel it: either side, until it is done, its day included. */
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
  /** Management only: they changed their mind once, so Not interested now closes the enquiry. */
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
  /** From tomorrow to 30 days ahead. Only dates the property offers a slot on. */
  days: { date: string; slots: VisitSlotAvailability[] }[];
};

/** A visit booked on one of the property's enquiries and not yet done. */
export type BookedVisit = {
  enquiryId: string;
  visitId: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  upcoming: boolean;
  missed: boolean;
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

    getVisitAvailability: builder.query<VisitAvailability, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/visit-availability`,
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
  useEndEnquiryConversationMutation,
  useGetBookedVisitsQuery,
  useGetEnquiryChatActionsQuery,
  useGetVisitAvailabilityQuery,
  useRescheduleVisitMutation,
  useScheduleVisitMutation,
  useSetEnquirySentimentMutation,
  useClearEnquirySentimentMutation,
} = enquiryChatApi;
