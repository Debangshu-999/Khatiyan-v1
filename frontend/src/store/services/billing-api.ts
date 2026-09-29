import { api, ifMatch } from "@/store/api";
import type { Page } from "@/store/pagination";

// UPCOMING is generated ahead of the due date and is NOT payable or billed yet;
// it is also the only state in which a rent cycle can still be edited.
/**
 * `CONFIRMATION_PENDING` is a tenant's payment claim awaiting the owner.
 *
 * <p>Neither paid nor unpaid: no collected figure counts it, and the late-fee
 * sweeps skip it, so the clock is frozen while the owner checks their statement.
 */
export type BillingCycleStatus =
  | "UPCOMING"
  | "UNPAID"
  | "OVERDUE"
  | "CONFIRMATION_PENDING"
  | "PAID"
  | "CANCELLED";
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
  /** Raised with a one-off bill: the bill itself, never an action on it (2026-09-28). */
  issuedWithBill: boolean;
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
  /** How to reach the tenant today, for the receipt's "Bill To" block. */
  tenantPhone: string | null;
  /** Null unless the address is verified — the server filters, not the app. */
  tenantEmail: string | null;
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
  /** Management's reason, present only on a cancelled one-off bill. */
  cancellationReason: string | null;
  /**
   * The row's version (2026-09-29). Sent back as If-Match when a screen acts
   * on it, so a record someone else changed since is refused, not overwritten.
   */
  version: number;
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
};

/**
 * A percentage of the bill's current total, or an amount off: exactly one
 * (2026-09-28). The server works out the money from a percentage.
 */
export type CreateDiscountPayload = {
  label: string;
  description?: string | null;
} & ({ discountPercent: number; discountAmountPaise?: never } | { discountAmountPaise: number; discountPercent?: never });

export type ManualPaymentMethod = "CASH" | "UPI" | "CARD" | "CHEQUE" | "OTHER" | "BANK_TRANSFER";

export type RecordManualPaymentPayload = {
  method: ManualPaymentMethod;
  referenceText?: string | null;
  proofImageUrls?: string[] | null;
  note?: string | null;
  /**
   * The tenant's cash-payment code. Required for CASH — the server refuses cash
   * without one — and ignored for every other method.
   */
  otp?: string | null;
};

/**
 * A cash-payment code has gone to the tenant's phone.
 *
 * <p>`sentTo` is the number masked to its last four digits, so the owner can
 * point the tenant at the right text without the whole number being on screen.
 */
