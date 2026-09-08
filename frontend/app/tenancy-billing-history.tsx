import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SlidersHorizontal } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { CountTabPills } from "@/components/filter-bubbles";
import { PickerOptionRow } from "@/components/picker-option-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { SkeletonList } from "@/components/skeleton";
import { BillPaymentIntentsSheet } from "@/features/billing/bill-payment-intents-sheet";
import { TenantBillCard } from "@/features/billing/tenant-bill-card";
import { TenantBillReceiptSheet } from "@/features/billing/tenant-bill-receipt-sheet";
import { IconButton } from "@/features/owner/owner-ui";
import { billTitle, useListMyTenancyBillingCyclesQuery, type BillingCycle } from "@/store/services/billing-api";
import { useListMyLivePaymentIntentsQuery, type PaymentIntent } from "@/store/services/payment-intent-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_BILL_ILLUSTRATION = require("../assets/workspace/No-Bill_512x436.png");

/**
 * First screenful, and how many more arrive each time the reader reaches the end.
 *
 * <p>Five, matching the bills screen's page. Eight was more bills than most
 * stays have behind them, so the list rendered whole and the paging never ran.
 */
const PAGE_SIZE = 5;

/** How close to the bottom counts as "reached the end", in px. */
const LOAD_MORE_THRESHOLD_PX = 240;

type BillFilter = "ALL" | "RENT_CYCLE" | "ONE_OFF";

/**
 * Paid, or not paid.
 *
 * <p>
 * Two states, because those are the only two a bill from an earlier month can
 * be in. UNPAID and OVERDUE are the same fact to somebody looking backwards —
 * the month has gone and the money has not — so they answer to one option
 * rather than making the reader guess which one an old bill counts as.
 *
 * <p>
 * No CANCELLED. {@code BillingCycle.cancel()} has no caller anywhere in the
 * backend, so no bill has ever been in that state.
 */
type BillStatusFilter = "ALL" | "PAID" | "UNPAID";

const STATUS_OPTIONS: { label: string; value: BillStatusFilter }[] = [
  { label: "Any status", value: "ALL" },
  { label: "Paid", value: "PAID" },
  { label: "Unpaid", value: "UNPAID" },
];

/**
 * Every bill from a month that has gone.
 *
 * <p>
 * The other half of the tenant's billing split: this month's bills sit on the
 * bills screen, where they are still a question, and everything before it is
 * here, where it is a record. Paid or not — an old cycle that was never settled
 * belongs in the record too, and hiding it would be the one bill a tenant most
 * needs to find.
 */
