import { api } from "@/store/api";

export type ConcernPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
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

export type ConcernSummary = {
  id: string;
  referenceCode: string;
  propertyId: string;
  roomId: string;
  tenancyId: string;
  raisedByUserId: string;
  assignedToUserId: string | null;
  resolvedByUserId: string | null;
  category: ConcernCategory;
  priority: ConcernPriority;
  escalationLevel: string;
  status: ConcernStatus;
  title: string;
  description: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  reopenUntil: string | null;
  reopened: boolean;
  reopenReason: string | null;
  reopenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  photos: unknown[];
};

export const concernApi = api.injectEndpoints({
  endpoints: (builder) => ({
    createConcern: builder.mutation<
      ConcernSummary,
      { category: ConcernCategory; description: string; priority: ConcernPriority; title: string }
    >({
      query: (body) => ({
        url: "/api/v1/concerns",
        method: "POST",
        body: { ...body, photos: [] },
      }),
      invalidatesTags: ["Concern", "Notification"],
    }),
    listMyCurrentConcerns: builder.query<ConcernSummary[], void>({
      query: () => "/api/v1/concerns/me/current",
      providesTags: ["Concern"],
    }),
    listMyConcernHistory: builder.query<ConcernSummary[], void>({
      query: () => "/api/v1/concerns/me/history",
      providesTags: ["Concern"],
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
  useCreateConcernMutation,
  useListMyConcernHistoryQuery,
  useListMyCurrentConcernsQuery,
  useReopenConcernMutation,
} = concernApi;
