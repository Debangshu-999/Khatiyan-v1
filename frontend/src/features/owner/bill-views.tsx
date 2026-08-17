import { Text, View } from "react-native";
import { AlertTriangle, CalendarDays, CheckCircle2, ReceiptText, TimerReset } from "lucide-react-native";

import { Card } from "@/components/card";
import { StatusPill } from "@/components/status-pill";
import { billTitle, type BillingCycle } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Shared, read-only bill views + pure bill helpers, reused by the owner
// payment-history and tenant-bills screens. The main billing screen keeps its
// own action-rich variants.

export type PaymentHistoryStatus = "ON_TIME" | "OVERDUE" | "UNPAID";

// ---------------------------------------------------------------- helpers

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value / 100);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(value));
}

export function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}

export function monthLabel(value: string) {
  const [year, month] = value.split("-").map((part) => Number(part));
  if (!year || !month) {
    return value;
  }
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateOnlyKey(value: string) {
  return value.slice(0, 10);
}

export function paymentHistoryStatus(cycle: BillingCycle): PaymentHistoryStatus {
  if (cycle.status === "UNPAID") {
    return "UNPAID";
  }
  if (cycle.status === "OVERDUE") {
    return "OVERDUE";
  }
  if (cycle.paidAt && dateOnlyKey(cycle.paidAt) > dateOnlyKey(cycle.rentDueDate)) {
    return "OVERDUE";
  }
  return "ON_TIME";
}

export function billingCycleStatusDisplay(cycle: BillingCycle): {
  label: string;
  tone: "danger" | "muted" | "primary" | "success" | "warning";
} {
  if (cycle.status === "PAID" && paymentHistoryStatus(cycle) === "OVERDUE") {
    return { label: "Late Pay", tone: "warning" };
  }
  if (cycle.status === "PAID") {
    return { label: "Paid", tone: "success" };
  }
  if (cycle.status === "OVERDUE") {
    return { label: "Overdue", tone: "danger" };
  }
  if (cycle.status === "CANCELLED") {
    return { label: "Cancelled", tone: "muted" };
  }
  return { label: humanizeToken(cycle.status), tone: "primary" };
}

export function comparePaymentHistoryCycles(left: BillingCycle, right: BillingCycle) {
  const leftDate = left.paidAt ?? left.rentDueDate;
  const rightDate = right.paidAt ?? right.rentDueDate;
  const dateDifference = new Date(rightDate).getTime() - new Date(leftDate).getTime();
  if (dateDifference !== 0) {
    return dateDifference;
  }
  return (right.cycleNumber ?? 0) - (left.cycleNumber ?? 0);
}

// Newest first — used by the tenant-bills list (across months).
export function compareByPeriodDesc(left: BillingCycle, right: BillingCycle) {
  const diff = new Date(right.periodStartDate).getTime() - new Date(left.periodStartDate).getTime();
  if (diff !== 0) {
    return diff;
  }
  return (right.cycleNumber ?? 0) - (left.cycleNumber ?? 0);
}

// ---------------------------------------------------------------- components

export function BillStatusPill({ cycle }: { cycle: BillingCycle }) {
  const statusDisplay = billingCycleStatusDisplay(cycle);
  const tone: "success" | "danger" | "warning" | "neutral" | "primary" =
    statusDisplay.tone === "success"
      ? "success"
      : statusDisplay.tone === "danger"
        ? "danger"
        : statusDisplay.tone === "warning"
          ? "warning"
          : statusDisplay.tone === "muted"
            ? "neutral"
            : "primary";
  return <StatusPill label={statusDisplay.label} tone={tone} />;
}

export function PaymentStatusBadge({ cycle }: { cycle: BillingCycle }) {
  const { colors, type } = useTheme();
  const status = billingCycleStatusDisplay(cycle);
  const tone =
    status.tone === "success"
      ? colors.successText
      : status.tone === "danger"
        ? colors.danger
        : status.tone === "warning"
          ? colors.warningText
          : status.tone === "muted"
            ? colors.muted
            : colors.primary;
  const Icon = status.tone === "success" ? CheckCircle2 : status.tone === "danger" || status.tone === "warning" ? AlertTriangle : TimerReset;
  const backgroundColor = status.tone === "warning" ? colors.warningSoft : colors.surfaceSunken;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor: tone,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <Icon color={tone} size={13} strokeWidth={2.4} />
      <Text style={[type.caption, { color: tone, fontWeight: "900" }]}>
        {status.label}
      </Text>
    </View>
  );
}

export function InfoBlock({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: 2,
        padding: spacing.sm,
      }}
    >
      <Text style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
      <Text
        style={{
          color: strong ? colors.primary : colors.ink,
          fontFamily: strong ? fonts.display : fonts.sans,
          fontSize: strong ? 19 : 13,
          fontWeight: "800",
          lineHeight: strong ? 23 : 18,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// Payment-history row: tenant, reference, amount, due + payment dates.
export function PaymentHistoryRow({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts, type } = useTheme();
  const tenantName = cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}`;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.primarySoft,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: 14,
              borderWidth: 1,
              height: 46,
              justifyContent: "center",
              width: 46,
            }}
          >
            <ReceiptText color={colors.primary} size={21} strokeWidth={2.3} />
          </View>

          <View style={{ flex: 1, gap: spacing.xxs }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
              <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>
                {cycle.referenceCode}
              </Text>
              <PaymentStatusBadge cycle={cycle} />
            </View>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, lineHeight: 25 }}>
              {tenantName}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {billTitle(cycle)} · {cycle.tenancyReferenceCode ?? shortId(cycle.tenancyId)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <InfoBlock label="Amount" strong value={formatMoney(cycle.totalAmountPaise)} />
          <InfoBlock label="Due date" value={formatFullDate(cycle.rentDueDate)} />
        </View>
        <InfoBlock label="Payment date" value={cycle.paidAt ? formatDateTime(cycle.paidAt) : "Not paid yet"} />
      </View>
    </Card>
  );
}

// Read-only bill card: reference, status, tenant, amount, due date, period.
export function BillCard({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts, type } = useTheme();
  const mutable = cycle.status === "UNPAID" || cycle.status === "OVERDUE";
  const tenantName = cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}`;

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: spacing.md, padding: spacing.md }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: mutable ? colors.primarySoft : colors.surfaceSunken,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            height: 44,
            justifyContent: "center",
            width: 44,
          }}
        >
          <ReceiptText color={mutable ? colors.primary : colors.kicker} size={20} strokeWidth={2.2} />
        </View>

        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>
              {cycle.referenceCode}
            </Text>
            <BillStatusPill cycle={cycle} />
          </View>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, lineHeight: 25 }}>
            {tenantName}
          </Text>

          <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginTop: spacing.xxs }}>
            <View style={{ gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Total payable
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.3 }} numberOfLines={1}>
                {formatMoney(cycle.totalAmountPaise)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Due date
              </Text>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                <CalendarDays color={cycle.status === "OVERDUE" ? colors.danger : colors.muted} size={14} strokeWidth={2.3} />
                <Text style={{ color: cycle.status === "OVERDUE" ? colors.danger : colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 14, }}>
                  {formatDate(cycle.rentDueDate)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[type.caption, { color: colors.kicker }]}>
            {billTitle(cycle)} · {formatDate(cycle.periodStartDate)} – {formatDate(cycle.periodEndDate)}
          </Text>
        </View>
      </View>
    </View>
  );
}
