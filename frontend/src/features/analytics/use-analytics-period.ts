import { useCallback, useEffect } from "react";

import { loadAnalyticsPresetForUser, saveAnalyticsPresetForUser } from "@/config/app-settings-storage";
import { PRESET_ORDER, type PeriodPreset } from "@/features/analytics/period";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { hydrateAnalyticsPeriod, setAnalyticsPeriod } from "@/store/slices/analytics-period-slice";

function savedPreset(value: string | undefined): PeriodPreset | undefined {
  return PRESET_ORDER.find((preset) => preset === value && preset !== "CUSTOM");
}

/** The period every division screen shares, restored per user from the last preset they picked. */
export function useAnalyticsPeriod() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.auth.user?.id);
  const period = useAppSelector((state) => state.analyticsPeriod);

  useEffect(() => {
    if (period.hydrated || !userId) return;
    let cancelled = false;
    loadAnalyticsPresetForUser(userId)
      .then((value) => {
        if (!cancelled) dispatch(hydrateAnalyticsPeriod(savedPreset(value)));
      })
      .catch(() => {
        if (!cancelled) dispatch(hydrateAnalyticsPeriod(undefined));
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, period.hydrated, userId]);

  const setPeriod = useCallback(
    (next: { preset: PeriodPreset; from?: string; to?: string }) => {
      dispatch(setAnalyticsPeriod(next));
      if (userId && next.preset !== "CUSTOM") void saveAnalyticsPresetForUser(userId, next.preset);
    },
    [dispatch, userId],
  );

  return { period, setPeriod };
}
