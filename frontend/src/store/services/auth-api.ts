import { api } from "@/store/api";

export type AuthUser = {
  id: string;
  phone: string;
  fullName: string;
  profilePhotoUrl?: string | null;
  role: "USER" | "OWNER" | "TENANT";
  activeTenant: boolean;
  active: boolean;
  phoneVerified: boolean;
  profileCompleted: boolean;
};

/**
 * TRANSGENDER is listed because Indian forms are expected to — NALSA (2014)
 * requires a third option on official records. UNDECLARED is a deliberate answer
 * rather than the absence of one: someone who picks it has been asked and
 * declined, where null means they were never asked.
 */
export type Gender = "MALE" | "FEMALE" | "TRANSGENDER" | "OTHER" | "UNDECLARED";

/**
 * The particulars a deed names a person by.
 *
 * <p>`agreementReady` is what the onboarding gate reads: a name, a VERIFIED
 * email, and a permanent address. Age and gender are excluded — they are
 * optional on a profile and the deed omits them when absent.
 */
export type UserIdentity = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  emailVerified: boolean;
  permanentAddress: string | null;
  permanentAddressPincode: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  agreementReady: boolean;
};

export type UpdateIdentityBody = {
  permanentAddress?: string | null;
  permanentAddressPincode?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
};

export type TokenResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: AuthUser;
};

export type OtpVerifyResponse = {
  phone: string;
  purpose: "LOGIN" | "PIN_RESET" | "EMAIL_LOGIN";
  verified: boolean;
  pinRequired: boolean;
};

/** One signed-in device, as the sessions list shows it. */
export type UserSession = {
  id: string;
  deviceLabel: string | null;
  platform: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  /** The session making the request — rendered as "This device", not a button. */
  current: boolean;
};

