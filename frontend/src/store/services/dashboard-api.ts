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
  unavailableRooms: number;
};

export type TenancySnapshot = {
  activeTenants: number;
  onNotice: number;
  startedThisMonth: number;
  endedThisMonth: number;
  upcomingExits: number;
  activeTenantsPrevMonth: number;
  startedPrevMonth: number;
  endedPrevMonth: number;
};

export type MoneySnapshot = {
  billedThisMonthPaise: number;
  collectedThisMonthPaise: number;
  pendingPaise: number;
  overduePaise: number;
  overdueCount: number;
  billedPrevMonthPaise: number;
  collectedPrevMonthPaise: number;
};

export type MonthlyTrendPoint = {
  label: string;
  occupancyRate: number;
  collectionRate: number;
  collectedPaise: number;
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
  underReview: number;
  inProgress: number;
  escalated: number;
  reopened: number;
  resolvedThisWeek: number;
};

export type RecentActivityType =
  | "TENANCY_STARTED"
  | "PAYMENT_RECORDED"
  | "CONCERN_RAISED"
  | "CONCERN_ASSIGNED"
  | "CONCERN_TAKEN_UP"
  | "CONCERN_ESCALATED"
  | "CONCERN_RESOLVED"
  | "NOTICE_PUBLISHED"
  | "ROOM_MAINTENANCE_STARTED"
  | "ROOM_MAINTENANCE_ENDED"
  | "ROOM_DEACTIVATED"
  | "ROOM_REACTIVATED"
  | "STAFF_ADDED"
  | "STAFF_REMOVED"
  | "MANAGER_ADDED"
  | "MANAGER_REMOVED";

export type RecentActivityItem = {
  type: RecentActivityType;
  title: string;
  subtitle: string;
  occurredAt: string;
};

export type OwnerDashboard = {
  property: DashboardProperty;
  occupancy: OccupancySnapshot;
  tenancy: TenancySnapshot;
  money: MoneySnapshot;
  today: TodayDigest;
  attention: AttentionSummary;
  concerns: ConcernQueueSummary;
  recentActivity: RecentActivityItem[];
  monthlyTrends: MonthlyTrendPoint[];
  generatedAt: string;
};

export const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOwnerDashboard: builder.query<OwnerDashboard, string>({
      query: (propertyId) => `/api/v1/dashboard/owner/${propertyId}`,
      providesTags: ["Tenancy", "BillingCycle", "Concern", "Staff"],
    }),
  }),
});

export const { useGetOwnerDashboardQuery } = dashboardApi;
