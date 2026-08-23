import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ReceiptText } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusPill } from "@/components/status-pill";
import { SkeletonCard } from "@/components/skeleton";
import { MarqueeText } from "@/components/marquee-text";
import { billTitle, useListMyTenancyBillingCyclesQuery, type BillingCycle } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type BillFilter = "ALL" | "RENT_CYCLE" | "ONE_OFF";
const FILTERS: { label: string; value: BillFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Rent cycles", value: "RENT_CYCLE" },
  { label: "Other bills", value: "ONE_OFF" },
];

export default function TenancyBillingHistoryScreen() {
  const router = useGuardedRouter();
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();
  const [filter, setFilter] = useState<BillFilter>("ALL");
  const cyclesQuery = useListMyTenancyBillingCyclesQuery(tenancyId ?? "", { skip: !tenancyId });

  // Settled bills only — payable ones live in "My bills". Newest first.
  const settled = [...(cyclesQuery.data ?? [])]
    .filter((cycle) => cycle.status === "PAID" || cycle.status === "CANCELLED")
    .sort((left, right) => new Date(right.periodStartDate).getTime() - new Date(left.periodStartDate).getTime());
  const cycles = filter === "ALL" ? settled : settled.filter((cycle) => cycle.category === filter);

  return (
    <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Billing"
        onBack={() => router.back()}
        title="Past"
        italicTail="bills."
        subtitle="Rent cycles and other bills you've settled — filter by type and open any for its line items."
      />

      <FilterBar active={filter} onSelect={setFilter} />

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
        <EmptyState icon={ReceiptText} title="No past bills" description="Settled bills appear here once they're paid." />
      )}
    </ScreenScrollView>
  );
}

function FilterBar({ active, onSelect }: { active: BillFilter; onSelect: (value: BillFilter) => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {FILTERS.map((entry) => {
        const on = entry.value === active;
        return (
          <AnimatedPressable
            accessibilityRole="button"
            key={entry.value}
            onPress={() => onSelect(entry.value)}
            style={{
              backgroundColor: on ? colors.primary : colors.surfaceSunken,
              borderColor: on ? colors.primary : colors.border,
              borderRadius: 999,
              borderWidth: 1,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm - 2,
            }}
          >
            <Text style={{ color: on ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, }}>
              {entry.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function CycleHistoryCard({ cycle, onPress }: { cycle: BillingCycle; onPress: () => void }) {
  const { colors, type } = useTheme();

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          {/* Bounded so a long one-off bill title scrolls instead of pushing
              the status pill out of the card. */}
          <View style={{ flexShrink: 1 }}>
            <MarqueeText style={[type.eyebrow, { color: colors.kicker }]}>{billTitle(cycle)}</MarqueeText>
          </View>
          <StatusPill label={humanizeToken(cycle.status)} tone={cycle.status === "PAID" ? "success" : cycle.status === "OVERDUE" ? "warning" : "neutral"} />
        </View>
        <DetailLine label="Period" value={`${formatShortDate(cycle.periodStartDate)} to ${formatShortDate(cycle.periodEndDate)}`} />
        <DetailLine label="Total" value={formatMoney(cycle.totalAmountPaise)} />
        <ActionCard
          meta={`${cycle.lineItems.length} item${cycle.lineItems.length === 1 ? "" : "s"}`}
          title="Open bill"
          description="View the bill total, due date and line-item breakdown."
          onPress={onPress}
        />
      </View>
    </Card>
  );
}


function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { color: colors.ink, flex: 1.25, fontWeight: "800", textAlign: "right" }]}>{value}</Text>
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
