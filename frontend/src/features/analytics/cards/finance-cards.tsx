import { useState } from "react";
import { Text, View } from "react-native";

import { BarList } from "@/components/charts/bar-list";
import { BudgetColumns } from "@/components/charts/budget-columns";
import { ChartCard, ChartDropdown, type InfoPoint } from "@/components/charts/chart-card";
import { Donut } from "@/components/charts/donut";
import { LineChart } from "@/components/charts/line-chart";
import { Meter } from "@/components/charts/meter";
import { PairedColumns } from "@/components/charts/paired-columns";
import { SegmentedBar } from "@/components/charts/segmented-bar";
import { HeroFigure, StatTile } from "@/components/charts/stat-tile";
import { moneyDelta, pointsDelta } from "@/features/analytics/cards/card-helpers";
import { compactPaise, formatPaise, percentChange, percentOf } from "@/features/analytics/format";
import { bucketLabel, formatMonthRange } from "@/features/analytics/period";
import type { CardProps } from "@/features/analytics/registry";
import { figureOf, type MetricResult, type Part } from "@/features/analytics/types";
import { useChartPalette } from "@/theme/chart-colors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const figure = (metric: MetricResult, key: string) => figureOf(metric, key)?.value ?? 0;
const previousOf = (metric: MetricResult, key: string) => figureOf(metric, key)?.previous ?? null;

/** Axis ticks in rupees, with a sign for losses. */
const moneyTick = (paise: number) => (paise === 0 ? "₹0" : compactPaise(paise));

/** "+₹5K" / "-₹2K": a bucket's net, printed under its columns. */
const signedCompact = (paise: number) => `${paise > 0 ? "+" : ""}${compactPaise(paise)}`;

function marginOf(net: number, income: number): number | null {
  return income > 0 ? Math.round((net * 100) / income) : null;
}

/** The app's names for the lines the system adds, which come as codes rather than typed names. */
const SYSTEM_LABELS: Record<string, string> = { OTHER: "Other", SALARY_ESTIMATED: "Salary (estimated)" };

/** A part's label: the name the owner typed, or the app's name for a system line. */
const partLabel = (part: Part) => SYSTEM_LABELS[part.key] ?? part.label ?? part.key;

const MONEY_INFO_WHOLE_MONTHS = "Counted by whole months, the same way as the Profit and loss screen.";

