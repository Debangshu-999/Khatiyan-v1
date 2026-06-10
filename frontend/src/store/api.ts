import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import type { RootState } from "@/store/store";

export const api = createApi({
  reducerPath: "api",
  baseQuery: async (args, apiContext, extraOptions) => {
    const state = apiContext.getState() as RootState;
    const rawBaseUrl = state.appConfig.apiBaseUrl.trim();
    const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
    const baseQuery = fetchBaseQuery({
      baseUrl,
      prepareHeaders: (headers, { getState }) => {
        const token = (getState() as RootState).auth.accessToken;
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return headers;
      },
    });

    return baseQuery(args, apiContext, extraOptions);
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
  ],
});
