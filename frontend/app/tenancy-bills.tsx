import { HelpModalClose } from "@/components/help-modal-header";
import { FilterMark } from "@/features/owner/status-filter-marks";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ModalTitle } from "@/components/modal-title";
import { CenterModal } from "@/components/center-modal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, View, type ImageSourcePropType } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { AlertCircle, CalendarDays, ChevronRight, CircleCheck, Clock3, History, Receipt, ReceiptText, SlidersHorizontal, X } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { PaginationBar } from "@/components/pagination-bar";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SearchField, SearchFilterButton } from "@/components/search-field";
import { FilteredSearch } from "@/components/filtered-queue";
import { AnimatedPressable } from "@/components/animated-pressable";
import { cardShadow, softShadow } from "@/theme/shadows";
import { TabSwitcher } from "@/components/tab-switcher";
import { ScreenHeader } from "@/components/screen-header";
import { PastBillsIcon } from "@/components/past-bills-icon";
import { ColorCalendarIcon } from "@/components/color-calendar-icon";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonList, SkeletonTiles } from "@/components/skeleton";
import { Card } from "@/components/card";
import { ActionButton, IconButton } from "@/features/owner/owner-ui";
import { useTheme } from "@/theme/use-theme";
import { BillPaymentIntentsSheet } from "@/features/billing/bill-payment-intents-sheet";
import { PayBillSheet } from "@/features/billing/pay-bill-sheet";
import { PaymentDecisionModal } from "@/features/billing/payment-decision-modal";
import { TenantBillCard } from "@/features/billing/tenant-bill-card";
import { TenantBillReceiptSheet } from "@/features/billing/tenant-bill-receipt-sheet";
import { StartsSoonBubble, daysUntil, startsInLabel } from "@/features/tenancy/starts-soon-bubble";
import { formatMoney } from "@/features/owner/bill-views";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  billTitle,
  isDamageBill,
  useListMyTenancyBillingCyclesQuery,
  type BillingCycle,
} from "@/store/services/billing-api";
import {
  useGetMyPaymentStateQuery,
  useListMyLivePaymentIntentsQuery,
  type PaymentIntent,
} from "@/store/services/payment-intent-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { paginateArray } from "@/store/pagination";
import { radii, spacing } from "@/theme/spacing";

/** Which kind of bill the switcher is showing. */
type BillTab = "RENT_CYCLE" | "ONE_OFF";

/**
 * Every state a bill can actually be in, as the tenant would name it.
 *
 * <p>
 * No CANCELLED. The status exists on {@code BillingCycleStatus} and is guarded
 * against in several places, but {@code BillingCycle.cancel()} has no caller
 * anywhere in the backend — no service, no endpoint, no scheduler — so no bill
 * has ever been in it. A filter option that can never match is a promise the
 * list cannot keep.
 *
 * <p>
 * Ordered by what a tenant is looking for: settled first, then the three
 * degrees of not-settled.
 */
type BillStatusFilter = "ALL" | "PAID" | "UNPAID" | "OVERDUE" | "CONFIRMATION_PENDING";

