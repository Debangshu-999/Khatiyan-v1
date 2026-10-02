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

export const enquiryChatApi = api.injectEndpoints({
  endpoints: (builder) => ({
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
      invalidatesTags: ["EnquiryChat"],
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
      invalidatesTags: ["EnquiryChat"],
    }),
  }),
  overrideExisting: true,
});

export const {
  useEndEnquiryConversationMutation,
  useGetEnquiryChatActionsQuery,
  useGetVisitAvailabilityQuery,
  useRescheduleVisitMutation,
  useScheduleVisitMutation,
  useSetEnquirySentimentMutation,
} = enquiryChatApi;
