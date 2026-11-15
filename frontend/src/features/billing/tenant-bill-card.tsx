import { useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  Info,
  ReceiptText,
  RefreshCw,
  XCircle,
  type LucideProps,
} from "lucide-react-native";

import { CardNameRow, CardStatus, cardText, smallerCardText } from "@/components/card-name-row";
import { AnimatedPressable } from "@/components/animated-pressable";
import { PaymentWindowModal } from "@/features/billing/payment-window-modal";
import { BookingTokenNote } from "@/features/billing/booking-token-note";
import { billTitle, bookingTokenPaise, isDamageBill, type BillingCycle } from "@/store/services/billing-api";
import { BillTotal } from "@/features/owner/bill-views";
import type { PaymentIntent } from "@/store/services/payment-intent-api";
import { UnpaidBillGlyph } from "@/components/billing-vector-icons";
import { PaymentClaimsIcon } from "@/components/artwork-icon";
import { cardShadow, useSoftShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The compact bill card used only on tenant-facing billing surfaces.
 *
 * Keeping its visual building blocks local prevents owner billing cards from
 * inheriting tenant UI changes while both sides continue to use the same bill
 * data and payment flow.
 */
export function TenantBillCard({
  cycle,
  onPay,
  onViewBill,
  onViewIntents,
  openAttempt,
}: {
  cycle: BillingCycle;
  /** Null when this bill cannot be paid from the app right now. */
  onPay: (() => void) | null;
  onViewBill: () => void;
  onViewIntents: () => void;
  /** An unfinished attempt on THIS bill, if there is one. */
  openAttempt: PaymentIntent | null;
}) {
  const softShadow = useSoftShadow();
  const { colors, fonts, type } = useTheme();
  const [windowInfoOpen, setWindowInfoOpen] = useState(false);
  const awaitingConfirmation = cycle.status === "CONFIRMATION_PENDING";
  const unanswered = openAttempt?.status === "CREATED";
  const paid = cycle.status === "PAID";
  const payLabel = payButtonLabel(cycle, openAttempt);
  const discount = tenantDiscountBreakdown(cycle);
  const token = bookingTokenPaise(cycle);
  return (
    // The owner's bill card, on the tenant's side (user, 2026-11-11): the
    // receipt mark with its window ?, the code, what the bill is and the total,
    // the status and due date at the right, then the kind of bill and the
    // way to pay, with the rest behind the dots.
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          <View style={{ alignItems: "center", height: 44, justifyContent: "center", width: 40 }}>
            <ReceiptText color={colors.ink} size={29} strokeWidth={2} />
          </View>
          <AnimatedPressable
            accessibilityLabel={`Payment window for ${cycle.referenceCode}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setWindowInfoOpen(true)}
            style={{ alignItems: "center", height: 24, justifyContent: "center", width: 24 }}
            tapLockMs={0}
          >
            <CircleHelp color={colors.kicker} size={16} strokeWidth={2.4} />
          </AnimatedPressable>
          {/* This bill's payment claims, under the ?, as on the owner's card (user, 2026-11-11). */}
          <AnimatedPressable
            accessibilityLabel={`Payment claims for ${cycle.referenceCode}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onViewIntents}
            style={{ alignItems: "center", height: 24, justifyContent: "center", width: 24 }}
            tapLockMs={0}
          >
            <PaymentClaimsIcon size={18} />
            {/* A claim still waiting to be resolved, by the tenant or the property (user, 2026-11-11). */}
            {openAttempt && (openAttempt.status === "CREATED" || openAttempt.status === "TENANT_CONFIRMED") ? (
              <View
                pointerEvents="none"
                style={{ backgroundColor: colors.danger, borderColor: colors.surface, borderRadius: 999, borderWidth: 1.5, height: 9, position: "absolute", right: 0, top: 0, width: 9 }}
              />
            ) : null}
          </AnimatedPressable>
        </View>

        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <FitText numberOfLines={1} style={[smallerCardText(type.eyebrow), { color: colors.kicker }]}>
            {cycle.referenceCode}
          </FitText>
          <FitText numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: cardText(21), lineHeight: 25 }}>
            {billTitle(cycle)}
          </FitText>
          <View style={{ marginTop: spacing.xs }}>
            <BillTotal cycle={cycle} size={30} />
          </View>
        </View>

        <View style={{ alignItems: "flex-end", flexShrink: 0, gap: spacing.sm, marginRight: -spacing.xs }}>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <Text style={[smallerCardText(type.eyebrow), { color: colors.kicker }]}>Due date</Text>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
              <CalendarDays color={cycle.status === "OVERDUE" ? colors.danger : colors.ink} size={15} strokeWidth={2.2} />
              <Text style={{ color: cycle.status === "OVERDUE" ? colors.danger : colors.ink, fontFamily: fonts.sansBold, fontSize: cardText(14) }}>
                {formatTenantDate(cycle.rentDueDate)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ backgroundColor: colors.border, height: 1 }} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        {cycle.category === "RENT_CYCLE" ? (
          <RefreshCw color={colors.primary} size={17} strokeWidth={2.1} />
        ) : (
          <ReceiptText color={colors.primary} size={17} strokeWidth={2.1} />
        )}
        <FitText numberOfLines={2} style={[smallerCardText(type.body), { color: colors.muted, flex: 1, fontSize: cardText(13), lineHeight: 18 }]}>
          {cycle.category === "RENT_CYCLE"
            ? `Rent for ${formatTenantDate(cycle.periodStartDate)} to ${formatTenantDate(cycle.periodEndDate)}`
            : (cycle.lineItems?.[0]?.label ?? (isDamageBill(cycle) ? "Damage bill" : "One-off bill")).replace(/^Damage DMG-\d{4}-\d+: /, "Damage bill: ")}
        </FitText>
        {/* The status at the right, just above the pay button (user, 2026-11-11). */}
        <TenantBillStatusBadge cycle={cycle} />
      </View>

      {cycle.status === "CANCELLED" && cycle.cancellationReason ? (
        <Text style={[smallerCardText(type.caption), { color: colors.muted, lineHeight: 17 }]}>
          Cancelled by the property: {cycle.cancellationReason}
        </Text>
      ) : null}

      {awaitingConfirmation ? (
        <Text style={[smallerCardText(type.caption), { color: colors.jade, lineHeight: 17 }]}>
          Waiting for the property to confirm your payment. No late fee is added while this is open.
        </Text>
      ) : null}

      {unanswered ? (
        // A pale purple box with a purple edge, pointing at the button (user, 2026-11-11).
        <View style={{ backgroundColor: "#F4F3FF", borderColor: "#9E77ED", borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          <Text style={[smallerCardText(type.caption), { color: "#53389E", lineHeight: 18 }]}>
            You started a payment for this bill. Tell us how it went before paying again. Click on <Text style={{ fontWeight: "800" }}>Finish payment</Text>.
          </Text>
        </View>
      ) : null}

      {/* Pay and View bill side by side (user, 2026-11-11). */}
      <View style={{ flexDirection: "row", gap: spacing.sm, height: 48 }}>
        <TenantBillAction
          disabled={!onPay || cycle.status === "UPCOMING"}
          icon={payLabel === "Pay now" ? Banknote : undefined}
          label={payLabel}
          onPress={() => onPay?.()}
          variant={paid ? "paid" : "primary"}
        />
        <TenantBillAction icon={ReceiptText} label="View bill" onPress={onViewBill} variant="secondary" />
      </View>

      {windowInfoOpen ? (
        <PaymentWindowModal cycle={cycle} onClose={() => setWindowInfoOpen(false)} />
      ) : null}
    </View>
  );
}

