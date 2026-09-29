import type { AnalyticsDivision, AnalyticsResponse, PeriodPreset } from "@/features/analytics/types";
import { api } from "@/store/api";

export type DivisionAnalyticsArgs = {
  propertyId: string;
  division: AnalyticsDivision;
  period: PeriodPreset;
  from?: string;
  to?: string;
};

export const analyticsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDivisionAnalytics: builder.query<AnalyticsResponse, DivisionAnalyticsArgs>({
      query: ({ division, from, period, propertyId, to }) => ({
        params: period === "CUSTOM" ? { from, period, to } : { period },
        url: `/api/v1/analytics/properties/${propertyId}/${division}`,
      }),
      providesTags: ["Analytics"],
    }),
  }),
  // Fast Refresh re-runs this module on every edit; see dashboard-api.ts.
  overrideExisting: __DEV__ ? true : "throw",
});

export const { useGetDivisionAnalyticsQuery } = analyticsApi;
