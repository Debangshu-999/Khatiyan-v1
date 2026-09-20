import { api } from "@/store/api";

/**
 * The owner's prepaid Service balance.
 *
 * <p>Money paid in advance for Khatiyan's own paid services. It buys those
 * services only — it cannot be withdrawn, sent to anyone, or spent on rent or
 * deposits. Money leaves only the way it came in, as a refund to the card that
 * paid, and no screen may offer another exit.
 */
export type ServiceBalanceEntryType =
  | "TOPUP"
  | "RESERVE"
  | "RELEASE"
  | "CHARGE"
  | "REFUND"
  | "CHARGEBACK"
  | "ADJUSTMENT";

export type ServiceBalanceReferenceType = "TOP_UP" | "VERIFICATION" | "REFUND" | "MANUAL";

/**
 * One line of the statement.
 *
 * <p>All three deltas travel rather than one net figure: a hold and a spend
 * look identical in a single number, and telling those apart is the whole
 * reason an owner opens a statement. Outstanding is the one a charge lands on
 * when the balance could not cover it.
 */
export type ServiceBalanceEntry = {
  id: string;
  type: ServiceBalanceEntryType;
  availableDeltaPaise: number;
  reservedDeltaPaise: number;
  outstandingDeltaPaise: number;
  availableAfterPaise: number;
  reservedAfterPaise: number;
  outstandingAfterPaise: number;
  referenceType: ServiceBalanceReferenceType;
  referenceId: string | null;
  memo: string | null;
  createdAt: string;
};

export type ServiceBalance = {
  availablePaise: number;
  /** Held against checks already asked for. Not spendable, not yet spent. */
  reservedPaise: number;
  totalPaise: number;
  /**
   * What the owner owes.
   *
   * <p>A service can run on an empty balance rather than stranding a manager
   * mid-onboarding, and the cost waits here. The balance itself never goes
   * negative, so this is shown as pending charges beside it.
   */
  outstandingPaise: number;
  /**
   * What could go back to the cards that paid it, and zero while anything is
   * owed. Read by the account-closure flow, which is the only way unused money
   * leaves this balance.
   */
  refundablePaise: number;
  /** Dues at the ceiling, or the account locked. No new work runs. */
  servicesSuspended: boolean;
  currency: string;
  minTopUpPaise: number;
  maxTopUpPaise: number;
  quickAmountsPaise: number[];
  /** False until the gateway is configured. The screen still reads. */
  topUpEnabled: boolean;
  recentEntries: ServiceBalanceEntry[];
};

export type TopUpStatus = "CREATED" | "AUTHORIZED" | "PAID" | "FAILED" | "EXPIRED";

export type ServiceBalanceTopUp = {
  id: string;
  amountPaise: number;
  status: TopUpStatus;
  providerOrderId: string | null;
  /** The publishable key. The secret never leaves the server. */
  providerKeyId: string;
  currency: string;
  /**
   * The page to open for payment, rendered by our own server.
   *
   * <p>Razorpay's checkout is a web SDK, and the native module alternative
   * cannot run in Expo Go — so the app opens this in the phone's browser.
   */
  checkoutUrl: string;
  expiresAt: string;
  paidAt: string | null;
};

/** A page of the statement, in Spring's shape. */
export type ServiceBalanceEntryPage = {
  content: ServiceBalanceEntry[];
  number: number;
  totalPages: number;
  totalElements: number;
  last: boolean;
};

export const serviceBalanceApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getServiceBalance: builder.query<ServiceBalance, void>({
      query: () => ({ url: "/api/v1/service-balance" }),
      providesTags: ["ServiceBalance"],
    }),

    listServiceBalanceEntries: builder.query<ServiceBalanceEntryPage, { page?: number; size?: number } | void>({
      query: (args) => ({
        params: { page: args?.page ?? 0, size: args?.size ?? 20 },
        url: "/api/v1/service-balance/entries",
      }),
      providesTags: ["ServiceBalance"],
    }),

    /**
     * Starts a checkout.
     *
     * <p>Does NOT add money. It returns the gateway order the checkout sheet
     * opens against, and the balance only moves when the gateway tells the
     * server it captured the payment.
     */
    startServiceBalanceTopUp: builder.mutation<ServiceBalanceTopUp, { amountPaise: number }>({
      query: (body) => ({ body, method: "POST", url: "/api/v1/service-balance/top-ups" }),
    }),

    /**
     * The server's view of a checkout, polled after the sheet closes.
     *
     * <p>Deliberately not cached and never tagged: the answer changes the
     * moment the webhook lands, and a cached "not paid yet" is exactly the
     * wrong thing to show.
     */
    getServiceBalanceTopUp: builder.query<ServiceBalanceTopUp, string>({
      query: (topUpId) => ({ url: `/api/v1/service-balance/top-ups/${topUpId}` }),
    }),
  }),
});

export const {
  useGetServiceBalanceQuery,
  useGetServiceBalanceTopUpQuery,
  useLazyGetServiceBalanceTopUpQuery,
  useListServiceBalanceEntriesQuery,
  useStartServiceBalanceTopUpMutation,
} = serviceBalanceApi;