function TenantBillAction({
  disabled = false,
  icon: Icon,
  label,
  onPress,
  variant = "primary",
}: {
  disabled?: boolean;
  icon?: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  variant?: "paid" | "primary" | "secondary";
}) {
  const { colors, fonts } = useTheme();
  const primary = variant === "primary";
  const paid = variant === "paid";
  const backgroundColor = paid ? colors.neutralSoft : primary ? colors.primary : colors.surface;
  const contentColor = paid ? colors.muted : primary ? colors.onPrimary : colors.ink;
  const borderColor = paid ? colors.border : primary ? colors.primary : colors.borderStrong;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor,
        borderCurve: "continuous",
        borderRadius: radii.md,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 44,
        opacity: disabled && !paid ? 0.45 : 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      {Icon ? (
        <Icon color={paid ? colors.jade : contentColor} size={16} strokeWidth={2.2} />
      ) : null}
      <FitText
        numberOfLines={1}
        style={{
          color: contentColor,
          fontFamily: fonts.sansBold,
          fontSize: 13,
        }}
      >
        {label}
      </FitText>
    </AnimatedPressable>
  );
}

function TenantBillStatusBadge({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts } = useTheme();
  const status = tenantStatusDisplay(cycle);
  const display =
    status.tone === "success"
      ? { background: colors.successSoft, color: colors.successText, icon: CheckCircle2 }
      : status.tone === "warning"
        ? { background: colors.warningSoft, color: colors.warningText, icon: Clock3 }
        : status.tone === "danger"
          ? { background: colors.dangerSoft, color: colors.danger, icon: AlertTriangle }
          : status.tone === "muted"
            ? { background: colors.surfaceSunken, color: colors.muted, icon: XCircle }
            : {
                background: colors.primarySoft,
                color: colors.primaryDeep,
                icon: cycle.status === "UPCOMING" ? Clock3 : UnpaidBillGlyph,
              };
  const Icon = display.icon;

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: display.background,
        borderRadius: 999,
        flexDirection: "row",
        flexShrink: 0,
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <Icon color={display.color} size={13} strokeWidth={2.3} />
      <FitText
        numberOfLines={1}
        style={{ color: display.color, fontFamily: fonts.sansBold, fontSize: cardText(11) }}
      >
        {status.label}
      </FitText>
    </View>
  );
}