const STATUS_OPTIONS: { label: string; value: BillStatusFilter }[] = [
  { label: "Any status", value: "ALL" },
  { label: "Paid", value: "PAID" },
  { label: "Unpaid", value: "UNPAID" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Confirming", value: "CONFIRMATION_PENDING" },
];

/**
 * Bills to a page.
 *
 * <p>Smaller than the owner's eight. This list is one month of one stay, so a
 * page that holds five is nearly always the whole of it — the pager is there for
 * the stay that carries a rent cycle and a handful of one-off charges in the
 * same month, not for routine scrolling.
 */
const BILL_PAGE_SIZE = 5;

const BILLING_HISTORY_ILLUSTRATION = require("../assets/images/workspace/billing-header.png");
const NO_BILL_ILLUSTRATION = require("../assets/empty-states/No-Bill_512x436.png");

/**
 * Everything a tenant owes on this stay, and the three things they can do
 * about each one.
 *
 * <p>
 * The owner's billing screen without the parts that are not theirs: no tools
 * row, because a tenant does not raise one-off bills or export a monthly
 * report, and no upcoming-cycles button, because a cycle they cannot pay yet is
 * not something to go looking at. What is left is the summary, the bills, and a
 * door to the ones already settled.
 *
 * <p>
 * <b>Payable bills only.</b> Settled ones are behind the history card — a list
 * that mixes "pay this" with "you paid this" makes the reader do the filtering
 * the screen should have done.
 */
type BillTypeFilter = "ALL" | "RENT" | "DAMAGE" | "OTHER";
/** The owner's bill-type filter (user, 2026-11-11). */
const BILL_TYPE_OPTIONS: { label: string; value: BillTypeFilter }[] = [
  { label: "All bills", value: "ALL" },
  { label: "Rent cycles", value: "RENT" },
  { label: "Damage bills", value: "DAMAGE" },
  { label: "Other bills", value: "OTHER" },
];

function matchesBillType(cycle: BillingCycle, filter: BillTypeFilter) {
  if (filter === "RENT") return cycle.category === "RENT_CYCLE";
  if (filter === "DAMAGE") return cycle.category === "ONE_OFF" && isDamageBill(cycle);
  if (filter === "OTHER") return cycle.category === "ONE_OFF" && !isDamageBill(cycle);
  return true;
}

/** Earlier months' bills, one compact row with the count (user, 2026-11-11). */
function PastBillsRow({ onPress }: { onPress: () => void }) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Past bills"
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...cardShadow(colors.shadow),
      }}
    >
      {/* A colour bill with the past clock (user, 2026-11-14). */}
      <PastBillsIcon size={44} />
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>Past bills</Text>
        <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>Bills from earlier months</Text>
      </View>
      <View style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderRadius: 999, height: 30, justifyContent: "center", width: 30 }}>
        <ChevronRight color={colors.muted} size={16} strokeWidth={2.3} />
      </View>
    </AnimatedPressable>
  );
}

