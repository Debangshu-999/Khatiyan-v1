import type { PeriodPreset, PeriodResponse } from "@/features/analytics/period";

export type { PeriodPreset, PeriodResponse };

export type AnalyticsDivision = "billing" | "finance" | "tenants" | "concerns";
export type MetricUnit = "PAISE" | "COUNT" | "MINUTES" | "DAYS" | "BASIS_POINTS";
export type MetricStatus = "OK" | "TOO_FEW" | "NO_DATA" | "UNAVAILABLE";

export type Figure = { key: string; unit: MetricUnit; value: number; previous: number | null };
export type Part = { key: string; label: string | null; value: number; count: number | null };
export type SeriesPoint = { from: string; to: string; values: Record<string, number> };

export type MetricResult = {
  key: string;
  scope: "NOW" | "PERIOD";
  status: MetricStatus;
  sampleSize: number;
  figures: Figure[];
  parts: Part[];
  series: SeriesPoint[];
  partUnit: MetricUnit | null;
  seriesUnit: MetricUnit | null;
};

export type AnalyticsResponse = {
  division: "BILLING" | "FINANCE" | "TENANTS" | "CONCERNS";
  period: PeriodResponse;
  metrics: MetricResult[];
};

export function figureOf(metric: MetricResult | undefined, key: string): Figure | undefined {
  return metric?.figures.find((figure) => figure.key === key);
}

export function partOf(metric: MetricResult | undefined, key: string): Part | undefined {
  return metric?.parts.find((part) => part.key === key);
}
