import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ReceiptText } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonList } from "@/components/skeleton";
import { MonthSelector, currentMonth } from "@/components/month-selector";
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

type BillFilter = "ALL" | "RENT_CYCLE" | "ONE_OFF";
const FILTERS: { label: string; value: BillFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Cycles", value: "RENT_CYCLE" },
  { label: "Other bills", value: "ONE_OFF" },
];

export default function OwnerPaymentHistoryScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const [month, setMonth] = useState(params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth());
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<BillFilter>("ALL");

  const cyclesQuery = useListPropertyBillingCyclesQuery({ month, propertyId }, { skip: !propertyId });
  const ordered = useMemo(() => [...(cyclesQuery.data ?? [])].sort(comparePaymentHistoryCycles), [cyclesQuery.data]);

  // Rent cycles and one-off bills read very differently — a penalty next to a
  // month's rent is easy to misread as rent. Split them the way tenant bills do.
  const rentCount = ordered.filter((c) => c.category === "RENT_CYCLE").length;
  const oneOffCount = ordered.filter((c) => c.category === "ONE_OFF").length;
  const visible = filter === "ALL" ? ordered : ordered.filter((c) => c.category === filter);

  // The metrics describe what is on screen, so they follow the filter too.
  const paidCount = visible.filter((c) => c.status === "PAID").length;
  const lateCount = visible.filter((c) => c.status === "PAID" && paymentHistoryStatus(c) === "OVERDUE").length;
  const unpaidCount = visible.filter((c) => c.status === "UNPAID" || c.status === "OVERDUE").length;

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function pickFilter(next: BillFilter) {
    setFilter(next);
    setPage(0);
  }

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
          <MonthSelector onChange={setMonth} value={month} />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {FILTERS.map((entry) => (
              <FilterPill
                active={filter === entry.value}
                count={entry.value === "RENT_CYCLE" ? rentCount : entry.value === "ONE_OFF" ? oneOffCount : ordered.length}
                key={entry.value}
                label={entry.label}
                onPress={() => pickFilter(entry.value)}
              />
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HistoryMetric label="Paid" value={String(paidCount)} />
            <HistoryMetric label="Late" value={String(lateCount)} />
            <HistoryMetric label="Unpaid" value={String(unpaidCount)} />
          </View>

          <Section eyebrow={monthLabel(month)} title={`${visible.length} bill${visible.length === 1 ? "" : "s"}`}>
            {cyclesQuery.isFetching && visible.length === 0 ? <SkeletonList rows={4} /> : null}

            {!cyclesQuery.isFetching && visible.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                eyebrow="No history"
                title="No payment history found"
                description={
                  ordered.length === 0
                    ? "No bills started in this month."
                    : "Switch the filter above to see this month's other bills."
                }
              />
            ) : null}

            <View style={{ gap: spacing.sm }}>
              {pageItems.map((cycle) => (
                <PaymentHistoryRow cycle={cycle} key={cycle.id} />
              ))}
            </View>

            {visible.length > 0 ? (
              <PaginationBar
                hasNext={safePage + 1 < totalPages}
                hasPrevious={safePage > 0}
                onNext={() => setPage(safePage + 1)}
                onPrevious={() => setPage(Math.max(0, safePage - 1))}
                page={safePage}
                totalElements={visible.length}
                totalPages={totalPages}
              />
            ) : null}
          </Section>
        </>
      )}
    </ScreenScrollView>
  );
}



/**
 * Matches the billing summary tiles: eyebrow label, ink figure, no tone colour.
 * Colouring each figure by status made three tiles shout at once — green, amber
 * and blue side by side read as three warnings rather than one breakdown. The
 * label carries the meaning; the figure just has to be legible.
 */
function HistoryMetric({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker }]}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        numberOfLines={1}
        style={[type.metric, { color: colors.ink, fontSize: 22, lineHeight: 26 }]}
      >
        {value}
      </Text>
    </View>
  );
}



function FilterPill({ active, count, label, onPress }: { active: boolean; count: number; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm - 2,
      }}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, }}>
        {label} · {count}
      </Text>
    </AnimatedPressable>
  );
}
