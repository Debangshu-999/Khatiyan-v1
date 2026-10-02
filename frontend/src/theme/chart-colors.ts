import { useTheme } from "@/theme/use-theme";
import type { ThemeMode } from "@/theme/colors";

/**
 * The chart palette, validated 2026-09-26 with the dataviz validator against
 * the app's own surfaces (#FFFFFF light, #101010 dark). Every check passes. The
 * light-mode contrast warning on aqua, yellow and pink is why every chart
 * prints its values in the legend.
 *
 * The ORDER is the colour-blind safety mechanism: never re-order it, cycle it,
 * or generate a ninth colour. Past eight, fold into "Other".
 */
export type ChartPalette = {
  series: readonly string[];
  /**
   * The two colours of a chart that compares exactly two series side by side
   * (income and expenses, moved in and moved out).
   *
   * Not `series[0]` and `series[1]`: blue beside orange is the loudest pair in
   * the palette, and a chart of nothing but that pair read as a clash (user,
   * 2026-10-02). The first stays the series blue, so an entity keeps its
   * colour. Both pairs pass the dataviz validator on their own surface.
   */
  pair: readonly [string, string];
  other: string;
  track: string;
  grid: string;
  baseline: string;
  axis: string;
  /** Ordinal steps, lightest first. Darker means older or longer. */
  ramp: readonly string[];
  status: { good: string; info: string; warning: string; serious: string; critical: string; neutral: string };
};

export const chartPalettes: Record<ThemeMode, ChartPalette> = {
  dark: {
    axis: "#737373",
    baseline: "#3A3A3A",
    grid: "#262626",
    other: "#64748B",
    // Blue with the palette's own green. A lighter blue cannot work here: inside
    // the dark surface's lightness band the two blues are too close to tell apart.
    pair: ["#3987e5", "#199e70"],
    // Evenly stepped in OKLab lightness (~0.12 apart), same blue. The old steps
    // were ~0.07 apart, and 25–34 against 35–44 on the age donut read as one colour.
    ramp: ["#01499b", "#1e6ccf", "#4691f8", "#89bafe", "#c5ddff"],
    series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
    status: { critical: "#F87171", good: "#34D399", info: "#8FB2FF", neutral: "#64748B", serious: "#E0916F", warning: "#FBBF24" },
    track: "#2a2a2a",
  },
  light: {
    axis: "#94A3B8",
    baseline: "#CBD5E1",
    grid: "#E5E7EB",
    other: "#94A3B8",
    // Blue with a lighter blue, the ramp's first step. Told apart by lightness,
    // so it holds for colour-blind readers, and the legend prints both values.
    pair: ["#3F6ED8", "#80b5fe"],
    // Evenly stepped in OKLab lightness (~0.11 apart), same blue, light end kept
    // at 2:1 against the surface. See the dark palette for why.
    ramp: ["#80b5fe", "#4590f6", "#206dd0", "#004da3", "#01316d"],
    series: ["#3F6ED8", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
    status: { critical: "#DC2626", good: "#047857", info: "#3F6ED8", neutral: "#94A3B8", serious: "#ec835a", warning: "#F59E0B" },
    track: "#E9EDF2",
  },
};

export function useChartPalette(): ChartPalette {
  const { mode } = useTheme();
  return chartPalettes[mode];
}
