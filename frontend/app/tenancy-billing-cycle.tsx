import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Clock3, ReceiptText } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { MarqueeText } from "@/components/marquee-text";
import type { BillingCycle, BillingCycleLineItem } from "@/store/services/billing-api";
import { billTitle, lineItemKindLabel, useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import { PayBillSheet } from "@/features/billing/pay-bill-sheet";
import { PaymentDecisionModal } from "@/features/billing/payment-decision-modal";
import { ActionButton, formatMoneyPaise } from "@/features/owner/owner-ui";
import { useGetMyPaymentStateQuery, type PaymentIntent } from "@/store/services/payment-intent-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_BILL_ILLUSTRATION = require("../assets/workspace/No-Bill_512x436.png");

export default function TenancyBillingCycleScreen() {
  const router = useRouter();
  const { cycleId, tenancyId } = useLocalSearchParams<{ cycleId?: string; tenancyId?: string }>();
  const { colors, fonts, type } = useTheme();
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(tenancyId ?? "", { skip: !tenancyId });
  const cycle = cyclesQuery.data?.find((item) => item.id === cycleId) ?? cyclesQuery.data?.[0];

  const [paySheetOpen, setPaySheetOpen] = useState(false);
  /**
   * The attempt whose outcome we are asking about.
   *
   * <p>Seeded from the server's live intent as well as from a just-opened one,
   * so a tenant who closed the question last time is asked again rather than
   * silently left with a blocked button.
   */
  const [deciding, setDeciding] = useState<PaymentIntent | null>(null);

  const paymentStateQuery = useGetMyPaymentStateQuery(cycle?.id ?? "", { skip: !cycle?.id });
  const paymentState = paymentStateQuery.data;
  const liveIntent = paymentState?.liveIntent ?? null;
  // Nothing to pay on a bill that is settled, cancelled, or already sitting with
  // the owner for confirmation.
  const payable = cycle ? cycle.status === "UNPAID" || cycle.status === "OVERDUE" : false;

  return (
    <ScreenScrollView>
      <ScreenHeader
        title="Line"
        italicTail="items."
        subtitle="Bill breakdown for rent, deposit, charges, discounts and settlement actions."
      />

      {cyclesQuery.isFetching ? (
        <>
          <SkeletonCard />
          <SkeletonList rows={3} />
        </>
      ) : cycle ? (
        <>
          <BillingSummary cycle={cycle} />

          {payable && paymentState?.upiAvailable ? (
            <PayBillAction
              amountPaise={cycle.totalAmountPaise}
              liveIntent={liveIntent}
              onFinishAttempt={() => setDeciding(liveIntent)}
              onPay={() => setPaySheetOpen(true)}
            />
          ) : null}

          {cycle.status === "CONFIRMATION_PENDING" ? <AwaitingConfirmationCard /> : null}
          {cycle.lineItems.length > 0 ? (
            cycle.lineItems
              .slice()
              .sort((left, right) => left.displayOrder - right.displayOrder)
              .map((item) => <LineItemCard item={item} key={item.id} />)
          ) : (
            <EmptyState
              artwork={NO_BILL_ILLUSTRATION}
              title="No line items yet"
              description="Line items appear here once the bill is generated or adjusted."
            />
          )}
        </>
      ) : (
        <EmptyState icon={ReceiptText} title="Bill not found" description="Refresh billing and try again." />
      )}
      {paySheetOpen && cycle && paymentState?.payee ? (
        <PayBillSheet
          amountPaise={cycle.totalAmountPaise}
          billingCycleId={cycle.id}
          hasPayLink={paymentState.payLinkAvailable}
          onClose={() => setPaySheetOpen(false)}
          onStarted={(intent) => {
            setPaySheetOpen(false);
            setDeciding(intent);
          }}
          payee={paymentState.payee}
          referenceCode={cycle.referenceCode}
        />
      ) : null}

      {deciding ? (
        <PaymentDecisionModal
          intent={deciding}
          onClose={() => setDeciding(null)}
          onSettled={() => setDeciding(null)}
        />
      ) : null}
    </ScreenScrollView>
  );
}

/**
 * The Pay button, or the way back into an unanswered attempt.
 *
 * <p>A blocked button on its own reads as broken, so the blocked state says what
 * is holding it and offers the way out rather than leaving the tenant to guess.
 */
function PayBillAction({
  amountPaise,
  liveIntent,
  onFinishAttempt,
  onPay,
}: {
  amountPaise: number;
  liveIntent: PaymentIntent | null;
  onFinishAttempt: () => void;
  onPay: () => void;
}) {
  const { colors, type } = useTheme();

  if (!liveIntent) {
    return <ActionButton label={`Pay ${formatMoneyPaise(amountPaise)}`} onPress={onPay} />;
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <ActionButton disabled label={`Pay ${formatMoneyPaise(amountPaise)}`} onPress={onPay} />
      <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
        You started a payment. Tell us how it went before trying again.
      </Text>
      <ActionButton label="Finish that payment" onPress={onFinishAttempt} variant="outline" />
    </View>
  );
}

/** The bill is with the owner. Nothing for the tenant to do but wait. */
function AwaitingConfirmationCard() {
  const { colors, fonts, type } = useTheme();

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Clock3 color={colors.jade} size={18} strokeWidth={2.2} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
            Waiting for the property to confirm
          </Text>
          <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
            They are checking their bank statement. No late fee is added while this is open.
          </Text>
        </View>
      </View>
    </Card>
  );
}

