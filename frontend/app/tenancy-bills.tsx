import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, Text, View, type ImageSourcePropType } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { AlertCircle, CalendarDays, CircleCheck, Clock3, History, Receipt, ReceiptText, SlidersHorizontal } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { PaginationBar } from "@/components/pagination-bar";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SearchField } from "@/components/search-field";
import { TabSwitcher } from "@/components/tab-switcher";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonList, SkeletonTiles } from "@/components/skeleton";
import { Card } from "@/components/card";
import { ActionButton, IconButton } from "@/features/owner/owner-ui";
import { useTheme } from "@/theme/use-theme";
import { BillPaymentIntentsSheet } from "@/features/billing/bill-payment-intents-sheet";
import { TenantBillCard } from "@/features/billing/tenant-bill-card";
import { TenantBillReceiptSheet } from "@/features/billing/tenant-bill-receipt-sheet";
import { formatMoney } from "@/features/owner/bill-views";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  billTitle,
  useListMyTenancyBillingCyclesQuery,
  type BillingCycle,
} from "@/store/services/billing-api";
import { useListMyLivePaymentIntentsQuery, type PaymentIntent } from "@/store/services/payment-intent-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { paginateArray } from "@/store/pagination";
import { spacing } from "@/theme/spacing";

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

const BILLS_HEADER_ILLUSTRATION = require("../assets/workspace/tenant-bills-header.png");
const BILLING_HISTORY_ILLUSTRATION = require("../assets/workspace/billing-header.png");
const NO_BILL_ILLUSTRATION = require("../assets/workspace/No-Bill_512x436.png");

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
export default function TenancyBillsScreen() {
  const router = useGuardedRouter();
  const { colors, fonts } = useTheme();
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();

  const cyclesQuery = useListMyTenancyBillingCyclesQuery(tenancyId ?? "", { skip: !tenancyId });
  const liveIntentsQuery = useListMyLivePaymentIntentsQuery(tenancyId ?? "", { skip: !tenancyId });

  const [viewingIntents, setViewingIntents] = useState<BillingCycle | null>(null);
  const [tab, setTab] = useState<BillTab>("RENT_CYCLE");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BillStatusFilter>("ALL");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<BillingCycle | null>(null);
  const [page, setPage] = useState(0);

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
      .filter((cycle) => cycle.category === tab)
      .filter((cycle) => istMonthKey(new Date(cycle.periodStartDate)) === thisMonth)
      .filter((cycle) => status === "ALL" || cycle.status === status)
      .filter(
        (cycle) =>
          !term
          || cycle.referenceCode.toLowerCase().includes(term)
          || billTitle(cycle).toLowerCase().includes(term),
      );
  }, [cycles, search, status, tab]);

  // Back to the first page whenever the list underneath changes. Staying on
  // page three of a list that now has one page is how a filter looks broken.
  useEffect(() => {
    setPage(0);
  }, [search, status, tab]);

  const paged = paginateArray(shown, page, BILL_PAGE_SIZE);

  const dueNowPaise = payable.reduce((total, cycle) => total + cycle.totalAmountPaise, 0);
  const overdueCount = payable.filter((cycle) => cycle.status === "OVERDUE").length;
  const paidPaise = cycles
    .filter((cycle) => cycle.status === "PAID")
    .reduce((total, cycle) => total + cycle.totalAmountPaise, 0);
  // The earliest date still owed. Sorted newest-first above, so the last
  // payable row is the oldest — which is the one that comes due first.
  const nextDue = payable.length > 0 ? payable[payable.length - 1].rentDueDate : null;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      {/* No back row, for the same reason the past-bills screen has none: the
          gesture and the hardware button both still leave, and this header
          already carries artwork on the row an arrow would sit in. */}
      <ScreenHeader
        artwork={BILLS_HEADER_ILLUSTRATION}
        italicTail="bills."
        subtitle="Manage this month's rent, charges and other bills all in one place."
        title="My"
      />

      {/* Which month the four numbers below are counting. They are a summary of
          one month, not of the stay, and without the date on them "Paid so far"
          reads as everything ever paid. */}
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            alignItems: "center",
            borderColor: colors.primary,
            borderRadius: 999,
            flexDirection: "row",
            gap: spacing.xs,
            paddingHorizontal: spacing.md,
            paddingVertical: 6,
            // Outlined, not filled. A pale blue ground is `primarySoft`, which
            // is barred as a fill anywhere in the app — blue is text, icon and
            // border here.
            borderWidth: 1,
          }}
        >
          <CalendarDays color={colors.primary} size={14} strokeWidth={2.4} />
          <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>
            {currentMonthLabel()}
          </Text>
        </View>
      </View>

      {cyclesQuery.isFetching && cycles.length === 0 ? (
        <SkeletonTiles count={4} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile
              icon={AlertCircle}
              iconPlacement="side"
              label="Due now"
              tone={dueNowPaise > 0 ? "danger" : "default"}
              value={formatMoney(dueNowPaise)}
            />
            <MetricTile icon={Clock3} iconPlacement="side" label="Overdue" value={String(overdueCount)} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <MetricTile icon={CircleCheck} iconPlacement="side" label="Paid so far" value={formatMoney(paidPaise)} />
            <MetricTile
              icon={CalendarDays}
              iconPlacement="side"
              label="Next due"
              value={nextDue ? formatDueDate(nextDue) : "—"}
            />
          </View>
        </View>
      )}

      {/* No heading over this. The switcher names what is below it, and a
          "To pay" title above a tab that can be showing paid bills would be
          describing the wrong list half the time. */}
      <TabSwitcher<BillTab>
        active={tab}
        onChange={setTab}
        options={[
          { icon: ReceiptText, label: "Billing cycles", value: "RENT_CYCLE" },
          { icon: Receipt, label: "Other bills", value: "ONE_OFF" },
        ]}
      />

      {/* The count names the list, as it does on the owner's billing screen.
          No information icon beside it: the owner's explains cycle generation
          and early windows, which are decisions a tenant does not make. */}
      <Section
        title={`${shown.length} ${tab === "RENT_CYCLE" ? "billing cycle" : "other bill"}${shown.length === 1 ? "" : "s"}`}
      >
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

        {cyclesQuery.isFetching && cycles.length === 0 ? (
          <SkeletonList rows={2} />
        ) : shown.length === 0 ? (
          <EmptyState
            artwork={NO_BILL_ILLUSTRATION}
            description={
              search.trim() || status !== "ALL"
                ? "Nothing matched. Try a different reference or status."
                : tab === "RENT_CYCLE"
                  ? "This month's rent cycle appears here once it is raised. Earlier ones are in Past bills."
                  : "One-off charges raised this month appear here. Earlier ones are in Past bills."
            }
            title={search.trim() || status !== "ALL" ? "No matching bills" : "Nothing this month"}
          />
        ) : (
          <>
            {paged.pageItems.map((cycle) => (
              <TenantBillCard
                cycle={cycle}
                key={cycle.id}
                // Paying happens on the tenancy tab, which owns the payment sheet
                // and the attempt-decision flow. Offering a second Pay here would
                // be a second place for a payment to be half-started.
                onPay={null}
                onViewBill={() => setViewingReceipt(cycle)}
                onViewIntents={() => setViewingIntents(cycle)}
                openAttempt={liveIntentByCycle.get(cycle.id) ?? null}
              />
            ))}

            {/* Shown whenever there is a bill, not only once there are two
                pages. The owner's billing list does the same: the bar carries
                the running total as well as the position, so on a single page
                it is still saying something — and a control that appears only
                sometimes is one the reader has to rediscover. */}
            {paged.totalElements > 0 ? (
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
      </Section>

      {/* The owner's history-route card, which is a card and not a section:
          artwork beside the words, the eyebrow naming what is behind it, and
          the count on the button rather than in a heading above it. */}
      <BillsRouteCard
        artwork={BILLING_HISTORY_ILLUSTRATION}
        buttonLabel={`${pastCount} past bill${pastCount === 1 ? "" : "s"}`}
        description="Bills from earlier months, paid or still owed."
        eyebrow="Billing history"
        onPress={() => router.push({ pathname: "/tenancy-billing-history", params: { tenancyId } })}
        title="View past bills"
      />

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

      {/* Read-only here. Resolving an unanswered attempt belongs with the
          payment sheet on the tenancy tab, which owns that conversation — two
          screens asking "did this go through" is two places to answer it. */}
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
          <Text style={[type.eyebrow, { color: colors.kicker }]}>{eyebrow}</Text>
          <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>{title}</Text>
          {/* Beside the artwork, not stacked under the row. Under it, the
              description was a third block with a gap above it and the card
              stood a good 40pt taller than it needed to — the artwork's own
              height was already paying for those lines. */}
          <Text style={[type.body, { color: colors.muted }]}>{description}</Text>
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
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Plain Pressables, NOT AnimatedPressable. That component springs a
          scale transform on press, and on a full-screen scrim it scales the
          whole dimmed screen as the modal fades — the backdrop appears to
          shrink away from the edges on the way out. InfoModal has this right
          and this follows it. */}
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
        {/* Its own pressable, so a tap on the card does not reach the scrim
            behind it and close the picker mid-decision. */}
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
