import { api } from "@/store/api";
import type { Page } from "@/store/pagination";

// UPCOMING is generated ahead of the due date and is NOT payable or billed yet;
// it is also the only state in which a rent cycle can still be edited.
export type BillingCycleStatus = "UPCOMING" | "UNPAID" | "OVERDUE" | "PAID" | "CANCELLED";
export type BillingCycleCategory = "RENT_CYCLE" | "ONE_OFF";
export type BillingCollectionTiming = "CYCLE_START" | "CYCLE_END";
export type BillingLineItemType = "RENT" | "DEPOSIT" | "EXTRA_CHARGE" | "DISCOUNT" | "LATE_FEE";
export type BillingLineItemStatus = "PENDING" | "ADDED";
export type BillingLineSettlementAction =
  | "ADDED_TO_BILL"
  | "ADJUSTED_FROM_DEPOSIT"
  | "DISCOUNTED"
  | "SYSTEM_CHARGE"
  | "WAIVED";
export type DepositAccountStatus = "ACTIVE" | "PENDING_SETTLEMENT" | "SETTLED";
/**
 * Mirrors the server's DepositMovementType exactly.
 *
 * <p>It read "CREDIT" | "DEBIT" until 2026-08-15, which the API has never sent.
 * Every `type === "CREDIT"` comparison was therefore permanently false and each
 * ledger row rendered as a debit — a type that lies is worse than no type,
 * because it makes the wrong comparison typecheck.
 */
export type DepositMovementType = "ADDITION" | "DEDUCTION" | "SETTLEMENT";

/** Only an ADDITION puts money in; a settlement pays it back out. */
export function isDepositCredit(movementType: DepositMovementType) {
  return movementType === "ADDITION";
}