export type CashPaymentCode = {
  sentTo: string;
  amountPaise: number;
  expiresAt: string;
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
  /** When the tenant confirmed it with their code. Null unless confirmed cash. */
  tenantConfirmedAt: string | null;
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
  /**
   * The row's version (2026-09-29). Sent back as If-Match when a screen acts
   * on it, so a record someone else changed since is refused, not overwritten.
   */
  version: number;
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

/**
 * The one page size every reader of the upcoming list uses.
 *
 * <p>RTK Query keys its cache by the arguments, so a different size is a
 * different entry that can hold a different answer. Anything that only needs
 * the total — the pill, the pending note — still asks for this size, so it
 * shares the upcoming screen's first page instead of keeping its own copy.
 */
export const UPCOMING_CYCLES_PAGE_SIZE = 8;

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
      // A first-cycle payment can create this account, while later owner
      // corrections invalidate the tenancy-specific Deposit tag.
      providesTags: (_result, _error, tenancyId) => [
        "BillingCycle",
        { type: "Deposit", id: tenancyId },
      ],
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

    /**
     * Cycles still to be generated for a month.
     *
     * <p>Read in three places — the pill on billing, the pending note under
     * the list, and the upcoming screen itself — which must all ask with
     * {@link UPCOMING_CYCLES_PAGE_SIZE} so they land on ONE cache entry. They
     * used three page sizes, so three entries, and the pill could keep an old
     * "none left" while the screen it opens showed eight.
     */
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

    /**
     * Charges on exactly this bill (2026-09-29). The tenancy-scoped endpoint it
     * replaced always picked the latest rent cycle, whichever card was pressed.
     */
    addCycleExtraCharges: builder.mutation<BillingCycle, { billingCycleId: string; charges: CreateExtraChargePayload[]; version: number }>({
      query: ({ billingCycleId, charges, version }) => ({
        body: charges,
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/cycles/${billingCycleId}/extra-charges`,
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
    clearBillingLineItem: builder.mutation<BillingCycle, { billingCycleId: string; lineItemId: string; version: number }>({
      query: ({ billingCycleId, lineItemId, version }) => ({
        headers: ifMatch(version),
        method: "PATCH",
        url: `/api/v1/billing/cycles/${billingCycleId}/line-items/${lineItemId}/clear`,
      }),
      invalidatesTags: ["BillingCycle", "Deposit", "Notification"],
    }),

    /** A discount on exactly this bill (2026-09-29), as above. */
    addCycleDiscount: builder.mutation<BillingCycle, { billingCycleId: string; discount: CreateDiscountPayload; version: number }>({
      query: ({ billingCycleId, discount, version }) => ({
        body: discount,
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/cycles/${billingCycleId}/discounts`,
      }),
      invalidatesTags: ["BillingCycle", "Notification"],
    }),

    recordManualPayment: builder.mutation<ManualPayment, { billingCycleId: string; payload: RecordManualPaymentPayload; version: number }>({
      query: ({ billingCycleId, payload, version }) => ({
        body: payload,
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/cycles/${billingCycleId}/manual-payment`,
      }),
      invalidatesTags: ["BillingCycle", "Notification", "Payment"],
    }),

    /**
     * Sends the bill's tenant a code confirming a cash payment at its current
     * total. No body: the number comes from the bill on the server, never from
     * here. Invalidates nothing — nothing is recorded until the code is entered.
     */
    sendCashPaymentCode: builder.mutation<CashPaymentCode, { billingCycleId: string; version: number }>({
      query: ({ billingCycleId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/cycles/${billingCycleId}/manual-payment/cash-code`,
      }),
    }),

    createOneOffBill: builder.mutation<BillingCycle, { tenancyId: string; payload: CreateOneOffBillPayload }>({
      query: ({ payload, tenancyId }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/one-off-bills`,
      }),
      invalidatesTags: ["BillingCycle", "Notification"],
    }),

    /**
     * Cancels a one-off bill raised by mistake. The server allows it only while
     * the bill is unpaid or overdue, and tells the tenant with the reason.
     */
    cancelOneOffBill: builder.mutation<BillingCycle, { billingCycleId: string; reason: string; version: number }>({
      query: ({ billingCycleId, reason, version }) => ({
        body: { reason },
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/cycles/${billingCycleId}/cancel`,
      }),
      invalidatesTags: ["BillingCycle", "Notification"],
    }),

    /**
     * Waives the late fee on a bill. The server allows it only while the bill
     * is overdue: not while a payment claim awaits confirmation, not in any other
     * state. The fee stays removed; the nightly run does not put it back.
     */
    removeLateFee: builder.mutation<BillingCycle, { billingCycleId: string; version: number }>({
      query: ({ billingCycleId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/cycles/${billingCycleId}/late-fee/remove`,
      }),
      invalidatesTags: ["BillingCycle"],
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

    addDepositCorrection: builder.mutation<DepositAccount, { tenancyId: string; reason: string; amountPaise: number; version: number }>({
      query: ({ amountPaise, reason, tenancyId, version }) => ({
        body: { amountPaise, reason },
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/deposit/corrections/add`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => [{ type: "Deposit", id: tenancyId }, { type: "Deposit", id: "LIST" }],
    }),

    deductDepositCorrection: builder.mutation<DepositAccount, { tenancyId: string; reason: string; amountPaise: number; version: number }>({
      query: ({ amountPaise, reason, tenancyId, version }) => ({
        body: { amountPaise, reason },
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/deposit/corrections/deduct`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => [{ type: "Deposit", id: tenancyId }, { type: "Deposit", id: "LIST" }],
    }),

    settleManagedDeposit: builder.mutation<DepositAccount, { tenancyId: string; reason: string; version: number }>({
      query: ({ reason, tenancyId, version }) => ({
        body: { reason },
        headers: ifMatch(version),
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
    closeDepositUnpaid: builder.mutation<DepositAccount, { tenancyId: string; reason: string; version: number }>({
      query: ({ reason, tenancyId, version }) => ({
        body: { reason },
        headers: ifMatch(version),
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
  useAddCycleDiscountMutation,
  useAddCycleExtraChargesMutation,
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
  useCancelOneOffBillMutation,
  useRemoveLateFeeMutation,
  useCreateOneOffBillMutation,
  useListManualPaymentsQuery,
  useRecordManualPaymentMutation,
  useSendCashPaymentCodeMutation,
  useCloseDepositUnpaidMutation,
  useSettleManagedDepositMutation,
} = billingApi;
