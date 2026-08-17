import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import { checkResponseShape } from "@/store/response-guards";
import { sessionExpired } from "@/store/slices/auth-slice";
import type { RootState } from "@/store/store";

export const api = createApi({
  reducerPath: "api",
  baseQuery: async (args, apiContext, extraOptions) => {
    const state = apiContext.getState() as RootState;
    // Read before the request: by the time it returns, another failing call may
    // already have cleared the token, and this one would then look like an
    // unauthenticated request that was always going to 401.
    const hadToken = Boolean(state.auth.accessToken);
    const rawBaseUrl = state.appConfig.apiBaseUrl.trim();
    const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
    const baseQuery = fetchBaseQuery({
      baseUrl,
      // Without this a request has no deadline at all. A refused connection
      // fails fast, so a stopped backend was never the problem — but a backend
      // that accepts the socket and never answers (hung, deadlocked, or simply
      // the wrong LAN IP where packets are dropped rather than rejected) leaves
      // the request hanging on the OS TCP timeout, which is minutes on Android.
      // The user sees a spinner that never resolves and no way to tell why.
      // 20s is well past a slow mobile round trip and well short of that.
      timeout: 20_000,
      prepareHeaders: (headers, { getState }) => {
        const token = (getState() as RootState).auth.accessToken;
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return headers;
      },
    });

    const result = await baseQuery(args, apiContext, extraOptions);

    // A token we were holding has been refused — expired, or invalidated by a
    // PIN change on another device. Caught here because every request passes
    // through this one function; screens used to each render their own empty
    // state instead, so an expired session looked like a page with no data
    // until a pull-to-refresh happened to bounce someone to sign-in.
    //
    // `hadToken` is the whole guard: a 401 from the sign-in endpoints means a
    // wrong PIN, not a dead session, and announcing "your session expired" to
    // someone who is not signed in would be nonsense.
    if (result.error?.status === 401 && hadToken) {
      apiContext.dispatch(sessionExpired());
    }

    // Verify what actually arrived against the shape the client claims. Dev-only
    // and warn-only — see response-guards for why.
    if (result.data !== undefined) {
      checkResponseShape(apiContext.endpoint, result.data);
    }

    return result;
  },
  endpoints: () => ({}),
  tagTypes: [
    "Profile",
    "Property",
    "Tenancy",
    "BillingCycle",
    "Concern",
    "Notice",
    "Notification",
    "Discovery",
    "Payment",
    "Deposit",
    "Staff",
    "Expense",
    "Pnl",
    "Payout",
    "Compliance",
    "Nudge",
    // Separate from "Nudge" so reading the tenant's list can refresh the badge
    // without invalidating the list it just fetched.
    "NudgeUnread",
    "Enquiry",
  ],
});