export type BillingCycleLineItem = {
  id: string;
  billingCycleId: string | null;
  tenancyId: string;
  tenantUserId: string;
  propertyId: string;
  type: BillingLineItemType;
  status: BillingLineItemStatus;
  label: string;
  description: string | null;
  amountPaise: number;
  settlementAmountPaise: number;
  settlementAction: BillingLineSettlementAction;
  systemGenerated: boolean;
  createdByUserId: string | null;
  /** Who added it. Null on system lines, and null when a read path cannot resolve it. */
  createdByName: string | null;
  lastAdjustedByUserId: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BillingCycle = {
  id: string;
  referenceCode: string;
  tenancyId: string;
  tenancyReferenceCode: string | null;
  tenantUserId: string;
  tenantNameSnapshot: string;
  propertyId: string;
  roomId: string;
  roomNumber: string | null;
  billingType: "DAILY" | "MONTHLY";
  category: BillingCycleCategory;
  cycleNumber: number | null;
  periodStartDate: string;
  periodEndDate: string;
  rentDueDate: string;
  billingCollectionTiming: BillingCollectionTiming;
  rentGraceDays: number;
  baseAmountPaise: number;
  extraChargePaise: number;
  lateFeeAmountPaise: number;
  // The rate stamped when the cycle activated. Absent while UPCOMING (and note
  // the API omits nulls entirely, so this arrives as undefined, not null) —
  // fall back to the property's current rentLateFeePerDayPaise.
  lateFeePerDayPaise: number | null;
  discountAmountPaise: number;
  totalAmountPaise: number;
  status: BillingCycleStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: BillingCycleLineItem[];
};

// A bill's display title: rent cycles are numbered; one-off bills (e.g. an
// early-exit penalty) have no number and take their line-item label instead.
export function billTitle(cycle: Pick<BillingCycle, "cycleNumber" | "lineItems">): string {
  if (cycle.cycleNumber != null) {
    return `Cycle ${cycle.cycleNumber}`;
  }
  return cycle.lineItems?.[0]?.label ?? "One-off bill";
}

// Sort key for bills, newest first, tolerating one-off bills (null cycle number).
export function byCycleNumberDesc(a: { cycleNumber: number | null }, b: { cycleNumber: number | null }): number {
  return (b.cycleNumber ?? 0) - (a.cycleNumber ?? 0);
}

// Whether a bill line is a system-imposed charge (rent, penalty) vs an
// owner-added extra charge — used to label penalties as "System charge".
export function lineItemKindLabel(item: BillingCycleLineItem): string {
  if (item.type === "EXTRA_CHARGE" && item.systemGenerated) {
    return "System charge";
  }
  return item.type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type BillingDashboardSummary = {
  billedThisMonthPaise: number;
  collectedThisMonthPaise: number;
  pendingPaise: number;
  overduePaise: number;
  overdueCount: number;
  paymentsMadeToday: number;
  paymentsMadeTodayPaise: number;
  activeCycleCount: number;
  paidCycleCount: number;
  manuallyPaidCycleCount: number;
  unpaidCycleCount: number;
  totalCollectedPaise: number;
  manuallyCollectedPaise: number;
  totalDiscountPaise: number;
};

export type CreateExtraChargePayload = {
  label: string;
  description?: string | null;
  amountPaise: number;
  adjustFromDeposit: boolean;
};

export type CreateDiscountPayload = {
  label: string;
  description?: string | null;
  discountPercent: number;
};

export type ManualPaymentMethod = "CASH" | "UPI" | "CARD" | "CHEQUE" | "OTHER";

export type RecordManualPaymentPayload = {
  method: ManualPaymentMethod;
  referenceText?: string | null;
  proofImageUrls?: string[] | null;
  note?: string | null;
};

export type CreateOneOffBillPayload = {
  reason: string;
  amountPaise: number;
};

export type ManualPayment = {
  id: string;
  billingCycleId: string;
  tenancyId: string;
  tenantUserId: string;
  propertyId: string;
  amountPaise: number;
  method: ManualPaymentMethod;
  referenceText: string | null;
  proofImageUrls: string[];
  note: string | null;
  collectedByUserId: string;
  collectedAt: string;
};

export type DepositMovement = {
  id: string;
  depositAccountId: string;
  billingCycleId: string | null;
  billingCycleLineItemId: string | null;
  type: DepositMovementType;
  reason: string;
  amountPaise: number;
  createdByUserId: string | null;
  createdAt: string;
};

export type DepositAccount = {
  id: string;
  tenancyId: string;
  tenantUserId: string;
  propertyId: string;
  tenantName: string | null;
  tenancyReferenceCode: string | null;
  currentBalancePaise: number;
  status: DepositAccountStatus;
  /**
   * The payability decision recorded at end-tenancy. Null means none was
   * recorded — an account from before the exit flow, or a tenancy still
   * running. Never treat null as "refundable".
   */
  payableAtExit: boolean | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  movements: DepositMovement[];
};

export type DepositHistoryParams = {
  propertyId: string;
  page?: number;
  size?: number;
  query?: string;
  status?: DepositAccountStatus;
};

// One row of the forward-looking generation schedule: the next cycle is not a
// stored row yet — it always starts one month after the latest cycle's period
// start, mirroring the backend's monthly generation scheduler.
export type UpcomingBillingCycle = {
  tenancyId: string;
  tenancyReferenceCode: string | null;
  tenantUserId: string;
  tenantName: string | null;
  roomId: string;
  roomNumber: string | null;
  currentCycleNumber: number;
  currentPeriodStartDate: string;
  currentPeriodEndDate: string;
  currentCycleStatus: BillingCycleStatus;
  baseAmountPaise: number;
  nextCycleStartDate: string;
  tenancyEndDate: string | null;
};

export type BillingMonthSummary = {
  month: string;
  hasData: boolean;
  activeCycleCount: number;
  overdueCount: number;
  overduePaise: number;
  paidCycleCount: number;
  unpaidCycleCount: number;
  billedPaise: number;
  collectedPaise: number;
  totalDiscountPaise: number;
  manuallyPaidCycleCount: number;
  manuallyPaidPaise: number;
  // Actual (non-projected) split by bill category.
  rentCycleCount: number;
  rentBilledPaise: number;
  oneOffCount: number;
  oneOffBilledPaise: number;
};

export const billingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listMyTenancyBillingCycles: builder.query<BillingCycle[], string>({
      query: (tenancyId) => `/api/v1/billing/me/tenancies/${tenancyId}/cycles`,
      providesTags: ["BillingCycle"],
    }),

    getMyTenancyDeposit: builder.query<DepositAccount, string>({
      query: (tenancyId) => `/api/v1/billing/me/tenancies/${tenancyId}/deposit`,
      providesTags: ["BillingCycle"],
    }),

    getPropertyBillingSummary: builder.query<BillingDashboardSummary, string>({
      query: (propertyId) => `/api/v1/billing/properties/${propertyId}/summary`,
      providesTags: ["BillingCycle"],
    }),

    getPropertyMonthSummary: builder.query<BillingMonthSummary, { propertyId: string; month?: string }>({
      query: ({ month, propertyId }) => ({
        params: month?.trim() ? { month: month.trim() } : undefined,
        url: `/api/v1/billing/properties/${propertyId}/month-summary`,
      }),
      providesTags: ["BillingCycle"],
    }),

    listPropertyBillingCycles: builder.query<BillingCycle[], { propertyId: string; query?: string; month?: string }>({
      query: ({ month, propertyId, query }) => ({
        params: {
          ...(query?.trim() ? { query: query.trim() } : {}),
          ...(month?.trim() ? { month: month.trim() } : {}),
        },
        url: `/api/v1/billing/properties/${propertyId}/cycles`,
      }),
      providesTags: ["BillingCycle"],
    }),

    listUpcomingPropertyCycles: builder.query<Page<UpcomingBillingCycle>, { propertyId: string; month?: string; page?: number; size?: number }>({
      query: ({ month, page = 0, propertyId, size = 10 }) => ({
        params: {
          page,
          size,
          ...(month?.trim() ? { month: month.trim() } : {}),
        },
        url: `/api/v1/billing/properties/${propertyId}/upcoming-cycles`,
      }),
      providesTags: ["BillingCycle"],
    }),

    exportPropertyBillingCycles: builder.query<string, { month?: string; propertyId: string }>({
      query: ({ month, propertyId }) => ({
        params: month?.trim() ? { month: month.trim() } : undefined,
        responseHandler: "text",
        url: `/api/v1/billing/properties/${propertyId}/cycles/export`,
      }),
    }),

    addTenancyExtraCharges: builder.mutation<BillingCycle, { charges: CreateExtraChargePayload[]; tenancyId: string }>({
      query: ({ charges, tenancyId }) => ({
        body: charges,
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/extra-charges`,
      }),
      invalidatesTags: ["BillingCycle", "Notification"],
    }),

    /**
     * Reverses one owner action on a bill by zeroing its line.
     *
     * <p>The line is kept rather than deleted — a bill's history is the record
     * of what was done to it, and a reverted discount that vanishes leaves the
     * reader wondering why the total moved.
     */
    clearBillingLineItem: builder.mutation<BillingCycle, { billingCycleId: string; lineItemId: string }>({
      query: ({ billingCycleId, lineItemId }) => ({
        method: "PATCH",
        url: `/api/v1/billing/cycles/${billingCycleId}/line-items/${lineItemId}/clear`,
      }),
      invalidatesTags: ["BillingCycle", "Deposit", "Notification"],
    }),

    addTenancyDiscount: builder.mutation<BillingCycle, { discount: CreateDiscountPayload; tenancyId: string }>({
      query: ({ discount, tenancyId }) => ({
        body: discount,
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/discounts`,
      }),
      invalidatesTags: ["BillingCycle", "Notification"],
    }),

    recordManualPayment: builder.mutation<ManualPayment, { billingCycleId: string; payload: RecordManualPaymentPayload }>({
      query: ({ billingCycleId, payload }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/billing/cycles/${billingCycleId}/manual-payment`,
      }),
      invalidatesTags: ["BillingCycle", "Notification", "Payment"],
    }),

    createOneOffBill: builder.mutation<BillingCycle, { tenancyId: string; payload: CreateOneOffBillPayload }>({
      query: ({ payload, tenancyId }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/one-off-bills`,
      }),
      invalidatesTags: ["BillingCycle", "Notification"],
    }),

    listManualPayments: builder.query<ManualPayment[], string>({
      query: (billingCycleId) => `/api/v1/billing/cycles/${billingCycleId}/manual-payments`,
      providesTags: (_result, _error, billingCycleId) => [{ type: "BillingCycle", id: billingCycleId }],
    }),

    // ----- Owner / manager deposit manager -----

    getManagedTenancyDeposit: builder.query<DepositAccount, string>({
      query: (tenancyId) => `/api/v1/billing/tenancies/${tenancyId}/deposit`,
      providesTags: (_result, _error, tenancyId) => [{ type: "Deposit", id: tenancyId }],
    }),

    listManagedTenancyBillingCycles: builder.query<BillingCycle[], string>({
      query: (tenancyId) => `/api/v1/billing/tenancies/${tenancyId}/cycles`,
      providesTags: ["BillingCycle"],
    }),

    listPropertyDeposits: builder.query<Page<DepositAccount>, DepositHistoryParams>({
      query: ({ page = 0, propertyId, query, size = 10, status }) => ({
        params: {
          page,
          size,
          ...(query?.trim() ? { query: query.trim() } : {}),
          ...(status ? { status } : {}),
        },
        url: `/api/v1/billing/properties/${propertyId}/deposits`,
      }),
      providesTags: [{ type: "Deposit", id: "LIST" }],
    }),

    addDepositCorrection: builder.mutation<DepositAccount, { tenancyId: string; reason: string; amountPaise: number }>({
      query: ({ amountPaise, reason, tenancyId }) => ({
        body: { amountPaise, reason },
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/deposit/corrections/add`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => [{ type: "Deposit", id: tenancyId }, { type: "Deposit", id: "LIST" }],
    }),

    deductDepositCorrection: builder.mutation<DepositAccount, { tenancyId: string; reason: string; amountPaise: number }>({
      query: ({ amountPaise, reason, tenancyId }) => ({
        body: { amountPaise, reason },
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/deposit/corrections/deduct`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => [{ type: "Deposit", id: tenancyId }, { type: "Deposit", id: "LIST" }],
    }),

    settleManagedDeposit: builder.mutation<DepositAccount, { tenancyId: string; reason: string }>({
      query: ({ reason, tenancyId }) => ({
        body: { reason },
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/deposit/settle`,
      }),
      // The refund posts a DepositPayoutEvent that auto-creates an expense row,
      // so refresh the expense tracker + budget overview too (both tag Expense).
      invalidatesTags: (_result, _error, { tenancyId }) => [
        { type: "Deposit", id: tenancyId },
        { type: "Deposit", id: "LIST" },
        "Expense",
      ],
    }),

    // Closes a deposit the exit marked not refundable. Pays out nothing, so no
    // DepositPayoutEvent and no expense row — only the account's own views move.
    closeDepositUnpaid: builder.mutation<DepositAccount, { tenancyId: string; reason: string }>({
      query: ({ reason, tenancyId }) => ({
        body: { reason },
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/deposit/close-unpaid`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => [
        { type: "Deposit", id: tenancyId },
        { type: "Deposit", id: "LIST" },
      ],
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
  useClearBillingLineItemMutation,
  useAddDepositCorrectionMutation,
  useAddTenancyDiscountMutation,
  useAddTenancyExtraChargesMutation,
  useDeductDepositCorrectionMutation,
  useExportPropertyBillingCyclesQuery,
  useGetManagedTenancyDepositQuery,
  useGetMyTenancyDepositQuery,
  useGetPropertyBillingSummaryQuery,
  useGetPropertyMonthSummaryQuery,
  useLazyExportPropertyBillingCyclesQuery,
  useListManagedTenancyBillingCyclesQuery,
  useListMyTenancyBillingCyclesQuery,
  useListPropertyBillingCyclesQuery,
  useListPropertyDepositsQuery,
  useListUpcomingPropertyCyclesQuery,
  useCreateOneOffBillMutation,
  useListManualPaymentsQuery,
  useRecordManualPaymentMutation,
  useCloseDepositUnpaidMutation,
  useSettleManagedDepositMutation,
} = billingApi;
