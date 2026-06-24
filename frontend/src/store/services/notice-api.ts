import { api } from "@/store/api";

export type NoticePriority = "NORMAL" | "IMPORTANT" | "URGENT" | "EMERGENCY";
export type NoticeStatus = "PUBLISHED" | "ARCHIVED" | "DELETED";
export type RecurringNoticeFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export type RecurringNoticeStatus = "ACTIVE" | "PAUSED" | "DELETED";

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
  createdAt: string;
  updatedAt: string;
};

export type CreateNoticePayload = {
  title: string;
  body: string;
  priority: NoticePriority;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
};

export type CreateRecurringNoticePayload = {
  notice: CreateNoticePayload;
  frequency: RecurringNoticeFrequency;
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
  startTime: string;
  endTime: string;
  activeFrom: string | null;
  activeUntil: string | null;
  lastGeneratedForDate: string | null;
  lastProcessedForDate: string | null;
  status: RecurringNoticeStatus;
  createdAt: string;
  updatedAt: string;
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
  }),
});

export const {
  useArchiveNoticeMutation,
  useCreateRecurringNoticeMutation,
  useDeleteNoticeMutation,
  useDeleteRecurringNoticeMutation,
  useListArchivedNoticesQuery,
  useListMyPropertyBoardItemsQuery,
  useListMyVisibleNoticesQuery,
  useListPropertyBoardItemsQuery,
  useListPublishedNoticesQuery,
  useListRecurringNoticesQuery,
  useListVisiblePropertyNoticesQuery,
  usePublishNoticeMutation,
  useUpdateNoticeMutation,
  useUpdateRecurringNoticeMutation,
} = noticeApi;
