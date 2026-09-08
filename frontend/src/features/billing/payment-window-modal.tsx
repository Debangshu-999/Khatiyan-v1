import type { ComponentType } from "react";
import { Modal, Text, View } from "react-native";
import { CalendarCheck2, CalendarRange, Clock3, X, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { IconButton, NoticeBar } from "@/features/owner/owner-ui";
import { formatDate, formatMoney } from "@/features/owner/bill-views";
import { type BillingCycle } from "@/store/services/billing-api";
import { DIALOG_MAX_WIDTH, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * What the ⓘ on a tenant's bill card opens: when this bill can be paid, and
 * what paying late costs.
 *
 * <p>
 * The owner's screen has a modal of the same shape, deliberately not shared.
 * Half of its sentences are written to the person who SETS the rate — "you can
 * set a daily rate in property billing settings", "changing it now applies from
 * the next cycle" — which is advice a tenant can do nothing with, and reads as
 * though they are being told to go and change their own late fee.
 */
export function PaymentWindowModal({ cycle, onClose }: { cycle: BillingCycle; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  // Null while the cycle is UPCOMING — the rate is stamped when it goes live.
  // The API omits nulls, so this can arrive as undefined rather than null.
  const rate = cycle.lateFeePerDayPaise;

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <AnimatedPressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}
        tapLockMs={0}
      >
        <View
          style={{
            alignSelf: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: DIALOG_MAX_WIDTH,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>{cycle.referenceCode}</Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>Payment window</Text>
            </View>
            <IconButton accessibilityLabel="Close payment window" icon={X} onPress={onClose} />
          </View>

          <View style={{ borderTopColor: colors.border, borderTopWidth: 1 }}>
            <WindowLine
              icon={CalendarRange}
              label="Cycle period"
              value={`${formatDate(cycle.periodStartDate)} – ${formatDate(cycle.periodEndDate)}`}
            />
            <WindowLine
              icon={CalendarCheck2}
              label="Billing window"
              value={`${formatDate(cycle.periodStartDate)} – ${formatDate(cycle.rentDueDate)}`}
            />
            <WindowLine
              icon={Clock3}
              label="Grace days"
              last
              value={
                cycle.rentGraceDays === 0
                  ? "None"
                  : `${cycle.rentGraceDays} day${cycle.rentGraceDays === 1 ? "" : "s"}`
              }
            />
          </View>

          {/* The one paragraph here that changes what a tenant does, so it gets
              the notice treatment rather than another grey block to skim. */}
          <NoticeBar
            message={
              rate == null
                ? `The daily late fee for this bill is set when the cycle starts. Paying by ${formatDate(cycle.rentDueDate)} avoids it either way.`
                : rate > 0
                  ? `${formatMoney(rate)} per day, charged from the day after ${formatDate(cycle.rentDueDate)}. This rate was fixed when the bill went live.`
                  : `No late fee is set for this bill, so paying after ${formatDate(cycle.rentDueDate)} costs nothing extra.`
            }
            title="IF PAID LATE?"
            tone="warning"
          />

          {cycle.lateFeeAmountPaise > 0 ? (
            <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
              This bill has already accrued {formatMoney(cycle.lateFeeAmountPaise)} of late fee. It sits on this
              bill as a line item and grows each night it stays overdue.
            </Text>
          ) : null}
        </View>
      </AnimatedPressable>
    </Modal>
  );
}

function WindowLine({
  icon: Icon,
  label,
  last = false,
  value,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  last?: boolean;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        borderBottomColor: colors.border,
        borderBottomWidth: last ? 0 : 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingVertical: spacing.md,
      }}
    >
      <Icon color={colors.primary} size={19} strokeWidth={2} />
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sansBold,
          fontSize: 13,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}
