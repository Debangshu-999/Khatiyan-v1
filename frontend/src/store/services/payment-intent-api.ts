import { api, ifMatch } from "@/store/api";
import type { ManualPaymentMethod } from "@/store/services/billing-api";

/**
 * A tenant's claim that they paid a bill, and the owner's verdict.
 *
 * <p>No money moves through the app. The tenant's own banking app pays the
 * owner directly over UPI, and these endpoints record the claim and the
 * decision made against the owner's bank statement.
 */
export type PaymentIntentStatus =
  | "CREATED"
  | "TENANT_CANCELLED"
  | "TENANT_CONFIRMED"
  | "OWNER_VERIFIED"
  | "OWNER_REJECTED";

export type PaymentIntent = {
  id: string;
  billingCycleId: string;
  status: PaymentIntentStatus;
  /** How the tenant says they paid. UPI for every link attempt. */
  method: ManualPaymentMethod;
  /**
   * Whether this attempt still blocks a fresh one.
   *
   * <p>Sent by the server rather than derived from `status` here, so "blocked"
   * has one definition and it is not this file's.
   */
  live: boolean;
  /** Snapshots from when the link was built, not current values. */
  amountPaise: number;
  referenceCode: string;
  /** Only on the owner's queue. Null on the tenant's own view. */
  tenantName: string | null;
  tenantReferenceText: string | null;
  tenantNote: string | null;
  proofImageUrls: string[];
  createdAt: string;
  tenantDecidedAt: string | null;
  ownerDecidedAt: string | null;
  /**
   * The row's version (2026-09-29). Sent back as If-Match when a screen acts
   * on it, so a record someone else changed since is refused, not overwritten.
   */
  version: number;
};

/** How a tenant may pay. Never carries anything the tenant may not see. */
export type PayeeDetails = {
  payeeName: string | null;
  upiVpa: string | null;
  upiPhone: string | null;
  upiQrImageUrl: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankAccountHolder: string | null;
  /** False means the pay sheet shows UPI alone, with no tabs at all. */
  hasBankDetails: boolean;
};

export type TenantPaymentState = {
  /** False when the property offers no route — no Pay button at all. */
  upiAvailable: boolean;
  /**
   * Whether a `upi://pay` link exists.
   *
   * <p>Narrower than `upiAvailable`: a property with only a QR can be paid by
   * scanning but has nothing to fire, so "Scan and pay" is hidden.
   */
  payLinkAvailable: boolean;
  payee: PayeeDetails | null;
  /** Non-null means Pay is blocked and the decision modal is what to show. */
  liveIntent: PaymentIntent | null;
  /**
   * The ways this tenant can pay, in the order the pay sheet shows them
   * (2026-09-28). UPI and bank transfer only when their details are complete.
   */
  acceptedMethods: ManualPaymentMethod[];
  /** Cash needs a code sent to the tenant's phone. */
  cashOtpRequired: boolean;
};

export type StartPaymentResult = {
  intent: PaymentIntent;
  /** Null when the property has a QR or number but no address. */
  upiLink: string | null;
  payee: PayeeDetails | null;
};

/** The owner's view — carries the bank reference they keep for themselves. */
export type PropertyPaymentDetails = {
  upiVpa: string | null;
  payeeName: string | null;
  upiPhone: string | null;
  upiQrImageUrl: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankAccountHolder: string | null;
  acceptsUpi: boolean;
  /** The ticked ways to be paid, in display order. Cash only until set. */
  acceptedMethods: ManualPaymentMethod[];
  cashOtpRequired: boolean;
  /**
   * The row's version (2026-09-29). Sent back as If-Match when a screen acts
   * on it, so a record someone else changed since is refused, not overwritten.
   */
  version: number;
};

/** Which ways a property takes money. Readable by whoever records a payment. */
export type PaymentMethods = {
  acceptedMethods: ManualPaymentMethod[];
  cashOtpRequired: boolean;
};

