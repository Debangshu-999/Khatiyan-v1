import { api } from "@/store/api";

export type NoticePriority = "NORMAL" | "IMPORTANT" | "URGENT" | "EMERGENCY";
export type NoticeStatus = "PUBLISHED" | "ARCHIVED" | "DELETED";
export type RecurringNoticeFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export type RecurringNoticeStatus = "ACTIVE" | "PAUSED" | "DELETED";

export type NoticeAttachmentKind = "IMAGE" | "DOCUMENT";

/** A file on a notice, once it is in storage. */
export type NoticeAttachment = {
  id: string;
  kind: NoticeAttachmentKind;
  url: string;
  publicId: string | null;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  sortOrder: number;
};

/** An uploaded file being attached — the handle, never the bytes. */
export type NewNoticeAttachment = {
  kind: NoticeAttachmentKind;
  url: string;
  publicId: string | null;
  fileName: string;
  contentType?: string | null;
  sizeBytes?: number | null;
};

export type NoticeSummary = {
  id: string;
  propertyId: string;
  createdByUserId: string;
  title: string;
  body: string;
  priority: NoticePriority;
  status: NoticeStatus;
  visibleFrom: string;
  visibleUntil: string | null;
  publishedAt: string;
  archivedAt: string | null;
  /** Set when this notice is one day's occurrence of a recurring template. */
  recurringNoticeId: string | null;
  occurrenceDate: string | null;
  createdAt: string;
  updatedAt: string;
  /** Empty on list endpoints, which do not render attachments. */
  attachments: NoticeAttachment[];
};

/**
 * Whether a notice can still be changed or removed at all.
 *
 * <p>Mirrors the server's rule exactly: published, and not yet live. Going live
 * is the point of no return — tenants have seen it and may have acted on it, so
 * rewriting or deleting it afterwards would rewrite what they were told.
 * Retiring it is what archiving is for.
 *
 * <p>Lives beside the type so every screen asks the same question. The lists
 * and the detail screen each had their own idea of when editing was allowed,
 * which is how buttons ended up offering saves the server refused.
 */
export function canEditNotice(notice: Pick<NoticeSummary, "status" | "visibleFrom"> | null | undefined) {
  if (!notice || notice.status !== "PUBLISHED") {
    return false;
  }
  return new Date(notice.visibleFrom).getTime() > Date.now();
}

export type CreateNoticePayload = {
  title: string;
  body: string;
  priority: NoticePriority;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
  attachments?: NewNoticeAttachment[];
};

/** Mirrors java.time.DayOfWeek, which is what the API serialises. */
export type DayOfWeekName =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type CreateRecurringNoticePayload = {
  notice: CreateNoticePayload;
  frequency: RecurringNoticeFrequency;
  /** Required for WEEKLY, empty otherwise. */
  daysOfWeek?: DayOfWeekName[];
  /** Required for MONTHLY, empty otherwise. Days 1-31. */
  daysOfMonth?: number[];
  startTime: string;
  endTime: string;
  activeFrom?: string | null;
  activeUntil?: string | null;
};

export type RecurringNoticeSummary = {
  id: string;
  propertyId: string;
  createdByUserId: string;
  title: string;
  body: string;
  priority: NoticePriority;
  frequency: RecurringNoticeFrequency;
  daysOfWeek: DayOfWeekName[];
  daysOfMonth: number[];
  startTime: string;
  endTime: string;
  activeFrom: string | null;
  activeUntil: string | null;
  lastGeneratedForDate: string | null;
  lastProcessedForDate: string | null;
  status: RecurringNoticeStatus;
  createdAt: string;
  updatedAt: string;
  /** Files copied onto every day this template generates. */
  attachments: NoticeAttachment[];
};