function BillingSummary({ cycle }: { cycle: BillingCycle }) {
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <DetailKicker text={billTitle(cycle)} />
          <StatusPill label={humanizeToken(cycle.status)} tone={cycle.status === "PAID" ? "success" : cycle.status === "OVERDUE" ? "warning" : "neutral"} />
        </View>
        <DetailLine label="Period" value={`${formatShortDate(cycle.periodStartDate)} to ${formatShortDate(cycle.periodEndDate)}`} />
        <DetailLine label="Due date" value={formatDate(cycle.rentDueDate)} />
        <DetailLine label="Total" value={formatMoney(cycle.totalAmountPaise)} strong />
      </View>
    </Card>
  );
}

function LineItemCard({ item }: { item: BillingCycleLineItem }) {
  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <DetailKicker text={lineItemKindLabel(item)} />
          <StatusPill label={lineItemStatusLabel(item)} tone={item.amountPaise === 0 ? "success" : "neutral"} />
        </View>
        <DetailLine label={item.label} value={formatMoney(item.amountPaise)} strong />
        {item.description ? <DetailText text={item.description} /> : null}
        <DetailLine label="Settlement" value={humanizeToken(item.settlementAction)} />
        {item.settlementAmountPaise ? <DetailLine label="Settlement amount" value={formatMoney(item.settlementAmountPaise)} /> : null}
      </View>
    </Card>
  );
}


function DetailKicker({ text }: { text: string }) {
  const { colors, type } = useTheme();
  // Bounded + marquee so a long bill title never pushes the status pill out.
  return (
    <View style={{ flexShrink: 1 }}>
      <MarqueeText style={[type.eyebrow, { color: colors.kicker }]}>{text}</MarqueeText>
    </View>
  );
}

function DetailText({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.body, { color: colors.muted }]}>{text}</Text>;
}

function DetailLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text
        style={{
          color: colors.ink,
          flex: 1.25,
          fontFamily: strong ? fonts.display : fonts.sans,
          fontSize: strong ? 19 : undefined,
          fontWeight: strong ? "500" : "800",
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: value % 100 === 0 ? 0 : 2, style: "currency" }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(value));
}

function humanizeToken(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function lineItemStatusLabel(item: BillingCycleLineItem) {
  if (item.amountPaise === 0 && item.settlementAmountPaise === 0) {
    return "Cleared";
  }

  return humanizeToken(item.status);
}
