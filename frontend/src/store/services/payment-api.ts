import { api } from "@/store/api";

export type PaymentProvider = "RAZORPAY" | "MOCK";
export type PaymentOrderStatus = "CREATED" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED";

export type PaymentOrder = {
  id: string;
  referenceCode: string;
  billingCycleId: string;
  tenancyId: string;
  tenantUserId: string;
  propertyId: string;
  amountPaise: number;
  currency: string;
  provider: PaymentProvider;
  providerOrderId: string | null;
  providerCheckoutReference: string | null;
  status: PaymentOrderStatus;
  createdByUserId: string | null;
  expiresAt: string;
  paidAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VerifyPaymentPayload = {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
};

export type RecordPaymentFailurePayload = {
  errorCode: string;
  errorDescription?: string | null;
  errorReason?: string | null;
  errorSource?: string | null;
  errorStep?: string | null;
  paymentOrderId: string;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
};

export const paymentApi = api.injectEndpoints({
  endpoints: (builder) => ({
    createPaymentOrder: builder.mutation<PaymentOrder, { billingCycleId: string; idempotencyKey: string }>({
      query: ({ billingCycleId, idempotencyKey }) => ({
        body: { idempotencyKey },
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        method: "POST",
        url: `/api/v1/payments/billing-cycles/${billingCycleId}/orders`,
      }),
      invalidatesTags: ["BillingCycle", "Notification", "Payment"],
    }),
    recordPaymentFailure: builder.mutation<PaymentOrder, RecordPaymentFailurePayload>({
      query: ({ paymentOrderId, ...body }) => ({
        body,
        method: "POST",
        url: `/api/v1/payments/orders/${paymentOrderId}/client-failure`,
      }),
      invalidatesTags: ["BillingCycle", "Notification", "Payment"],
    }),
    verifyPaymentReturn: builder.mutation<PaymentOrder, VerifyPaymentPayload>({
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/v1/payments/orders/verify",
      }),
      invalidatesTags: ["BillingCycle", "Notification", "Payment"],
    }),
  }),
});

export const {
  useCreatePaymentOrderMutation,
  useRecordPaymentFailureMutation,
  useVerifyPaymentReturnMutation,
} = paymentApi;
