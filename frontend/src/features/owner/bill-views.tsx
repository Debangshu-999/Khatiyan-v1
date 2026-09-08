import { Text, View } from "react-native";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ReceiptText,
  RefreshCw,
  WalletCards,
  XCircle,
  type LucideProps,
} from "lucide-react-native";

import { billTitle, type BillingCycle } from "@/store/services/billing-api";
import { GhostText } from "@/components/skeleton-boundary";
import { radii, spacing } from "@/theme/spacing";
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
  // Its own label rather than a humanized enum name. "Confirmation Pending"
  // reads as a system state; the owner needs to know a person is waiting on
  // them, and the tenant needs to know the bill is not theirs to act on.
  if (cycle.status === "CONFIRMATION_PENDING") {
    return { label: "Confirming", tone: "warning" };
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

/**
 * What the bill cost before discounts, and what the discounts came to overall.
 *
 * <p>{@code totalAmountPaise} is already net of discount, so the pre-discount
 * figure is the total plus it back. Stacked discounts need no special handling:
 * {@code discountAmountPaise} is the sum of every discount line, so one
 * percentage against the gross is the effective rate however many were applied —
 * which is the number a reader actually wants, rather than "10% then 5%".
 *
 * <p>Null when nothing was discounted, so callers render the plain total.
 */
export function discountBreakdown(cycle: BillingCycle): { grossPaise: number; percent: number } | null {
  if (!cycle.discountAmountPaise || cycle.discountAmountPaise <= 0) {
    return null;
  }
  const grossPaise = cycle.totalAmountPaise + cycle.discountAmountPaise;
  if (grossPaise <= 0) {
    return null;
  }
  return { grossPaise, percent: Math.round((cycle.discountAmountPaise / grossPaise) * 100) };
}

/**
 * The payable figure, with the pre-discount price struck through beside it when
 * something was taken off — the shape every shopping app uses, because it says
 * "this is cheaper than it was" without the reader doing arithmetic.
 */
export function BillTotal({ cycle, size = 24 }: { cycle: BillingCycle; size?: number }) {
  const { colors, fonts, type } = useTheme();
  const discount = discountBreakdown(cycle);

  return (
    <View style={{ gap: 2 }}>
      <GhostText ghostWidth={72} style={[type.eyebrow, { color: colors.kicker }]}>
        Total payable
      </GhostText>
      <View style={{ alignItems: "flex-end", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <GhostText
          ghostWidth={108}
          numberOfLines={1}
          style={{ color: colors.ink, fontFamily: fonts.display, fontSize: size, letterSpacing: -0.3 }}
        >
          {formatMoney(cycle.totalAmountPaise)}
        </GhostText>
        {discount ? (
          <>
            <Text
              style={[type.caption, { color: colors.muted, textDecorationLine: "line-through" }]}
              numberOfLines={1}
            >
              {formatMoney(discount.grossPaise)}
            </Text>
            <View style={{ backgroundColor: colors.jadeSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 11 }}>
                {discount.percent}% off
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The status chip both bill lists use.
 *
 * <p>One component on purpose. The billing cards drew the plain caps-on-tint
 * pill while the payment history drew a tinted chip with a leading icon, so the
 * same cycle in the same state looked like two different kinds of thing
 * depending on which screen you reached it from.
 *
 * <p>The icon is not decoration: these chips sit in a list you scan, and the
 * glyph is what separates "Paid" from "Late Pay" before the colour registers.
 */
/**
 * Exported for the payment-claims screen, which shows the same kind of thing —
 * a settled/waiting/refused state on a row of money — and had drifted onto the
 * app's caps-on-tint {@code StatusPill} instead. Two chip shapes for one idea
 * made a claim and the bill it pays look like different species.
 */
export function BillingStatusBadge({
  background,
  color,
  icon: Icon,
  label,
}: {
  background: string;
  color: string;
  icon: ComponentType<LucideProps>;
  label: string;
}) {
  const { fonts } = useTheme();

  return (
    // Sizes to its label and nothing more. A MarqueeText here expanded to fill
    // the row it sits in — it wants a width to scroll within — which stretched
    // the chip across the whole billing card and squeezed the reference code
    // beside it out of sight. A plain Text is what the payment history always
    // used, and why that list rendered correctly.
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: background,
        borderRadius: 999,
        flexDirection: "row",
        flexShrink: 0,
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <Icon color={color} size={13} strokeWidth={2.3} />
      <Text numberOfLines={1} style={{ color, fontFamily: fonts.sansBold, fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

export function BillStatusPill({ cycle }: { cycle: BillingCycle }) {
  const { colors } = useTheme();
  const statusDisplay = billingCycleStatusDisplay(cycle);

  // Keeps the billing statuses — "Late Pay", "Not generated", anything
  // humanized off the enum — and only borrows the payment history's SHAPE. The
  // two lists answer different questions and their labels should not be forced
  // to match, just their treatment.
  const display =
    statusDisplay.tone === "success"
      ? { background: colors.successSoft, color: colors.successText, icon: CheckCircle2 }
      : statusDisplay.tone === "warning"
        ? { background: colors.warningSoft, color: colors.warningText, icon: Clock3 }
        : statusDisplay.tone === "danger"
          ? { background: colors.dangerSoft, color: colors.danger, icon: AlertTriangle }
          : statusDisplay.tone === "muted"
            ? { background: colors.surfaceSunken, color: colors.muted, icon: XCircle }
            // Everything still owing shares the blue, so the ICON is what tells
            // them apart — a clock for a bill whose date has not arrived, a
            // wallet for one that is waiting to be paid. Both landed on the
            // wallet before this, which made Upcoming and Unpaid identical
            // chips. Matches the payment history exactly.
            : {
                background: colors.primarySoft,
                color: colors.primaryDeep,
                icon: cycle.status === "UPCOMING" ? Clock3 : WalletCards,
              };

  return (
    <BillingStatusBadge
      background={display.background}
      color={display.color}
      icon={display.icon}
      label={statusDisplay.label}
    />
  );
}

type PaymentHistoryVisualState = "CANCELLED" | "LATE" | "OVERDUE" | "PAID" | "UNPAID" | "UPCOMING";

function dayNumber(value: string) {
  const [year, month, day] = dateOnlyKey(value).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function istTodayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function daysBetween(from: string, to: string) {
  return dayNumber(to) - dayNumber(from);
}

export function paymentLateDays(cycle: BillingCycle) {
  if (!cycle.paidAt) {
    return 0;
  }
  return Math.max(0, daysBetween(cycle.rentDueDate, cycle.paidAt));
}

function paymentHistoryVisualState(cycle: BillingCycle): PaymentHistoryVisualState {
  if (cycle.status === "PAID") {
    return paymentLateDays(cycle) > 0 ? "LATE" : "PAID";
  }
  if (cycle.status === "CANCELLED") {
    return "CANCELLED";
  }

  const dueInDays = daysBetween(istTodayKey(), cycle.rentDueDate);
  if (cycle.status === "UPCOMING" || dueInDays > 0) {
    return "UPCOMING";
  }
  if (cycle.status === "OVERDUE" || dueInDays < 0) {
    return "OVERDUE";
  }
  return "UNPAID";
}

export function PaymentStatusBadge({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts } = useTheme();
  const state = paymentHistoryVisualState(cycle);
  const display =
    state === "PAID"
      ? { background: colors.successSoft, color: colors.successText, icon: CheckCircle2, label: "Paid" }
      : state === "LATE"
        ? { background: colors.warningSoft, color: colors.warningText, icon: Clock3, label: "Late" }
        : state === "UPCOMING"
          ? { background: colors.primarySoft, color: colors.primaryDeep, icon: Clock3, label: "Upcoming" }
          : state === "OVERDUE"
            ? { background: colors.dangerSoft, color: colors.danger, icon: AlertTriangle, label: "Overdue" }
            : state === "CANCELLED"
              ? { background: colors.surfaceSunken, color: colors.muted, icon: XCircle, label: "Cancelled" }
              : { background: colors.primarySoft, color: colors.primaryDeep, icon: WalletCards, label: "Unpaid" };
  return (
    <BillingStatusBadge
      background={display.background}
      color={display.color}
      icon={display.icon}
      label={display.label}
    />
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
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        gap: 2,
        minWidth: 0,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: colors.ink,
          fontFamily: strong ? fonts.display : fonts.sansBold,
          fontSize: strong ? 19 : 13,
          fontVariant: ["tabular-nums"],
          lineHeight: strong ? 23 : 18,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function PaymentTimingFooter({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts } = useTheme();
  const state = paymentHistoryVisualState(cycle);
  const dueDelta = daysBetween(istTodayKey(), cycle.rentDueDate);
  const lateDays = paymentLateDays(cycle);

  const display =
    state === "LATE"
      ? {
          color: colors.warningText,
          icon: Clock3,
          label: `Paid ${lateDays} day${lateDays === 1 ? "" : "s"} late`,
        }
      : state === "PAID"
        ? { color: colors.successText, icon: CheckCircle2, label: "Paid on time" }
        : state === "UPCOMING"
          ? {
              color: colors.primaryDeep,
              icon: Clock3,
              label: dueDelta <= 0 ? "Due today" : `In ${dueDelta} day${dueDelta === 1 ? "" : "s"}`,
            }
          : state === "OVERDUE"
            ? {
                color: colors.danger,
                icon: AlertTriangle,
                label: `${Math.abs(dueDelta)} day${Math.abs(dueDelta) === 1 ? "" : "s"} overdue`,
              }
            : state === "CANCELLED"
              ? { color: colors.muted, icon: XCircle, label: "Bill cancelled" }
              : { color: colors.primaryDeep, icon: WalletCards, label: "Payment due today" };
  const Icon = display.icon;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 5, justifyContent: "center" }}>
      <Icon color={display.color} size={13} strokeWidth={2.2} />
      <Text
        style={{
          color: display.color,
          fontFamily: fonts.sansBold,
          fontSize: 11,
          fontVariant: ["tabular-nums"],
        }}
      >
        {display.label}
      </Text>
    </View>
  );
}

// Payment-history row: tenant, reference, amount, due + payment dates.
export function PaymentHistoryRow({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts, type } = useTheme();
  const tenantName = cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}`;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View style={{ alignItems: "center", height: 44, justifyContent: "center", width: 40 }}>
          <ReceiptText color={colors.ink} size={28} strokeWidth={2} />
        </View>

        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text numberOfLines={1} style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>
              {cycle.referenceCode}
            </Text>
            <PaymentStatusBadge cycle={cycle} />
          </View>
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, lineHeight: 24 }}
          >
            {tenantName}
          </Text>
          <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
            {billTitle(cycle)} · {cycle.tenancyReferenceCode ?? shortId(cycle.tenancyId)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <InfoBlock label="Amount" strong value={formatMoney(cycle.totalAmountPaise)} />
        <InfoBlock label="Due date" value={formatFullDate(cycle.rentDueDate)} />
      </View>
      <InfoBlock label="Payment date" value={cycle.paidAt ? formatFullDate(cycle.paidAt) : "Not paid yet"} />

      <PaymentTimingFooter cycle={cycle} />
    </View>
  );
}

// Read-only bill card: reference, status, tenant, amount, due date, period.
export function BillCard({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts, type } = useTheme();
  const tenantName = cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}`;
  const overdue = cycle.status === "OVERDUE";

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View style={{ alignItems: "center", height: 44, justifyContent: "center", width: 40 }}>
          <ReceiptText color={colors.ink} size={29} strokeWidth={2} />
        </View>

        <View style={{ flex: 1, gap: spacing.md, minWidth: 0 }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <Text numberOfLines={1} style={[type.eyebrow, { color: colors.kicker }]}>
                {cycle.referenceCode}
              </Text>
              <Text
                numberOfLines={2}
                style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, lineHeight: 25 }}
              >
                {tenantName}
              </Text>
            </View>

            <View style={{ alignItems: "flex-end", gap: spacing.sm }}>
              <PaymentStatusBadge cycle={cycle} />
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>Due date</Text>
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                  <CalendarDays color={overdue ? colors.danger : colors.ink} size={15} strokeWidth={2.2} />
                  <Text
                    style={{
                      color: overdue ? colors.danger : colors.ink,
                      fontFamily: fonts.sansBold,
                      fontSize: 14,
                    }}
                  >
                    {formatDate(cycle.rentDueDate)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <BillTotal cycle={cycle} size={30} />

          <View style={{ backgroundColor: colors.border, height: 1 }} />

          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <RefreshCw color={colors.primary} size={17} strokeWidth={2.1} />
            <Text numberOfLines={2} style={[type.body, { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 18 }]}>
              {billTitle(cycle)} · {formatDate(cycle.periodStartDate)} – {formatDate(cycle.periodEndDate)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
