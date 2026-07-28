import { api } from "@/store/api";

export type PayoutAccountStatus = "PENDING" | "ACTIVE" | "FAILED";

/** Max banks an owner can keep on file. Mirrors the backend's cap. */
export const MAX_PAYOUT_ACCOUNTS = 2;

export type PayoutAccount = {
  id: string;
  status: PayoutAccountStatus;
  accountHolderName: string;
  accountNumberLast4: string;
  ifsc: string;
  // Resolved from the IFSC when the account was saved. Null for rows saved
  // while the bank directory was unreachable.
  bankName: string | null;
  branchName: string | null;
  pan: string | null;
  // The one rent is transferred to. Exactly one account is primary.
  primary: boolean;
  failureReason: string | null;
};

// NOT_FOUND means the branch genuinely doesn't exist (the owner's typo);
// UNAVAILABLE means we couldn't reach the directory and must not blame them.
export type IfscLookupStatus = "FOUND" | "NOT_FOUND" | "UNAVAILABLE";

export type IfscLookup = {
  ifsc: string;
  status: IfscLookupStatus;
  bank: string | null;
  branch: string | null;
  city: string | null;
  state: string | null;
};

export type SetupPayoutPayload = {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  pan: string;
};

export const payoutApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listPayoutAccounts: builder.query<PayoutAccount[], void>({
      query: () => "/api/v1/payments/payout-accounts",
      providesTags: ["Payout"],
    }),
    addPayoutAccount: builder.mutation<PayoutAccount, SetupPayoutPayload>({
      query: (payload) => ({ body: payload, method: "POST", url: "/api/v1/payments/payout-accounts" }),
      invalidatesTags: ["Payout"],
    }),
    updatePayoutAccount: builder.mutation<PayoutAccount, { id: string; payload: SetupPayoutPayload }>({
      query: ({ id, payload }) => ({ body: payload, method: "PUT", url: `/api/v1/payments/payout-accounts/${id}` }),
      invalidatesTags: ["Payout"],
    }),
    deletePayoutAccount: builder.mutation<void, string>({
      query: (id) => ({ method: "DELETE", url: `/api/v1/payments/payout-accounts/${id}` }),
      invalidatesTags: ["Payout"],
    }),
    setPrimaryPayoutAccount: builder.mutation<PayoutAccount[], string>({
      query: (id) => ({ method: "POST", url: `/api/v1/payments/payout-accounts/${id}/primary` }),
      invalidatesTags: ["Payout"],
    }),
    // Branch records are static, so results are held for the session rather
    // than refetched every time the form reopens.
    lookupIfsc: builder.query<IfscLookup, string>({
      query: (ifsc) => `/api/v1/payments/ifsc/${ifsc}`,
      keepUnusedDataFor: 3600,
    }),
  }),
});

export const {
  useAddPayoutAccountMutation,
  useDeletePayoutAccountMutation,
  useListPayoutAccountsQuery,
  useLookupIfscQuery,
  useSetPrimaryPayoutAccountMutation,
  useUpdatePayoutAccountMutation,
} = payoutApi;
