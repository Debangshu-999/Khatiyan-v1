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

export type TokenResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: AuthUser;
};

export type OtpVerifyResponse = {
  phone: string;
  purpose: "LOGIN" | "PIN_RESET" | "NEW_DEVICE";
  verified: boolean;
  pinRequired: boolean;
};

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProfile: builder.query<AuthUser, void>({
      query: () => "/api/v1/auth/me",
      providesTags: ["Profile"],
    }),
    loginWithPin: builder.mutation<TokenResponse, { phone: string; pin: string }>({
      query: (body) => ({
        url: "/api/v1/auth/pin/login",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Profile", "Notification"],
    }),
    registerUser: builder.mutation<void, { phone: string; fullName: string }>({
      query: (body) => ({
        url: "/api/v1/auth/user/register",
        method: "POST",
        body,
      }),
    }),
    registerOwner: builder.mutation<void, { phone: string; fullName: string }>({
      query: (body) => ({
        url: "/api/v1/auth/owner/register",
        method: "POST",
        body,
      }),
    }),
    requestOtp: builder.mutation<void, { phone: string; purpose: "LOGIN" | "PIN_RESET"; channel?: "SMS" | "SMS_AND_WHATSAPP" }>({
      query: (body) => ({
        url: "/api/v1/auth/otp/request",
        method: "POST",
        body,
      }),
    }),
    verifyOtp: builder.mutation<OtpVerifyResponse, { phone: string; otp: string; purpose: "LOGIN" | "PIN_RESET" }>({
      query: (body) => ({
        url: "/api/v1/auth/otp/verify",
        method: "POST",
        body,
      }),
    }),
    setPin: builder.mutation<TokenResponse, { phone: string; otp: string; pin: string }>({
      query: (body) => ({
        url: "/api/v1/auth/pin/set",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Profile"],
    }),
    requestPinReset: builder.mutation<void, { phone: string; channel?: "SMS" | "SMS_AND_WHATSAPP" }>({
      query: (body) => ({
        url: "/api/v1/auth/pin/reset/request",
        method: "POST",
        body,
      }),
    }),
    confirmPinReset: builder.mutation<TokenResponse, { phone: string; otp: string; newPin: string }>({
      query: (body) => ({
        url: "/api/v1/auth/pin/reset/confirm",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Profile"],
    }),
    changePin: builder.mutation<TokenResponse, { currentPin: string; otp: string; newPin: string }>({
      query: (body) => ({
        url: "/api/v1/auth/pin/change",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Profile"],
    }),
  }),
});

export const {
  useChangePinMutation,
  useConfirmPinResetMutation,
  useGetProfileQuery,
  useLazyGetProfileQuery,
  useLoginWithPinMutation,
  useRegisterOwnerMutation,
  useRegisterUserMutation,
  useRequestOtpMutation,
  useRequestPinResetMutation,
  useSetPinMutation,
  useVerifyOtpMutation,
} = authApi;
