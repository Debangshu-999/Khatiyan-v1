import { api } from "@/store/api";

/**
 * A nudge is a one-way message from management to one tenant. Both sides read
 * the same shape; the tenant screen uses the sender fields and the owner's Sent
 * tab uses the recipient ones.
 */
export type Nudge = {
  id: string;
  propertyId: string;
  tenancyId: string;
  message: string;
  sentAt: string;
  readAt: string | null;
  recipientUserId: string;
  recipientName: string | null;
  roomNumber: string | null;
  senderUserId: string;
  senderName: string | null;
  sentByViewer: boolean;
};

/** An active tenant on the send list, with their cooldown state. */
export type NudgeCandidate = {
  tenancyId: string;
  userId: string;
  tenantName: string | null;
  roomNumber: string | null;
  lastNudgedAt: string | null;
  /** Null when no cooldown is running. Present, and in the future, when one is. */
  cooldownEndsAt: string | null;
  canNudge: boolean;
};

export type SendNudgePayload = {
  tenancyId: string;
  message: string;
};

export const NUDGE_MESSAGE_MAX_LENGTH = 200;

/**
 * Same reasoning as the notification feed: nothing on this client invalidates
 * the cache when a manager elsewhere sends a nudge, and the cooldown countdown
 * goes stale on its own. Refetch whenever the screen is looked at.
 */
export const NUDGE_REFETCH_OPTIONS = {
  refetchOnMountOrArgChange: true,
  refetchOnFocus: true,
  refetchOnReconnect: true,
} as const;

export const nudgeApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listNudgeCandidates: builder.query<NudgeCandidate[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/nudges/candidates`,
      providesTags: ["Nudge"],
    }),

    listSentNudges: builder.query<Nudge[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/nudges`,
      providesTags: ["Nudge"],
    }),

    sendNudge: builder.mutation<Nudge, SendNudgePayload>({
      query: (body) => ({ body, method: "POST", url: "/api/v1/nudges" }),
      // The candidate list carries the cooldown, so it is stale the moment this
      // succeeds — the row that was just nudged has three hours on it.
      invalidatesTags: ["Nudge"],
    }),

    listReceivedNudges: builder.query<Nudge[], void>({
      query: () => "/api/v1/nudges/received",
      providesTags: ["Nudge"],
      // Fetching this endpoint is what marks the nudges read, so the badge that
      // brought the tenant here is wrong the moment the response lands. Nothing
      // else clears it: the notifications screen stays mounted underneath, so
      // going back does not remount the pill, and a query cannot declare
      // `invalidatesTags` — hence doing it here, by hand, against a tag this
      // endpoint does not itself provide (invalidating "Nudge" would refetch
      // this list forever).
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          // A failed read marks nothing, so the badge is still correct.
          return;
        }
        dispatch(api.util.invalidateTags(["NudgeUnread"]));
      },
    }),

    getNudgeUnreadCount: builder.query<number, void>({
      query: () => "/api/v1/nudges/unread-count",
      transformResponse: (response: { count: number }) => response.count,
      providesTags: ["NudgeUnread"],
    }),
  }),
});

export const {
  useGetNudgeUnreadCountQuery,
  useListNudgeCandidatesQuery,
  useListReceivedNudgesQuery,
  useListSentNudgesQuery,
  useSendNudgeMutation,
} = nudgeApi;

/**
 * How long until this tenant can be nudged again, as the row says it.
 *
 * <p>Derived on the client from `cooldownEndsAt` so the countdown ticks without
 * asking the server; the server still refuses the send if the client's clock
 * disagrees.
 */
export function describeCooldownRemaining(
  cooldownEndsAt: string,
  now: number,
  lastNudgedAt?: string | null,
): string | null {
  const endsAt = new Date(cooldownEndsAt).getTime();
  let remainingMs = endsAt - now;

  // Cap at the full window, measured between two SERVER timestamps so device
  // clock skew cannot inflate it. Without this a phone running a few seconds
  // behind the server reads "3h 01m" the instant a three-hour cooldown starts —
  // a countdown opening above its own maximum.
  if (lastNudgedAt) {
    remainingMs = Math.min(remainingMs, endsAt - new Date(lastNudgedAt).getTime());
  }

  if (remainingMs <= 0) {
    return null;
  }

  // Floor, not ceil. A countdown should account for time already spent, so the
  // first reading of a three-hour wait is "2h 59m". Rounding up held it at the
  // starting number for a whole minute before it appeared to move at all.
  const totalMinutes = Math.floor(remainingMs / 60_000);
  if (totalMinutes < 1) {
    return "under a minute";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
