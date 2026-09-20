import { useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  History,
  Info,
  ReceiptText,
  WalletCards,
  XCircle,
  type LucideProps,
} from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { PaymentWindowModal } from "@/features/billing/payment-window-modal";
import { billTitle, type BillingCycle } from "@/store/services/billing-api";
import type { PaymentIntent } from "@/store/services/payment-intent-api";
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
  const { colors, fonts, type } = useTheme();
  const [windowInfoOpen, setWindowInfoOpen] = useState(false);
  const awaitingConfirmation = cycle.status === "CONFIRMATION_PENDING";
  const unanswered = openAttempt?.status === "CREATED";
  const payable = cycle.status === "UNPAID" || cycle.status === "OVERDUE";
  const paid = cycle.status === "PAID";
  const payLabel = payButtonLabel(cycle, openAttempt);
  const discount = tenantDiscountBreakdown(cycle);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 4, width: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ alignItems: "center", height: 40, justifyContent: "center", width: 40 }}>
          <ReceiptText color={payable ? colors.primary : colors.muted} size={29} strokeWidth={1.9} />
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, lineHeight: 23 }}
          >
            {billTitle(cycle)}
          </Text>
          <Text numberOfLines={1} style={[type.eyebrow, { color: colors.kicker }]}>
            {cycle.referenceCode}
          </Text>
        </View>

        <TenantBillStatusBadge cycle={cycle} />
      </View>

      <View style={{ backgroundColor: colors.border, height: 1 }} />

      <View style={{ alignItems: "stretch", flexDirection: "row" }}>
        <View style={{ flex: 2.2, gap: 4, minWidth: 0 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>Total payable</Text>
          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 22,
                letterSpacing: -0.35,
                lineHeight: 27,
              }}
            >
              {formatTenantMoney(cycle.totalAmountPaise)}
            </Text>
            {discount ? (
              <>
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.muted,
                    fontFamily: fonts.sans,
                    fontSize: 10.5,
                    textDecorationLine: "line-through",
                  }}
                >
                  {formatTenantMoney(discount.grossPaise)}
                </Text>
                <View
                  style={{
                    backgroundColor: colors.jadeSoft,
                    borderRadius: 999,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 9.5 }}
                  >
                    {discount.percent}% OFF
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        <View
          style={{
            alignSelf: "stretch",
            backgroundColor: colors.border,
            marginHorizontal: spacing.sm,
            width: 1,
          }}
        />

        <View style={{ flex: 0.95, gap: 5, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
            <Text numberOfLines={1} style={[type.eyebrow, { color: colors.kicker, flexShrink: 1 }]}>
              Due date
            </Text>
            <AnimatedPressable
              accessibilityLabel={`Payment window for ${cycle.referenceCode}`}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setWindowInfoOpen(true)}
              style={{
                alignItems: "center",
                height: 20,
                justifyContent: "center",
                width: 20,
              }}
              tapLockMs={0}
            >
              <Info color={colors.kicker} size={12} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
            <CalendarDays
              color={cycle.status === "OVERDUE" ? colors.danger : colors.muted}
              size={15}
              strokeWidth={2.2}
            />
            <Text
              numberOfLines={1}
              style={{
                color: cycle.status === "OVERDUE" ? colors.danger : colors.ink,
                fontFamily: fonts.sansBold,
                fontSize: 13.5,
              }}
            >
              {formatTenantDate(cycle.rentDueDate)}
            </Text>
          </View>
        </View>
      </View>

      {cycle.status === "CANCELLED" && cycle.cancellationReason ? (
        <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
          Cancelled by the property: {cycle.cancellationReason}
        </Text>
      ) : null}

      {awaitingConfirmation ? (
        <Text style={[type.caption, { color: colors.jade, lineHeight: 17 }]}>
          Waiting for the property to confirm your payment. No late fee is added while this is open.
        </Text>
      ) : null}

      {unanswered ? (
        <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
          You started a payment for this bill. Tell us how it went before paying again.
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TenantBillAction
            icon={ReceiptText}
            label="View bill"
            onPress={onViewBill}
            variant="secondary"
          />
          <TenantBillAction
            disabled={!onPay}
            icon={paid ? Check : payLabel === "Pay now" ? Banknote : undefined}
            label={payLabel}
            onPress={() => onPay?.()}
            variant={paid ? "paid" : "primary"}
          />
        </View>
        <TenantBillAction
          icon={History}
          label="View payment intents"
          onPress={onViewIntents}
          variant="secondary"
        />
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
      <Text
        numberOfLines={1}
        style={{
          color: contentColor,
          fontFamily: fonts.sansBold,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
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
                icon: cycle.status === "UPCOMING" ? Clock3 : WalletCards,
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
      <Text
        numberOfLines={1}
        style={{ color: display.color, fontFamily: fonts.sansBold, fontSize: 11 }}
      >
        {status.label}
      </Text>
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
  const grossPaise = cycle.totalAmountPaise + cycle.discountAmountPaise;
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
