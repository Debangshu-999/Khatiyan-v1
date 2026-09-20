import { api } from "@/store/api";

/**
 * Identity checks a tenant runs on themselves.
 *
 * <p>Every endpoint here belongs to the signed-in tenant. There is no
 * owner-facing call for starting or submitting a check, and there must not be:
 * an owner who could type a tenant's Aadhaar number would make the separation
 * this feature is built on decorative.
 */
export type VerificationServiceCode = "AADHAAR_OKYC";

export type VerificationGrantStatus = "PENDING" | "VERIFIED" | "EXHAUSTED" | "CANCELLED";

/**
 * One check an owner ordered, as the tenant sees it.
 *
 * <p>Carries no Aadhaar number because there is none anywhere — the masked
 * last four is all that was ever kept.
 */
export type VerificationGrant = {
  id: string;
  serviceCode: VerificationServiceCode;
  status: VerificationGrantStatus;
  attemptsGranted: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  verifiedAt: string | null;
  verifiedName: string | null;
  maskedIdLastFour: string | null;
  nameMatched: boolean | null;
  /**
   * Whether the Aadhaar-linked mobile is the phone they signed in with.
   *
   * <p>Null means we could not tell, which is not the same as false, and false
   * is a fact rather than a failure — people register with a work phone, an old
   * SIM, a spouse's number.
   */
  phoneMatched: boolean | null;
  adultAtVerification: boolean | null;
};

/** A code is on its way to the tenant's Aadhaar-linked phone. */
export type OtpChallenge = {
  attemptId: string;
  /** The last digits of the number it went to. Null when the provider does not say. */
  linkedMobileHint: string | null;
  expiresAt: string | null;
};

/**
 * What submitting a code achieved.
 *
 * <p>Arrives as a 200 whether or not it passed — a wrong code is an ordinary
 * outcome of asking somebody to read a text message, and the screen needs the
 * grant back either way to say how many tries are left.
 */
export type VerificationResult = {
  verified: boolean;
  message: string | null;
  grant: VerificationGrant | null;
};

export const verificationApi = api.injectEndpoints({
  endpoints: (builder) => ({
    /** Everything this tenant has been asked to complete. */
    listMyVerifications: builder.query<VerificationGrant[], void>({
      providesTags: ["Verification"],
      query: () => ({ url: "/api/v1/verification/my" }),
    }),

    /**
     * Asks the provider to text a code.
     *
     * <p>The Aadhaar number goes up and is never stored, logged or returned —
     * not by the app, and not by the server behind it.
     *
     * <p>Invalidates, because starting a check spends one of the tenant's
     * attempts whether or not they go on to use it.
     */
    startVerificationOtp: builder.mutation<
      OtpChallenge,
      { grantId: string; aadhaarNumber: string; consent: boolean }
    >({
      invalidatesTags: ["Verification"],
      query: ({ grantId, ...body }) => ({
        body,
        method: "POST",
        url: `/api/v1/verification/grants/${grantId}/otp`,
      }),
    }),

    /**
     * Submits the code.
     *
     * <p>Invalidates whatever the answer: a pass changes the status, and a
     * failure changes how many tries are left.
     */
    submitVerificationOtp: builder.mutation<VerificationResult, { attemptId: string; otp: string }>({
      invalidatesTags: ["Verification"],
      query: ({ attemptId, otp }) => ({
        body: { otp },
        method: "POST",
        url: `/api/v1/verification/attempts/${attemptId}/otp`,
      }),
    }),
  }),
});

export const {
  useListMyVerificationsQuery,
  useStartVerificationOtpMutation,
  useSubmitVerificationOtpMutation,
} = verificationApi;