export default function TenancyBillingHistoryScreen() {
  const { colors, type } = useTheme();
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();

  const cyclesQuery = useListMyTenancyBillingCyclesQuery(tenancyId ?? "", { skip: !tenancyId });
  const liveIntentsQuery = useListMyLivePaymentIntentsQuery(tenancyId ?? "", { skip: !tenancyId });

  const [filter, setFilter] = useState<BillFilter>("ALL");
  const [status, setStatus] = useState<BillStatusFilter>("ALL");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [viewingIntents, setViewingIntents] = useState<BillingCycle | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<BillingCycle | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /**
   * The stay's property, for the receipt's letterhead.
   *
   * <p>Only when it is the stay this screen was opened for. An old bill from a
   * previous tenancy must not be printed under the address of the current one.
   */
  const activeTenancy = useGetMyActiveTenancyQuery().data;
  const receiptProperty = activeTenancy && activeTenancy.tenancy.id === tenancyId ? activeTenancy.property : null;

  const liveIntentByCycle = useMemo(() => {
    const byCycle = new Map<string, PaymentIntent>();
    for (const intent of liveIntentsQuery.data ?? []) {
      byCycle.set(intent.billingCycleId, intent);
    }
    return byCycle;
  }, [liveIntentsQuery.data]);

  /**
   * Everything whose period began before this month, newest first.
   *
   * <p>Keyed on the period start in IST, the same rule the bills screen uses to
   * decide what is current. The two must agree, or a bill falls through the gap
   * between them and appears on neither.
   */
  const past = useMemo(() => {
    const thisMonth = istMonthKey(new Date());
    return [...(cyclesQuery.data ?? [])]
      .filter((cycle) => istMonthKey(new Date(cycle.periodStartDate)) !== thisMonth)
      .sort((left, right) => new Date(right.periodStartDate).getTime() - new Date(left.periodStartDate).getTime());
  }, [cyclesQuery.data]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return past
      .filter((cycle) => filter === "ALL" || cycle.category === filter)
      .filter((cycle) => {
        if (status === "ALL") {
          return true;
        }
        return status === "PAID" ? cycle.status === "PAID" : cycle.status !== "PAID";
      })
      .filter(
        (cycle) =>
          !term
          || cycle.referenceCode.toLowerCase().includes(term)
          || billTitle(cycle).toLowerCase().includes(term),
      );
  }, [filter, past, search, status]);

  const visible = shown.slice(0, visibleCount);
  const hasMore = visibleCount < shown.length;

  /**
   * Pages the RENDER, not the fetch.
   *
   * <p>A tenancy's bills arrive as one payload, so there is nothing further to
   * ask the server for. What this avoids is mounting a hundred bill cards — each
   * with its own status pill, totals and payment-window modal — for a list the
   * reader will scroll two screens of.
   */
  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!hasMore) {
      return;
    }
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom <= LOAD_MORE_THRESHOLD_PX) {
      setVisibleCount((current) => Math.min(current + PAGE_SIZE, shown.length));
    }
  }

  // Back to one screenful whenever the list underneath changes. Keeping a grown
  // window across a filter change means a search of three results renders all
  // three and then claims there is more below.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, search, status]);

  const narrowed = Boolean(search.trim()) || status !== "ALL" || filter !== "ALL";

  return (
    <ScreenScrollView onScroll={handleScroll} safeAreaEdges={["top", "bottom"]}>
      {/* No back row. The gesture and the hardware button both still leave,
          and an arrow above a filter strip is one more thing between the reader
          and the list they came for. */}
      <ScreenHeader
        italicTail="bills."
        subtitle="Bills from earlier months, paid or still owed."
        title="Past"
      />

      <CountTabPills<BillFilter>
        onChange={setFilter}
        options={[
          { count: past.length, label: "All", value: "ALL" },
          { count: past.filter((cycle) => cycle.category === "RENT_CYCLE").length, label: "Rent cycles", value: "RENT_CYCLE" },
          { count: past.filter((cycle) => cycle.category === "ONE_OFF").length, label: "Others", value: "ONE_OFF" },
        ]}
        value={filter}
      />

      <SearchField
        autoCapitalize="characters"
        onChangeText={setSearch}
        placeholder="Search by bill reference"
        trailing={
          <IconButton
            accessibilityLabel="Filter bills by payment status"
            icon={SlidersHorizontal}
            onPress={() => setStatusPickerOpen(true)}
          />
        }
        value={search}
      />

      {cyclesQuery.isFetching && past.length === 0 ? (
        <SkeletonList rows={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          artwork={NO_BILL_ILLUSTRATION}
          description={
            narrowed
              ? "Nothing matched. Try a different reference or status."
              : "Bills move here once their month has passed."
          }
          title={narrowed ? "No matching bills" : "No past bills"}
        />
      ) : (
        <>
          {visible.map((cycle) => (
            <TenantBillCard
              cycle={cycle}
              key={cycle.id}
              // Paying happens on the tenancy tab, which owns the payment sheet
              // and the attempt-decision flow. An old unpaid bill is still paid
              // from there, not from a second button on a record screen.
              onPay={null}
              onViewBill={() => setViewingReceipt(cycle)}
              onViewIntents={() => setViewingIntents(cycle)}
              openAttempt={liveIntentByCycle.get(cycle.id) ?? null}
            />
          ))}

          {/* The end of the list says which end it is: more on the way, or
              nothing after this. A list that just stops leaves the reader
              scrolling to find out. */}
          {hasMore ? (
            <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <ActivityIndicator color={colors.muted} size="small" />
            </View>
          ) : shown.length > PAGE_SIZE ? (
            <Text style={[type.caption, { color: colors.muted, paddingVertical: spacing.sm, textAlign: "center" }]}>
              That is every past bill on this stay.
            </Text>
          ) : null}
        </>
      )}

      {statusPickerOpen ? (
        <StatusFilterDialog onClose={() => setStatusPickerOpen(false)} onSelect={setStatus} value={status} />
      ) : null}

      {/* The owner's receipt, unchanged — the same document the PDF prints. */}
      {viewingReceipt ? (
        <TenantBillReceiptSheet
          cycle={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
          property={receiptProperty}
        />
      ) : null}

      {viewingIntents ? (
        <BillPaymentIntentsSheet
          cycle={viewingIntents}
          onClose={() => setViewingIntents(null)}
          onResolve={() => setViewingIntents(null)}
        />
      ) : null}
    </ScreenScrollView>
  );
}

/**
 * The status filter, behind the icon in the search box.
 *
 * <p>Plain Pressables, not AnimatedPressable: that one springs a scale
 * transform on press, and on a full-screen scrim it scales the whole dimmed
 * screen as the modal fades out.
 */
function StatusFilterDialog({
  onClose,
  onSelect,
  value,
}: {
  onClose: () => void;
  onSelect: (value: BillStatusFilter) => void;
  value: BillStatusFilter;
}) {
  const { colors, fonts } = useTheme();

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 14,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.display,
              fontSize: 19,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            Payment status
          </Text>

          <View style={{ paddingBottom: spacing.xs, paddingHorizontal: spacing.lg }}>
            {STATUS_OPTIONS.map((option) => (
              <PickerOptionRow
                key={option.value}
                label={option.label}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                selected={option.value === value}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A date's month in IST — the same key the bills screen splits on. */
function istMonthKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" }).format(date);
}
