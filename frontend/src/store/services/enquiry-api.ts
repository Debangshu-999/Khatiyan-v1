import { api, ifMatch } from "@/store/api";

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

/** Whether an attempt reached them. OPEN on a call still waiting for "Record response". */
export type EnquiryAttemptOutcome = "OPEN" | "SUCCEEDED" | "FAILED";

/**
 * How a call went, as "Record response" records it (2026-10-03). The first two
 * fail the call, the accepted two succeed and set the sentiment.
 */
export type EnquiryCallResult = "NO_ANSWER" | "REJECTED" | "ACCEPTED_INTERESTED" | "ACCEPTED_NOT_INTERESTED";

export type EnquiryResponseView = {
  id: string;
  channel: EnquiryResponseChannel;
  respondedByUserId: string;
  respondedByName: string | null;
  note: string | null;
  respondedAt: string;
  outcome: EnquiryAttemptOutcome | null;
  settledAt: string | null;
  /** Calls recorded through "Record response" only. */
  callResult: EnquiryCallResult | null;
  /** How long an accepted call ran, when the handler said. */
  durationSeconds: number | null;
};

/** How a new enquiry finds its handler. */
export type EnquiryHandlerMode = "SYSTEM_TURNS" | "FIRST_RESPONSE" | "OWNER_ASSIGNS";

/** A property's choice. `configured` is false, and `version` null, until the owner first picks. */
export type EnquiryHandlerSettings = {
  propertyId: string;
  mode: EnquiryHandlerMode;
  /** Whether the owner takes a turn when the system assigns. */
  includeOwner: boolean;
  configured: boolean;
  version: number | null;
};

/** Why an enquiry ended (2026-10-03). Stored when it ends. */
export type EnquiryEndReason =
  | "HANDLER_DID_NOT_RESPOND"
  | "TENANT_DID_NOT_RESPOND"
  | "NOT_INTERESTED"
  | "NO_VISIT_BOOKED"
  | "VISIT_CANCELLED"
  | "VISIT_BOOKED";

/** Where an enquiry stands for the person who raised it. Never the handler's reading. */
export type MyEnquiryState = "AWAITING_REPLY" | "ANSWERED" | "CLOSED" | "EXPIRED";

/** One row of My enquiries. */
export type MyEnquiryItem = {
  id: string;
  propertyId: string;
  propertyName: string;
  message: string;
  askedAt: string;
  expiresAt: string;
  /** When the property first reached them. Null until then. */
  answeredAt: string | null;
  state: MyEnquiryState;
  closedAt: string | null;
  chatThreadId: string | null;
  /** The visit still booked on it: "yyyy-mm-dd" and "HH:mm:ss". */
  visitDate: string | null;
  visitStart: string | null;
  /** Its visit was cancelled and none is booked again: "Visit cancelled". */
  visitCancelledAt: string | null;
  /** Marked not interested and still open: when it closes by itself. */
  notInterestedClosesAt: string | null;
  /** Whether "Changed your mind?" is still on offer. Once only. */
  canChangeMind: boolean;
  version: number;
};

