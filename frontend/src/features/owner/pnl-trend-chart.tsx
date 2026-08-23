import { DualBarChart } from "@/components/dual-bar-chart";
import type { PnlTrendPoint } from "@/store/services/pnl-api";
import { useTheme } from "@/theme/use-theme";

/**
 * Income against expense with a net line, shared by the P&L screen and the
 * owner dashboard's P&L snapshot.
 *
 * <p>Draws through {@link DualBarChart} rather than owning its own geometry.
 * The two had drifted into the same chart with different maths, and this one
 * was the worse of the pair: no y axis at all, a ceiling pinned to the tallest
 * month so every chart looked equally full, and — the reason it needed fixing
 * once an axis was added — a net line on its OWN hidden scale, centred on the
 * middle of the card. Against a labelled axis that line would have been read as
 * a rupee figure it never was. Here all three share one scale, so the net line
 * crossing an expense bar means exactly what it looks like it means.
 *
 * <p>No title: both callers already sit under a section heading.
 */
export function PnlTrendChart({ points }: { points: PnlTrendPoint[] }) {
  const { colors } = useTheme();

  return (
    <DualBarChart
      data={points.map((point) => ({
        label: monthShort(point.month),
        line: point.netPaise,
        primary: point.incomePaise,
        secondary: point.expensePaise,
      }))}
      lineColor={colors.primary}
      lineLabel="Net"
      mode="money"
      primaryColor={colors.jade}
      primaryLabel="Income"
      secondaryColor={colors.danger}
      secondaryLabel="Expense"
    />
  );
}

export function monthShort(iso?: string) {
  if (!iso) return "";
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(year, month - 1, 1));
}