export type EmailRecoveryStatus = { email: string | null; verified: boolean };
type EmailOtpBody = { email: string };

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProfile: builder.query<AuthUser, void>({
      query: () => "/api/v1/auth/me",
      providesTags: ["Profile"],
    }),
    // The photo fields are tri-state on the server: omitted leaves the photo
    // alone, "" clears it, a URL replaces it. Renaming must not send them.
    updateProfile: builder.mutation<
      AuthUser,
      { fullName: string; profilePhotoPublicId?: string | null; profilePhotoUrl?: string | null }
    >({
      query: (body) => ({ url: "/api/v1/auth/me", method: "PATCH", body }),
      invalidatesTags: ["Profile"],
    }),
    /**
     * The identity details an agreement names this person by.
     *
     * <p>A separate read from `/me` on purpose: the user summary is returned
     * wherever a person is mentioned anywhere in the app, and a permanent address
     * and a date of birth do not belong in a chat row.
     */
    getMyIdentity: builder.query<UserIdentity, void>({
      query: () => "/api/v1/auth/me/identity",
      providesTags: ["Profile"],
    }),

    /** Blanks CLEAR here — this is the person editing their own record. */
    updateMyIdentity: builder.mutation<UserIdentity, UpdateIdentityBody>({
      query: (body) => ({ url: "/api/v1/auth/me/identity", method: "PATCH", body }),
      invalidatesTags: ["Profile"],
    }),

    getEmailRecoveryStatus: builder.query<EmailRecoveryStatus, void>({
      query: () => "/api/v1/auth/me/email",
      providesTags: ["Profile"],
    }),
    updateRecoveryEmail: builder.mutation<EmailRecoveryStatus, EmailOtpBody>({
      query: (body) => ({ url: "/api/v1/auth/me/email", method: "PATCH", body }),
      invalidatesTags: ["Profile"],
    }),
    requestEmailVerification: builder.mutation<void, void>({
      query: () => ({ url: "/api/v1/auth/me/email/verification/request", method: "POST" }),
      invalidatesTags: ["Profile"],
    }),
    listSessions: builder.query<UserSession[], void>({
      query: () => "/api/v1/auth/sessions",
      providesTags: ["Session"],
    }),

    revokeSession: builder.mutation<void, string>({
      query: (sessionId) => ({ url: `/api/v1/auth/sessions/${sessionId}`, method: "DELETE" }),
      invalidatesTags: ["Session"],
    }),

    loginWithPin: builder.mutation<TokenResponse, { phone: string; pin: string; signOutSessionId?: string }>({
      query: (body) => ({ url: "/api/v1/auth/pin/login", method: "POST", body }),
      invalidatesTags: ["Profile", "Notification"],
    }),
    requestEmailLogin: builder.mutation<void, EmailOtpBody>({
      query: (body) => ({ url: "/api/v1/auth/email/login/request", method: "POST", body }),
    }),
    confirmEmailLogin: builder.mutation<TokenResponse, EmailOtpBody & { otp: string }>({
      query: (body) => ({ url: "/api/v1/auth/email/login/confirm", method: "POST", body }),
      invalidatesTags: ["Profile", "Notification"],
    }),
    registerUser: builder.mutation<void, { phone: string; email: string; fullName: string }>({
      query: (body) => ({ url: "/api/v1/auth/user/register", method: "POST", body }),
    }),
    registerOwner: builder.mutation<void, { phone: string; email: string; fullName: string }>({
      query: (body) => ({ url: "/api/v1/auth/owner/register", method: "POST", body }),
    }),
    requestOtp: builder.mutation<void, { phone: string; purpose: "LOGIN" | "PIN_RESET"; channel?: "SMS" | "SMS_AND_WHATSAPP" | "SMS_AND_EMAIL" }>({
      query: (body) => ({ url: "/api/v1/auth/otp/request", method: "POST", body }),
    }),
    verifyOtp: builder.mutation<OtpVerifyResponse, { phone: string; otp: string; purpose: "LOGIN" | "PIN_RESET" }>({
      query: (body) => ({ url: "/api/v1/auth/otp/verify", method: "POST", body }),
    }),
    setPin: builder.mutation<TokenResponse, { phone: string; otp: string; pin: string }>({
      query: (body) => ({ url: "/api/v1/auth/pin/set", method: "POST", body }),
      invalidatesTags: ["Profile"],
    }),
    requestPinReset: builder.mutation<void, { phone: string; channel?: "SMS" | "SMS_AND_WHATSAPP" }>({
      query: (body) => ({ url: "/api/v1/auth/pin/reset/request", method: "POST", body }),
    }),
    requestEmailPinReset: builder.mutation<void, EmailOtpBody>({
      query: (body) => ({ url: "/api/v1/auth/pin/reset/email/request", method: "POST", body }),
    }),
    verifyEmailPinReset: builder.mutation<OtpVerifyResponse, EmailOtpBody & { otp: string }>({
      query: (body) => ({ url: "/api/v1/auth/pin/reset/email/verify", method: "POST", body }),
    }),
    confirmPinReset: builder.mutation<TokenResponse, { phone: string; otp: string; newPin: string }>({
      query: (body) => ({ url: "/api/v1/auth/pin/reset/confirm", method: "POST", body }),
      invalidatesTags: ["Profile"],
    }),
    confirmEmailPinReset: builder.mutation<TokenResponse, EmailOtpBody & { otp: string; newPin: string }>({
      query: (body) => ({ url: "/api/v1/auth/pin/reset/email/confirm", method: "POST", body }),
      invalidatesTags: ["Profile"],
    }),
    changePin: builder.mutation<TokenResponse, { currentPin: string; otp: string; newPin: string }>({
      query: (body) => ({ url: "/api/v1/auth/pin/change", method: "POST", body }),
      invalidatesTags: ["Profile"],
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
  useChangePinMutation,
  useConfirmEmailLoginMutation,
  useConfirmEmailPinResetMutation,
  useConfirmPinResetMutation,
  useGetEmailRecoveryStatusQuery,
  useGetMyIdentityQuery,
  useGetProfileQuery,
  useLazyGetProfileQuery,
  useListSessionsQuery,
  useLoginWithPinMutation,
  useRegisterOwnerMutation,
  useRegisterUserMutation,
  useRequestEmailLoginMutation,
  useRequestEmailPinResetMutation,
  useRequestEmailVerificationMutation,
  useRequestOtpMutation,
  useRequestPinResetMutation,
  useRevokeSessionMutation,
  useSetPinMutation,
  useUpdateMyIdentityMutation,
  useUpdateProfileMutation,
  useUpdateRecoveryEmailMutation,
  useVerifyEmailPinResetMutation,
  useVerifyOtpMutation,
} = authApi;