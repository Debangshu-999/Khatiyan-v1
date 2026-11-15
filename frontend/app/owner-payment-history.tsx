import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ReceiptText } from "lucide-react-native";

import { FilterBubble } from "@/components/filter-bubbles";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerPaymentListSkeleton } from "@/components/skeletons/owner";
import { MonthSelector, currentMonth } from "@/components/month-selector";
import { useAvailableAccounts } from "@/features/account/accounts";
import {
  PaymentHistoryRow,
  comparePaymentHistoryCycles,
  paymentHistoryStatus,
} from "@/features/owner/bill-views";
import { useAppSelector } from "@/store/hooks";
import { useListPropertyBillingCyclesQuery } from "@/store/services/billing-api";
import { BillStatusMark } from "@/features/owner/status-filter-marks";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

const NO_BILL_ILLUSTRATION = require("../assets/empty-states/No-Bill_512x436.png");

const PAGE_SIZE = 8;

type BillFilter = "ALL" | "RENT_CYCLE" | "ONE_OFF";
const FILTERS: { label: string; value: BillFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Cycles", value: "RENT_CYCLE" },
  { label: "Other bills", value: "ONE_OFF" },
];

export default function OwnerPaymentHistoryScreen() {
  const { colors } = useTheme();
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

  const rentCount = ordered.filter((cycle) => cycle.category === "RENT_CYCLE").length;
  const oneOffCount = ordered.filter((cycle) => cycle.category === "ONE_OFF").length;
  const visible = filter === "ALL" ? ordered : ordered.filter((cycle) => cycle.category === filter);

  const paidCount = visible.filter((cycle) => cycle.status === "PAID").length;
  const lateCount = visible.filter(
    (cycle) => cycle.status === "PAID" && paymentHistoryStatus(cycle) === "OVERDUE",
  ).length;
  const unpaidCount = visible.filter(
    (cycle) => cycle.status === "UNPAID" || cycle.status === "OVERDUE",
  ).length;

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function pickFilter(next: BillFilter) {
    setFilter(next);
    setPage(0);
  }

  const loadFailed = loadFailure(cyclesQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  return (
    <ScreenScrollView
      contentContainerStyle={{ paddingTop: spacing.xs }}
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
    >
      <PaymentHistoryHeader propertyName={property?.name ?? null} />

      {!property ? (
        <EmptyState
          icon={ReceiptText}
          title="No property selected"
          description="Choose an active property from Home before viewing payment history."
        />
      ) : (
        <>
          <MonthSelector onChange={setMonth} value={month} />

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
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
            <HistoryMetric label="Paid" status="PAID" value={String(paidCount)} />
            <HistoryMetric label="Late" status="LATE_PAY" value={String(lateCount)} />
            <HistoryMetric label="Unpaid" status="UNPAID" value={String(unpaidCount)} />
          </View>

          <View style={{ gap: spacing.md }}>
            {cyclesQuery.isFetching && visible.length === 0 ? <OwnerPaymentListSkeleton rows={4} /> : null}

            {!cyclesQuery.isFetching && visible.length === 0 ? (
              <EmptyState
                artwork={NO_BILL_ILLUSTRATION}
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
          </View>
        </>
      )}
    </ScreenScrollView>
  );
}

function PaymentHistoryHeader({ propertyName }: { propertyName: string | null }) {
  return (
    <ScreenHeader
      italicTail="history."
      subtitle={propertyName
        ? "Paid, late and unpaid bills for " + propertyName + "."
        : "Select a property from Home to view payment history."}
      title="Payment"
      titleAdjustsFontSizeToFit
      titleMinimumFontScale={0.7}
      titleNumberOfLines={1}
    />
  );
}
function HistoryMetric({
  label,
  status,
  value,
}: {
  label: string;
  status: string;
  value: string;
}) {
  const { colors, fonts } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: spacing.sm,
        minWidth: 0,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <BillStatusMark value={status} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <FitText numberOfLines={1} style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 13 }}>
          {label}
        </FitText>
        <FitText
          numberOfLines={1}
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 18,
            fontVariant: ["tabular-nums"],
            lineHeight: 21,
          }}
        >
          {value}
        </FitText>
      </View>
    </View>
  );
}

function FilterPill({ active, count, label, onPress }: { active: boolean; count: number; label: string; onPress: () => void }) {
  return <FilterBubble active={active} count={count} label={label} onPress={onPress} />;
}
