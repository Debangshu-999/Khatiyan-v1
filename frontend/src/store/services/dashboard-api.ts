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
  /** Stays that began in the month. */
  startedCount: number;
  /** Stays that ended in the month — ended ones only, never notice served. */
  endedCount: number;
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
  exitsPastDue: number;
  tenantsOnNotice: number;
  pendingDepositSettlements: number;
  /** Enquiries from the property's public profile with no answer yet. */
  newEnquiries: number;
  /**
   * Salaries unpaid for the current payroll month.
   *
   * <p>Counted all month, unlike the end-of-month push reminder that chases the
   * same condition — so the two deliberately disagree on timing.
   */
  salaryPaymentsDue: number;
  /** Agreements signed by the owner and still waiting on the tenant. */
  agreementsPendingAcceptance: number;
};

export type BudgetAttentionLevel = "NONE" | "APPROACHING" | "EXCEEDED";

export type BudgetAttention = {
  level: BudgetAttentionLevel;
  effectiveBudgetPaise: number;
  spentPaise: number;
  overPaise: number;
  remainingPaise: number;
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
  | "TENANCY_ENDED"
  | "TENANCY_ROOM_CHANGED"
  | "TENANCY_EXIT_REQUESTED"
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

// Day group, computed server-side in IST — the device clock is not necessarily
// in the owner's zone, so the client must not work "today" out for itself.
// Only three: the feed is a rolling 7-day window, so nothing older reaches here.
export type ActivityDayBucket = "TODAY" | "YESTERDAY" | "EARLIER_THIS_WEEK";

export type RecentActivityItem = {
  type: RecentActivityType;
  title: string;
  subtitle: string | null;
  occurredAt: string;
  dayBucket: ActivityDayBucket;
};

export type OwnerDashboard = {
  property: DashboardProperty;
  occupancy: OccupancySnapshot;
  tenancy: TenancySnapshot;
  money: MoneySnapshot;
  today: TodayDigest;
  attention: AttentionSummary;
  budget: BudgetAttention;
  concerns: ConcernQueueSummary;
  recentActivity: RecentActivityItem[];
  monthlyTrends: MonthlyTrendPoint[];
  generatedAt: string;
};

export const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOwnerDashboard: builder.query<OwnerDashboard, string>({
      query: (propertyId) => `/api/v1/dashboard/owner/${propertyId}`,
      // "Enquiry" included so responding to one refreshes the action centre's
      // "New enquiries" row. Its count rides in on `attention.newEnquiries`, so
      // without this the row keeps the old number while the property-card badge
      // — which reads the enquiry endpoint directly — already dropped.
      providesTags: ["Tenancy", "BillingCycle", "Concern", "Staff", "Expense", "Enquiry"],
    }),
  }),
  // Fast Refresh re-runs this whole module on every edit, so injectEndpoints
  // sees endpoints it already registered and logs an error for each one — two
  // dozen of them behind a red overlay, none of them real. Allowed in dev for
  // that reason; "throw" in production, where the module runs once and a second
  // registration really would be a duplicate name.
  overrideExisting: __DEV__ ? true : "throw",
});

export const { useGetOwnerDashboardQuery } = dashboardApi;
