import { api } from "@/store/api";

export type EnquiryResponseChannel = "CALL_BACK" | "EMAIL" | "CHAT";
/**
 * EXPIRED is set by the server sweep seven days after an enquiry is raised. It
 * both greys the card and releases the one-open-enquiry index, so the person who
 * asked can ask again.
 */
export type EnquiryStatus = "NEW" | "RESPONDED" | "EXPIRED";
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
  /** Still sent after it has passed — the card shows it for a further day. */
  expiresAt: string;
  enquirerUserId: string;
  enquirerName: string | null;
  enquirerPhone: string | null;
  /** Null unless registered and verified. */
  enquirerEmail: string | null;
  reachableChannels: ReachableChannel[];
  /**
   * The conversation this enquiry was answered in, if it was answered in one.
   *
   * <p>Null for phone and email replies, which happen outside the app entirely.
   */
  chatThreadId: string | null;
  /** The action log — every response, newest first. Empty while still open. */
  responses: EnquiryResponseView[];
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

/** One row of the consent modal's channel selector. */
export type EnquiryChannelOption = {
  channel: EnquiryResponseChannel;
  /** The number or address this would share. Null when unavailable, and for chat. */
  target: string | null;
  /** False when there is nothing to share yet — an absent or unverified email. */
  available: boolean;
  granted: boolean;
  /**
   * True for a channel that is not the enquirer's to decide about.
   *
   * <p>Only CHAT. It shares nothing, so there is nothing to agree to and nothing
   * to withdraw — it is drawn ticked and does not respond to a press. Never send
   * a locked channel back in an update, the server refuses it.
   */
  locked: boolean;
};

/**
 * What this person has agreed a property may contact them on.
 *
 * <p>Not property-scoped. The grant is a standing decision about them, so the
 * modal on any profile and the account settings section read the same thing.
 */
export type EnquiryChannelConsents = {
  channels: EnquiryChannelOption[];
  emailChannelState: EmailChannelState;
  /** What the enquire button checks to decide whether to open the modal. */
  anyGranted: boolean;
  termsVersion: string;
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

    getMyEnquiryChannelConsents: builder.query<EnquiryChannelConsents, void>({
      query: () => "/api/v1/enquiries/channel-consents",
      providesTags: ["EnquiryConsent"],
    }),

    /**
     * Sends the whole set, not a delta.
     *
     * <p>`agreed` is the tick, and the server only demands it when the request
     * ADDS a channel — so a revoke does not have to claim an agreement it is
     * not making.
     */
    updateEnquiryChannelConsents: builder.mutation<
      EnquiryChannelConsents,
      { channels: EnquiryResponseChannel[]; agreed: boolean }
    >({
      query: ({ agreed, channels }) => ({
        body: { agreed, channels },
        method: "PUT",
        url: "/api/v1/enquiries/channel-consents",
      }),
      /**
       * Patched into the cache before the request goes out.
       *
       * <p>Without this a switch flickers on, off, then on again. A Switch is
       * controlled by `granted`, so tapping it paints the new position, the very
       * next render puts back the server's still-old value, and the refetch then
       * paints it a third time. Three states for one decision.
       *
       * <p>Undone on failure, so a refused save snaps back rather than leaving a
       * switch claiming a grant the server does not hold.
       */
      async onQueryStarted({ channels }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          enquiryApi.util.updateQueryData("getMyEnquiryChannelConsents", undefined, (draft) => {
            for (const option of draft.channels) {
              // Chat is never in the requested set and is always on. Reading it
              // off `channels` would switch it off on every save.
              if (option.locked) {
                continue;
              }
              option.granted = option.available && channels.includes(option.channel);
            }
            draft.anyGranted = draft.channels.some((option) => option.granted && !option.locked);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      // Enquiry too: the set decides what a NEW enquiry will carry, and the
      // enquire button's caption reads from it.
      invalidatesTags: ["EnquiryConsent", "Enquiry"],
    }),

    /** The account settings master switch. Can only ever take access away. */
    revokeEnquiryChannelConsent: builder.mutation<EnquiryChannelConsents, EnquiryResponseChannel>({
      query: (channel) => ({
        method: "DELETE",
        url: `/api/v1/enquiries/channel-consents/${channel}`,
      }),
      invalidatesTags: ["EnquiryConsent", "Enquiry"],
    }),
  }),
  // Fast Refresh re-runs this whole module on every edit, so injectEndpoints
  // sees endpoints it already registered and logs an error for each one — two
  // dozen of them behind a red overlay, none of them real. Allowed in dev for
  // that reason; "throw" in production, where the module runs once and a second
  // registration really would be a duplicate name.
  overrideExisting: __DEV__ ? true : "throw",
});

export const {
  useGetMyEnquiryChannelConsentsQuery,
  useGetMyEnquiryForPropertyQuery,
  useGetOpenEnquiryCountQuery,
  useListPropertyEnquiriesQuery,
  useRaiseEnquiryMutation,
  useRespondToEnquiryMutation,
  useRevokeEnquiryChannelConsentMutation,
  useUpdateEnquiryChannelConsentsMutation,
} = enquiryApi;

/** "Phone call" / "Email", for the consent modal and the settings rows. */
export function describeChannelName(channel: EnquiryResponseChannel) {
  if (channel === "EMAIL") {
    return "Email";
  }
  return channel === "CHAT" ? "Chat" : "Phone call";
}

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

/**
 * The same gap, as a row subtitle rather than a footnote.
 *
 * <p>The long form was written to sit under a dialog as a closing note. Dropped
 * into a channel row it wrapped to two lines and pushed the row taller than the
 * two beside it, and "for a revert back" reads as filler where the label above
 * already says Email.
 */
export function describeEmailChannelGapShort(state: EmailChannelState) {
  if (state === "AVAILABLE") {
    return null;
  }
  return state === "UNVERIFIED" ? "Verify your email to use this" : "Add a verified email to use this";
}
