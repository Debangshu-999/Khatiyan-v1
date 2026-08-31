import { api } from "@/store/api";

export type ChatThreadKind = "TEAM" | "DIRECT";
export type ChatThreadOrigin = "TENANCY" | "ENQUIRY" | "PERSONAL";
export type ChatThreadStatus = "OPEN" | "READ_ONLY";
export type ChatAttachmentKind = "IMAGE" | "FILE";

export type ChatAttachment = {
  id: string;
  kind: ChatAttachmentKind;
  url: string;
  /** The sender's original filename. The only thing naming a document. */
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
};

export type ChatMessage = {
  id: string;
  /**
   * Ordering, never time. Also the poll cursor — see `messagesAfter`.
   */
  seq: number;
  authorUserId: string;
  authorName: string;
  /** Null for most people — uploading one is not wired yet. */
  authorPhotoUrl: string | null;
  /** Server-computed, so the client never compares ids to decide sides. */
  mine: boolean;
  body: string | null;
  attachments: ChatAttachment[];
  deleted: boolean;
  /** Rewritten after sending. Shown so the reader knows the words changed. */
  edited: boolean;
  sentAt: string;
};

export type ChatThreadReader = {
  userId: string;
  name: string;
  lastReadSeq: number;
};

export type ChatMessagePage = {
  messages: ChatMessage[];
  /**
   * How far the other side has read. Anything you sent at or below this has
   * been seen.
   */
  counterpartLastReadSeq: number;
  /**
   * Everyone on the other side who has opened the conversation. On a team
   * thread this is what makes "Seen by 2" possible; on a one-to-one it is a
   * list of one.
   */
  readers: ChatThreadReader[];
  /**
   * The conversation itself.
   *
   * <p>The screen takes its header from here rather than from navigation
   * params: a push notification opens a thread with no params at all, and a
   * title handed over by a list goes stale the moment anything renames it.
   */
  thread: ChatThread;
  /**
   * How far you had read before opening. Captured once by the screen, because
   * reading moves it immediately.
   */
  viewerLastReadSeq: number;
};

export type ChatThread = {
  /**
   * Null for a tenant nobody has written to yet. The Tenants section is a
   * roster rather than an inbox, so a row exists before its thread does — the
   * first message creates it.
   */
  id: string | null;
  kind: ChatThreadKind;
  origin: ChatThreadOrigin;
  originId: string | null;
  propertyId: string;
  status: ChatThreadStatus;
  title: string;
  counterpartUserId: string | null;
  counterpartPhotoUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  /** DELETED is not an attachment kind — it says the newest message was withdrawn. */
  lastMessageKind: "TEXT" | "IMAGE" | "FILE" | "DELETED" | null;
  lastMessageSeq: number;
  unread: boolean;
  counterpartLastReadSeq: number;
};

export type ChatContact = {
  userId: string;
  name: string;
  role: "OWNER" | "MANAGER" | "TENANT";
  /** Set when a conversation already exists, so the picker never duplicates one. */
  existingThreadId: string | null;
};

export type ChatAttachmentDraft = {
  kind: ChatAttachmentKind;
  url: string;
  publicId?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
};

/**
 * How far back a poll re-asks, in sequence numbers.
 *
 * <p>NOT an optimisation — a correctness requirement. `seq` is allocated when a
 * message is inserted but the row only becomes visible when its transaction
 * commits, and those orders are independent. So 812 can appear before 811, and a
 * poll landing in between would take 812, move its cursor past 811, and never
 * ask for it again. The message is committed and permanent; that client simply
 * walked past it, and nothing errors — a missing 811 looks exactly like a number
 * burned by a rollback.
 *
 * <p>Asking one message back is not enough: two can arrive in a single poll with
 * the gap below both. Because `seq` is global this window spans 100 inserts
 * across the whole app, which is far more than a millisecond-long transaction
 * can straddle, and it usually re-reads two or three rows of this thread.
 */
export const POLL_LOOKBACK = 100;

/** How often an open conversation asks for anything new. */
export const MESSAGE_POLL_MS = 4000;

/**
 * How often a list of conversations does.
 *
 * <p>Only slightly slower than an open thread. A reply arriving while the list
 * is on screen has no local event to react to — nothing was sent from here and
 * no tag is invalidated — so the poll is the ONLY thing that will ever show it.
 * Fifteen seconds was indistinguishable from broken.
 */
export const THREAD_LIST_POLL_MS = 5000;

/**
 * What "live" means for a chat screen.
 *
 * <p>Polling alone is not enough, and this is the lesson the notification feed
 * already learned: a phone that has been asleep resumes its timer on its own
 * schedule, and a device that lost the network never retries. Focus and
 * reconnect are what make coming back to the app feel immediate rather than
 * "reload and it appears".
 *
 * <p>`setupListeners` in the store maps React Native's AppState onto the focus
 * events these rely on — without that wiring these flags would be inert.
 */
export const CHAT_LIVE_OPTIONS = {
  refetchOnFocus: true,
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
} as const;

const base = "/api/v1/chat";

