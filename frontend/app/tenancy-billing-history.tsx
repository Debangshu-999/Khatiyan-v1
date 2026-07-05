import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ArrowLeft, ReceiptText } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonCard } from "@/components/skeleton";
import { useListMyTenancyBillingCyclesQuery, type BillingCycle } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function TenancyBillingHistoryScreen() {
  const router = useGuardedRouter();
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();
  const { colors } = useTheme();
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(tenancyId ?? "", { skip: !tenancyId });
  const cycles = [...(cyclesQuery.data ?? [])].sort((left, right) => right.cycleNumber - left.cycleNumber);

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="BILLING"
        title="Past"
        italicTail="cycles."
        subtitle="Previous billing cycles, each with the same line-item drilldown as the current cycle."
        trailing={<BackButton onPress={() => router.back()} />}
      />

      {cyclesQuery.isFetching ? (
        <SkeletonCard />
      ) : cycles.length > 0 ? (
        cycles.map((cycle) => (
          <CycleHistoryCard
            cycle={cycle}
            key={cycle.id}
            onPress={() => router.push({ pathname: "/tenancy-billing-cycle", params: { cycleId: cycle.id, tenancyId } })}
          />
        ))
      ) : (
        <EmptyState icon={ReceiptText} eyebrow="No cycles" title="No billing history yet" description="Past cycles will appear here after billing starts." />
      )}
    </ScreenScrollView>
  );
}

function CycleHistoryCard({ cycle, onPress }: { cycle: BillingCycle; onPress: () => void }) {
  const { colors, type } = useTheme();

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Cycle {cycle.cycleNumber}
          </Text>
          <StatusPill label={humanizeToken(cycle.status)} tone={cycle.status === "PAID" ? "success" : cycle.status === "OVERDUE" ? "warning" : "neutral"} />
        </View>
        <DetailLine label="Period" value={`${formatShortDate(cycle.periodStartDate)} to ${formatShortDate(cycle.periodEndDate)}`} />
        <DetailLine label="Total" value={formatMoney(cycle.totalAmountPaise)} />
        <ActionCard
          meta={`${cycle.lineItems.length} item${cycle.lineItems.length === 1 ? "" : "s"}`}
          title="Open cycle"
          description="View the cycle totals, due date and line item breakdown."
          onPress={onPress}
        />
      </View>
    </Card>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable accessibilityLabel="Go back" onPress={onPress} style={{ alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: "center", width: 42 }}>
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>{label}</Text>
      <Text style={[type.body, { color: colors.ink, flex: 1.25, fontWeight: "800", textAlign: "right" }]} selectable>{value}</Text>
    </View>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: value % 100 === 0 ? 0 : 2, style: "currency" }).format(value / 100);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(value));
}

function humanizeToken(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}