export type PropertyBoardItem = {
  id: string;
  propertyId: string;
  createdByUserId: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  title: string;
  body: string;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export const noticeApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listMyVisibleNotices: builder.query<NoticeSummary[], void>({
      query: () => "/api/v1/notices/me/visible",
      providesTags: ["Notice"],
    }),
    publishNotice: builder.mutation<NoticeSummary, { propertyId: string; payload: CreateNoticePayload }>({
      query: ({ payload, propertyId }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/properties/${propertyId}/notices`,
      }),
      invalidatesTags: ["Notice", "Notification"],
    }),
    updateNotice: builder.mutation<NoticeSummary, { noticeId: string; payload: CreateNoticePayload }>({
      query: ({ noticeId, payload }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/v1/notices/${noticeId}`,
      }),
      invalidatesTags: ["Notice", "Notification"],
    }),
    listPublishedNotices: builder.query<NoticeSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/notices/published`,
      providesTags: ["Notice"],
    }),
    listVisiblePropertyNotices: builder.query<NoticeSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/notices/visible`,
      providesTags: ["Notice"],
    }),
    listArchivedNotices: builder.query<NoticeSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/notices/archived`,
      providesTags: ["Notice"],
    }),
    getNotice: builder.query<NoticeSummary, string>({
      query: (noticeId) => `/api/v1/notices/${noticeId}`,
      providesTags: ["Notice"],
    }),
    listUpcomingNotices: builder.query<NoticeSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/notices/upcoming`,
      providesTags: ["Notice"],
    }),
    delayNotice: builder.mutation<NoticeSummary, { noticeId: string; visibleFrom: string }>({
      query: ({ noticeId, visibleFrom }) => ({
        body: { visibleFrom },
        method: "PATCH",
        url: `/api/v1/notices/${noticeId}/delay`,
      }),
      invalidatesTags: ["Notice", "Notification"],
    }),
    archiveNotice: builder.mutation<NoticeSummary, string>({
      query: (noticeId) => ({ method: "PATCH", url: `/api/v1/notices/${noticeId}/archive` }),
      invalidatesTags: ["Notice", "Notification"],
    }),
    deleteNotice: builder.mutation<void, string>({
      query: (noticeId) => ({ method: "DELETE", url: `/api/v1/notices/${noticeId}` }),
      invalidatesTags: ["Notice", "Notification"],
    }),
    listRecurringNotices: builder.query<RecurringNoticeSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/recurring-notices`,
      providesTags: ["Notice"],
    }),
    createRecurringNotice: builder.mutation<RecurringNoticeSummary, { propertyId: string; payload: CreateRecurringNoticePayload }>({
      query: ({ payload, propertyId }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/properties/${propertyId}/recurring-notices`,
      }),
      invalidatesTags: ["Notice"],
    }),
    updateRecurringNotice: builder.mutation<RecurringNoticeSummary, { recurringNoticeId: string; payload: CreateRecurringNoticePayload }>({
      query: ({ payload, recurringNoticeId }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/v1/recurring-notices/${recurringNoticeId}`,
      }),
      invalidatesTags: ["Notice"],
    }),
    deleteRecurringNotice: builder.mutation<void, string>({
      query: (recurringNoticeId) => ({ method: "DELETE", url: `/api/v1/recurring-notices/${recurringNoticeId}` }),
      invalidatesTags: ["Notice"],
    }),
    listPropertyBoardItems: builder.query<PropertyBoardItem[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/property-board/items`,
      providesTags: ["Notice"],
    }),
    listMyPropertyBoardItems: builder.query<PropertyBoardItem[], void>({
      query: () => "/api/v1/property-board/me/items",
      providesTags: ["Notice"],
    }),

    // Attachments on a notice that already exists. Each mutation returns the
    // whole ordered list, because removing one renumbers the rest.
    listNoticeAttachments: builder.query<NoticeAttachment[], string>({
      query: (noticeId) => `/api/v1/notices/${noticeId}/attachments`,
      providesTags: ["Notice"],
    }),
    addNoticeAttachments: builder.mutation<
      NoticeAttachment[],
      { noticeId: string; attachments: NewNoticeAttachment[] }
    >({
      query: ({ noticeId, attachments }) => ({
        body: { attachments },
        method: "POST",
        url: `/api/v1/notices/${noticeId}/attachments`,
      }),
      invalidatesTags: ["Notice"],
    }),
    removeNoticeAttachment: builder.mutation<
      NoticeAttachment[],
      { noticeId: string; attachmentId: string }
    >({
      query: ({ noticeId, attachmentId }) => ({
        method: "DELETE",
        url: `/api/v1/notices/${noticeId}/attachments/${attachmentId}`,
      }),
      invalidatesTags: ["Notice"],
    }),
  }),
});

export const {
  useAddNoticeAttachmentsMutation,
  useArchiveNoticeMutation,
  useCreateRecurringNoticeMutation,
  useDelayNoticeMutation,
  useDeleteNoticeMutation,
  useDeleteRecurringNoticeMutation,
  useGetNoticeQuery,
  useListArchivedNoticesQuery,
  useListMyPropertyBoardItemsQuery,
  useListNoticeAttachmentsQuery,
  useListMyVisibleNoticesQuery,
  useListPropertyBoardItemsQuery,
  useListPublishedNoticesQuery,
  useListRecurringNoticesQuery,
  useListUpcomingNoticesQuery,
  useListVisiblePropertyNoticesQuery,
  usePublishNoticeMutation,
  useRemoveNoticeAttachmentMutation,
  useUpdateNoticeMutation,
  useUpdateRecurringNoticeMutation,
} = noticeApi;