export const chatApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // --- Management sections ---

    /**
     * Every current tenant, one row each, whether or not anything was said.
     *
     * <p>The screen filters to conversations that exist — the untouched rows are
     * what the New chat picker offers instead of a separate lookup.
     */
    listTenantThreads: builder.query<ChatThread[], string>({
      query: (propertyId) => `${base}/properties/${propertyId}/threads/tenants`,
      providesTags: ["Chat"],
    }),

    listPersonalThreads: builder.query<ChatThread[], string>({
      query: (propertyId) => `${base}/properties/${propertyId}/threads/personal`,
      providesTags: ["Chat"],
    }),

    listEnquiryThreads: builder.query<ChatThread[], string>({
      query: (propertyId) => `${base}/properties/${propertyId}/threads/enquiries`,
      providesTags: ["Chat"],
    }),

    listChatContacts: builder.query<ChatContact[], string>({
      query: (propertyId) => `${base}/properties/${propertyId}/contacts`,
      providesTags: ["Chat"],
    }),

    // --- A tenant's or prospect's own list ---

    listMyThreads: builder.query<ChatThread[], void>({
      query: () => `${base}/threads`,
      providesTags: ["Chat"],
    }),

    getChatUnreadCount: builder.query<{ count: number }, void>({
      query: () => `${base}/unread-count`,
      providesTags: ["ChatUnread"],
    }),

    // --- Messages ---

    /**
     * A page of a conversation.
     *
     * <p>`after` omitted gives the most recent page; supplied, only what is
     * newer. Callers polling MUST pass `highestSeq - POLL_LOOKBACK` and drop
     * ids they already hold — see {@link POLL_LOOKBACK}.
     *
     * <p>Deliberately no `providesTags`: this is polled, and a tag would make
     * every send invalidate a query that is about to refetch anyway.
     */
    getChatMessages: builder.query<ChatMessagePage, { threadId: string; after?: number }>({
      query: ({ threadId, after }) => ({
        params: after === undefined ? undefined : { after },
        url: `${base}/threads/${threadId}/messages`,
      }),
    }),

    sendChatMessage: builder.mutation<
      ChatMessage,
      { threadId: string; body?: string; attachments?: ChatAttachmentDraft[] }
    >({
      query: ({ threadId, ...payload }) => ({
        body: payload,
        method: "POST",
        url: `${base}/threads/${threadId}/messages`,
      }),
      // The list needs the new preview; the open conversation does not, because
      // the response carries the message and the poll catches the rest.
      invalidatesTags: ["Chat"],
    }),

    editChatMessage: builder.mutation<
      ChatMessage,
      { threadId: string; messageId: string; body: string }
    >({
      query: ({ threadId, messageId, body }) => ({
        body: { body },
        method: "PATCH",
        url: `${base}/threads/${threadId}/messages/${messageId}`,
      }),
      invalidatesTags: ["Chat"],
    }),

    deleteChatMessage: builder.mutation<void, { threadId: string; messageId: string }>({
      query: ({ threadId, messageId }) => ({
        method: "DELETE",
        url: `${base}/threads/${threadId}/messages/${messageId}`,
      }),
      invalidatesTags: ["Chat"],
    }),

    // --- Opening ---

    openTeamThread: builder.mutation<ChatThread, string>({
      query: (tenancyId) => ({ method: "POST", url: `${base}/threads/team/${tenancyId}` }),
      invalidatesTags: ["Chat"],
    }),

    openDirectThread: builder.mutation<ChatThread, { propertyId: string; withUserId: string }>({
      query: (payload) => ({ body: payload, method: "POST", url: `${base}/threads/direct` }),
      invalidatesTags: ["Chat"],
    }),

    // --- Read state ---

    /**
     * Moves the reader's mark.
     *
     * <p>Invalidates the LIST as well as the badge, and it has to: the unread
     * dot lives on the thread row, so leaving `Chat` alone meant opening a
     * conversation cleared the tab badge while the row behind it stayed bold
     * until something unrelated refetched. Cheap in practice — this only fires
     * when the reader's high-water mark actually advances, not on every scroll.
     */
    markChatRead: builder.mutation<void, { threadId: string; lastReadSeq: number }>({
      query: ({ threadId, lastReadSeq }) => ({
        body: { lastReadSeq },
        method: "POST",
        url: `${base}/threads/${threadId}/read`,
      }),
      invalidatesTags: ["Chat", "ChatUnread"],
    }),

    /**
     * Removes a conversation from this reader's list, and nobody else's.
     *
     * <p>Invalidates the unread badge as well as the list: a thread deleted
     * while it still had something unread in it was still being counted by the
     * tab dot, which then pointed at a row that was no longer there.
     */
    deleteChatThread: builder.mutation<void, string>({
      query: (threadId) => ({ method: "DELETE", url: `${base}/threads/${threadId}` }),
      invalidatesTags: ["Chat", "ChatUnread"],
    }),

    closeChatThread: builder.mutation<void, string>({
      query: (threadId) => ({ method: "POST", url: `${base}/threads/${threadId}/close` }),
      invalidatesTags: ["Chat"],
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
  useCloseChatThreadMutation,
  useDeleteChatMessageMutation,
  useDeleteChatThreadMutation,
  useEditChatMessageMutation,
  useGetChatMessagesQuery,
  useGetChatUnreadCountQuery,
  useListChatContactsQuery,
  useListEnquiryThreadsQuery,
  useListMyThreadsQuery,
  useListPersonalThreadsQuery,
  useListTenantThreadsQuery,
  useMarkChatReadMutation,
  useOpenDirectThreadMutation,
  useOpenTeamThreadMutation,
  useSendChatMessageMutation,
} = chatApi;
