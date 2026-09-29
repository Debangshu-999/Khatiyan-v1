import { useState } from "react";
import { Text, View } from "react-native";

import { BarList } from "@/components/charts/bar-list";
import { ChartCard, ChartToggle } from "@/components/charts/chart-card";
import { Donut } from "@/components/charts/donut";
import { Meter } from "@/components/charts/meter";
import { OrderedColumns } from "@/components/charts/ordered-columns";
import { SegmentedBar } from "@/components/charts/segmented-bar";
import { HeroFigure, StatTile } from "@/components/charts/stat-tile";
import { bills, moneyDelta, partValue } from "@/features/analytics/cards/card-helpers";
import { compactPaise, formatPaise, percentOf } from "@/features/analytics/format";
import type { CardProps } from "@/features/analytics/registry";
import { figureOf, partOf } from "@/features/analytics/types";
import { ActionButton } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useChartPalette } from "@/theme/chart-colors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const value = partValue;

export function DuesCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const parts = [
    { color: palette.status.critical, key: "OVERDUE", label: "Overdue" },
    { color: palette.status.serious, key: "DUE_NOW", label: "Due now" },
    { color: palette.status.warning, key: "DUE_THIS_WEEK", label: "This week" },
    { color: palette.status.neutral, key: "LATER", label: "Later" },
  ].map((part) => ({ ...part, value: value(metric, part.key), valueText: formatPaise(value(metric, part.key)) }));
  return (
    <ChartCard
      emptyText="Nothing due right now"
      info={[
        "Money tenants still owe, counted right now.",
        "Overdue: past the due date and the grace days.",
        "Due now: the due date has come and the grace days are still running.",
        "This week: due in the next 7 days.",
        "Later: due after that, including bills already raised for next month.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Dues"
    >
      <HeroFigure suffix="due" value={formatPaise(figureOf(metric, "total")?.value ?? 0)} />
      <SegmentedBar accessibilityLabel={parts.map((part) => `${part.label} ${part.valueText}`).join(", ")} segments={parts} />
    </ChartCard>
  );
}

const AGEING = [
  { key: "D1_7", label: "1–7d" },
  { key: "D8_15", label: "8–15d" },
  { key: "D16_30", label: "16–30d" },
  { key: "D31_60", label: "31–60d" },
  { key: "D60_PLUS", label: "60+d" },
];

export function OverdueAgeingCard({ metric, onRetry }: CardProps) {
  const [mode, setMode] = useState<"amount" | "count">("amount");
  const buckets = AGEING.map((bucket) => {
    const part = partOf(metric, bucket.key);
    return { key: bucket.key, label: bucket.label, value: mode === "amount" ? part?.value ?? 0 : part?.count ?? 0 };
  });
  return (
    <ChartCard
      emptyText="No overdue bills"
      info={["Overdue bills by how many days they are past the due date.", "Switch between the amount owed and the number of bills.", "Tap a column to see its exact figure."]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Overdue ageing"
      trailing={<ChartToggle onChange={setMode} options={[{ key: "amount", label: "Amount" }, { key: "count", label: "Count" }]} value={mode} />}
    >
      <OrderedColumns
        accessibilityLabel={buckets.map((bucket) => `${bucket.label} ${mode === "amount" ? formatPaise(bucket.value) : bills(bucket.value)}`).join(", ")}
        buckets={buckets}
        formatTick={mode === "amount" ? (tick) => (tick === 0 ? "₹0" : compactPaise(tick)) : (tick) => String(tick)}
        formatValue={mode === "amount" ? formatPaise : bills}
        integer={mode === "count"}
      />
    </ChartCard>
  );
}

export function UpiClaimsCard({ metric, onRetry }: CardProps) {
  const { colors, fonts } = useTheme();
  const router = useGuardedRouter();
  const claims = figureOf(metric, "claims")?.value ?? 0;
  return (
    <ChartCard onRetry={onRetry} sampleSize={metric.sampleSize} status={metric.status} title="UPI claims to check">
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted, flex: 1 }}>
          {claims === 0 ? "Nothing waiting for your check" : `${claims} ${claims === 1 ? "claim" : "claims"} · ${formatPaise(figureOf(metric, "amount")?.value ?? 0)}`}
        </Text>
        {claims > 0 ? <ActionButton compact label="Review" onPress={() => router.push("/owner-payment-claims")} variant="outline" /> : null}
      </View>
    </ChartCard>
  );
}

