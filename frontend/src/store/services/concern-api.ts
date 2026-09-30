import { api, ifMatch } from "@/store/api";
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
  /**
   * The row's version (2026-09-29). Sent back as If-Match when a screen acts
   * on it, so a record someone else changed since is refused, not overwritten.
   */
  version: number;
};

/**
 * A tenant's concern is closed only once it reaches CLOSED. RESOLVED stays
 * open on the tenant side: they can still reopen it until the reopen window
 * lapses and the server closes it.
 */
export function isConcernClosed(concern: Pick<ConcernSummary, "status">) {
  return concern.status === "CLOSED";
}

/**
 * Splits a tenant's concerns into open and closed by their own status, not by
 * which endpoint returned them. Older servers still list RESOLVED under
 * history; sorting on status keeps such a concern in Open instead of losing
 * it between the two lists.
 */
export function splitTenantConcerns(current: ConcernSummary[] | undefined, history: Page<ConcernSummary> | undefined) {
  const seen = new Set<string>();
  const all = [...(current ?? []), ...(history?.items ?? [])].filter((concern) => {
    if (seen.has(concern.id)) return false;
    seen.add(concern.id);
    return true;
  });
  const open = all.filter((concern) => !isConcernClosed(concern));
  const closed = all.filter(isConcernClosed);
  // totalElements also counts history rows beyond the fetched page; take out
  // the ones on this page that turned out not to be closed.
  const historyItems = history?.items ?? [];
  const notClosedInHistory = historyItems.filter((concern) => !isConcernClosed(concern)).length;
  const closedCount = Math.max((history?.totalElements ?? 0) - notClosedInHistory, closed.length);
  return { closed, closedCount, open };
}

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
    updateConcernStatus: builder.mutation<ConcernSummary, { concernId: string; status: ConcernStatus; statusNote?: string | null; version: number }>({
      query: ({ concernId, status, statusNote, version }) => ({
        body: { status, statusNote },
        headers: ifMatch(version),
        method: "PATCH",
        url: `/api/v1/concerns/${concernId}/status`,
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
    assignConcern: builder.mutation<ConcernSummary, { concernId: string; assignedToUserId: string; version: number }>({
      query: ({ assignedToUserId, concernId, version }) => ({
        body: { assignedToUserId },
        headers: ifMatch(version),
        method: "PATCH",
        url: `/api/v1/concerns/${concernId}/assign`,
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
    resolveConcern: builder.mutation<ConcernSummary, { concernId: string; resolutionNote: string; version: number }>({
      query: ({ concernId, resolutionNote, version }) => ({
        body: { resolutionNote },
        headers: ifMatch(version),
        method: "PATCH",
        url: `/api/v1/concerns/${concernId}/resolve`,
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
    reopenConcern: builder.mutation<ConcernSummary, { concernId: string; reopenReason: string; version: number }>({
      query: ({ concernId, reopenReason, version }) => ({
        url: `/api/v1/concerns/${concernId}/reopen`,
        headers: ifMatch(version),
        method: "POST",
        body: { reopenReason },
      }),
      invalidatesTags: ["Concern", "Notification"],
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
