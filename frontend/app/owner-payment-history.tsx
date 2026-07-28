import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ChevronLeft, ChevronRight, ReceiptText } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonList } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import {
  PaymentHistoryRow,
  comparePaymentHistoryCycles,
  monthLabel,
  paymentHistoryStatus,
} from "@/features/owner/bill-views";
import { useAppSelector } from "@/store/hooks";
import { useListPropertyBillingCyclesQuery } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PAGE_SIZE = 8;

export default function OwnerPaymentHistoryScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const [month, setMonth] = useState(params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth());
  const [page, setPage] = useState(0);

  const cyclesQuery = useListPropertyBillingCyclesQuery({ month, propertyId }, { skip: !propertyId });
  const ordered = useMemo(() => [...(cyclesQuery.data ?? [])].sort(comparePaymentHistoryCycles), [cyclesQuery.data]);

  const paidCount = ordered.filter((c) => c.status === "PAID").length;
  const lateCount = ordered.filter((c) => c.status === "PAID" && paymentHistoryStatus(c) === "OVERDUE").length;
  const unpaidCount = ordered.filter((c) => c.status === "UNPAID" || c.status === "OVERDUE").length;

  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = ordered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function changeMonth(delta: number) {
    setMonth((current) => shiftMonth(current, delta));
    setPage(0);
  }

  const atCurrentMonth = month >= currentMonth();

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        onBack={() => router.back()}
        eyebrow="Billing"
        title="Payment"
        italicTail="history."
        subtitle={property ? `Paid, late and unpaid bills for ${property.name}.` : "Select a property from Home to view payment history."}
      />

      {!property ? (
        <EmptyState
          icon={ReceiptText}
          eyebrow="Property required"
          title="No property selected"
          description="Choose an active property from Home before viewing payment history."
        />
      ) : (
        <>
          <MonthSelector atCurrentMonth={atCurrentMonth} label={monthLabel(month)} onNext={() => changeMonth(1)} onPrevious={() => changeMonth(-1)} />

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HistoryMetric label="Paid" tone="success" value={String(paidCount)} />
            <HistoryMetric label="Late" tone="warning" value={String(lateCount)} />
            <HistoryMetric label="Unpaid" tone="primary" value={String(unpaidCount)} />
          </View>

          <Section eyebrow={monthLabel(month)} title={`${ordered.length} bill${ordered.length === 1 ? "" : "s"}`}>
            {cyclesQuery.isFetching && ordered.length === 0 ? <SkeletonList rows={4} /> : null}

            {!cyclesQuery.isFetching && ordered.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                eyebrow="No history"
                title="No payment history found"
                description="No bills started in this month."
              />
            ) : null}

            <View style={{ gap: spacing.sm }}>
              {pageItems.map((cycle) => (
                <PaymentHistoryRow cycle={cycle} key={cycle.id} />
              ))}
            </View>

            {ordered.length > 0 ? (
              <PaginationBar
                hasNext={safePage + 1 < totalPages}
                hasPrevious={safePage > 0}
                onNext={() => setPage(safePage + 1)}
                onPrevious={() => setPage(Math.max(0, safePage - 1))}
                page={safePage}
                totalElements={ordered.length}
                totalPages={totalPages}
              />
            ) : null}
          </Section>
        </>
      )}
    </ScreenScrollView>
  );
}

function MonthSelector({ atCurrentMonth, label, onNext, onPrevious }: { atCurrentMonth: boolean; label: string; onNext: () => void; onPrevious: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
      <RoundIconButton icon={ChevronLeft} label="Previous month" onPress={onPrevious} />
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "600" }} selectable>
        {label}
      </Text>
      <RoundIconButton disabled={atCurrentMonth} icon={ChevronRight} label="Next month" onPress={onNext} />
    </View>
  );
}

function RoundIconButton({ disabled = false, icon: Icon, label, onPress }: { disabled?: boolean; icon: typeof ChevronLeft; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 12, height: 40, justifyContent: "center", opacity: disabled ? 0.4 : 1, width: 40 }}
    >
      <Icon color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function HistoryMetric({ label, tone, value }: { label: string; tone: "success" | "warning" | "primary"; value: string }) {
  const { colors, fonts, type } = useTheme();
  const color = tone === "success" ? colors.successText : tone === "warning" ? colors.warningText : colors.primary;
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, gap: 2, padding: spacing.md }}>
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={{ color, fontFamily: fonts.display, fontSize: 22, fontWeight: "700" }} selectable>
        {value}
      </Text>
    </View>
  );
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