export function CollectionRateCard({ compareLabel, metric, onRetry }: CardProps) {
  const collected = figureOf(metric, "collected");
  const billed = figureOf(metric, "billed");
  const rate = percentOf(collected?.value ?? 0, billed?.value ?? 0);
  const previousRate = collected?.previous != null && billed?.previous ? percentOf(collected.previous, billed.previous) : null;
  const points = rate !== null && previousRate !== null ? rate - previousRate : null;
  return (
    <ChartCard
      info={[
        "Bills for this period whose due date has come.",
        "Collected: what tenants have paid against those bills so far.",
        "Collection rate: collected out of billed.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Collections"
      tooFewText={`${bills(metric.sampleSize)} so far, too few to compare`}
    >
      <HeroFigure delta={moneyDelta(collected?.value ?? 0, collected?.previous, compareLabel, true)} value={formatPaise(collected?.value ?? 0)} />
      <Meter
        caption={`of ${formatPaise(billed?.value ?? 0)} billed`}
        fraction={rate === null ? 0 : rate / 100}
        label="Collection rate"
        trailingCaption={points ? `${points > 0 ? "▲" : "▼"} ${Math.abs(points)} pts` : null}
        trailingTone={points ? (points > 0 ? "good" : "bad") : "neutral"}
        valueText={rate === null ? "—" : `${rate}%`}
      />
    </ChartCard>
  );
}

export function StatusMixCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const cancelled = figureOf(metric, "cancelled")?.value ?? 0;
  const slices = [
    { color: palette.status.good, key: "PAID", label: "Paid" },
    { color: palette.status.warning, key: "UNPAID", label: "Unpaid" },
    { color: palette.status.critical, key: "OVERDUE", label: "Overdue" },
    { color: palette.status.info, key: "CONFIRMATION_PENDING", label: "Awaiting check" },
    { color: palette.status.neutral, key: "UPCOMING", label: "Upcoming" },
  ].map((slice) => ({ ...slice, value: value(metric, slice.key), valueText: String(value(metric, slice.key)) }));
  return (
    <ChartCard
      footnote={cancelled > 0 ? `${cancelled} cancelled ${cancelled === 1 ? "bill" : "bills"} not counted` : null}
      info={["Every bill for this period, by where it stands now.", "Awaiting check: the tenant says they paid and it needs your check.", "Cancelled bills are not counted."]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Bill status"
    >
      <Donut accessibilityLabel={slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")} centerLabel={metric.sampleSize === 1 ? "bill" : "bills"} centerValue={String(metric.sampleSize)} slices={slices} />
    </ChartCard>
  );
}

export function CollectionsByModeCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  const received = figureOf(metric, "received")?.value ?? 0;
  const payments = figureOf(metric, "payments")?.value ?? 0;
  const unrecorded = figureOf(metric, "unrecorded")?.value ?? 0;
  const slices = [
    { color: palette.series[0], key: "UPI", label: "UPI" },
    { color: palette.series[1], key: "CASH", label: "Cash" },
    { color: palette.series[2], key: "CARD", label: "Card" },
    { color: palette.series[3], key: "CHEQUE", label: "Cheque" },
    { color: palette.other, key: "OTHER", label: "Other" },
  ].map((slice) => ({ ...slice, value: value(metric, slice.key), valueText: `${percentOf(value(metric, slice.key), received) ?? 0}%` }));
  return (
    <ChartCard
      footnote={unrecorded > 0 ? `${formatPaise(unrecorded)} paid with no recorded mode is not shown` : null}
      info={[
        "Money received in this period, by how it was paid.",
        "Counted by the date it was paid, so it can differ from the Collections card.",
        "Cash is always confirmed with the tenant's code.",
        "Bills marked paid before payments were recorded have no mode, so they are left out.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Collections by mode"
    >
      <Donut accessibilityLabel={slices.map((slice) => `${slice.label} ${slice.valueText}`).join(", ")} centerLabel={payments === 1 ? "payment" : "payments"} centerValue={String(payments)} slices={slices} />
    </ChartCard>
  );
}

export function BillTypesCard({ metric, metrics, onRetry }: CardProps) {
  const { colors, fonts } = useTheme();
  const palette = useChartPalette();
  const reasons = metrics.get("billing.one_off_reasons");
  const segments = [
    { color: palette.series[0], key: "RENT_CYCLE", label: "Rent" },
    { color: palette.series[1], key: "ONE_OFF", label: "One-off" },
  ].map((segment) => ({ ...segment, value: value(metric, segment.key), valueText: formatPaise(value(metric, segment.key)) }));
  return (
    <ChartCard
      info={["Rent bills against one-off bills raised for this period.", "Top one-off reasons groups one-off charges by their name."]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="Rent vs one-off bills"
    >
      <SegmentedBar accessibilityLabel={segments.map((segment) => `${segment.label} ${segment.valueText}`).join(", ")} segments={segments} />
      {reasons && reasons.status === "OK" && reasons.parts.length > 0 ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>Top one-off reasons</Text>
          <BarList
            rows={reasons.parts.map((part) => ({
              color: part.key === "OTHER" ? palette.other : palette.series[1],
              key: part.key,
              label: part.key === "OTHER" ? "Other" : part.label ?? part.key,
              value: part.value,
              valueText: formatPaise(part.value),
            }))}
          />
        </View>
      ) : null}
    </ChartCard>
  );
}

export function TimelinessCard({ metric, onRetry }: CardProps) {
  const palette = useChartPalette();
  // Two outcomes only (owner's correction, 2026-09-27): the due date is the last
  // day of the payment window, and a bill cannot be paid before it opens.
  const segments = [
    { color: palette.status.good, key: "ON_TIME", label: "On time" },
    { color: palette.status.critical, key: "LATE", label: "Late" },
  ].map((segment) => ({ ...segment, value: value(metric, segment.key), valueText: String(value(metric, segment.key)) }));
  return (
    <ChartCard
      info={[
        "Paid rent bills for this period. One-off bills are left out: they never go overdue.",
        "On time: paid by the due date, the last day of the payment window. Your grace days are already inside it.",
        "Late: paid after the due date.",
      ]}
      onRetry={onRetry}
      sampleSize={metric.sampleSize}
      status={metric.status}
      title="When tenants pay"
      tooFewText={`${metric.sampleSize} paid so far, too few to compare`}
    >
      <SegmentedBar accessibilityLabel={segments.map((segment) => `${segment.label} ${segment.valueText}`).join(", ")} legendColumns={1} segments={segments} />
    </ChartCard>
  );
}

export function FeesCard({ compareLabel, metric, onRetry }: CardProps) {
  const lateFees = figureOf(metric, "late_fees");
  const discounts = figureOf(metric, "discounts");
  const lateBills = figureOf(metric, "late_fee_bills")?.value ?? 0;
  const discountBills = figureOf(metric, "discount_bills")?.value ?? 0;
  return (
    <ChartCard onRetry={onRetry} sampleSize={metric.sampleSize} status={metric.status} title="Late fees and discounts">
      <View style={{ gap: spacing.sm }}>
        <StatTile caption={`on ${bills(lateBills)}`} delta={moneyDelta(lateFees?.value ?? 0, lateFees?.previous, compareLabel, false)} label="Late fees charged" value={formatPaise(lateFees?.value ?? 0)} />
        <StatTile caption={`on ${bills(discountBills)}`} delta={moneyDelta(discounts?.value ?? 0, discounts?.previous, compareLabel, false)} label="Discounts given" value={formatPaise(discounts?.value ?? 0)} />
      </View>
    </ChartCard>
  );
}
