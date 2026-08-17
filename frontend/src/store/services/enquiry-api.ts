import { api } from "@/store/api";

export type EnquiryResponseChannel = "CALL_BACK" | "EMAIL" | "CHAT";
export type EnquiryStatus = "NEW" | "RESPONDED";
export type EmailChannelState = "AVAILABLE" | "UNVERIFIED" | "NOT_REGISTERED";

/**
 * A way the enquirer can actually be reached. Computed on the server so the
 * enquirer's confirmation dialog and the owner's respond sheet agree — CHAT
 * never appears here, because nobody can be reached on it yet.
 */
export type ReachableChannel = {
  channel: EnquiryResponseChannel;
  target: string;
};

export type EnquiryResponseView = {
  id: string;
  channel: EnquiryResponseChannel;
  respondedByUserId: string;
  respondedByName: string | null;
  note: string | null;
  respondedAt: string;
};

export type EnquiryDetail = {
  id: string;
  propertyId: string;
  message: string;
  status: EnquiryStatus;
  createdAt: string;
  enquirerUserId: string;
  enquirerName: string | null;
  enquirerPhone: string | null;
  /** Null unless registered and verified. */
  enquirerEmail: string | null;
  reachableChannels: ReachableChannel[];
  response: EnquiryResponseView | null;
};

/** Everything the confirmation dialog needs, straight from the send call. */
export type EnquiryReceipt = {
  enquiryId: string;
  propertyId: string;
  propertyName: string;
  createdAt: string;
  reachableChannels: ReachableChannel[];
  emailChannelState: EmailChannelState;
};

export type MyEnquiry = {
  canEnquire: boolean;
  /** Why not, in words the button can show. Null when they can. */
  blockedReason: string | null;
  openEnquiryId: string | null;
  openEnquiryAt: string | null;
};

export const ENQUIRY_MESSAGE_MAX_LENGTH = 500;

export const enquiryApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMyEnquiryForProperty: builder.query<MyEnquiry, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/enquiries/me`,
      providesTags: ["Enquiry"],
    }),

    raiseEnquiry: builder.mutation<EnquiryReceipt, { propertyId: string; message: string }>({
      query: ({ message, propertyId }) => ({
        body: { message },
        method: "POST",
        url: `/api/v1/properties/${propertyId}/enquiries`,
      }),
      invalidatesTags: ["Enquiry"],
    }),

    listPropertyEnquiries: builder.query<EnquiryDetail[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/enquiries`,
      providesTags: ["Enquiry"],
    }),

    getOpenEnquiryCount: builder.query<number, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/enquiries/open-count`,
      transformResponse: (response: { count: number }) => response.count,
      providesTags: ["Enquiry"],
    }),

    respondToEnquiry: builder.mutation<
      EnquiryDetail,
      { enquiryId: string; channel: EnquiryResponseChannel; note?: string | null }
    >({
      query: ({ channel, enquiryId, note }) => ({
        body: { channel, note: note ?? null },
        method: "PATCH",
        url: `/api/v1/enquiries/${enquiryId}/respond`,
      }),
      invalidatesTags: ["Enquiry"],
    }),
  }),
});

export const {
  useGetMyEnquiryForPropertyQuery,
  useGetOpenEnquiryCountQuery,
  useListPropertyEnquiriesQuery,
  useRaiseEnquiryMutation,
  useRespondToEnquiryMutation,
} = enquiryApi;

/** "Callback on +91…" / "Email to anita@example.com", for the dialog bullets. */
export function describeReachableChannel(channel: ReachableChannel) {
  return channel.channel === "EMAIL" ? `Email to ${channel.target}` : `Callback on ${channel.target}`;
}

/**
 * What the enquirer should do to open up the email channel, or null when it is
 * already open. Registering and verifying are different jobs — telling someone
 * to add an address they already added reads as not paying attention.
 */
export function describeEmailChannelGap(state: EmailChannelState) {
  if (state === "AVAILABLE") {
    return null;
  }
  return state === "UNVERIFIED"
    ? "Verify your email to enable that channel for a revert back."
    : "Register and verify your email to enable that channel for a revert back.";
}
