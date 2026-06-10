import { api } from "@/store/api";

export type BillingCycleStatus = "UNPAID" | "OVERDUE" | "PAID" | "CANCELLED";
export type BillingCollectionTiming = "CYCLE_START" | "CYCLE_END";
export type BillingLineItemType = "RENT" | "DEPOSIT" | "EXTRA_CHARGE" | "DISCOUNT" | "LATE_FEE";
export type BillingLineItemStatus = "PENDING" | "ADDED";
export type BillingLineSettlementAction =
  | "ADDED_TO_BILL"
  | "ADJUSTED_FROM_DEPOSIT"
  | "DISCOUNTED"
  | "SYSTEM_CHARGE"
  | "WAIVED";
export type DepositAccountStatus = "ACTIVE" | "SETTLED";
export type DepositMovementType = "CREDIT" | "DEBIT";

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
  lastAdjustedByUserId: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BillingCycle = {
  id: string;
  referenceCode: string;
  tenancyId: string;
  tenantUserId: string;
  tenantNameSnapshot: string;
  propertyId: string;
  roomId: string;
  billingType: "DAILY" | "MONTHLY";
  cycleNumber: number;
  periodStartDate: string;
  periodEndDate: string;
  rentDueDate: string;
  billingCollectionTiming: BillingCollectionTiming;
  rentGraceDays: number;
  baseAmountPaise: number;
  extraChargePaise: number;
  lateFeeAmountPaise: number;
  discountAmountPaise: number;
  totalAmountPaise: number;
  status: BillingCycleStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: BillingCycleLineItem[];
};

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
  proofImageUrl?: string | null;
  note?: string | null;
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
  proofImageUrl: string | null;
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
  currentBalancePaise: number;
  status: DepositAccountStatus;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  movements: DepositMovement[];
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
};

export type BillingPastSummary = {
  olderCycleCount: number;
  paidCount: number;
  paidPaise: number;
  unpaidCount: number;
  unpaidPaise: number;
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

    getPropertyPastSummary: builder.query<BillingPastSummary, { propertyId: string; month?: string }>({
      query: ({ month, propertyId }) => ({
        params: month?.trim() ? { month: month.trim() } : undefined,
        url: `/api/v1/billing/properties/${propertyId}/past-summary`,
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

    listPastPropertyBillingCycles: builder.query<BillingCycle[], { propertyId: string; query?: string; month?: string }>({
      query: ({ month, propertyId, query }) => ({
        params: {
          ...(query?.trim() ? { query: query.trim() } : {}),
          ...(month?.trim() ? { month: month.trim() } : {}),
        },
        url: `/api/v1/billing/properties/${propertyId}/past-cycles`,
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
  }),
});

export const {
  useAddTenancyDiscountMutation,
  useAddTenancyExtraChargesMutation,
  useExportPropertyBillingCyclesQuery,
  useGetMyTenancyDepositQuery,
  useGetPropertyBillingSummaryQuery,
  useGetPropertyMonthSummaryQuery,
  useGetPropertyPastSummaryQuery,
  useLazyExportPropertyBillingCyclesQuery,
  useListPastPropertyBillingCyclesQuery,
  useListMyTenancyBillingCyclesQuery,
  useListPropertyBillingCyclesQuery,
  useRecordManualPaymentMutation,
} = billingApi;
