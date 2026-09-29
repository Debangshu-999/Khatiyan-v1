import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { DEFAULT_PRESET, type PeriodPreset } from "@/features/analytics/period";

export type AnalyticsPeriodState = { preset: PeriodPreset; from?: string; to?: string; hydrated: boolean };

const initialState: AnalyticsPeriodState = { hydrated: false, preset: DEFAULT_PRESET };

/** One period for every division screen: switching Billing to Finance keeps it. */
const analyticsPeriodSlice = createSlice({
  initialState,
  name: "analyticsPeriod",
  reducers: {
    hydrateAnalyticsPeriod(state, action: PayloadAction<PeriodPreset | undefined>) {
      if (!state.hydrated && action.payload) state.preset = action.payload;
      state.hydrated = true;
    },
    setAnalyticsPeriod(state, action: PayloadAction<{ preset: PeriodPreset; from?: string; to?: string }>) {
      state.preset = action.payload.preset;
      state.from = action.payload.from;
      state.to = action.payload.to;
      state.hydrated = true;
    },
  },
});

export const { hydrateAnalyticsPeriod, setAnalyticsPeriod } = analyticsPeriodSlice.actions;
export const analyticsPeriodReducer = analyticsPeriodSlice.reducer;