/** The Live digest tile's numbers. */
export type PaymentIntentDigest = {
  awaitingReview: number;
  awaitingAmountPaise: number;
  oldestWaitingDays: number;
  /** Approved or rejected in the current IST month — work done, not waiting. */
  resolvedThisMonth: number;
};

/**
 * An IFSC resolved against Razorpay's public bank directory. UNAVAILABLE means
 * the directory could not be reached, never that the code is wrong.
 */
export type IfscLookup = {
  ifsc: string;
  status: "FOUND" | "NOT_FOUND" | "UNAVAILABLE";
  bank: string | null;
  branch: string | null;
  city: string | null;
  state: string | null;
};

export const paymentIntentApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // ---- Tenant ----------------------------------------------------------

    getMyPaymentState: builder.query<TenantPaymentState, string>({
      query: (billingCycleId) => `/api/v1/billing/me/cycles/${billingCycleId}/payment-state`,
      providesTags: ["PaymentIntent"],
    }),

    /** Every attempt on one bill, newest first — the ledger under a bill. */
    listMyPaymentIntents: builder.query<PaymentIntent[], string>({
      query: (billingCycleId) => `/api/v1/billing/me/cycles/${billingCycleId}/payment-intents`,
      providesTags: ["PaymentIntent"],
    }),

    /**
     * Live attempts across a whole stay.
     *
     * <p>One call for a bill list, so every card can lock its own Pay button
     * without a request each.
     */
    listMyLivePaymentIntents: builder.query<PaymentIntent[], string>({
      query: (tenancyId) => `/api/v1/billing/me/tenancies/${tenancyId}/payment-intents/live`,
      providesTags: ["PaymentIntent"],
    }),

    startPayment: builder.mutation<StartPaymentResult, { billingCycleId: string; version: number }>({
      query: ({ billingCycleId, version }) => ({
        // The bill's version: one whose amount changed is not paid at the old figure.
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/me/cycles/${billingCycleId}/payment-intents`,
      }),
      invalidatesTags: ["PaymentIntent"],
    }),

    cancelMyPaymentIntent: builder.mutation<PaymentIntent, { intentId: string; version: number }>({
      query: ({ intentId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/me/payment-intents/${intentId}/cancel`,
      }),
      invalidatesTags: ["PaymentIntent"],
    }),

    confirmMyPaymentIntent: builder.mutation<
      PaymentIntent,
      { intentId: string; version: number; referenceText?: string | null; note?: string | null; proofImageUrls?: string[] }
    >({
      query: ({ intentId, version, ...body }) => ({
        body,
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/me/payment-intents/${intentId}/confirm`,
      }),
      // BillingCycle too: claiming moves the bill to confirmation pending, so
      // the bill card behind the modal is stale the moment this returns.
      invalidatesTags: ["PaymentIntent", "BillingCycle"],
    }),

    /**
     * "I paid" by UPI, bank transfer, card or cheque, raised from that method's
     * tab (2026-09-28). Proof is optional. Goes to the owner to check.
     */
    raisePaymentClaim: builder.mutation<
      PaymentIntent,
      {
        billingCycleId: string;
        /** The bill's version, as the tenant saw it. */
        version: number;
        method: ManualPaymentMethod;
        referenceText?: string | null;
        note?: string | null;
        proofImageUrls?: string[];
      }
    >({
      query: ({ billingCycleId, version, ...body }) => ({
        body,
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/me/cycles/${billingCycleId}/payment-claims`,
      }),
      invalidatesTags: ["PaymentIntent", "BillingCycle"],
    }),

    // ---- Owner -----------------------------------------------------------

    /**
     * One month of a property's claims, newest first, decided or not.
     *
     * <p>Was "everything awaiting review". That list emptied itself as the owner
     * worked through it, so the screen could never answer "what did I approve
     * last week" — and month by month is how an owner reads a bank statement.
     */
    listPaymentClaims: builder.query<PaymentIntent[], { propertyId: string; month: string }>({
      query: ({ month, propertyId }) => ({
        params: { month },
        url: `/api/v1/billing/properties/${propertyId}/payment-intents`,
      }),
      providesTags: ["PaymentIntent"],
    }),

    /** One bill's claims, newest first: the claims icon on a bill card. Owner only. */
    listBillPaymentClaims: builder.query<PaymentIntent[], string>({
      query: (billingCycleId) => `/api/v1/billing/cycles/${billingCycleId}/payment-claims`,
      providesTags: ["PaymentIntent"],
    }),

    verifyPaymentIntent: builder.mutation<PaymentIntent, { intentId: string; version: number }>({
      query: ({ intentId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/payment-intents/${intentId}/verify`,
      }),
      // Approving marks the bill paid, which moves collected money, the deposit
      // ledger and the P&L — every one of those reads from cycle state.
      invalidatesTags: ["PaymentIntent", "BillingCycle", "Deposit", "Pnl", "Notification"],
    }),

    rejectPaymentIntent: builder.mutation<PaymentIntent, { intentId: string; version: number }>({
      query: ({ intentId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/payment-intents/${intentId}/reject`,
      }),
      invalidatesTags: ["PaymentIntent", "BillingCycle"],
    }),

    // ---- Owner: where the money goes -------------------------------------

    /** For Mark paid and the end-tenancy picker (2026-09-28). No payout details. */
    getPaymentMethods: builder.query<PaymentMethods, string>({
      query: (propertyId) => `/api/v1/billing/properties/${propertyId}/payment-methods`,
      providesTags: ["PaymentDetails"],
    }),

    /**
     * Payment setup's IFSC check (2026-09-28). The endpoint lives in the parked
     * payment module and is still served: a keyless read of the bank directory.
     * Branches do not move, so an answer is kept for the session.
     */
    lookupIfsc: builder.query<IfscLookup, string>({
      keepUnusedDataFor: 3600,
      query: (ifsc) => `/api/v1/payments/ifsc/${ifsc}`,
    }),

    getPropertyPaymentDetails: builder.query<PropertyPaymentDetails, string>({
      query: (propertyId) => `/api/v1/billing/properties/${propertyId}/payment-details`,
      providesTags: ["PaymentDetails"],
    }),

    updatePropertyPaymentDetails: builder.mutation<
      PropertyPaymentDetails,
      {
        propertyId: string;
        upiVpa: string | null;
        payeeName: string | null;
        upiPhone: string | null;
        upiQrImageUrl: string | null;
        bankAccountNumber: string | null;
        bankIfsc: string | null;
        bankAccountHolder: string | null;
        acceptedMethods: ManualPaymentMethod[];
        cashOtpRequired: boolean;
        /** The setup's version as loaded, 0 before its first save. */
        version: number;
      }
    >({
      query: ({ propertyId, version, ...body }) => ({
        body,
        headers: ifMatch(version),
        method: "PUT",
        url: `/api/v1/billing/properties/${propertyId}/payment-details`,
      }),
      // PaymentIntent too: turning UPI on or off changes whether every tenant on
      // the property is offered a Pay button at all.
      invalidatesTags: ["PaymentDetails", "PaymentIntent"],
    }),
  }),
  // Fast Refresh re-runs this module on every edit, so injectEndpoints sees
  // endpoints it already registered. Allowed in dev for that reason.
  overrideExisting: __DEV__ ? true : "throw",
});

export const {
  useCancelMyPaymentIntentMutation,
  useListMyLivePaymentIntentsQuery,
  useListMyPaymentIntentsQuery,
  useConfirmMyPaymentIntentMutation,
  useGetMyPaymentStateQuery,
  useGetPaymentMethodsQuery,
  useLookupIfscQuery,
  useGetPropertyPaymentDetailsQuery,
  useListPaymentClaimsQuery,
  useListBillPaymentClaimsQuery,
  useRaisePaymentClaimMutation,
  useRejectPaymentIntentMutation,
  useStartPaymentMutation,
  useUpdatePropertyPaymentDetailsMutation,
  useVerifyPaymentIntentMutation,
} = paymentIntentApi;