export type EnquiryDetail = {
  id: string;
  propertyId: string;
  message: string;
  status: EnquiryStatus;
  createdAt: string;
  /** Still sent after it has passed: the card shows it as Expired, as long as it was raised this year. */
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
  /** Who handles it. All null while nobody does. */
  handlerUserId?: string | null;
  handlerName?: string | null;
  handlerAssignedAt?: string | null;
  /** When the first attempt reached them. Null until it has. Gates booking a visit. */
  respondedAt?: string | null;
  /** Whether the person asking may act on it: its handler, the owner, or anyone while unhandled. */
  viewerMayAct?: boolean;
  /**
   * The call still waiting for "Record response", if there is one. A new call
   * cannot start until it is answered.
   */
  callToSettleId?: string | null;
  /** Whether the person asking is the one to answer it: they made the call. */
  viewerSettlesCall?: boolean;
  /** The handler's reading of the enquirer. Never sent to the enquirer. */
  sentiment?: "INTERESTED" | "NOT_INTERESTED" | null;
  /** When the handler closed it (Close enquiry, End conversation). It reads Closed until its usual date. */
  endedAt?: string | null;
  /** Why it ended, once it has: the pill on an expired card. */
  endReason?: EnquiryEndReason | null;
  /** The enquirer took back a Not interested: "Interested: Tenant changed mind". */
  tenantChangedMindAt?: string | null;
  /** Management's latest turn of a Not interested back to Interested, and who did it. */
  handlerReversedAt?: string | null;
  handlerReversedByUserId?: string | null;
  handlerReversedByName?: string | null;
  /** When a Not interested enquiry closes by itself, if it is one. */
  notInterestedClosesAt?: string | null;
  /** Its latest cancelled visit. Shown while no visit is booked again. */
  cancelledVisit?: { reason: string | null; byTenant: boolean; cancelledAt: string } | null;
  /**
   * The row's version (2026-09-29). Sent back as If-Match when a screen acts
   * on it, so a record someone else changed since is refused, not overwritten.
   */
  version: number;
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
  /**
   * A closed Not interested enquiry they may still reopen, once. Enquire then
   * offers "Changed your mind?" on it instead of a new enquiry.
   */
  reopenableEnquiryId?: string | null;
  reopenableVersion?: number | null;
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

    /** The enquirer's own enquiries raised this year, in any state (My enquiries). */
    getMyEnquiries: builder.query<MyEnquiryItem[], void>({
      query: () => "/api/v1/enquiries/mine",
      providesTags: ["Enquiry"],
    }),

    /** "Changed your mind?": takes back a Not interested, once, and tells the handler. */
    changeEnquiryMind: builder.mutation<MyEnquiryItem, { enquiryId: string; version: number }>({
      query: ({ enquiryId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/enquiries/${enquiryId}/changed-mind`,
      }),
      invalidatesTags: ["Enquiry", "EnquiryChat"],
    }),

    /** The owner gives an enquiry to a manager, or to themselves. */
    assignEnquiryHandler: builder.mutation<EnquiryDetail, { enquiryId: string; handlerUserId: string; version: number }>({
      query: ({ enquiryId, handlerUserId, version }) => ({
        body: { handlerUserId },
        headers: ifMatch(version),
        method: "PATCH",
        url: `/api/v1/enquiries/${enquiryId}/handler`,
      }),
      invalidatesTags: ["Enquiry", "EnquiryChat"],
    }),

    getEnquiryHandlerSettings: builder.query<EnquiryHandlerSettings, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/enquiry-handler-settings`,
      providesTags: ["Enquiry"],
    }),

    /**
     * The owner's choice of how enquiries are assigned. The first choice is a
     * POST, later ones a PUT with If-Match, which the version tells apart.
     */
    saveEnquiryHandlerSettings: builder.mutation<
      EnquiryHandlerSettings,
      { includeOwner: boolean; mode: EnquiryHandlerMode; propertyId: string; version: number | null }
    >({
      query: ({ includeOwner, mode, propertyId, version }) => ({
        body: { includeOwner, mode },
        headers: version == null ? undefined : ifMatch(version),
        method: version == null ? "POST" : "PUT",
        url: `/api/v1/properties/${propertyId}/enquiry-handler-settings`,
      }),
      invalidatesTags: ["Enquiry"],
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
      { enquiryId: string; channel: EnquiryResponseChannel; note?: string | null; version: number }
    >({
      query: ({ channel, enquiryId, note, version }) => ({
        body: { channel, note: note ?? null },
        headers: ifMatch(version),
        method: "PATCH",
        url: `/api/v1/enquiries/${enquiryId}/respond`,
      }),
      invalidatesTags: ["Enquiry"],
    }),

    /**
     * "Record response" for a call (2026-10-03). The result decides success or
     * failure, and an accepted one sets the sentiment, so the chat's bar is
     * read again too.
     */
    settleEnquiryCall: builder.mutation<
      EnquiryDetail,
      {
        attemptId: string;
        callResult: EnquiryCallResult;
        durationSeconds?: number | null;
        enquiryId: string;
        note?: string | null;
        version: number;
      }
    >({
      query: ({ attemptId, callResult, durationSeconds, enquiryId, note, version }) => ({
        body: { callResult, durationSeconds: durationSeconds ?? null, note: note ?? null },
        headers: ifMatch(version),
        method: "PATCH",
        url: `/api/v1/enquiries/${enquiryId}/attempts/${attemptId}/settle`,
      }),
      invalidatesTags: ["Enquiry", "EnquiryChat"],
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
  useAssignEnquiryHandlerMutation,
  useChangeEnquiryMindMutation,
  useGetEnquiryHandlerSettingsQuery,
  useSaveEnquiryHandlerSettingsMutation,
  useGetMyEnquiriesQuery,
  useGetMyEnquiryChannelConsentsQuery,
  useGetMyEnquiryForPropertyQuery,
  useGetOpenEnquiryCountQuery,
  useListPropertyEnquiriesQuery,
  useRaiseEnquiryMutation,
  useRespondToEnquiryMutation,
  useRevokeEnquiryChannelConsentMutation,
  useSettleEnquiryCallMutation,
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
