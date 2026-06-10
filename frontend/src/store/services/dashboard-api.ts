import { api } from "@/store/api";

export type DashboardProperty = {
  propertyId: string;
  name: string;
  referenceCode: string;
  city: string | null;
  type: string;
};

export type OccupancySnapshot = {
  activeTenants: number;
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  roomCount: number;
};

export type MoneySnapshot = {
  billedThisMonthPaise: number;
  collectedThisMonthPaise: number;
  pendingPaise: number;
  overduePaise: number;
  overdueCount: number;
};

export type TodayDigest = {
  paymentsMadeToday: number;
  paymentsMadeTodayPaise: number;
  concernsRaisedToday: number;
  tenanciesStartedToday: number;
  tenanciesEndingToday: number;
};

export type AttentionSummary = {
  paymentsOverdue: number;
  concernsUnattended24h: number;
  escalatedConcerns: number;
  pendingExitRequests: number;
  pendingRoomChangeRequests: number;
  upcomingExits: number;
  tenantsOnNotice: number;
};

export type ConcernQueueSummary = {
  open: number;
  inProgress: number;
  escalated: number;
  resolvedThisWeek: number;
};

export type RecentActivityType =
  | "TENANCY_STARTED"
  | "PAYMENT_RECORDED"
  | "CONCERN_RAISED"
  | "CONCERN_ESCALATED"
  | "CONCERN_RESOLVED"
  | "NOTICE_PUBLISHED";

export type RecentActivityItem = {
  type: RecentActivityType;
  title: string;
  subtitle: string;
  occurredAt: string;
};

export type OwnerDashboard = {
  property: DashboardProperty;
  occupancy: OccupancySnapshot;
  money: MoneySnapshot;
  today: TodayDigest;
  attention: AttentionSummary;
  concerns: ConcernQueueSummary;
  recentActivity: RecentActivityItem[];
  generatedAt: string;
};

export const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOwnerDashboard: builder.query<OwnerDashboard, string>({
      query: (propertyId) => `/api/v1/dashboard/owner/${propertyId}`,
      providesTags: ["Tenancy", "BillingCycle", "Concern"],
    }),
  }),
});

export const { useGetOwnerDashboardQuery } = dashboardApi;
