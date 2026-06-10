import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ReceiptText } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import type { BillingCycle, BillingCycleLineItem } from "@/store/services/billing-api";
import { useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function TenancyBillingCycleScreen() {
  const router = useRouter();
  const { cycleId, tenancyId } = useLocalSearchParams<{ cycleId?: string; tenancyId?: string }>();
  const { colors, fonts, type } = useTheme();
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(tenancyId ?? "", { skip: !tenancyId });
  const cycle = cyclesQuery.data?.find((item) => item.id === cycleId) ?? cyclesQuery.data?.[0];

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="BILLING"
        title="Line"
        italicTail="items."
        subtitle="Cycle breakdown for rent, deposit, charges, discounts and settlement actions."
        trailing={<BackButton onPress={() => router.back()} />}
      />

      {cyclesQuery.isFetching ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : cycle ? (
        <>
          <BillingSummary cycle={cycle} />
          {cycle.lineItems.length > 0 ? (
            cycle.lineItems
              .slice()
              .sort((left, right) => left.displayOrder - right.displayOrder)
              .map((item) => <LineItemCard item={item} key={item.id} />)
          ) : (
            <EmptyState
              icon={ReceiptText}
              eyebrow="No items"
              title="No line items yet"
              description="Line items appear here once the cycle is generated or adjusted."
            />
          )}
        </>
      ) : (
        <EmptyState icon={ReceiptText} eyebrow="Missing cycle" title="Cycle not found" description="Refresh billing and try again." />
      )}
    </ScreenScrollView>
  );
}

function BillingSummary({ cycle }: { cycle: BillingCycle }) {
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <DetailKicker text={`Cycle ${cycle.cycleNumber}`} />
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
          <DetailKicker text={humanizeToken(item.type)} />
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

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Go back"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        height: 42,
        justifyContent: "center",
        width: 42,
      }}
    >
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function DetailKicker({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>{text}</Text>;
}

function DetailText({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.body, { color: colors.muted }]} selectable>{text}</Text>;
}

function DetailLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>{label}</Text>
      <Text
        style={{
          color: colors.ink,
          flex: 1.25,
          fontFamily: strong ? fonts.display : fonts.sans,
          fontSize: strong ? 19 : undefined,
          fontWeight: strong ? "500" : "800",
          textAlign: "right",
        }}
        selectable
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
