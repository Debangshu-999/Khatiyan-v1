import { api } from "@/store/api";

export type NoticePriority = "NORMAL" | "IMPORTANT" | "URGENT" | "EMERGENCY";
export type NoticeStatus = "PUBLISHED" | "ARCHIVED" | "DELETED";

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

export const { useListMyPropertyBoardItemsQuery, useListMyVisibleNoticesQuery, useListPropertyBoardItemsQuery } = noticeApi;