function tenantStatusDisplay(cycle: BillingCycle): {
  label: string;
  tone: "danger" | "muted" | "primary" | "success" | "warning";
} {
  if (
    cycle.status === "PAID" &&
    cycle.paidAt &&
    cycle.paidAt.slice(0, 10) > cycle.rentDueDate.slice(0, 10)
  ) {
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
  if (cycle.status === "CONFIRMATION_PENDING") {
    return { label: "Confirming", tone: "warning" };
  }
  if (cycle.status === "UPCOMING") {
    return { label: "Upcoming", tone: "primary" };
  }
  return { label: "Unpaid", tone: "primary" };
}

function tenantDiscountBreakdown(cycle: BillingCycle) {
  if (!cycle.discountAmountPaise || cycle.discountAmountPaise <= 0) {
    return null;
  }
  // The token is added back too: the struck price is the bill before anything came off it.
  const grossPaise = cycle.totalAmountPaise + cycle.discountAmountPaise + bookingTokenPaise(cycle);
  if (grossPaise <= 0) {
    return null;
  }
  return {
    grossPaise,
    percent: Math.max(1, Math.round((cycle.discountAmountPaise / grossPaise) * 100)),
  };
}

function formatTenantMoney(valuePaise: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(valuePaise / 100);
}

function formatTenantDate(value: string) {
  const [, monthToken, dayToken] = value.slice(0, 10).split("-");
  const month = Number(monthToken);
  const day = Number(dayToken);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

  if (!month || !day || !monthNames[month - 1]) {
    return value;
  }
  return `${day} ${monthNames[month - 1]}`;
}

function payButtonLabel(cycle: BillingCycle, openAttempt: PaymentIntent | null) {
  if (cycle.status === "PAID") {
    return "Paid";
  }
  if (cycle.status === "CONFIRMATION_PENDING" || openAttempt?.status === "TENANT_CONFIRMED") {
    return "Confirming";
  }
  if (openAttempt?.status === "CREATED") {
    return "Finish payment";
  }
  return "Pay now";
}
import { CircleHelp } from "lucide-react-native";
import { FitText } from "@/components/fit-text";