export default function TenancyBillsScreen() {
  const router = useGuardedRouter();
  const { colors, fonts } = useTheme();
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();

  const cyclesQuery = useListMyTenancyBillingCyclesQuery(tenancyId ?? "", { skip: !tenancyId });
  const liveIntentsQuery = useListMyLivePaymentIntentsQuery(tenancyId ?? "", { skip: !tenancyId });

  const [viewingIntents, setViewingIntents] = useState<BillingCycle | null>(null);
  const [payingBill, setPayingBill] = useState<BillingCycle | null>(null);
  const [deciding, setDeciding] = useState<PaymentIntent | null>(null);
  const [billType, setBillType] = useState<BillTypeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BillStatusFilter>("ALL");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<BillingCycle | null>(null);
  const [page, setPage] = useState(0);
  const askedAboutRef = useRef<string | null>(null);
  const paymentStateQuery = useGetMyPaymentStateQuery(payingBill?.id ?? "", { skip: !payingBill });
  const paymentState = paymentStateQuery.data;

  /**
   * Open an unfinished UPI attempt only here, while My bills is focused.
   *
   * <p>The tenant tab used to own this re-entry prompt, which meant returning
   * from a payment app could put a billing decision over the tenancy home.
   * Keeping the listener on this route also prevents a mounted My bills screen
   * in the background from placing a native modal over bill details.
   */
  const askAbout = useCallback((intent: PaymentIntent) => {
    askedAboutRef.current = intent.id;
    setDeciding(intent);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (deciding || payingBill || viewingIntents || viewingReceipt || statusPickerOpen) {
        return;
      }

      const unanswered = (liveIntentsQuery.data ?? []).find(
        (intent) => intent.status === "CREATED" && intent.method === "UPI",
      );
      if (unanswered && askedAboutRef.current !== unanswered.id) {
        askAbout(unanswered);
      }
    }, [
      askAbout,
      deciding,
      liveIntentsQuery.data,
      payingBill,
      statusPickerOpen,
      viewingIntents,
      viewingReceipt,
    ]),
  );

  // Dismissing the question does not make it bounce straight back. Leaving
  // My bills and opening it again is a new visit, so an unresolved attempt is
  // offered again then.
  useFocusEffect(
    useCallback(
      () => () => {
        askedAboutRef.current = null;
      },
      [],
    ),
  );

  /**
   * The stay's property, for the receipt's letterhead.
   *
   * <p>Guarded on the id rather than taken on trust. This screen is opened with
   * a tenancy in its params, and stamping the ACTIVE stay's property onto a bill
   * from a different one would put the wrong address on a document a tenant may
   * well forward to somebody.
   */
  const activeTenancy = useGetMyActiveTenancyQuery().data;
  const receiptProperty = activeTenancy && activeTenancy.tenancy.id === tenancyId ? activeTenancy.property : null;

  const cycles = useMemo(
    () =>
      [...(cyclesQuery.data ?? [])].sort(
        (left, right) => new Date(right.periodStartDate).getTime() - new Date(left.periodStartDate).getTime(),
      ),
    [cyclesQuery.data],
  );

  const liveIntentByCycle = useMemo(() => {
    const byCycle = new Map<string, PaymentIntent>();
    for (const intent of liveIntentsQuery.data ?? []) {
      byCycle.set(intent.billingCycleId, intent);
    }
    return byCycle;
  }, [liveIntentsQuery.data]);

  // CONFIRMATION_PENDING counts as payable. It is neither settled nor payable
  // in the strict sense, and leaving it out of both lists made a bill vanish
  // the moment its tenant said they had paid it — the one moment they look.
  const payable = useMemo(
    () =>
      cycles.filter(
        (cycle) =>
          cycle.status === "UNPAID" || cycle.status === "OVERDUE" || cycle.status === "CONFIRMATION_PENDING",
      ),
    [cycles],
  );
  // Everything not from this month. The card says how many are back there so
  // the door is worth opening.
  const pastCount = useMemo(() => {
    const thisMonth = istMonthKey(new Date());
    return cycles.filter((cycle) => istMonthKey(new Date(cycle.periodStartDate)) !== thisMonth).length;
  }, [cycles]);

  /**
   * What the list shows: THIS MONTH's bills of the chosen kind, narrowed by
   * status and by text.
   *
   * <p>
   * The month is the whole point of the split. A tenant opens this to answer
   * "where am I this month", and everything older is a record rather than a
   * question — so it lives in Past bills, which has the same search and its own
   * status filter.
   *
   * <p>
   * Keyed on the period START in IST, not on today falling inside the period.
   * A monthly cycle is anchored to the tenancy's start date, so one running
   * 07 Sep to 06 Oct is September's bill for the whole of its life, and on
   * 2 October it should already have moved to Past bills alongside the October
   * cycle that replaced it.
   */
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const thisMonth = istMonthKey(new Date());
    return cycles
      .filter((cycle) => matchesBillType(cycle, billType))
      .filter((cycle) => istMonthKey(new Date(cycle.periodStartDate)) === thisMonth)
      .filter((cycle) => status === "ALL" || cycle.status === status)
      .filter(
        (cycle) =>
          !term
          || cycle.referenceCode.toLowerCase().includes(term)
          || billTitle(cycle).toLowerCase().includes(term),
      );
  }, [billType, cycles, search, status]);

  // Back to the first page whenever the list underneath changes. Staying on
  // page three of a list that now has one page is how a filter looks broken.
  useEffect(() => {
    setPage(0);
  }, [billType, search, status]);

  const paged = paginateArray(shown, page, BILL_PAGE_SIZE);

  /**
   * Days until billing begins, while it has not begun yet: no rent cycle has
   * left UPCOMING. Counted to the first cycle's start (its window opens then),
   * or to the stay's start when no cycle has been raised yet. Zero once the
   * first window is open, which hides the note.
   */
  const billingStartsIn = useMemo(() => {
    const rent = cycles.filter((cycle) => cycle.category === "RENT_CYCLE");
    if (rent.some((cycle) => cycle.status !== "UPCOMING")) {
      return 0;
    }
    const firstStart =
      rent.map((cycle) => cycle.periodStartDate.slice(0, 10)).sort()[0]
      ?? (activeTenancy && activeTenancy.tenancy.id === tenancyId ? activeTenancy.tenancy.startDate : null);
    return firstStart ? Math.max(0, daysUntil(firstStart)) : 0;
  }, [activeTenancy, cycles, tenancyId]);

  // A red dot on a tab while a bill in it is waiting to be paid. Counted over
  // what the tab lists (this month), so the dot never points at a bill the tab
  // does not show. Upcoming bills are not payable yet and confirming ones are
  // with the owner, so neither counts.
  const unpaidThisMonth = useMemo(() => {
    const thisMonth = istMonthKey(new Date());
    return cycles.filter(
      (cycle) =>
        (cycle.status === "UNPAID" || cycle.status === "OVERDUE")
        && istMonthKey(new Date(cycle.periodStartDate)) === thisMonth,
    );
  }, [cycles]);

  const dueNowPaise = payable.reduce((total, cycle) => total + cycle.totalAmountPaise, 0);
  const overdueCount = payable.filter((cycle) => cycle.status === "OVERDUE").length;
  const paidPaise = cycles
    .filter((cycle) => cycle.status === "PAID")
    .reduce((total, cycle) => total + cycle.totalAmountPaise, 0);
  // The earliest date still owed. Sorted newest-first above, so the last
  // payable row is the oldest — which is the one that comes due first.
  const nextDue = payable.length > 0 ? payable[payable.length - 1].rentDueDate : null;

  function payHandlerFor(cycle: BillingCycle) {
    // Only a bill whose window is open can be paid. UPCOMING is not open yet,
    // and a paid, cancelled or confirming one has nothing left to pay.
    if (cycle.status !== "UNPAID" && cycle.status !== "OVERDUE") {
      return null;
    }
    const openAttempt = liveIntentByCycle.get(cycle.id);
    if (openAttempt) {
      return openAttempt.status === "CREATED" ? () => askAbout(openAttempt) : null;
    }
    return () => setPayingBill(cycle);
  }

  const loadFailed = loadFailure(cyclesQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  return (
    // Closer under the title bar than the 18 default, no empty band (user, 2026-11-14).
    <ScreenScrollView contentContainerStyle={{ paddingTop: spacing.sm }} safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="bills."
        subtitle="Manage this month's rent, charges and other bills all in one place."
        title="My"
      />

      {/* Which month the four numbers below are counting. They are a summary of
          one month, not of the stay, and without the date on them "Paid so far"
          reads as everything ever paid. */}
      <View style={{ gap: spacing.sm }}>
        <View
          style={{
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: colors.surfaceSunken,
            borderCurve: "continuous",
            borderRadius: 8,
            flexDirection: "row",
            gap: spacing.xs,
            paddingHorizontal: spacing.sm,
            paddingVertical: 6,
          }}
        >
          {/* The owner's colour calendar, as on their month picker (user, 2026-11-14). */}
          <ColorCalendarIcon size={16} />
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 13 }}>
            {currentMonthLabel()}
          </Text>
        </View>

        {cyclesQuery.isFetching && cycles.length === 0 ? (
          <SkeletonTiles count={4} />
        ) : (
          <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              icon={AlertCircle}
              iconPlacement="side"
              iconTone="ink"
              label="Due now"
              value={formatMoney(dueNowPaise)}
            />
            <MetricTile
              icon={Clock3}
              iconPlacement="side"
              iconTone="ink"
              label="Overdue"
              value={String(overdueCount)}
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              icon={CircleCheck}
              iconPlacement="side"
              iconTone="ink"
              label="Paid so far"
              value={formatMoney(paidPaise)}
            />
            <MetricTile
              icon={CalendarDays}
              iconPlacement="side"
              iconTone="ink"
              label="Next due"
              value={nextDue ? formatDueDate(nextDue) : "—"}
            />
          </View>
          </View>
        )}
      </View>

      {/* Under the four tiles, one compact row (user, 2026-11-11). */}
      <PastBillsRow
        onPress={() => router.push({ pathname: "/tenancy-billing-history", params: { tenancyId } })}
      />

      {/* No heading over this. The switcher names what is below it, and a
          "To pay" title above a tab that can be showing paid bills would be
          describing the wrong list half the time. */}
      {billingStartsIn > 0 ? <StartsSoonBubble title={startsInLabel("Billing", billingStartsIn)} /> : null}

      {/* One list for every bill, filtered by kind beside the search, as the
          owner's Billing does (user, 2026-11-11). */}
      <FilteredSearch<BillTypeFilter>
        // "All", or the kind's first word and an ellipsis, so the pill stays small (user, 2026-11-11).
        bubbleLabel={(option) => (option.value === "ALL" ? "All" : `${option.label.split(" ")[0]}…`)}
        onChange={setBillType}
        options={BILL_TYPE_OPTIONS}
        purpose="Bill type"
        search={
          <SearchField
            autoCapitalize="characters"
            onChangeText={setSearch}
            placeholder="Search by bill reference"
            trailing={
              <SearchFilterButton accessibilityLabel="Filter bills by payment status" active={status !== "ALL"} inside onPress={() => setStatusPickerOpen(true)} />
            }
            value={search}
          />
        }
        value={billType}
      >
      <View style={{ gap: spacing.sm }}>
        {shown.length > 0 ? (
          // Snug between the search and the list: 8 above, 6 below (user, 2026-11-14).
          <View style={{ alignSelf: "flex-start", backgroundColor: colors.surfaceSunken, borderRadius: 999, marginBottom: -4, marginTop: -6, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
            <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 11 }}>
              {`${shown.length} bill${shown.length === 1 ? "" : "s"}`}
            </Text>
          </View>
        ) : null}

        {cyclesQuery.isFetching && cycles.length === 0 ? (
          <SkeletonList rows={2} />
        ) : shown.length === 0 ? (
          <EmptyState
            artwork={NO_BILL_ILLUSTRATION}
            description={
              search.trim() || status !== "ALL"
                ? "Nothing matched. Try a different reference or status."
                : "This month's bills appear here once they are raised. Earlier ones are in Past bills."
            }
            title={search.trim() || status !== "ALL" ? "No matching bills" : "Nothing this month"}
          />
        ) : (
          <>
            {/* Billing cycles are never paged: a month holds one live cycle
                (user, 2026-09-27). Other bills can pile up, so they keep it. */}
            {paged.pageItems.map((cycle) => (
              <TenantBillCard
                cycle={cycle}
                key={cycle.id}
                onPay={payHandlerFor(cycle)}
                onViewBill={() => setViewingReceipt(cycle)}
                onViewIntents={() => setViewingIntents(cycle)}
                openAttempt={liveIntentByCycle.get(cycle.id) ?? null}
              />
            ))}

            {/* On Other bills, shown whenever there is a bill, not only once
                there are two pages: the bar carries the running total as well
                as the position, so on a single page it still says something. */}
            {paged.totalPages > 1 ? (
              <PaginationBar
                hasNext={paged.hasNext}
                hasPrevious={paged.hasPrevious}
                onNext={() => setPage(paged.page + 1)}
                onPrevious={() => setPage(Math.max(0, paged.page - 1))}
                page={paged.page}
                totalElements={paged.totalElements}
                totalPages={paged.totalPages}
              />
            ) : null}
          </>
        )}
      </View>
      </FilteredSearch>

      {statusPickerOpen ? (
        <StatusFilterDialog
          onClose={() => setStatusPickerOpen(false)}
          onSelect={setStatus}
          value={status}
        />
      ) : null}

      {/* The owner's receipt, unchanged — View bill shows the tenant the same
          document the owner looks at and the PDF prints. It used to push the
          line-items screen, which is a breakdown rather than a bill. */}
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
          onResolve={(intent) => {
            setViewingIntents(null);
            askAbout(intent);
          }}
        />
      ) : null}

      {payingBill && paymentStateQuery.isLoading ? (
        <SheetShell onClose={() => setPayingBill(null)} title="Pay">
          <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </SheetShell>
      ) : null}

      {/* Every property takes at least one way of paying (cash by default), so
          the sheet always has something to show. */}
      {payingBill && paymentState ? (
        <PayBillSheet
          amountPaise={payingBill.totalAmountPaise}
          billingCycleId={payingBill.id}
          billVersion={payingBill.version}
          cashOtpRequired={paymentState.cashOtpRequired}
          hasPayLink={paymentState.payLinkAvailable}
          methods={paymentState.acceptedMethods}
          onClose={() => setPayingBill(null)}
          onStarted={(intent) => {
            setPayingBill(null);
            askAbout(intent);
          }}
          payee={paymentState.payee}
          referenceCode={payingBill.referenceCode}
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
 * A door to another billing screen, drawn the way the owner's concern and
 * request history cards are.
 *
 * <p>Artwork beside the words rather than above them: above, it pushes the
 * title into the middle of the card and leaves the eyebrow floating at the top
 * on its own.
 */
function BillsRouteCard({
  artwork,
  buttonLabel,
  description,
  eyebrow,
  onPress,
  title,
}: {
  artwork: ImageSourcePropType;
  buttonLabel: string;
  description: string;
  eyebrow: string;
  onPress: () => void;
  title: string;
}) {
  const { colors, type } = useTheme();

  return (
    <Card>
      {/* The exit-request and room-change history preset: 96pt artwork, a 22pt
          title, and the row centred rather than top-aligned. Concerns uses 76
          and flex-start because its title wraps to two lines and fills that
          height on its own — this one fits on a single line, so the smaller
          mark left the card looking half empty beside it. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
          <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>{title}</Text>
          {/* Beside the artwork, not stacked under the row. Under it, the
              description was a third block with a gap above it and the card
              stood a good 40pt taller than it needed to — the artwork's own
              height was already paying for those lines. */}
          <Text style={[type.description, { color: colors.muted }]}>{description}</Text>
        </View>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={artwork}
          style={{ height: 96, width: 96 }}
        />
      </View>

      <ActionButton icon={History} label={buttonLabel} onPress={onPress} variant="secondary" />
    </Card>
  );
}

/**
 * The status filter, behind the icon in the search box.
 *
 * <p>A centred dialog of picker rows rather than a field: this is a filter on a
 * list, not an answer being collected, and the notice board's filter uses the
 * same shape. Tapping the scrim closes it — a six-option choice does not
 * deserve a seventh row for Cancel.
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
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Plain Pressables, NOT AnimatedPressable. That component springs a
          scale transform on press, and on a full-screen scrim it scales the
          whole dimmed screen as the modal fades — the backdrop appears to
          shrink away from the edges on the way out. InfoModal has this right
          and this follows it. */}
      {/* Closes by its own close button, a choice or the device back button, not a tap
          on the scrim (user, 2026-09-29). */}
      <View style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}>
        <View style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 14,
            overflow: "hidden",
            width: "100%",
          }}>
          <HelpModalClose corner onClose={onClose} />
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: spacing.sm,
              paddingLeft: spacing.lg,
              paddingRight: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <ModalTitle style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 19 }}>
              Payment status
            </ModalTitle>
          </View>

          {/* A little room under the title (user, 2026-11-11). */}
          <View style={{ paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            {STATUS_OPTIONS.map((option) => (
              <PickerOptionRow
                icon={<FilterMark value={option.value} />}
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
        </View>
      </View>
    </CenterModal>
  );
}

/**
 * This month, spelled out — "September 2026".
 *
 * <p>Asia/Kolkata, like every other "today" in the app. On the first of a month
 * a phone left on another zone would put last month's name over this month's
 * numbers.
 */
function currentMonthLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date());
}

/**
 * A date's month, in IST.
 *
 * <p>Asia/Kolkata rather than the device's zone, like every other "today" in
 * the app: on the first of a month a phone left on another zone would file this
 * month's bill under last month.
 */
function istMonthKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" }).format(date);
}

/** Day and month — the year is never in question for a bill still owed. */
function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
