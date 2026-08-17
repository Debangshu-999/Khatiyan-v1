import { api } from "@/store/api";
import type { Page } from "@/store/pagination";

export type ConcernCategory =
  | "MAINTENANCE"
  | "CLEANING"
  | "WIFI"
  | "MESS"
  | "WATER"
  | "ELECTRICITY"
  | "NOISE"
  | "SECURITY"
  | "PAYMENT"
  | "LIFT"
  | "OTHER";
export type ConcernStatus = "OPEN" | "UNDER_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type ConcernPhoto = {
  id?: string;
  photoUrl?: string | null;
  photoPublicId?: string | null;
  displayOrder?: number | null;
};

export type ConcernSummary = {
  id: string;
  referenceCode: string;
  propertyId: string;
  roomNumber: string;
  tenancyReferenceCode: string;
  raisedByUserId: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedByUserId: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  inProgressByUserId: string | null;
  inProgressAt: string | null;
  resolvedByUserId: string | null;
  category: ConcernCategory;
  escalationLevel: string;
  status: ConcernStatus;
  title: string;
  description: string;
  statusNote: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  reopenUntil: string | null;
  reopened: boolean;
  reopenReason: string | null;
  reopenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  photos: ConcernPhoto[];
};

export const concernApi = api.injectEndpoints({
  endpoints: (builder) => ({
    createConcern: builder.mutation<
      ConcernSummary,
      {
        category: ConcernCategory;
        description: string;
        title: string;
        // Already uploaded by the caller. This used to be hardcoded to [] here,
        // which silently discarded every photo the picker collected.
        photos?: { photoUrl: string; photoPublicId: string | null; displayOrder: number }[];
      }
    >({
      query: ({ photos = [], ...body }) => ({
        url: "/api/v1/concerns",
        method: "POST",
        body: { ...body, photos },
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
    listMyCurrentConcerns: builder.query<ConcernSummary[], void>({
      query: () => "/api/v1/concerns/me/current",
      providesTags: ["Concern"],
    }),
    listMyConcernHistory: builder.query<Page<ConcernSummary>, { page?: number; size?: number } | void>({
      query: (args) => ({ params: { page: args?.page ?? 0, size: args?.size ?? 20 }, url: "/api/v1/concerns/me/history" }),
      providesTags: ["Concern"],
    }),
    listPropertyAvailableConcerns: builder.query<ConcernSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/concerns/available`,
      providesTags: ["Concern"],
    }),
    listPropertyConcernHistory: builder.query<Page<ConcernSummary>, { propertyId: string; page?: number; size?: number }>({
      query: ({ page = 0, propertyId, size = 20 }) => ({ params: { page, size }, url: `/api/v1/properties/${propertyId}/concerns/history` }),
      providesTags: ["Concern"],
    }),
    listPropertyEscalatedConcerns: builder.query<ConcernSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/concerns/escalated`,
      providesTags: ["Concern"],
    }),
    listPropertyConcernMonitor: builder.query<ConcernSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/concerns/monitor`,
      providesTags: ["Concern"],
    }),
    listUndertakenConcerns: builder.query<ConcernSummary[], void>({
      query: () => "/api/v1/concerns/undertaken",
      providesTags: ["Concern"],
    }),
    updateConcernStatus: builder.mutation<ConcernSummary, { concernId: string; status: ConcernStatus; statusNote?: string | null }>({
      query: ({ concernId, status, statusNote }) => ({
        body: { status, statusNote },
        method: "PATCH",
        url: `/api/v1/concerns/${concernId}/status`,
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
    assignConcern: builder.mutation<ConcernSummary, { concernId: string; assignedToUserId: string }>({
      query: ({ assignedToUserId, concernId }) => ({
        body: { assignedToUserId },
        method: "PATCH",
        url: `/api/v1/concerns/${concernId}/assign`,
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
    resolveConcern: builder.mutation<ConcernSummary, { concernId: string; resolutionNote: string }>({
      query: ({ concernId, resolutionNote }) => ({
        body: { resolutionNote },
        method: "PATCH",
        url: `/api/v1/concerns/${concernId}/resolve`,
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
    reopenConcern: builder.mutation<ConcernSummary, { concernId: string; reopenReason: string }>({
      query: ({ concernId, reopenReason }) => ({
        url: `/api/v1/concerns/${concernId}/reopen`,
        method: "POST",
        body: { reopenReason },
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
  }),
});

export const {
  useAssignConcernMutation,
  useCreateConcernMutation,
  useListMyConcernHistoryQuery,
  useListMyCurrentConcernsQuery,
  useListPropertyAvailableConcernsQuery,
  useListPropertyConcernHistoryQuery,
  useListPropertyConcernMonitorQuery,
  useListPropertyEscalatedConcernsQuery,
  useListUndertakenConcernsQuery,
  useReopenConcernMutation,
  useResolveConcernMutation,
  useUpdateConcernStatusMutation,
} = concernApi;