export function DepositsCard({ metric, onRetry }: CardProps) {
  const heldAccounts = figure(metric, "held_accounts");
  const awaitingAccounts = figure(metric, "awaiting_accounts");
  return (
    <ChartCard
      emptyText="No deposits held right now"
      info={[
        "Held: deposits tenants have paid that you still hold.",
        "Awaiting settlement: stays that have ended whose deposit is yet to be paid back.",
        {
          formula: ["Deposit", "=", "Paid in − Taken out"],
          note: "Taken out covers deductions and anything already paid back. Held adds up running stays, awaiting settlement adds up ended ones.",
        },
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Deposits"
    >
      <View style={{ gap: spacing.sm }}>
        <StatTile caption={`${heldAccounts} ${heldAccounts === 1 ? "tenant" : "tenants"}`} label="Held" value={formatPaise(figure(metric, "held"))} />
        <StatTile caption={`${awaitingAccounts} ended ${awaitingAccounts === 1 ? "stay" : "stays"}`} label="Awaiting settlement" value={formatPaise(figure(metric, "awaiting"))} />
      </View>
    </ChartCard>
  );
}

export function FixedVariableCard({ metric, onRetry }: CardProps) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const fixed = figure(metric, "fixed");
  const variable = figure(metric, "variable");
  const segments = [
    { color: palette.series[0], key: "FIXED", label: "Fixed", value: Math.max(0, fixed), valueText: formatPaise(fixed) },
    { color: palette.series[1], key: "VARIABLE", label: "Variable", value: Math.max(0, variable), valueText: formatPaise(variable) },
  ];
  return (
    <ChartCard
      emptyText="No expenses recorded in this period"
      footnote={`${formatPaise(fixed + variable)} spent in all`}
      info={[
        "Fixed: costs that repeat every month, your recurring expenses and staff salary.",
        "Variable: everything else you spent.",
        {
          formula: ["Fixed", "=", "Recurring expenses + Estimated salary"],
          note: "Estimated salary is the current month's staff pay, as on the Profit and loss screen, whether or not it has been paid yet. Past months count no salary, the same as that screen.",
        },
        { formula: ["Variable", "=", "All expenses − Fixed"], note: "All expenses is the Expenses figure on Income and expenses, so the two always add up to it." },
        "A reversed entry is taken off the cost it reverses.",
        MONEY_INFO_WHOLE_MONTHS,
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Fixed and variable costs"
    >
      <SegmentedBar accessibilityLabel={`Fixed ${formatPaise(fixed)}, variable ${formatPaise(variable)}`} segments={segments} />
      {metric.parts.length > 0 ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>Largest fixed costs</Text>
          <BarList
            rows={metric.parts.map((part) => ({
              color: part.key === "OTHER" ? palette.other : palette.series[0],
              key: part.key,
              label: partLabel(part),
              value: part.value,
              valueText: formatPaise(part.value),
            }))}
          />
        </View>
      ) : null}
    </ChartCard>
  );
}

export function IncomeVsExpensesCard({ compareLabel, metric, onRetry, period }: CardProps) {
  const palette = useChartPalette();
  const net = figure(metric, "net");
  const netDelta = moneyDelta(net, previousOf(metric, "net"), compareLabel, true);
  const trend = metric.series.length > 1;
  return (
    <ChartCard
      info={[
        "Income: rent and one-off bills raised, plus income you added yourself.",
        "Expenses: everything you recorded, plus this month's estimated salaries.",
        { formula: ["Income", "=", "Bills raised + Income you added"] },
        { formula: ["Expenses", "=", "Recorded expenses + Estimated salaries"], note: "Estimated salaries count for the current month only." },
        { formula: ["Profit", "=", "Income − Expenses"] },
        MONEY_INFO_WHOLE_MONTHS,
        ...(trend ? ["Tap a month to see its figures."] : []),
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Income and expenses"
    >
      <HeroFigure delta={netDelta} suffix={net < 0 ? "loss" : "profit"} value={formatPaise(net)} />
      {trend ? (
        <PairedColumns
          accessibilityLabel={metric.series.map((point) => `${bucketLabel(point.from, point.to, period.bucket)}: income ${formatPaise(point.values.income ?? 0)}, expenses ${formatPaise(point.values.expenses ?? 0)}`).join(". ")}
          buckets={metric.series.map((point) => ({
            a: point.values.income ?? 0,
            b: point.values.expenses ?? 0,
            footer: signedCompact(point.values.net ?? 0),
            key: point.from,
            label: bucketLabel(point.from, point.to, period.bucket),
          }))}
          formatTick={moneyTick}
          formatValue={formatPaise}
          seriesA={{ color: palette.series[0], label: "Income" }}
          seriesB={{ color: palette.series[1], label: "Expenses" }}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <StatTile delta={moneyDelta(figure(metric, "income"), previousOf(metric, "income"), compareLabel, true)} label="Income" value={formatPaise(figure(metric, "income"))} />
          <StatTile delta={moneyDelta(figure(metric, "expenses"), previousOf(metric, "expenses"), compareLabel, false)} label="Expenses" value={formatPaise(figure(metric, "expenses"))} />
        </View>
      )}
    </ChartCard>
  );
}

export function ProfitMarginCard({ compareLabel, metric, onRetry, period }: CardProps) {
  const margin = marginOf(figure(metric, "net"), figure(metric, "income"));
  const previousIncome = previousOf(metric, "income");
  const previousNet = previousOf(metric, "net");
  const previousMargin = previousIncome !== null && previousNet !== null ? marginOf(previousNet, previousIncome) : null;
  const trend = metric.series.length > 1;
  const buckets = metric.series.map((point) => ({
    key: point.from,
    label: bucketLabel(point.from, point.to, period.bucket),
    value: marginOf(point.values.net ?? 0, point.values.income ?? 0),
  }));
  return (
    <ChartCard
      emptyText="No income in this period, so there is no margin"
      info={[
        "Profit margin: how much of your income you keep as profit.",
        { formula: ["Profit margin", "=", { over: ["Profit", "Income"] }, "× 100"], note: "Each month on the chart uses only that month's figures." },
        "A month with no income has no margin, so the line breaks there.",
        MONEY_INFO_WHOLE_MONTHS,
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Profit margin"
    >
      <HeroFigure delta={pointsDelta(margin, previousMargin, compareLabel)} value={margin === null ? "—" : `${margin}%`} />
      {trend ? (
        <LineChart
          accessibilityLabel={buckets.map((bucket) => `${bucket.label} ${bucket.value === null ? "no income" : `${bucket.value}%`}`).join(", ")}
          buckets={buckets}
          formatTick={(value) => `${value}%`}
          formatValue={(value) => `${value}%`}
        />
      ) : null}
    </ChartCard>
  );
}

/**
 * The donut is the billed money, split into what has come in and what has not:
 * that split is exactly the gap between the two profits beneath it.
 */
export function AccrualVsCashCard({ metric, onRetry }: CardProps) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const billed = figure(metric, "billed");
  const collected = Math.min(figure(metric, "collected"), billed);
  const outstanding = Math.max(0, billed - collected);
  const slices = [
    { color: palette.status.good, key: "COLLECTED", label: "Collected", value: collected, valueText: formatPaise(collected) },
    { color: palette.status.warning, key: "OUTSTANDING", label: "Still to come in", value: outstanding, valueText: formatPaise(outstanding) },
  ];
  const profitRow = (label: string, value: number) => (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: value < 0 ? colors.danger : colors.ink, fontFamily: fonts.display, fontSize: 16, fontVariant: ["tabular-nums"] }}>{formatPaise(value)}</Text>
    </View>
  );
  return (
    <ChartCard
      info={[
        "The ring is the money you billed, split into what tenants have paid and what is still to come in.",
        { formula: ["Collected", "=", { over: ["Money collected", "Bills raised"] }, "× 100"] },
        { formula: ["Profit on bills raised", "=", "Bills raised + Income you added − Expenses"], note: "Counts every bill raised, paid or not." },
        { formula: ["Profit on cash received", "=", "Money collected + Income you added − Expenses"], note: "Counts only what tenants have actually paid." },
        "The two differ by the money still to come in.",
        MONEY_INFO_WHOLE_MONTHS,
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Profit on bills and on cash"
    >
      <Donut
        accessibilityLabel={`Billed ${formatPaise(billed)}: collected ${formatPaise(collected)}, still to come in ${formatPaise(outstanding)}`}
        centerLabel="collected"
        centerValue={`${percentOf(collected, billed) ?? 0}%`}
        slices={slices}
      />
      <View style={{ borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, marginTop: spacing.xs, paddingTop: spacing.sm }}>
        {profitRow("Profit on bills raised", figure(metric, "accrual_net"))}
        {profitRow("Profit on cash received", figure(metric, "cash_net"))}
      </View>
    </ChartCard>
  );
}

/**
 * Each month is worked out on its own (collected ÷ beds, expenses ÷ beds), and a
 * longer period shows the average of those months, never one pooled total.
 */
type PerBedKey = "expense_per_bed" | "income_per_bed" | "profit_per_bed";

const PER_BED_LINES: { key: PerBedKey; label: string }[] = [
  { key: "expense_per_bed", label: "Cost per bed" },
  { key: "income_per_bed", label: "Income per bed" },
  { key: "profit_per_bed", label: "Profit per bed" },
];

const TREND_TITLES = { MONTH: "Month by month", NONE: "Month by month", QUARTER: "Quarter by quarter", YEAR: "Year by year" } as const;

export function PerBedCard({ compareLabel, metric, onRetry, period }: CardProps) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const [line, setLine] = useState<PerBedKey>("expense_per_bed");
  const months = figure(metric, "months");
  const averaged = period.bucket !== "NONE";
  // The line needs more than two points to say anything a pair of tiles cannot.
  const trend = averaged && metric.series.length > 2;
  const caption = averaged ? `${months} ${months === 1 ? "month" : "months"}` : formatMonthRange(period.from, period.to);
  const label = (name: string) => (averaged ? `Avg ${name.toLowerCase()} per bed` : `${name} per bed`);
  // A single month is compared with the month before. An average has its line instead.
  const delta = (key: PerBedKey, higherIsBetter: boolean) =>
    averaged ? null : moneyDelta(figure(metric, key), previousOf(metric, key), compareLabel, higherIsBetter);
  const days = figure(metric, "days");
  const beds = days > 0 ? Math.round((figure(metric, "occupied_bed_days") * 10) / days) / 10 : 0;
  const profit = figure(metric, "profit_per_bed");
  // Income and cost keep the colours they have on Income and expenses.
  const lineColor = { expense_per_bed: palette.series[1], income_per_bed: palette.series[0], profit_per_bed: palette.series[2] }[line];
  const lineLabel = PER_BED_LINES.find((option) => option.key === line)?.label ?? "";
  const buckets = metric.series.map((point) => ({
    key: point.from,
    label: bucketLabel(point.from, point.to, period.bucket),
    value: point.values[line] ?? null,
  }));
  return (
    <ChartCard
      emptyText="No beds were occupied in this period"
      footnote={`About ${beds} ${beds === 1 ? "bed" : "beds"} occupied on average`}
      info={[
        {
          formula: ["Income per bed", "=", { over: ["Money collected in the month", "Beds occupied"] }],
          note: "Only money collected from tenants. Income you added yourself is not counted.",
        },
        { formula: ["Cost per bed", "=", { over: ["Expenses in the month", "Beds occupied"] }] },
        { formula: ["Profit per bed", "=", "Income per bed − Cost per bed"] },
        {
          formula: ["Beds occupied", "=", { over: ["Bed-nights in the month", "Days in the month"] }],
          note: "A bed taken for half the month counts as half a bed.",
        },
        ...(averaged
          ? [
              {
                formula: ["Avg per bed", "=", { over: ["Sum of each month's per-bed figure", "Number of months"] }],
                note: "Each month is worked out on its own first. Months before this property joined Khatiyan, or with no bed occupied, are left out.",
              } satisfies InfoPoint,
            ]
          : []),
        ...(trend ? ["The line: how the figure moved over the period. Choose cost, income or profit from the menu above it, and tap a point to see its value."] : []),
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Per occupied bed"
    >
      <View style={{ gap: spacing.sm }}>
        <StatTile caption={caption} delta={delta("income_per_bed", true)} label={label("Income")} value={formatPaise(figure(metric, "income_per_bed"))} />
        <StatTile caption={caption} delta={delta("expense_per_bed", false)} label={label("Cost")} value={formatPaise(figure(metric, "expense_per_bed"))} />
        <StatTile caption={caption} danger={profit < 0} delta={delta("profit_per_bed", true)} label={label("Profit")} value={formatPaise(profit)} />
      </View>
      {trend ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>{TREND_TITLES[period.bucket]}</Text>
            <ChartDropdown accessibilityLabel="Line shows" onChange={setLine} options={PER_BED_LINES} value={line} />
          </View>
          <LineChart
            accessibilityLabel={`${lineLabel}: ${buckets.map((bucket) => `${bucket.label} ${bucket.value === null ? "no beds occupied" : formatPaise(bucket.value)}`).join(", ")}`}
            buckets={buckets}
            color={lineColor}
            formatTick={moneyTick}
            formatValue={compactPaise}
          />
        </View>
      ) : null}
    </ChartCard>
  );
}

export function ExpenseCategoriesCard({ compareLabel, metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const total = metric.parts.reduce((sum, part) => sum + part.value, 0);
  const slices = metric.parts.map((part, index) => {
    const change = percentChange(part.value, previousOf(metric, part.key) ?? 0);
    const previous = previousOf(metric, part.key);
    const note = compareLabel && previous !== null && change !== null && change !== 0 ? `${change > 0 ? "▲" : "▼"}${Math.abs(change)}%` : null;
    return {
      color: part.key === "OTHER" ? palette.other : palette.series[index],
      key: part.key,
      label: partLabel(part),
      note,
      noteTone: (change ?? 0) > 0 ? ("bad" as const) : ("good" as const),
      value: part.value,
      valueText: compactPaise(part.value),
    };
  });
  return (
    <ChartCard
      emptyText="No expenses recorded in this period"
      info={[
        "Your own expense categories, largest first.",
        { formula: ["Category total", "=", "Its expenses − Reversals"], note: "The four largest are shown, the rest are grouped as Other." },
        "Salary (estimated): this month's estimated staff pay, as on the Profit and loss screen.",
        ...(compareLabel ? [`The change is against ${compareLabel}.`] : []),
        MONEY_INFO_WHOLE_MONTHS,
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Spending by category"
    >
      <Donut accessibilityLabel={slices.map((slice) => `${slice.label} ${formatPaise(slice.value)}`).join(", ")} centerLabel="spent" centerValue={compactPaise(total)} slices={slices} />
    </ChartCard>
  );
}

export function BudgetCard({ metric, onRetry }: CardProps) {
  const { colors, fonts } = useTheme();
  const over = figure(metric, "months_over");
  const withBudget = figure(metric, "months_with_budget");
  const months = metric.series.map((point) => ({
    budget: point.values.budget ?? null,
    key: point.from,
    label: bucketLabel(point.from, point.to, "MONTH"),
    spent: point.values.spent ?? 0,
  }));
  const single = months.length === 1 ? months[0] : null;
  const firstMonth = metric.series[0];
  return (
    <ChartCard
      emptyText="No whole month in this period to measure"
      footnote={!single ? (withBudget > 0 ? `${over} of ${withBudget} ${withBudget === 1 ? "month" : "months"} over budget` : "No budget set for these months") : null}
      info={[
        "Your monthly budget against what you spent, the same as the Budget screen.",
        { formula: ["Month's budget", "=", "Budget + Raises"] },
        { formula: ["Left", "=", "Month's budget − Spent"], note: "Below zero means over budget, and the month turns red." },
        "Counts whole months. The current month counts what you have spent so far against its full budget.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Budget"
    >
      {single ? (
        single.budget !== null ? (
          <Meter
            caption={`${formatPaise(single.spent)} of ${formatPaise(single.budget)}`}
            fraction={single.budget > 0 ? single.spent / single.budget : 1}
            label={`Spent in ${formatMonthRange(firstMonth.from, firstMonth.to)}`}
            trailingCaption={single.spent > single.budget ? `Over by ${formatPaise(single.spent - single.budget)}` : `${formatPaise(single.budget - single.spent)} left`}
            trailingTone={single.spent > single.budget ? "bad" : "good"}
            valueText={`${percentOf(single.spent, single.budget) ?? 0}%`}
          />
        ) : (
          <View style={{ gap: 2 }}>
            <HeroFigure suffix="spent" value={formatPaise(single.spent)} />
            <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>No budget set for {formatMonthRange(firstMonth.from, firstMonth.to)}</Text>
          </View>
        )
      ) : (
        <BudgetColumns
          accessibilityLabel={months.map((month) => `${month.label}: spent ${formatPaise(month.spent)}${month.budget !== null ? ` of ${formatPaise(month.budget)}` : ""}`).join(", ")}
          formatTick={moneyTick}
          formatValue={compactPaise}
          months={months}
        />
      )}
    </ChartCard>
  );
}

function NamedAmountsCard({ emptyText, info, metric, onRetry, title }: CardProps & { emptyText: string; info: InfoPoint[]; title: string }) {
  const palette = useChartPalette();
  return (
    <ChartCard emptyText={emptyText} info={info} onRetry={onRetry} sampleSize={metric.sampleSize} status={metric.status} title={title}>
      <BarList
        rows={metric.parts.map((part) => ({
          color: part.key === "OTHER" ? palette.other : palette.series[0],
          key: part.key,
          label: partLabel(part),
          value: part.value,
          valueText: formatPaise(part.value),
        }))}
      />
    </ChartCard>
  );
}

export function TopPayeesCard(props: CardProps) {
  return (
    <NamedAmountsCard
      {...props}
      emptyText="No payees recorded in this period"
      info={[
        "Who you paid the most in this period.",
        { formula: ["Paid to a payee", "=", "Expenses paid to them − Reversals"], note: "The five largest are shown, the rest are grouped as Other." },
        MONEY_INFO_WHOLE_MONTHS,
      ]}
      title="Top payees"
    />
  );
}

export function OtherIncomeCard(props: CardProps) {
  return (
    <NamedAmountsCard
      {...props}
      emptyText="No income added outside billing"
      info={[
        "Income you added yourself, outside billing, by source.",
        { formula: ["Source total", "=", "Its income entries − Reversals"], note: "The five largest are shown, the rest are grouped as Other." },
        MONEY_INFO_WHOLE_MONTHS,
      ]}
      title="Other income"
    />
  );
}

