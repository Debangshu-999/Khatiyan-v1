import type { Delta } from "@/components/charts/stat-tile";
import { percentChange } from "@/features/analytics/format";
import { partOf, type MetricResult } from "@/features/analytics/types";

/** A part's value, or 0 when the server sent no such part. */
export const partValue = (metric: MetricResult | undefined, key: string) => partOf(metric, key)?.value ?? 0;

export const bills = (n: number) => `${n} ${n === 1 ? "bill" : "bills"}`;

/**
 * "8% vs Aug 2026", coloured by whether the move is good. Null when there is no
 * comparison, nothing to compare against, or no change.
 */
export function moneyDelta(current: number, previous: number | null | undefined, compareLabel: string | null, higherIsBetter: boolean): Delta | null {
  if (previous == null || !compareLabel) return null;
  const change = percentChange(current, previous);
  if (change === null || change === 0) return null;
  const up = change > 0;
  return { direction: up ? "up" : "down", text: `${Math.abs(change)}% vs ${compareLabel}`, tone: up === higherIsBetter ? "good" : "bad" };
}

/** "+2 vs Aug 2026": a change in a small count, shown as the difference, since 1 to 3 is not usefully "200%". */
export function countDelta(current: number, previous: number | null | undefined, compareLabel: string | null, higherIsBetter: boolean): Delta | null {
  if (previous == null || !compareLabel || current === previous) return null;
  const up = current > previous;
  return { direction: up ? "up" : "down", text: `${up ? "+" : "−"}${Math.abs(current - previous)} vs ${compareLabel}`, tone: up === higherIsBetter ? "good" : "bad" };
}

/** "4 pts vs Aug 2026": a change between two percentages. */
export function pointsDelta(current: number | null, previous: number | null, compareLabel: string | null): Delta | null {
  if (current === null || previous === null || !compareLabel || current === previous) return null;
  const up = current > previous;
  return { direction: up ? "up" : "down", text: `${Math.abs(current - previous)} pts vs ${compareLabel}`, tone: up ? "good" : "bad" };
}
