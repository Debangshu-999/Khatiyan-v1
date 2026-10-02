import { CenterModal } from "@/components/center-modal";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Animated, Easing, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { MoneyIcon, PaymentClaimsIcon } from "@/components/artwork-icon";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { AlertTriangle, ArrowLeft, ArrowRight, Banknote, CalendarCheck2, CalendarClock, CalendarDays, CalendarRange, CheckCircle2, ChevronDown, ChevronUp, Download, Eye, FileDown, FileText, Clock3, History, IndianRupee, Info, type LucideProps, MoreHorizontal, Percent, Plus, ReceiptText, RefreshCw, Repeat, Search, SlidersHorizontal, TimerReset, Undo2, Users, Wallet, WalletCards, X, XCircle } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ActivityIndicator } from "react-native";
import { ListEnd } from "@/components/list-end";
import { CircleAlert } from "lucide-react-native";
import { PickerOptionRow } from "@/components/picker-option-row";

import { StatusPill as Pill } from "@/components/status-pill";
import { MonthSelector, currentMonth, monthName, shiftMonth } from "@/components/month-selector";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { AlertModal } from "@/components/alert-modal";
import { classifyToast } from "@/components/toast";
import { errorMessage, retryAfterSeconds } from "@/features/forms/server-error";
import { NoticeBar, RequiredMark } from "@/features/owner/owner-ui";
import { SheetShell } from "@/components/sheet-shell";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { OtpCodeEntry, RESEND_COOLDOWN_SECONDS } from "@/components/otp-code-sheet";
import { blockCashCodes, useCashCodeWait, waitClock } from "@/features/billing/cash-code-block";
import { BillStatusPill, BillTotal } from "@/features/owner/bill-views";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { FieldError } from "@/components/field-error";
import { SingleOptionPicker } from "@/components/option-picker";
import { PaymentWindowLine } from "@/features/billing/payment-window-modal";
import { BillClaimsSheet } from "@/features/billing/bill-claims-sheet";
import { PaymentMethodIcon } from "@/features/billing/payment-method-toggle";
import { TabSwitcher, type TabOption } from "@/components/tab-switcher";
import { useToast } from "@/components/toast";
import { MultiImageField } from "@/features/uploads/multi-image-field";
import { SingleImageField } from "@/features/uploads/single-image-field";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { FormInput, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { Section } from "@/components/section";
import { useAppSelector } from "@/store/hooks";
import {
  useClearBillingLineItemMutation,
  type BillingCycle,
  type BillingCycleLineItem,
  type BillingMonthSummary,
  type ManualPaymentMethod,
  billTitle,
  useAddCycleDiscountMutation,
  useAddCycleExtraChargesMutation,
  useCancelOneOffBillMutation,
  useRemoveLateFeeMutation,
  useGetPropertyMonthSummaryQuery,
  useLazyExportPropertyBillingCyclesQuery,
  useListPropertyBillingCyclesQuery,
  useListUpcomingPropertyCyclesQuery,
  UPCOMING_CYCLES_PAGE_SIZE,
  useRecordManualPaymentMutation,
  useSendCashPaymentCodeMutation,
} from "@/store/services/billing-api";
import { useGetPaymentMethodsQuery } from "@/store/services/payment-intent-api";
import { downloadBillReceipt } from "@/features/billing/download-bill-receipt";
// One receipt, printed for both sides. The document and its sheet used to live
// in this file, which is how the tenant ended up reading a different-looking
// paper for the same bill.
import { BillReceiptSheet } from "@/features/billing/bill-receipt-sheet";
import { PaymentDetailsSheet } from "@/features/billing/payment-details-sheet";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { DIALOG_MAX_WIDTH, radii, spacing } from "@/theme/spacing";
import { metricFontSize } from "@/theme/metric-size";
import { useTheme } from "@/theme/use-theme";
import {
  OwnerBillingCycleListSkeleton,
  OwnerBillingOverviewSkeleton,
} from "@/components/skeletons/owner";
import { HeaderGradient } from "@/components/header-gradient";
import { HowItWorksSheet, type HowItWorksStep } from "@/components/how-it-works-sheet";

const NO_BILL_ILLUSTRATION = require("../assets/empty-states/No-Bill_512x436.png");

type ActionMode = "menu" | "manual-payment" | "discount" | "extra-charge" | "cancel";
type CycleView = "cycles" | "other";
type PaymentHistoryStatus = "ON_TIME" | "OVERDUE" | "UNPAID";
type ReportActionMode = "actions" | "month-picker";
type SummaryFilter = "all" | "cycles" | "other" | "overdue" | "paid" | "unpaid" | "outstanding" | "collectable" | "discount";
type BillingStatusFilter =
  | "ALL"
  | "UPCOMING"
  | "UNPAID"
  | "OVERDUE"
  | "CONFIRMATION_PENDING"
  | "PAID"
  | "LATE_PAY";

/**
 * The status picker shows each status as the chip its bill card shows (user,
 * 2026-09-30), drawn by BillStatusPill from a minimal bill in that state, the
 * way the status legend does. "Any status" has no chip and stays text.
 */
const BILLING_STATUS_FILTER_OPTIONS: {
  label: string;
  sample?: Pick<BillingCycle, "paidAt" | "rentDueDate" | "status">;
  value: BillingStatusFilter;
}[] = [
  { label: "Any status", value: "ALL" },
  { label: "Upcoming", sample: { paidAt: null, rentDueDate: "2026-01-05", status: "UPCOMING" }, value: "UPCOMING" },
  { label: "Unpaid", sample: { paidAt: null, rentDueDate: "2026-01-05", status: "UNPAID" }, value: "UNPAID" },
  { label: "Overdue", sample: { paidAt: null, rentDueDate: "2026-01-05", status: "OVERDUE" }, value: "OVERDUE" },
  {
    label: "Awaiting",
    sample: { paidAt: null, rentDueDate: "2026-01-05", status: "CONFIRMATION_PENDING" },
    value: "CONFIRMATION_PENDING",
  },
  { label: "Paid", sample: { paidAt: "2026-01-04T10:00:00Z", rentDueDate: "2026-01-05", status: "PAID" }, value: "PAID" },
  {
    label: "Late Pay",
    sample: { paidAt: "2026-01-09T10:00:00Z", rentDueDate: "2026-01-05", status: "PAID" },
    value: "LATE_PAY",
  },
];

// Both controls in a bill card's action row are locked to this, so the circle
// can never render larger than the button beside it.
const BILL_ACTION_ROW_HEIGHT = 48;
const CYCLE_PAGE_SIZE = 8;
const BILLING_HEADER_ILLUSTRATION = require("../assets/images/workspace/billing-header.png");
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Client-side pager: a single month's cycles are bounded, and the summary tiles
// + "view all" modal still need the full list, so we page the array in memory.
function paginateArray<T>(items: T[], page: number, size: number) {
  const totalElements = items.length;
  const totalPages = Math.ceil(totalElements / size);
  const safePage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);
  const start = safePage * size;
  return {
    hasNext: safePage + 1 < totalPages,
    hasPrevious: safePage > 0,
    page: safePage,
    pageItems: items.slice(start, start + size),
    totalElements,
    totalPages,
  };
}

function filterSummaryCycles(cycles: BillingCycle[], filter: SummaryFilter): BillingCycle[] {
  switch (filter) {
    case "cycles":
      return cycles.filter((cycle) => cycle.category === "RENT_CYCLE");
    case "other":
      return cycles.filter((cycle) => cycle.category === "ONE_OFF");
    case "overdue":
      return cycles.filter((cycle) => cycle.status === "OVERDUE");
    case "paid":
      return cycles.filter((cycle) => cycle.status === "PAID");
    case "unpaid":
      return cycles.filter((cycle) => cycle.status === "UNPAID");
    case "outstanding":
      return cycles.filter((cycle) => cycle.status === "UNPAID" || cycle.status === "OVERDUE");
    case "discount":
      return cycles.filter((cycle) => cycle.discountAmountPaise > 0);
    case "collectable":
      return cycles.filter((cycle) => cycle.status !== "CANCELLED");
    case "all":
    default:
      return cycles;
  }
}

function filterBillingCyclesByStatus(cycles: BillingCycle[], filter: BillingStatusFilter): BillingCycle[] {
  if (filter === "ALL") {
    return cycles;
  }
  if (filter === "LATE_PAY") {
    return cycles.filter((cycle) => cycle.status === "PAID" && paymentHistoryStatus(cycle) === "OVERDUE");
  }
  if (filter === "PAID") {
    return cycles.filter((cycle) => cycle.status === "PAID" && paymentHistoryStatus(cycle) === "ON_TIME");
  }
  return cycles.filter((cycle) => cycle.status === filter);
}

function summaryFilterTitle(filter: SummaryFilter): string {
  switch (filter) {
    case "cycles":
      return "Billing cycles";
    case "other":
      return "Other bills";
    case "overdue":
      return "Overdue cycles";
    case "paid":
      return "Paid cycles";
    case "unpaid":
      return "Unpaid cycles";
    case "outstanding":
      return "Unpaid & overdue cycles";
    case "discount":
      return "Cycles with a discount";
    case "collectable":
      return "Collectable cycles";
    case "all":
    default:
      return "All cycles";
  }
}

/**
 * How an offline payment was collected, and what proof each one leaves behind.
 *
 * <p>The reference is a DIFFERENT number for every method, so one generic
 * "Reference" box was asking the owner to know which of four things to type.
 * Each option carries its own label and the format it comes in:
 *
 * <ul>
 *   <li>UPI — the UTR, also printed as "RRN" or "transaction reference". NPCI
 *       issues it as 12 digits, and every UPI app shows it on the receipt.</li>
 *   <li>Card — the approval (auth) code off the charge slip, six digits. Slips
 *       also carry a 12-digit RRN, so the field accepts either rather than
 *       insisting on the one this particular terminal happened to print.</li>
 *   <li>Cheque — the cheque number, six digits under CTS-2010: the first block
 *       of the MICR line along the bottom of the leaf.</li>
 *   <li>Cash — nothing. Cash leaves no reference to quote, which is why it is
 *       the one method with no proof section at all.</li>
 * </ul>
 *
 * <p>The formats are stated in the label but NOT enforced. A UPI app may show a
 * longer alphanumeric transaction id beside the 12-digit UTR, and refusing what
 * an owner is reading off their own screen would be worse than storing it.
 *
 * <p>OTHER is deliberately absent. It stays in the enum — old rows still carry
 * it and a persisted constant is never removed — but offering it invited a
 * payment with no defined proof at all.
 */
type ManualPaymentOption = {
  value: ManualPaymentMethod;
  label: string;
  referenceLabel: string;
  referencePlaceholder: string;
};

const manualPaymentMethods: ManualPaymentOption[] = [
  { label: "Cash", referenceLabel: "", referencePlaceholder: "", value: "CASH" },
  {
    label: "UPI",
    referenceLabel: "UTR / transaction reference (12 digits)",
    referencePlaceholder: "123456789012",
    value: "UPI",
  },
  {
    label: "Bank transfer",
    referenceLabel: "UTR / transaction reference",
    referencePlaceholder: "From the bank statement line",
    value: "BANK_TRANSFER",
  },
  {
    label: "Card",
    referenceLabel: "Approval code or RRN from the slip",
    referencePlaceholder: "6-digit approval code",
    value: "CARD",
  },
  {
    label: "Cheque",
    referenceLabel: "Cheque number (6 digits)",
    referencePlaceholder: "123456",
    value: "CHEQUE",
  },
];

export default function OwnerBillingScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const account = useAppSelector((state) => state.auth.user);
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const apiBaseUrl = useAppSelector((state) => state.appConfig.apiBaseUrl);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = selectedPropertyId
    ? properties.find((property) => property.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;

  /**
   * The contact printed on the property's letterhead.
   *
   * <p>Only the OWNER's. A manager can reach this screen too, and putting their
   * personal number on the property's receipt would hand a tenant the wrong
   * person to chase — and hand every tenant a staff member's details.
   */
  const letterheadContact = useMemo(() => {
    const isOwner = Boolean(account && selectedProperty && selectedProperty.ownerId === account.id);
    return {
      email: isOwner ? account?.email ?? null : null,
      phone: isOwner ? account?.phone ?? null : null,
    };
  }, [account, selectedProperty]);

  const [cycleView, setCycleView] = useState<CycleView>("cycles");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [billingStatusFilter, setBillingStatusFilter] = useState<BillingStatusFilter>("ALL");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [reportMonth, setReportMonth] = useState(currentMonth());
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [reportActionMode, setReportActionMode] = useState<ReportActionMode | null>(null);
  const toast = useToast();
  // Failures raised anywhere on this screen; no field owns them.
  const opErrors = useFormErrors<never>();

  const setStatusMessage = (value: string | null) => {
    if (!value) {
      return;
    }
    // A failure ends the attempt, so it interrupts; a confirmation does not.
    if (classifyToast(value) === "error") {
      opErrors.failFromServer(value);
      return;
    }
    toast.show(value);
  };
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter | null>(null);
  const [receiptCycle, setReceiptCycle] = useState<BillingCycle | null>(null);
  const [paymentDetailsCycle, setPaymentDetailsCycle] = useState<BillingCycle | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [selectedProperty?.id]);
  const summaryMonth = selectedMonth;
  // Search applies to both bill lists (rent cycles and other bills).
  const cycleSearchQuery = searchQuery;

  // Match Tenancy: commit the field after a short pause so the list updates
  // without a separate Search button or a request on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchDraft.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchDraft]);

  // VIEW sees every figure and every bill; MANAGE adds recording payment,
  // one-off bills and line-item edits.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const canManageBilling = canManageResource("BILLING_CYCLES");

  const monthSummaryQuery = useGetPropertyMonthSummaryQuery(
    { month: summaryMonth, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );
  const cyclesQuery = useListPropertyBillingCyclesQuery(
    { month: summaryMonth, propertyId: selectedProperty?.id ?? "", query: cycleSearchQuery },
    { skip: !selectedProperty },
  );
  /**
   * Whether next month can be opened yet.
   *
   * <p>Rent cycles are generated on each tenancy's own anniversary day, so a
   * cycle whose period starts on the 3rd is created on the 3rd. With the
   * picker stopping at the current month, the owner could not reach that bill
   * until the month it belongs to had already begun — losing most of the
   * window in which it can still be corrected.
   *
   * <p>`hasData` is the right signal because the summary only PROJECTS
   * uncreated cycles for the current month. Asked about a future month it
   * counts real rows alone, so this is true exactly when the first bill for
   * next month exists.
   */
  const nextMonth = shiftMonth(currentMonth(), 1, "9999-12");
  const nextMonthQuery = useGetPropertyMonthSummaryQuery(
    { month: nextMonth, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );
  const nextMonthOpen = nextMonthQuery.data?.hasData === true;

  const [exportMonthlyReport, exportState] = useLazyExportPropertyBillingCyclesQuery();

  const visibleCycles = cyclesQuery.currentData ?? [];
  // isLoading, not isFetching: it means "in flight AND nothing to show". A
  // refetch of a list already on screen must not blank the page the reader is
  // looking at.
  const summaryLoading =
    (cyclesQuery.isFetching && !cyclesQuery.currentData) ||
    (monthSummaryQuery.isFetching && !monthSummaryQuery.currentData);
  const cycleListLoading = cyclesQuery.isFetching && !cyclesQuery.currentData;
  // Rent cycles vs one-off bills (penalties, ad-hoc charges) shown as separate
  // segmented lists. The summary filter modal still spans all categories.
  const statusFilteredCycles = filterBillingCyclesByStatus(visibleCycles, billingStatusFilter);
  const rentCycles = statusFilteredCycles.filter((cycle) => cycle.category === "RENT_CYCLE");
  const oneOffCycles = statusFilteredCycles.filter((cycle) => cycle.category === "ONE_OFF");
  const listedCycles = cycleView === "cycles" ? rentCycles : oneOffCycles;
  const visibleQuery = cycleSearchQuery;
  // The summary includes one-off bills and projections, not just rent cycles.
  // Use the actual upcoming list for both the pending note and completion card.
  const futureUpcomingQuery = useListUpcomingPropertyCyclesQuery(
    { month: summaryMonth, page: 0, propertyId: selectedProperty?.id ?? "", size: UPCOMING_CYCLES_PAGE_SIZE },
    { skip: !selectedProperty, refetchOnMountOrArgChange: true },
  );
  const notGeneratedCount =
    cycleSearchQuery || billingStatusFilter !== "ALL"
      ? 0
      : futureUpcomingQuery.currentData?.totalElements ?? 0;

  function openAction(cycle: BillingCycle, mode: ActionMode) {
    setSelectedCycle(cycle);
    setActionMode(mode);
    setStatusMessage(null);
  }

  function closeAction() {
    setSelectedCycle(null);
    setActionMode(null);
  }

  async function downloadMonthlyReport() {
    if (!selectedProperty) {
      return;
    }

    // Exporting the whole month's ledger is a manage-level act, not a read: a
    // view-only manager can look at the figures on screen without being able to
    // take the book away.
    if (!canManageBilling) {
      opErrors.failFromServer("Downloading the monthly report is not available to you. Ask the property owner for access.");
      return;
    }

    try {
      const csv = await exportMonthlyReport({ month: reportMonth, propertyId: selectedProperty.id }).unwrap();
      await downloadTextFile(`billing-cycles-${reportMonth}.csv`, csv, "text/csv");
      setStatusMessage("Monthly billing report download started.");
    } catch {
      setStatusMessage("This month is not finalized yet, or no report is available for the selected month.");
    }
  }

  async function downloadCycleReceipt(cycle: BillingCycle) {
    try {
      // Fetched, not rendered here. The server builds the PDF, so this is an
      // ordinary file download on every platform — the same shape as the
      // monthly CSV export — and the tenant's copy is the same document.
      const fileName = await downloadBillReceipt({
        apiBaseUrl,
        billingCycleId: cycle.id,
        fileName: cycle.referenceCode,
        token: accessToken,
      });
      setStatusMessage(`Receipt saved as ${fileName}`);
    } catch {
      setStatusMessage("Could not download the receipt. Please try again.");
    }
  }

  function handleSummaryMonthChange(month: string) {
    setSelectedMonth(month);
    setPage(0);
  }

  function changeCycleView(value: CycleView) {
    setCycleView(value);
    setPage(0);
  }

  return (
    <ScreenScrollView
      background={<HeaderGradient />}
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
      onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
        if (!cycleListLoading && (page + 1) * CYCLE_PAGE_SIZE < listedCycles.length && contentSize.height - contentOffset.y - layoutMeasurement.height <= 240) setPage(Math.min(page + 1, Math.ceil(listedCycles.length / CYCLE_PAGE_SIZE) - 1));
      }}
      scrollEventThrottle={16}
    >
      <ScreenHeader
        artwork={BILLING_HEADER_ILLUSTRATION}
        badge={!canManageBilling ? <ViewOnlyChip /> : null}
        italicTail="control."
        subtitle={selectedProperty ? `Billing workspace for ${selectedProperty.name}.` : "Select a property on Home first."}
        title="Billing"
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={MoneyIcon}

          title="Select a property"
          description="Billing is scoped to the active owner property selected on Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <MonthSelector
            maxMonth={nextMonthOpen ? nextMonth : undefined}
            onChange={handleSummaryMonthChange}
            value={summaryMonth}
          />

          {/* Only while looking at a month that is not the new one. Once the
              owner is there the notice has served its purpose, and a banner
              announcing the page you are on is noise. */}
          {nextMonthOpen && summaryMonth !== nextMonth ? (
            <NoticeBar
              message={`Bills for ${monthName(nextMonth)} have started generating. Switch the month above to review or change them before they fall due.`}
              title={`${monthName(nextMonth)} bills are now available`}
              tone="warning"
            />
          ) : null}

          {summaryLoading ? (
            <OwnerBillingOverviewSkeleton />
          ) : (
            <ActiveSummarySection
              month={summaryMonth}
              onOpenFilter={setSummaryFilter}
              oneOffCount={oneOffCycles.length}
              rentCycleCount={rentCycles.length}
              summary={monthSummaryQuery.data}
            />
          )}

          <BillToolsGrid
            onOpenPaymentDetails={() => router.push("/owner-payment-details")}
            reportBusy={exportState.isFetching}
            onOpenPaymentHistory={() => router.push({ params: { month: summaryMonth }, pathname: "/owner-payment-history" })}
            onOpenReport={() => setReportActionMode("actions")}
            onOpenTenantBills={() => router.push("/owner-tenant-bills")}
          />

          <SegmentedControl
            active={cycleView}
            onChange={changeCycleView}
            options={[
              { icon: RefreshCw, label: "Billing cycles", value: "cycles" },
              { icon: ReceiptText, label: "Other bills", value: "other" },
            ]}
          />

          <BillingCyclesSection
            cycles={listedCycles}
            fallbackLateFeePerDayPaise={selectedProperty.rentLateFeePerDayPaise}
            month={summaryMonth}
            noun={cycleView === "cycles" ? "billing cycle" : "other bill"}
            notGeneratedCount={cycleView === "cycles" ? notGeneratedCount : 0}
            canManage={canManageBilling}
            onAction={openAction}
            page={page}
            query={visibleQuery}
            narrowed={Boolean(visibleQuery) || billingStatusFilter !== "ALL"}
            loading={cycleListLoading}
            footer={cycleView === "cycles" ? <UpcomingCyclesLink month={summaryMonth} onPress={() => router.push({ params: { month: summaryMonth }, pathname: "/owner-upcoming-cycles" })} propertyId={selectedProperty.id} /> : undefined}
            searchField={
              <SearchField
                onChangeText={setSearchDraft}
                placeholder="Search tenant name, phone or tenancy reference"
                trailing={
                  <AnimatedPressable
                    accessibilityLabel="Filter bills by status"
                    accessibilityRole="button"
                    accessibilityState={{ selected: billingStatusFilter !== "ALL" }}
                    onPress={() => setStatusPickerOpen(true)}
                    style={{
                      alignItems: "center",
                      backgroundColor: billingStatusFilter === "ALL" ? colors.surfaceSunken : colors.primary,
                      borderRadius: 999,
                      height: 34,
                      justifyContent: "center",
                      width: 34,
                    }}
                  >
                    <SlidersHorizontal
                      color={billingStatusFilter === "ALL" ? colors.ink : colors.onPrimary}
                      size={17}
                      strokeWidth={2.3}
                    />
                  </AnimatedPressable>
                }
                value={searchDraft}
              />
            }
          />

        </>
      ) : null}

      {selectedCycle && actionMode ? (
        <BillingActionModal
          canManage={canManageBilling}
          // The live copy from the list, not the snapshot taken when the modal
          // opened (2026-09-29): its version must be the bill's latest, or the
          // modal's second action would look stale against its own first.
          cycle={visibleCycles.find((item) => item.id === selectedCycle.id) ?? selectedCycle}
          mode={actionMode}
          onClose={closeAction}
          onSelectMode={setActionMode}
          onViewPaymentDetails={setPaymentDetailsCycle}
          onViewReceipt={setReceiptCycle}
        />
      ) : null}
      {reportActionMode ? (
        <MonthlyReportModal
          busy={exportState.isFetching}
          mode={reportActionMode}
          month={reportMonth}
          onChangeMonth={setReportMonth}
          onClose={() => setReportActionMode(null)}
          onDownload={downloadMonthlyReport}
          onSelectMode={setReportActionMode}
        />
      ) : null}
      {statusPickerOpen ? (
        <BillingStatusFilterDialog
          onClose={() => setStatusPickerOpen(false)}
          onSelect={(value) => {
            setBillingStatusFilter(value);
            setPage(0);
          }}
          value={billingStatusFilter}
        />
      ) : null}
      {summaryFilter ? (
        <SummaryCyclesModal
          cycles={filterSummaryCycles(visibleCycles, summaryFilter)}
          notGeneratedCount={notGeneratedCount}
          onClose={() => setSummaryFilter(null)}
          title={summaryFilterTitle(summaryFilter)}
        />
      ) : null}
      {receiptCycle ? (
        <BillReceiptSheet
          contact={letterheadContact}
          cycle={receiptCycle}
          onClose={() => setReceiptCycle(null)}
          // The sheet no longer closes itself on download — the tenant's copy
          // stays up to show "Preparing…" on the button. The owner's does close,
          // so say so here rather than changing what a tap does for both.
          onDownload={() => {
            void downloadCycleReceipt(receiptCycle);
            setReceiptCycle(null);
          }}
          property={selectedProperty ?? null}
        />
      ) : null}
      {paymentDetailsCycle ? (
        <PaymentDetailsSheet
          cycle={paymentDetailsCycle}
          onClose={() => setPaymentDetailsCycle(null)}
          propertyName={selectedProperty?.name ?? null}
        />
      ) : null}
      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

function ActiveSummarySection({
  month,
  onOpenFilter,
  oneOffCount,
  rentCycleCount,
  summary,
}: {
  month: string;
  onOpenFilter: (filter: SummaryFilter) => void;
  oneOffCount: number;
  rentCycleCount: number;
  summary?: BillingMonthSummary;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      {summary && !summary.hasData ? (
        <EmptyState
          artwork={NO_BILL_ILLUSTRATION}
          title="No data available"
          description="No billing cycles started in this month."
        />
      ) : null}

      {summary && summary.hasData ? (
        <View style={{ gap: spacing.sm }}>
          <CollectionSummaryCard
            billedPaise={summary.billedPaise}
            collectedPaise={summary.collectedPaise}
            onPress={() => onOpenFilter("collectable")}
          />

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile
              hint="Rent cycles"
              icon={BillingCyclesIcon}
              label="Billing cycles"
              onPress={() => onOpenFilter("cycles")}
              value={String(rentCycleCount)}
            />
            <SummaryTile
              hint={formatMoney(summary.overduePaise)}
              icon={OverdueBillIcon}
              label="Overdue"
              onPress={() => onOpenFilter("overdue")}
              value={String(summary.overdueCount)}
            />
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile
              hint="Bills raised"
              icon={OtherBillsIcon}
              label="Other bills"
              onPress={() => onOpenFilter("other")}
              value={String(oneOffCount)}
            />
            <SummaryTile
              hint="Cycles settled"
              icon={PaidBillIcon}
              label="Paid"
              onPress={() => onOpenFilter("paid")}
              value={String(summary.paidCycleCount)}
            />
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile
              hint="Awaiting payment"
              icon={UnpaidBillIcon}
              label="Unpaid"
              onPress={() => onOpenFilter("unpaid")}
              value={String(summary.unpaidCycleCount)}
            />
            <SummaryTile
              hint="This month"
              icon={DiscountBillIcon}
              label="Discount given"
              onPress={() => onOpenFilter("discount")}
              value={formatMoney(summary.totalDiscountPaise)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PaymentHistorySection({
  cycles,
  month,
  onPageChange,
  page,
  query,
}: {
  cycles: BillingCycle[];
  month: string;
  onPageChange: (page: number) => void;
  page: number;
  query: string;
}) {
  const orderedCycles = [...cycles].sort(comparePaymentHistoryCycles);
  const paidCount = orderedCycles.filter((cycle) => cycle.status === "PAID").length;
  const lateCount = orderedCycles.filter((cycle) => cycle.status === "PAID" && paymentHistoryStatus(cycle) === "OVERDUE").length;
  const unpaidCount = orderedCycles.filter((cycle) => cycle.status === "UNPAID" || cycle.status === "OVERDUE").length;
  const paged = paginateArray(orderedCycles, page, CYCLE_PAGE_SIZE);

  return (
    <Section title="Payment history">
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <HistorySummaryMetric label="Paid" tone="success" value={String(paidCount)} />
          <HistorySummaryMetric label="Late" tone="warning" value={String(lateCount)} />
          <HistorySummaryMetric label="Unpaid" tone="primary" value={String(unpaidCount)} />
        </View>

        {orderedCycles.length === 0 ? (
          <EmptyState
            artwork={NO_BILL_ILLUSTRATION}
            title="No payment history found"
            description={query ? "No billing cycle matched the current search for this month." : "No billing cycles started in this month."}
          />
        ) : (
          <>
            <View style={{ gap: spacing.sm }}>
              {paged.pageItems.map((cycle) => (
                <PaymentHistoryRow cycle={cycle} key={cycle.id} />
              ))}
            </View>
            {paged.totalElements > 0 ? (
              <PaginationBar
                hasNext={paged.hasNext}
                hasPrevious={paged.hasPrevious}
                onNext={() => onPageChange(paged.page + 1)}
                onPrevious={() => onPageChange(Math.max(0, paged.page - 1))}
                page={paged.page}
                totalElements={paged.totalElements}
                totalPages={paged.totalPages}
              />
            ) : null}
          </>
        )}
      </View>
    </Section>
  );
}

function PendingGenerationNote({ count }: { count: number }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.description, { color: colors.muted, textAlign: "center" }]}>
      {count} more cycle{count === 1 ? "" : "s"} will appear here shortly before {count === 1 ? "its" : "their"} due
      date{count === 1 ? "" : "s"} this month.
    </Text>
  );
}

function BillingCyclesSection({
  footer,
  canManage,
  cycles,
  fallbackLateFeePerDayPaise,
  month,
  narrowed,
  loading = false,
  noun = "billing cycle",
  notGeneratedCount,
  onAction,
  page,
  query,
  searchField,
}: {
  footer?: ReactNode;
  canManage: boolean;
  cycles: BillingCycle[];
  fallbackLateFeePerDayPaise?: number | null;
  month: string;
  narrowed: boolean;
  loading?: boolean;
  noun?: string;
  notGeneratedCount: number;
  onAction?: (cycle: BillingCycle, mode: ActionMode) => void;
  page: number;
  query: string;
  searchField: ReactNode;
}) {
  const { colors } = useTheme();
  const shownCycles = cycles.slice(0, (page + 1) * CYCLE_PAGE_SIZE);
  const hasMore = shownCycles.length < cycles.length;
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <Section
      title={loading ? (noun === "billing cycle" ? "Billing cycles" : "Other bills") : cycles.length + " " + noun + (cycles.length === 1 ? "" : "s")}
      trailing={
        <AnimatedPressable
          accessibilityLabel="How billing cycles work"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => setRulesOpen(true)}
          style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
          tapLockMs={0}
        >
        <CircleHelp color={colors.kicker} size={17} strokeWidth={2.4} />
        </AnimatedPressable>
      }
    >
      {rulesOpen ? <BillingRulesModal onClose={() => setRulesOpen(false)} /> : null}
      {searchField}
      {loading ? (
        <OwnerBillingCycleListSkeleton />
      ) : cycles.length === 0 ? (
        <EmptyState
          artwork={NO_BILL_ILLUSTRATION}
          title={narrowed ? "No matching bills" : !query && notGeneratedCount > 0 ? "Cycles not generated yet" : "No billing cycles found"}
          description={
            narrowed
              ? "No bill matched that tenant, tenancy reference or status for this billing month."
              : notGeneratedCount > 0
                ? notGeneratedCount + " cycle" + (notGeneratedCount === 1 ? "" : "s") + " " + (notGeneratedCount === 1 ? "has" : "have") + " not been generated yet — each appears automatically a few days before its due date, so you can adjust it before it goes live."
                : "No billing cycles started in this month."
          }
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <CycleListFrame>
            <CycleCardList
              canManage={canManage}
              cycles={shownCycles}
              fallbackLateFeePerDayPaise={fallbackLateFeePerDayPaise}
              onAction={onAction}
            />
          </CycleListFrame>
          {!hasMore ? footer : null}
          {!hasMore && notGeneratedCount > 0 ? <PendingGenerationNote count={notGeneratedCount} /> : null}
          {hasMore ? <ActivityIndicator color={colors.muted} style={{ padding: spacing.sm }} /> : <ListEnd />}
        </View>
      )}
      {!loading && cycles.length === 0 ? footer : null}
    </Section>
  );
}

function BillingStatusFilterDialog({
  onClose,
  onSelect,
  value,
}: {
  onClose: () => void;
  onSelect: (value: BillingStatusFilter) => void;
  value: BillingStatusFilter;
}) {
  const { colors, fonts } = useTheme();

  return (
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Closes by its close button, a choice or the device back button,
          not a tap on the scrim (user, 2026-09-29). */}
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 14,
            overflow: "hidden",
            width: "100%",
          }}
        >
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
            <Text style={{ color: colors.muted, flex: 1, fontFamily: fonts.display, fontSize: 19 }}>
              Bill status
            </Text>
            <IconButton accessibilityLabel="Close" filled icon={X} onPress={onClose} />
          </View>

          <View style={{ paddingBottom: spacing.xs, paddingHorizontal: spacing.lg }}>
            {BILLING_STATUS_FILTER_OPTIONS.map((option) => {
              const Icon = option.value === "ALL" ? null : option.value === "UNPAID" ? CircleAlert : option.value === "OVERDUE" ? AlertTriangle : option.value === "PAID" ? CheckCircle2 : Clock3;
              return (
              <PickerOptionRow
                icon={Icon ? <Icon color={colors.inkSoft} size={18} strokeWidth={2.3} /> : undefined}
                key={option.value}
                label={option.label}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                selected={option.value === value}
              />
            ); })}
          </View>
        </View>
      </View>
    </CenterModal>
  );
}

function PaymentHistoryRow({ cycle }: { cycle: BillingCycle }) {
  const { colors, fonts, type } = useTheme();
  const tenantName = cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}`;
  // Settled covers cancelled as well as paid: neither is money still to come,
  // and both should sit back from the rows that are.
  const settled = cycle.status === "PAID" || cycle.status === "CANCELLED";

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              height: 46,
              justifyContent: "center",
              width: 46,
            }}
          >
            {/* The colour carries the state, not a tile behind it. A blue fill
                on every unpaid row made the list a wall of blue boxes; the same
                fact reads just as fast from the glyph itself, and a paid row
                then recedes into grey instead of shouting in a quieter shade.
                No border either — this labels the row, it is not a control. */}
            <ReceiptText
              color={settled ? colors.muted : colors.primary}
              size={28}
              strokeWidth={1.8}
            />
          </View>

          <View style={{ flex: 1, gap: spacing.xxs }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
              <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>
                {cycle.referenceCode}
              </Text>
              <PaymentStatusBadge cycle={cycle} />
            </View>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, lineHeight: 25 }}>
              {tenantName}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {billTitle(cycle)} · {cycle.tenancyReferenceCode ?? shortId(cycle.tenancyId)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <InfoBlock label="Amount" strong value={formatMoney(cycle.totalAmountPaise)} />
          <InfoBlock label="Due date" value={formatFullDate(cycle.rentDueDate)} />
        </View>
        <InfoBlock label="Payment date" value={cycle.paidAt ? formatDateTime(cycle.paidAt) : "Not paid yet"} />
      </View>
    </Card>
  );
}

function PaymentStatusBadge({ cycle }: { cycle: BillingCycle }) {
  const { colors, type } = useTheme();
  const status = billingCycleStatusDisplay(cycle);
  const tone =
    status.tone === "success"
      ? colors.successText
      : status.tone === "danger"
        ? colors.danger
        : status.tone === "warning"
          ? colors.warningText
          : status.tone === "muted"
            ? colors.muted
            : colors.primary;
  const Icon = status.tone === "success" ? CheckCircle2 : status.tone === "danger" || status.tone === "warning" ? AlertTriangle : TimerReset;
  const backgroundColor = status.tone === "warning" ? colors.warningSoft : colors.surfaceSunken;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor: tone,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <Icon color={tone} size={13} strokeWidth={2.4} />
      <Text style={[type.caption, { color: tone, fontWeight: "900" }]}>
        {status.label}
      </Text>
    </View>
  );
}

function InfoBlock({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flex: 1,
        gap: 2,
        padding: spacing.sm,
      }}
    >
      <Text style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
      <Text
        style={{
          color: strong ? colors.primary : colors.ink,
          fontFamily: strong ? fonts.display : fonts.sans,
          fontSize: strong ? 19 : 13,
          fontWeight: "800",
          lineHeight: strong ? 23 : 18,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
// Holds exactly the paginated page of bills — no inner scroller. A scroll view
// nested in the screen's own scroll view meant two competing gestures and a
// list that could never be seen whole; pagination already bounds the height.
/**
 * Spacing between the cards, and nothing else.
 *
 * <p>It used to be a sunken panel with its own border and padding: a box of
 * boxes. That cost every card the width of two insets and left them floating in
 * a container that carried no information — now that the page itself is grey,
 * a white card already has an edge and needs no tray to sit in.
 */
function CycleListFrame({ children }: { children: ReactNode }) {
  return <View style={{ gap: spacing.sm }}>{children}</View>;
}

function BillToolsGrid({
  onOpenPaymentDetails,
  onOpenPaymentHistory,
  onOpenReport,
  onOpenTenantBills,
  reportBusy,
}: {
  onOpenPaymentDetails: () => void;
  onOpenPaymentHistory: () => void;
  onOpenReport: () => void;
  onOpenTenantBills: () => void;
  reportBusy: boolean;
}) {
  const { colors } = useTheme();
  const tools: { icon: ComponentType<LucideProps>; key: string; label: string; onPress: () => void }[] = [
    { icon: PaymentHistoryIcon, key: "history", label: "Payment history", onPress: onOpenPaymentHistory },
    // Broken explicitly. "Payment history", "Monthly report" and "Payment
    // setup" all wrap at their space because they are too wide for a quarter
    // tile; "Tenant bills" just fits, so it sat alone on one line with its
    // glyph half a line higher than the other three.
    { icon: TenantBillsIcon, key: "tenant-bills", label: "Tenant\nbills", onPress: onOpenTenantBills },
    { icon: MonthlyReportIcon, key: "report", label: reportBusy ? "Preparing…" : "Monthly report", onPress: onOpenReport },
    { icon: PaymentSetupIcon, key: "payment-details", label: "Payment setup", onPress: onOpenPaymentDetails },
  ];

  return (
    <Card style={{ flexDirection: "row", gap: 0, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm }}>
      {tools.map((tool, index) => (
        <View key={tool.key} style={{ alignItems: "stretch", flex: 1, flexDirection: "row" }}>
          {index > 0 ? (
            <View
              style={{
                alignSelf: "center",
                backgroundColor: colors.borderStrong,
                height: 62,
                opacity: 0.65,
                width: 1,
              }}
            />
          ) : null}
          <BillToolTile icon={tool.icon} label={tool.label} onPress={tool.onPress} />
        </View>
      ))}
    </Card>
  );
}

function BillToolTile({
  icon: Icon,
  label,
  onPress,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        flex: 1,
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 88,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
      }}
    >
      <Icon color={colors.primary} size={32} strokeWidth={1.9} />
      <Text
        numberOfLines={2}
        style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 15, textAlign: "center" }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function HistorySummaryMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "danger" | "primary" | "success" | "warning";
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const color =
    tone === "success"
      ? colors.successText
      : tone === "danger"
        ? colors.danger
        : tone === "warning"
          ? colors.warningText
          : colors.primary;

  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flex: 1,
        gap: 2,
        padding: spacing.sm,
      }}
    >
      <Text style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
      <Text style={{ color, fontFamily: fonts.display, fontSize: 20, fontVariant: ["tabular-nums"], }}>
        {value}
      </Text>
    </View>
  );
}

function UpcomingCyclesLink({ month, onPress, propertyId }: { month: string; onPress: () => void; propertyId: string }) {
  const { colors, fonts } = useTheme();
  // The upcoming screen's own first page, not a one-row copy of it: a separate
  // entry kept an old "none left" here while the screen it opens showed eight.
  // Refetched on mount because cycles appear on a schedule nothing here hears.
  const upcomingQuery = useListUpcomingPropertyCyclesQuery(
    { month, page: 0, propertyId, size: UPCOMING_CYCLES_PAGE_SIZE },
    { refetchOnMountOrArgChange: true, skip: !propertyId },
  );
  const data = upcomingQuery.currentData;
  const hasUpcoming = (data?.totalElements ?? 0) > 0;
  const nudge = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasUpcoming) {
      nudge.stopAnimation();
      nudge.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(nudge, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(nudge, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasUpcoming, nudge]);

  const translateX = nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  const tint = hasUpcoming ? colors.primary : colors.muted;

  if (!data && upcomingQuery.isFetching) return <ActivityIndicator color={colors.muted} />;
  if (upcomingQuery.isError) return <AnimatedPressable onPress={() => void upcomingQuery.refetch()} style={{ alignSelf: "center" }}><Text style={{ color: colors.muted }}>Could not check upcoming cycles. Tap to retry</Text></AnimatedPressable>;

  return (
    <AnimatedPressable
      accessibilityLabel={hasUpcoming ? "View upcoming cycles" : "All cycles generated"}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        alignSelf: "center",
        backgroundColor: "transparent",
        borderColor: hasUpcoming ? colors.primary : colors.border,
        borderCurve: "continuous",
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
      }}
    >
      <CalendarClock color={tint} size={16} strokeWidth={2.4} />
      <Text style={{ color: tint, fontFamily: fonts.sans, fontSize: 14, fontWeight: hasUpcoming ? "900" : "700", letterSpacing: 0.3 }}>
        {hasUpcoming ? "View upcoming cycles" : "All cycles generated"}
      </Text>
      {hasUpcoming ? (
        <Animated.View style={{ transform: [{ translateX }] }}>
          <ArrowRight color={tint} size={16} strokeWidth={2.6} />
        </Animated.View>
      ) : null}
    </AnimatedPressable>
  );
}

function MonthlyReportModal({
  busy,
  mode,
  month,
  onChangeMonth,
  onClose,
  onDownload,
  onSelectMode,
}: {
  busy: boolean;
  mode: ReportActionMode;
  month: string;
  onChangeMonth: (value: string) => void;
  onClose: () => void;
  onDownload: () => void;
  onSelectMode: (mode: ReportActionMode) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const monthOptions = useMemo(() => reportMonthOptions(), []);

  async function handleDownload(dismiss: () => void) {
    await onDownload();
    dismiss();
  }

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => <View style={{ flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.md,
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Monthly report
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, }}>
                {mode === "month-picker" ? "Choose month" : "Report actions"}
              </Text>
            </View>
            <IconButton accessibilityLabel="Close monthly report" filled icon={X} onPress={() => dismiss()} />
          </View>

          {mode === "actions" ? (
            <View style={{ gap: spacing.sm }}>
              <View
                style={{
                  alignItems: "center",
                  borderColor: colors.border,
                  borderRadius: 14,
                  borderWidth: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: spacing.md,
                }}
              >
                <View>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    Selected month
                  </Text>
                  <Text style={[type.body, { color: colors.ink, fontWeight: "900" }]}>
                    {monthLabel(month)}
                  </Text>
                </View>
                <ActionButton icon={CalendarDays} label="Change" onPress={() => onSelectMode("month-picker")} variant="secondary" />
              </View>
              <ActionButton disabled={busy} icon={Download} label={busy ? "Preparing" : "Download CSV"} onPress={() => void handleDownload(dismiss)} />
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {monthOptions.map((option) => (
                <ChoiceButton
                  active={option.value === month}
                  key={option.value}
                  label={option.label}
                  onPress={() => {
                    onChangeMonth(option.value);
                    onSelectMode("actions");
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </View>}
    </BottomSheetModal>
  );
}

function CycleCardList({
  canManage = true,
  cycles,
  fallbackLateFeePerDayPaise,
  onAction,
  readOnly = false,
}: {
  canManage?: boolean;
  cycles: BillingCycle[];
  fallbackLateFeePerDayPaise?: number | null;
  onAction?: (cycle: BillingCycle, mode: ActionMode) => void;
  readOnly?: boolean;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {cycles.map((cycle) => (
        <BillingCycleCard
          canManage={canManage}
          cycle={cycle}
          fallbackLateFeePerDayPaise={fallbackLateFeePerDayPaise}
          key={cycle.id}
          onAction={onAction}
          readOnly={readOnly}
        />
      ))}
    </View>
  );
}





function BillingCycleCard({
  canManage = true,
  cycle,
  fallbackLateFeePerDayPaise,
  onAction,
  readOnly,
}: {
  canManage?: boolean;
  cycle: BillingCycle;
  // The property's current rate, used while the cycle is UPCOMING and has no
  // stamped rate of its own.
  fallbackLateFeePerDayPaise?: number | null;
  onAction?: (cycle: BillingCycle, mode: ActionMode) => void;
  readOnly: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const [windowInfoOpen, setWindowInfoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [claimsOpen, setClaimsOpen] = useState(false);
  // Claims are answered against the owner's own bank statement, so only the
  // owner gets the claims icon. The server refuses anyone else.
  const ownsProperty = useOwnsProperty(cycle.propertyId);
  // Owner actions only: a discount or charge added to the bill. System lines
  // (rent, deposit) and the lines a one-off bill was raised with are the bill
  // itself, so a bill nobody changed shows no history button at all.
  const ownerActions = (cycle.lineItems ?? []).filter(isOwnerAction);
  // Two different questions, and they do NOT have the same answer. A cycle is
  // payable once its window opens (UNPAID/OVERDUE); a rent cycle is editable
  // only BEFORE that, while it is still UPCOMING — see the backend's
  // ensureCycleStillEditable, which rejects charges on a live rent cycle.
  const payable = cycle.status === "UNPAID" || cycle.status === "OVERDUE";
  const tenantName = cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}`;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          {/* The colour carries the state, not a tile behind it. A blue fill on
              every unpaid row made the list a wall of blue boxes; the glyph
              says the same thing as fast, and a settled row then recedes into
              grey instead of shouting in a quieter shade. No border either —
              this labels the row, it is not a control. */}
          <View style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}>
            <ReceiptText color={payable ? colors.primary : colors.muted} size={30} strokeWidth={1.8} />
          </View>
          <AnimatedPressable
            accessibilityLabel={`Payment window for ${cycle.referenceCode}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setWindowInfoOpen(true)}
            style={{ alignItems: "center", height: 24, justifyContent: "center", width: 24 }}
            tapLockMs={0}
          >
        <CircleHelp color={colors.kicker} size={16} strokeWidth={2.4} />
          </AnimatedPressable>
          {/* On every bill, rent cycle or one-off (2026-09-28): this bill's
              payment claims, under the info icon. */}
          {ownsProperty ? (
            <AnimatedPressable
              accessibilityLabel={`Payment claims for ${cycle.referenceCode}`}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setClaimsOpen(true)}
              style={{ alignItems: "center", height: 24, justifyContent: "center", width: 24 }}
              tapLockMs={0}
            >
              <PaymentClaimsIcon size={18} />
            </AnimatedPressable>
          ) : null}
          {/* Only once something has been done to the bill. On an untouched one
              it would open an empty sheet, which reads as broken. */}
          {ownerActions.length > 0 ? (
            <AnimatedPressable
              accessibilityLabel={`Action history for ${cycle.referenceCode}`}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setHistoryOpen(true)}
              style={{ alignItems: "center", height: 24, justifyContent: "center", width: 24 }}
              tapLockMs={0}
            >
              <History color={colors.kicker} size={16} strokeWidth={2.4} />
            </AnimatedPressable>
          ) : null}
        </View>

        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: spacing.md }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                {cycle.referenceCode}
              </Text>
              <Text numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, lineHeight: 25 }}>
                {tenantName}
              </Text>
            </View>
            {/* One right-hand column keeps the date centred under its status
                chip, even when the status label or formatted date is wider. */}
            <View style={{ alignItems: "center", flexShrink: 0 }}>
              <View style={{ alignSelf: "center" }}>
                <BillStatusPill cycle={cycle} />
              </View>
              <View style={{ alignItems: "center", gap: 3, marginTop: spacing.md }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>Due date</Text>
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                  <CalendarDays color={cycle.status === "OVERDUE" ? colors.danger : colors.muted} size={14} strokeWidth={2.3} />
                  <Text
                    style={{
                      color: cycle.status === "OVERDUE" ? colors.danger : colors.inkSoft,
                      fontFamily: fonts.sansBold,
                      fontSize: 14,
                    }}
                  >
                    {formatDate(cycle.rentDueDate)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <BillTotal cycle={cycle} />

          <Text style={[type.caption, { color: colors.kicker }]}>
            {billTitle(cycle)} · {formatDate(cycle.periodStartDate)} – {formatDate(cycle.periodEndDate)}
          </Text>
        </View>
      </View>

      {/* Why it was cancelled, kept on the bill so it does not just turn grey. */}
      {cycle.status === "CANCELLED" && cycle.cancellationReason ? (
        <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
          Cancelled: {cycle.cancellationReason}
        </Text>
      ) : null}

      {/* Recording the payment is the thing an owner does on a bill constantly;
          receipts, discounts and extra charges are occasional. So it gets the
          wide button and everything else lives behind the overflow dots. */}
      {!readOnly && onAction ? (
        // Fixed row height with both children stretched, so the pill and the
        // circle are the same height by construction rather than by two
        // separately-guessed numbers. ActionButton's flex:1 eats the rest of
        // the width, so the pair spans the card edge to edge.
        <View style={{ flexDirection: "row", gap: spacing.sm, height: BILL_ACTION_ROW_HEIGHT }}>
          <ActionButton
            disabled={!payable || !canManage}
            fill
            icon={Banknote}
            label={markPaidLabel(cycle)}
            onPress={() => onAction(cycle, "manual-payment")}
          />
          <OverflowDotsButton accessibilityLabel="More bill actions" onPress={() => onAction(cycle, "menu")} />
        </View>
      ) : null}

      {readOnly ? (
        <Text style={[type.description, { color: colors.muted }]}>
          Open the billing screen to manage receipts and cycle actions.
        </Text>
      ) : null}

      {historyOpen ? (
        <BillHistorySheet cycle={cycle} onClose={() => setHistoryOpen(false)} readOnly={readOnly || !canManage} />
      ) : null}

      {claimsOpen ? (
        <BillClaimsSheet cycle={cycle} onClose={() => setClaimsOpen(false)} readOnly={Boolean(readOnly)} />
      ) : null}

      {windowInfoOpen ? (
        <CycleWindowModal
          cycle={cycle}
          fallbackLateFeePerDayPaise={fallbackLateFeePerDayPaise}
          onClose={() => setWindowInfoOpen(false)}
        />
      ) : null}
    </View>
  );
}

function SummaryCyclesModal({
  cycles,
  notGeneratedCount,
  onClose,
  title,
}: {
  cycles: BillingCycle[];
  notGeneratedCount: number;
  onClose: () => void;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "85%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                {cycles.length} cycle{cycles.length === 1 ? "" : "s"}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
                {title}
              </Text>
            </View>
            <IconButton accessibilityLabel="Close cycle list" filled icon={X} onPress={() => dismiss()} />
          </View>

          {cycles.length === 0 ? (
            <EmptyState
              artwork={NO_BILL_ILLUSTRATION}
              title={notGeneratedCount > 0 ? "Cycles not generated yet" : "No matching cycles"}
              description={
                notGeneratedCount > 0
                  ? `${notGeneratedCount} cycle${notGeneratedCount === 1 ? "" : "s"} ${notGeneratedCount === 1 ? "has" : "have"} not been generated yet — each appears automatically a few days before its due date, so you can adjust it before it goes live.`
                  : "There are no billing cycles in this category for the selected period."
              }
            />
          ) : (
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
              <CycleCardList
                cycles={cycles}
                readOnly
              />
            </ScrollView>
          )}
        </View>
      </View>}
    </BottomSheetModal>
  );
}

function LineItemTable({ items }: { items: BillingCycleLineItem[] }) {
  const { colors, type } = useTheme();
  if (items.length === 0) {
    return (
      <Text style={[type.caption, { color: colors.muted }]}>
        No line items available.
      </Text>
    );
  }

  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.sm }}>
      {items.map((item) => (
        <View key={item.id} style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.caption, { color: colors.ink, fontWeight: "800" }]}>
              {item.label}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {humanizeToken(item.type)} · {humanizeToken(item.settlementAction)}
            </Text>
          </View>
          <Text style={[type.caption, { color: colors.ink, fontWeight: "900" }]}>
            {formatMoney(item.amountPaise)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatusText({ cycle }: { cycle: BillingCycle }) {
  const { colors, type } = useTheme();
  const statusDisplay = billingCycleStatusDisplay(cycle);
  const tone =
    statusDisplay.tone === "success"
      ? colors.successText
      : statusDisplay.tone === "danger"
        ? colors.danger
        : statusDisplay.tone === "warning"
          ? colors.warningText
          : statusDisplay.tone === "muted"
          ? colors.muted
          : colors.primary;

  return (
    <Text style={[type.caption, { color: tone, flex: 0.9, fontWeight: "900" }]}>
      {statusDisplay.label}
    </Text>
  );
}

function BillingActionModal({
  canManage,
  cycle,
  mode,
  onClose,
  onSelectMode,
  onViewPaymentDetails,
  onViewReceipt,
}: {
  canManage: boolean;
  cycle: BillingCycle;
  mode: ActionMode;
  onClose: () => void;
  onSelectMode: (mode: ActionMode) => void;
  onViewPaymentDetails: (cycle: BillingCycle) => void;
  onViewReceipt: (cycle: BillingCycle) => void;
}) {
  const { colors, fonts, type } = useTheme();
  // Starts unchosen. The proof section is revealed BY the choice, so defaulting
  // to Cash would open the sheet already past the question it is asking.
  const [method, setMethod] = useState<ManualPaymentMethod | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [proofImageUrls, setProofImageUrls] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  // The same discount as money (2026-09-28). Typing either fills the other in,
  // and only the one the owner typed is sent: the server works out the rest.
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountSource, setDiscountSource] = useState<"amount" | "percent" | null>(null);
  const discountPaise = discountPaiseFor(discountSource, discountPercent, discountAmount, cycle.totalAmountPaise);
  // Shown as it is typed, under the field typed in, and Save stays blocked
  // until it clears (user, 2026-09-28): the bill never drops below ₹1.
  const discountLeavesTooLittle =
    discountPaise !== null && discountPaise > 0 && cycle.totalAmountPaise - discountPaise < MIN_BILL_AFTER_DISCOUNT_PAISE;
  const [chargeLabel, setChargeLabel] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  // Per field, under the field. The old single line at the foot of the sheet
  // said "Enter a charge label" below a form of four inputs and left the reader
  // to work out which one, and it scrolled out of sight on a short screen.
  const form = useFormErrors<"amount" | "label" | "percent" | "method" | "proof" | "reason">();
  const [confirm, setConfirm] = useState<{ message: string; title: string } | null>(null);
  const insets = useSafeAreaInsets();

  /**
   * Android's keyboard height, measured rather than inferred.
   *
   * <p>`KeyboardAvoidingView behavior="padding"` is broken on Android under
   * edge-to-edge, which has been mandatory since SDK 53. It infers the keyboard
   * height by comparing screen height to window height, and edge-to-edge makes
   * the window span the whole display — so the number is wrong, and on DISMISSAL
   * its padding does not return to zero. That is exactly the bug where this
   * sheet stayed shoved up the screen after the keyboard closed.
   *
   * <p>This is SheetShell's fix, copied because this sheet is hand-rolled rather
   * than built on it. If that ever changes, delete this and use SheetShell.
   */
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const onShow = Keyboard.addListener("keyboardDidShow", (event) =>
      // Minus the safe-area inset: on a gesture-navigation device the keyboard's
      // reported height already includes that strip, and counting it twice lifts
      // the sheet a nav-bar's height too far.
      setKeyboardInset(Math.max(0, event.endCoordinates.height - insets.bottom)),
    );
    const onHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [insets.bottom]);
  const toast = useToast();
  // Refusals get their own modal: they are things the reader cannot fix by
  // retyping (bill already paid, cycle locked, discount exceeds the payable
  // amount), while `error` above stays the inline channel for bad input.
  const opErrors = useFormErrors<never>();
  const [recordManualPayment, manualPaymentState] = useRecordManualPaymentMutation();
  const [sendCashCode, sendCashCodeState] = useSendCashPaymentCodeMutation();
  /**
   * The cash code being entered, while that step is showing.
   *
   * <p>`cooldown` is where the resend countdown starts. `attempt` remounts the
   * entry when a resend is refused, so its countdown restarts from the
   * server's own wait instead of the thirty seconds it assumed.
   */
  const [cashCode, setCashCode] = useState<{ attempt: number; cooldown: number; sentTo: string } | null>(null);
  /**
   * Seconds until the server will send this tenant another code. Survives the
   * sheet closing and the method changing — see cash-code-block.
   */
  const cashWait = useCashCodeWait(cycle.tenancyId);
  // The ways this property takes money, and whether cash needs the tenant's
  // code (2026-09-28). Mark paid lists only those, and asks for the code only
  // when the property has switched it on.
  const methodsQuery = useGetPaymentMethodsQuery(cycle.propertyId);
  const takenMethods = methodsQuery.data?.acceptedMethods ?? ["CASH"];
  const cashNeedsCode = methodsQuery.data?.cashOtpRequired ?? false;
  const offeredMethods = manualPaymentMethods.filter((item) => takenMethods.includes(item.value));
  const cashBlocked = method === "CASH" && cashNeedsCode && cashWait > 0;
  const [addDiscount, discountState] = useAddCycleDiscountMutation();
  const [addExtraCharges, extraChargeState] = useAddCycleExtraChargesMutation();
  const [cancelOneOffBill, cancelState] = useCancelOneOffBillMutation();
  const [removeLateFee, removeLateFeeState] = useRemoveLateFeeMutation();
  const [confirmRemoveLateFee, setConfirmRemoveLateFee] = useState(false);
  const busy =
    manualPaymentState.isLoading
    || discountState.isLoading
    || extraChargeState.isLoading
    || cancelState.isLoading
    || removeLateFeeState.isLoading
    // Sending the tenant their code, so a second tap on Save cannot send two.
    || sendCashCodeState.isLoading;
  const payable = cycle.status === "UNPAID" || cycle.status === "OVERDUE";
  const editable = isCycleEditable(cycle);
  // One-off bills only, and only while still owed. A bill the tenant has
  // reported paying is decided first, and a rent cycle is corrected with a
  // discount, never cancelled.
  const cancellable = canManage && cycle.category === "ONE_OFF" && payable;
  // Overdue only (owner's rule, 2026-09-27): not while a payment claim awaits
  // confirmation, and not in any other state. The server holds the same line.
  const lateFeeRemovable = canManage && cycle.status === "OVERDUE" && cycle.lateFeeAmountPaise > 0;

  async function removeTheLateFee() {
    try {
      await removeLateFee({ billingCycleId: cycle.id, version: cycle.version }).unwrap();
      onClose();
      toast.success(`Late fee removed from ${cycle.referenceCode}.`);
    } catch (caught) {
      opErrors.failFromServer(errorMessage(caught) || "Could not remove the late fee. Please try again.");
    }
  }

  const chosenMethod = manualPaymentMethods.find((item) => item.value === method) ?? null;

  const title = useMemo(() => {
    if (mode === "menu") {
      return "Cycle actions";
    }
    if (mode === "manual-payment") {
      return "Mark paid";
    }
    if (mode === "discount") {
      return "Add discount";
    }
    if (mode === "cancel") {
      return "Cancel bill";
    }
    return "Add extra charge";
  }, [mode]);

  // Validates the active form, then shows a final confirmation dialog before
  // performing the action.
  /**
   * Everything the form itself can refuse, keyed by field.
   *
   * <p>Returns every problem rather than the first: a sheet that rejects the
   * label, then the amount, then the label again is three round trips for one
   * form.
   */
  function problems(): Partial<Record<"amount" | "label" | "percent" | "method" | "proof" | "reason", string>> {
    if (mode === "cancel") {
      return cancelReason.trim() ? {} : { reason: "Add a reason. The tenant is sent it." };
    }

    if (mode === "discount") {
      // The bill stays at ₹1 or more (user, 2026-09-28). Checked on the money,
      // as the server does, because a percentage just under 100 can round to
      // all of it.
      const maxDiscountPaise = cycle.totalAmountPaise - MIN_BILL_AFTER_DISCOUNT_PAISE;
      if (discountSource === "amount") {
        if (discountPaise === null || discountPaise <= 0) {
          return { amount: "Enter a valid amount." };
        }
        return discountPaise <= maxDiscountPaise ? {} : { amount: "Bill amount must be at least ₹1." };
      }
      const percent = Number(discountPercent);
      if (!discountPercent.trim()) {
        return { percent: "Enter a percentage or an amount." };
      }
      if (!Number.isFinite(percent) || percent <= 0) {
        return { percent: "Enter a valid percentage." };
      }
      return percent < 100 && discountPaise !== null && discountPaise <= maxDiscountPaise
        ? {}
        : { percent: "Bill amount must be at least ₹1." };
    }

    if (mode === "extra-charge") {
      const amountPaise = Math.round(Number(chargeAmount) * 100);
      return {
        ...(chargeLabel.trim() ? {} : { label: "Enter a charge label." }),
        ...(chargeAmount.trim()
          ? Number.isFinite(amountPaise) && amountPaise > 0
            ? {}
            : { amount: "Enter a valid amount." }
          : { amount: "Enter an amount." }),
      };
    }

    if (mode === "manual-payment") {
      if (!method) {
        return { method: "Select how the payment was made." };
      }
      // Cash is the exception on purpose: it leaves no reference to quote and
      // no slip to photograph, so demanding proof would only teach owners to
      // type something meaningless into the box.
      if (method === "CASH") {
        return {};
      }
      return referenceText.trim() || proofImageUrls.length > 0
        ? {}
        : { proof: "Enter the reference or attach a photo of the proof." };
    }

    return {};
  }

  function handleSave() {
    if (busy) {
      return;
    }
    if (!form.validate(problems())) {
      return;
    }

    if (mode === "manual-payment") {
      // Cash skips the confirm dialog and goes straight to the tenant's code.
      // The code IS the confirmation — and a better one, because it is the
      // tenant saying yes rather than the collector asking themselves.
      if (method === "CASH" && cashNeedsCode) {
        if (cashBlocked) {
          return;
        }
        void startCashConfirmation();
        return;
      }
      setConfirm({
        message: `Mark ${cycle.referenceCode} as paid for ${formatMoney(cycle.totalAmountPaise)} via ${chosenMethod?.label ?? ""}?`,
        title: "Mark this bill paid?",
      });
      return;
    }

    if (mode === "discount") {
      setConfirm({
        message: `Take ${formatMoney(discountPaise ?? 0)} (${discountPercent}%) off ${cycle.referenceCode}?`,
        title: "Apply discount?",
      });
      return;
    }

    if (mode === "cancel") {
      setConfirm({
        message: `${cycle.referenceCode} for ${formatMoney(cycle.totalAmountPaise)} will no longer be owed. The tenant is told, with your reason. This can't be undone.`,
        title: "Cancel this bill?",
      });
      return;
    }

    if (mode === "extra-charge") {
      const amountPaise = Math.round(Number(chargeAmount) * 100);
      setConfirm({
        message: `Add a ${formatMoney(amountPaise)} charge "${chargeLabel.trim()}" to ${cycle.referenceCode} and bill it to the tenant?`,
        title: "Add extra charge?",
      });
    }
  }

  /**
   * A refusal to send, recorded where it will be seen again.
   *
   * <p>Returns false when this was not a rate limit, so the caller can show
   * the server's own message instead.
   */
  function recordCashCodeRefusal(caught: unknown) {
    const wait = retryAfterSeconds(caught);
    if (!wait) {
      return false;
    }
    blockCashCodes(cycle.tenancyId, wait, /device/i.test(errorMessage(caught) ?? ""));
    return true;
  }

  /** Sends the tenant their code and moves to the step where it is entered. */
  async function startCashConfirmation() {
    try {
      const sent = await sendCashCode({ billingCycleId: cycle.id, version: cycle.version }).unwrap();
      setCashCode({ attempt: 0, cooldown: RESEND_COOLDOWN_SECONDS, sentTo: sent.sentTo });
    } catch (caught) {
      // Rate limited: stay on the form, where Save now counts down to when a
      // code can be sent. The timer is the message, so no alert over it.
      if (recordCashCodeRefusal(caught)) {
        return;
      }
      opErrors.failFromServer(
        errorMessage(caught) || "Could not send the code to the tenant. Please try again.",
      );
    }
  }

  /**
   * Another code, from the code step.
   *
   * <p>A refused resend leaves the step open: the code already on the tenant's
   * phone still works. Only its Resend button waits, counting down from the
   * server's figure.
   */
  async function resendCashCode() {
    try {
      await sendCashCode({ billingCycleId: cycle.id, version: cycle.version }).unwrap();
    } catch (caught) {
      if (recordCashCodeRefusal(caught)) {
        const wait = retryAfterSeconds(caught);
        setCashCode((step) => (step ? { ...step, attempt: step.attempt + 1, cooldown: wait } : step));
        return;
      }
      opErrors.failFromServer(errorMessage(caught) || "Could not send a new code. Please try again.");
    }
  }

  /**
   * Records the cash with the tenant's code.
   *
   * <p>A refusal — a wrong code, or a bill that changed after the code went
   * out — leaves the sheet open, because the answer to both is on it: retype,
   * or Resend.
   */
  async function confirmCash(otp: string) {
    try {
      await recordManualPayment({
        billingCycleId: cycle.id,
        payload: {
          method: "CASH",
          note: note.trim() || null,
          otp,
          proofImageUrls: [],
          referenceText: null,
        },
        version: cycle.version,
      }).unwrap();
      setCashCode(null);
      onClose();
      toast.success(`${cycle.referenceCode} marked paid, confirmed by the tenant.`);
    } catch (caught) {
      opErrors.failFromServer(
        errorMessage(caught) || "Could not record the payment. Please try again.",
      );
    }
  }

  async function submit() {
    try {
      // What to say once it lands. Built before the call so the sheet can close
      // immediately and the toast still names what happened.
      const done =
        mode === "manual-payment"
          ? `${cycle.referenceCode} marked paid.`
          : mode === "discount"
            ? `${formatMoney(discountPaise ?? 0)} discount applied to ${cycle.referenceCode}.`
            : mode === "cancel"
              ? `${cycle.referenceCode} cancelled.`
              : `Charge added to ${cycle.referenceCode}.`;
      if (mode === "manual-payment") {
        await recordManualPayment({
          billingCycleId: cycle.id,
          payload: {
            method: method!,
            note: note.trim() || null,
            proofImageUrls,
            referenceText: referenceText.trim() || null,
          },
          version: cycle.version,
        }).unwrap();
      } else if (mode === "discount") {
        // Only what the owner typed. The other field was filled in for them.
        // On exactly this bill (2026-09-29), not the tenancy's latest rent cycle.
        await addDiscount({
          billingCycleId: cycle.id,
          discount:
            discountSource === "amount"
              ? { description: note.trim() || null, discountAmountPaise: discountPaise ?? 0, label: "Owner discount" }
              : { description: note.trim() || null, discountPercent: Number(discountPercent), label: "Owner discount" },
          version: cycle.version,
        }).unwrap();
      } else if (mode === "cancel") {
        await cancelOneOffBill({ billingCycleId: cycle.id, reason: cancelReason.trim(), version: cycle.version }).unwrap();
      } else if (mode === "extra-charge") {
        const amountPaise = Math.round(Number(chargeAmount) * 100);
        await addExtraCharges({
          billingCycleId: cycle.id,
          charges: [
            {
              amountPaise,
              description: chargeDescription.trim() || null,
              label: chargeLabel.trim(),
            },
          ],
          version: cycle.version,
        }).unwrap();
      }
      onClose();
      toast.success(done);
    } catch (caught) {
      // The server's own words. "Action failed. Refresh and try again." was the
      // same sentence whether the bill was locked, already paid, or the discount
      // exceeded the payable amount — none of which a refresh fixes.
      opErrors.failFromServer(
        errorMessage(caught) || "Could not complete the action. Please try again.",
      );
    }
  }

  return (
    <>
    {/* No statusBarTranslucent: it extends the modal window under the system
        bars on Android, and the KeyboardAvoidingView below then measures the
        keyboard against a frame taller than the one it is padding. The sheet
        rises correctly and never comes back down, because the padding it
        resolves to on dismissal is not zero. The same flag is already omitted
        from AddClauseSheet and the manager-permissions sheet for the sibling
        symptom — a foot button that could not be tapped. */}
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => (
      <KeyboardAvoidingView
        // Android drives itself from the measured inset below; handing it
        // "padding" too would apply the lift twice — and leave it applied.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Full width and anchored to the bottom edge, like every other sheet in
            the app. An inset card floating above the edge is the dialog
            language, and this is a sheet — it scrolls, it holds a form, and it
            has a button at its foot that wants the whole width. */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            // Lifted clear of the keyboard rather than padded behind it, so the
            // sheet's own bottom edge stays visible sitting on top of it.
            marginBottom: keyboardInset,
            maxHeight: "90%",
            // The safe-area inset is the nav bar's. With the keyboard up the
            // keyboard covers it, so applying both leaves a dead strip.
            paddingBottom: (keyboardInset > 0 ? 0 : insets.bottom) + spacing.lg,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: spacing.sm }}>
              {mode !== "menu" ? (
                <IconButton
                  accessibilityLabel={cashCode ? "Back to payment" : "Back to actions"}
                  filled
                  icon={ArrowLeft}
                  onPress={() => {
                    // One step at a time: from the code back to the payment
                    // form, and only from there back to the actions.
                    if (cashCode) {
                      setCashCode(null);
                      return;
                    }
                    form.clearAll();
                    onSelectMode("menu");
                  }}
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  {cycle.referenceCode}
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, }}>
                  {cashCode ? "Tenant's code" : title}
                </Text>
              </View>
            </View>
            <IconButton accessibilityLabel="Close billing action" filled icon={X} onPress={() => dismiss()} />
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
          {/* The next step of the same sheet, not a second sheet over it. A
              stacked sheet dimmed this one behind it and put two close buttons
              on screen for what is one act: taking the cash. */}
          {cashCode ? (
            <OtpCodeEntry
              busy={manualPaymentState.isLoading}
              key={cashCode.attempt}
              busyLabel="Recording…"
              confirmLabel="Mark paid"
              cooldownSeconds={cashCode.cooldown}
              message={`Ask the tenant for the six-digit code sent to the number ending ${cashCode.sentTo}. It confirms they paid ${formatMoney(cycle.totalAmountPaise)} in cash for this bill.`}
              onResend={() => void resendCashCode()}
              onSubmit={(otp) => void confirmCash(otp)}
              resending={sendCashCodeState.isLoading}
            />
          ) : null}
          {mode === "menu" ? (
            <View style={{ gap: spacing.sm }}>
              <ActionButton disabled={!editable || !canManage} icon={Percent} label="Add discount" onPress={() => onSelectMode("discount")} variant="secondary" />
              <ActionButton disabled={!editable || !canManage} icon={Plus} label="Add extra charge" onPress={() => onSelectMode("extra-charge")} variant="secondary" />
              {/* Receipt actions stay available on paid and cancelled bills —
                  those are exactly the ones an owner comes back to print.
                  Downloading the PDF lives inside the receipt itself rather
                  than beside this row: two doors to one file meant an owner
                  could send a receipt without ever having read it. */}
              <ActionButton
                icon={Eye}
                label="View receipt"
                onPress={() => {
                  onClose();
                  onViewReceipt(cycle);
                }}
                variant="secondary"
              />
              {/* Only once there IS a payment. Before that the sheet would open
                  on four empty rows and a proof section with nothing in it,
                  which reads as a fault rather than as "not yet". */}
              {cycle.status === "PAID" ? (
                <ActionButton
                  icon={Banknote}
                  label="Payment details"
                  onPress={() => {
                    onClose();
                    onViewPaymentDetails(cycle);
                  }}
                  variant="secondary"
                />
              ) : null}
              {lateFeeRemovable ? (
                <ActionButton
                  disabled={busy}
                  icon={TimerReset}
                  label="Remove late fee"
                  onPress={() => setConfirmRemoveLateFee(true)}
                  variant="secondary"
                />
              ) : null}
              {/* Last, and red: the one action here that removes a charge
                  rather than changing it. */}
              {cancellable ? (
                <ActionButton icon={XCircle} label="Cancel bill" onPress={() => onSelectMode("cancel")} variant="danger" />
              ) : null}
              {canManage && cycle.category === "ONE_OFF" && cycle.status === "CONFIRMATION_PENDING" ? (
                <Text style={[type.modalDescription, { color: colors.muted }]}>
                  The tenant has reported paying this bill. Confirm or reject their payment before cancelling it.
                </Text>
              ) : null}
              {!payable || !editable ? (
                <Text style={[type.caption, { color: colors.muted }]}>
                  {cycle.status === "UPCOMING"
                    ? "This bill isn't payable until its due window opens. You can still change it until then."
                    : cycle.status === "PAID" || cycle.status === "CANCELLED"
                      ? "Paid or cancelled bills cannot be edited."
                      : "This bill is live, so its charges are frozen. Raise a one-off bill for anything new."}
                </Text>
              ) : null}
            </View>
          ) : null}

          {mode === "manual-payment" && !cashCode ? (
            <>
              <Text style={[type.modalDescription, { color: colors.muted }]}>
                Records the full bill amount {formatMoney(cycle.totalAmountPaise)} as received. Rent is collected
                outside the app, so this is what marks it settled.
              </Text>
              {/* One: how it was paid. A picker rather than a row of chips —
                  the same control the app uses for every other single choice,
                  and the chips wrapped to two lines at five options. */}
              <SingleOptionPicker<ManualPaymentMethod>
                centered
                emptyLabel="Select how it was paid"
                error={form.errors.method}
                label="Payment method"
                onChange={(picked) => {
                  setMethod(picked);
                  form.clearField("method");
                  form.clearField("proof");
                  // Cash carries no proof, so anything typed against a previous
                  // method must not ride along with it.
                  if (picked === "CASH") {
                    setReferenceText("");
                    setProofImageUrls([]);
                  }
                }}
                optionIcon={(value) => <PaymentMethodIcon method={value} />}
                options={offeredMethods.map((item) => ({ label: item.label, value: item.value }))}
                required
                showIcon={false}
                title="Payment method"
                value={method}
              />

              {/* Why Save is counting down rather than sending. Only for cash —
                  every other method records without a code, so a block on
                  codes has nothing to say to them. */}
              {cashBlocked ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                  <TimerReset color={colors.warningText} size={15} strokeWidth={2.2} />
                  <Text style={[type.caption, { color: colors.warningText, flex: 1 }]}>
                    Too many codes sent. Try again in {waitClock(cashWait)}.
                  </Text>
                </View>
              ) : null}

              {/* Two: the proof, revealed by the choice above and skipped
                  entirely for cash.

                  Its own card, because the two halves are one requirement
                  rather than two fields that happen to sit together — loose in
                  the sheet they read as a reference AND a photo, both wanted.
                  The OR between them is the whole rule, said once and in the
                  place a reader is already looking: an owner holding the slip
                  should not have to transcribe the number off it, and one
                  holding the number should not have to photograph it. */}
              {chosenMethod && chosenMethod.value !== "CASH" ? (
                <View
                  style={{
                    backgroundColor: colors.surface,
                    // Reddens as one, because the requirement is the card's and
                    // not either field's — neither box is individually wrong.
                    borderColor: form.errors.proof ? colors.danger : colors.borderStrong,
                    borderCurve: "continuous",
                    borderRadius: radii.card,
                    borderWidth: 1,
                    gap: spacing.md,
                    padding: spacing.md,
                  }}
                >
                  <Text style={[type.label, { color: form.errors.proof ? colors.danger : colors.inkSoft }]}>
                    Payment proof
                    <RequiredMark required />
                  </Text>

                  <FormInput
                    label={chosenMethod.referenceLabel}
                    onChangeText={(next) => {
                      setReferenceText(next);
                      form.clearField("proof");
                    }}
                    placeholder={chosenMethod.referencePlaceholder}
                    value={referenceText}
                  />

                  <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
                    <Text style={[type.caption, { color: colors.kicker, fontFamily: fonts.sansBold }]}>
                      OR
                    </Text>
                    <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
                  </View>

                  {/* Two, because the evidence usually comes in pairs — a
                      cheque's face and counterfoil, a card slip's merchant and
                      customer copies, a UPI screenshot and the bank's SMS. */}
                  <MultiImageField
                    label="Photo of payment proof"
                    max={2}
                    onChange={(next) => {
                      setProofImageUrls(next);
                      form.clearField("proof");
                    }}
                    target="PAYMENT_PROOF"
                    urls={proofImageUrls}
                  />

                  <FieldError message={form.errors.proof} />
                </View>
              ) : null}

              {/* Three: the note, always last. Multiline because it is the one
                  free-text box here — a single line invited four words when the
                  useful thing is a sentence about where the money came from.
                  The placeholder no longer says "optional": nothing on this
                  field is marked required, so saying so twice was noise. */}
              <FormInput
                label="Note"
                multiline
                onChangeText={setNote}
                placeholder="Add a note"
                value={note}
              />
            </>
          ) : null}

          {mode === "discount" ? (
            <>
              {/* One or the other (user, 2026-09-28): typing in one fills and
                  locks the other, and clearing it opens both again. */}
              <FormInput
                disabled={discountSource === "amount"}
                error={form.errors.percent ?? (discountSource === "percent" && discountLeavesTooLittle ? "Bill amount must be at least ₹1." : undefined)}
                keyboardType="decimal-pad"
                label="Discount percentage"
                onChangeText={(next) => {
                  setDiscountPercent(next);
                  setDiscountSource(next.trim() ? "percent" : null);
                  setDiscountAmount(amountFromPercent(next, cycle.totalAmountPaise));
                  form.clearField("percent");
                  form.clearField("amount");
                }}
                placeholder="Example: 10"
                required={discountSource !== "amount"}
                value={discountPercent}
              />
              <OrDivider />
              <FormInput
                disabled={discountSource === "percent"}
                error={form.errors.amount ?? (discountSource === "amount" && discountLeavesTooLittle ? "Bill amount must be at least ₹1." : undefined)}
                keyboardType="decimal-pad"
                label="Discount amount"
                onChangeText={(next) => {
                  setDiscountAmount(next);
                  setDiscountSource(next.trim() ? "amount" : null);
                  setDiscountPercent(percentFromAmount(next, cycle.totalAmountPaise));
                  form.clearField("percent");
                  form.clearField("amount");
                }}
                placeholder="0"
                prefix="₹"
                required={discountSource !== "percent"}
                value={discountAmount}
              />
              <DiscountPreview discountPaise={discountPaise} totalPaise={cycle.totalAmountPaise} />
              <FormInput label="Reason" onChangeText={setNote} placeholder="Optional reason" value={note} />
            </>
          ) : null}

          {mode === "cancel" ? (
            <>
              <Text style={[type.modalDescription, { color: colors.muted }]}>
                {cycle.referenceCode} stays on record as Cancelled and stops counting towards what the tenant owes.
                The tenant is sent a notification with your reason.
              </Text>
              <FormInput
                error={form.errors.reason}
                label="Reason"
                maxLength={200}
                onChangeText={(next) => {
                  setCancelReason(next);
                  form.clearField("reason");
                }}
                placeholder="Wrong amount, raised twice"
                required
                value={cancelReason}
              />
            </>
          ) : null}

          {mode === "extra-charge" ? (
            <>
              <FormInput
                error={form.errors.label}
                label="Charge label"
                onChangeText={(next) => {
                  setChargeLabel(next);
                  form.clearField("label");
                }}
                placeholder="Damage, cleaning, extra usage"
                required
                value={chargeLabel}
              />
              <FormInput
                error={form.errors.amount}
                keyboardType="decimal-pad"
                label="Amount"
                onChangeText={(next) => {
                  setChargeAmount(next);
                  form.clearField("amount");
                }}
                placeholder="0"
                prefix="₹"
                required
                value={chargeAmount}
              />
              {/* Always added to the bill (user, 2026-09-28). Taking money from
                  the deposit is the deposit manager's job, not a charge that
                  never reaches the bill. */}
              <FormInput label="Description" onChangeText={setChargeDescription} placeholder="Optional description" value={chargeDescription} />
            </>
          ) : null}

          </ScrollView>

          {mode !== "menu" && !cashCode ? (
            <ActionButton
              disabled={busy || form.blocked || cashBlocked || (mode === "discount" && discountLeavesTooLittle)}
              icon={mode === "cancel" ? XCircle : IndianRupee}
              label={
                // Blocked, not relabelled: the countdown already sits under the
                // payment method, and a timer on the button said the same thing
                // twice in two places.
                sendCashCodeState.isLoading
                  ? "Sending code"
                  : busy
                    ? "Saving"
                    : mode === "cancel"
                      ? "Cancel bill"
                      : "Save"
              }
              onPress={handleSave}
              variant={mode === "cancel" ? "danger" : "primary"}
            />
          ) : null}
        </View>
      </View>
      </KeyboardAvoidingView>
      )}
    </BottomSheetModal>
    {confirm ? (
      <ConfirmDialog
        confirmLabel="Yes, confirm"
        message={confirm.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void submit();
        }}
        title={confirm.title}
      />
    ) : null}
    {confirmRemoveLateFee ? (
      <ConfirmDialog
        confirmLabel="Remove late fee"
        message={`Remove the ${formatMoney(cycle.lateFeeAmountPaise)} late fee from ${cycle.referenceCode}? It will not be charged again on this bill.`}
        onCancel={() => setConfirmRemoveLateFee(false)}
        onConfirm={() => {
          setConfirmRemoveLateFee(false);
          void removeTheLateFee();
        }}
        title="Remove late fee?"
      />
    ) : null}
    {/* Sits outside the sheet's own Modal so the refusal is still readable
        after the sheet closes on a failed submit. */}
    {opErrors.serverError ? (
      <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
    ) : null}
    </>
  );
}

function ConfirmDialog({
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={onCancel} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 420,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, }}>
            {title}
          </Text>
          <Text style={[type.modalDescription, { color: colors.muted }]}>
            {message}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onCancel}
              style={{
                alignItems: "center",
                backgroundColor: colors.surfaceSunken,
                borderColor: colors.border,
                borderRadius: 14,
                borderWidth: 1,
                flex: 1,
                justifyContent: "center",
                paddingVertical: spacing.md,
              }}
            >
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14, }}>
                Cancel
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderRadius: 14,
                flex: 1,
                justifyContent: "center",
                paddingVertical: spacing.md,
              }}
            >
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 14, }}>
                {confirmLabel}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </CenterModal>
  );
}

/** A bill never drops below ₹1 after a discount (user, 2026-09-28). The server holds the same floor. */
const MIN_BILL_AFTER_DISCOUNT_PAISE = 100;

/** A rule either side of "or", between two fields where one is enough. */
function OrDivider() {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
      <Text style={[type.caption, { color: colors.kicker }]}>or</Text>
      <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
    </View>
  );
}

/** The bill after the discount, once the discount is a real figure. */
function DiscountPreview({ discountPaise, totalPaise }: { discountPaise: number | null; totalPaise: number }) {
  const { colors, type } = useTheme();
  if (discountPaise === null || discountPaise <= 0 || totalPaise - discountPaise < MIN_BILL_AFTER_DISCOUNT_PAISE) {
    return null;
  }
  return (
    <Text style={[type.caption, { color: colors.primary }]}>
      New total {formatMoney(totalPaise - discountPaise)}
    </Text>
  );
}

/** Up to two decimals, no trailing zeros: 12.5, not 12.50. */
function trimDecimal(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** The amount a percentage comes to, rounded as the server rounds it. */
function amountFromPercent(percent: string, totalPaise: number): string {
  const parsed = Number(percent);
  if (!percent.trim() || !Number.isFinite(parsed) || parsed <= 0 || totalPaise <= 0) {
    return "";
  }
  return trimDecimal(Math.min(Math.round((totalPaise * parsed) / 100), totalPaise) / 100);
}

/** The share of the total an amount is, for the percentage field. */
function percentFromAmount(amount: string, totalPaise: number): string {
  const paise = Math.round(Number(amount) * 100);
  if (!amount.trim() || !Number.isFinite(paise) || paise <= 0 || totalPaise <= 0) {
    return "";
  }
  return trimDecimal((paise * 100) / totalPaise);
}

/**
 * The money a discount takes off, from whichever field the owner typed in.
 * Null until that field holds a number.
 */
function discountPaiseFor(
  source: "amount" | "percent" | null,
  percent: string,
  amount: string,
  totalPaise: number,
): number | null {
  if (source === "amount") {
    const paise = Math.round(Number(amount) * 100);
    return Number.isFinite(paise) ? paise : null;
  }
  if (source === "percent") {
    const parsed = Number(percent);
    return Number.isFinite(parsed) ? Math.min(Math.round((totalPaise * parsed) / 100), totalPaise) : null;
  }
  return null;
}

function SegmentedControl({
  active,
  onChange,
  options,
}: {
  active: CycleView;
  onChange: (value: CycleView) => void;
  options: TabOption<CycleView>[];
}) {
  return <TabSwitcher active={active} onChange={onChange} options={options} />;
}


/**
 * Line heights reserved above and below the figure in a small tile.
 *
 * <p>Three tiles sit in a row at a third of the screen each, where "Billing
 * cycles" wraps to two lines and "Overdue" does not — so the figures below them
 * landed at different heights and the row read as misaligned. Reserving two
 * lines for both the label and the hint fixes the figure's position regardless
 * of how the copy happens to break.
 *
 * <p>Reserved rather than solved by shortening the labels: a longer word, a
 * narrower phone or a larger system font size would reintroduce the wrap, and
 * the alignment would silently break again.
 */
function CollectionSummaryCard({
  billedPaise,
  collectedPaise,
  onPress,
}: {
  billedPaise: number;
  collectedPaise: number;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const ringSize = 80;
  const ringStrokeWidth = 8;
  const ringRadius = (ringSize - ringStrokeWidth) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const collectedPercent = billedPaise > 0
    ? Math.max(0, Math.min(100, Math.round((collectedPaise / billedPaise) * 100)))
    : 0;
  const animatedPercent = useRef(new Animated.Value(collectedPercent)).current;
  const animatedCollectedPaise = useRef(new Animated.Value(collectedPaise)).current;
  const animatedBilledPaise = useRef(new Animated.Value(billedPaise)).current;
  const [displayPercent, setDisplayPercent] = useState(collectedPercent);
  const [displayCollectedPaise, setDisplayCollectedPaise] = useState(collectedPaise);
  const [displayBilledPaise, setDisplayBilledPaise] = useState(billedPaise);
  const animatedRingOffset = animatedPercent.interpolate({
    extrapolate: "clamp",
    inputRange: [0, 100],
    outputRange: [ringCircumference, 0],
  });

  useEffect(() => {
    const percentListenerId = animatedPercent.addListener(({ value }) => {
      setDisplayPercent(Math.round(value));
    });
    const collectedListenerId = animatedCollectedPaise.addListener(({ value }) => {
      setDisplayCollectedPaise(Math.round(value));
    });
    const billedListenerId = animatedBilledPaise.addListener(({ value }) => {
      setDisplayBilledPaise(Math.round(value));
    });
    const animation = Animated.parallel([
      Animated.timing(animatedPercent, {
        duration: 650,
        easing: Easing.out(Easing.cubic),
        toValue: collectedPercent,
        useNativeDriver: false,
      }),
      Animated.timing(animatedCollectedPaise, {
        duration: 650,
        easing: Easing.out(Easing.cubic),
        toValue: collectedPaise,
        useNativeDriver: false,
      }),
      Animated.timing(animatedBilledPaise, {
        duration: 650,
        easing: Easing.out(Easing.cubic),
        toValue: billedPaise,
        useNativeDriver: false,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
      animatedPercent.removeListener(percentListenerId);
      animatedCollectedPaise.removeListener(collectedListenerId);
      animatedBilledPaise.removeListener(billedListenerId);
    };
  }, [
    animatedBilledPaise,
    animatedCollectedPaise,
    animatedPercent,
    billedPaise,
    collectedPaise,
    collectedPercent,
  ]);

  return (
    <AnimatedPressable
      accessibilityLabel="Open collectable billing cycles"
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        elevation: 3,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.lg,
        shadowColor: colors.shadow,
        shadowOffset: { height: 4, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 12,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={[type.body, { color: colors.muted, fontSize: 16 }]}>
          Collectable amount
        </Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.65}
          numberOfLines={1}
          style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 31, lineHeight: 37 }}
        >
          {formatMoney(displayCollectedPaise)}
          <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 21 }}>
            {" / " + formatMoney(displayBilledPaise)}
          </Text>
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>Collected / billed</Text>
      </View>

      <View
        style={{
          alignItems: "center",
          height: ringSize,
          justifyContent: "center",
          position: "relative",
          width: ringSize,
        }}
      >
        <Svg height={ringSize} style={{ position: "absolute" }} width={ringSize}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            fill="transparent"
            r={ringRadius}
            stroke={colors.primarySoft}
            strokeWidth={ringStrokeWidth}
          />
          <AnimatedCircle
            cx={ringSize / 2}
            cy={ringSize / 2}
            fill="transparent"
            originX={ringSize / 2}
            originY={ringSize / 2}
            r={ringRadius}
            rotation={-90}
            stroke={colors.primary}
            strokeDasharray={[ringCircumference, ringCircumference]}
            strokeDashoffset={animatedRingOffset}
            strokeLinecap="round"
            strokeWidth={ringStrokeWidth}
          />
        </Svg>
        <Text style={{ color: colors.primaryDeep, fontFamily: fonts.display, fontSize: 18, lineHeight: 22 }}>
          {displayPercent}%
        </Text>
        <Text style={[type.caption, { color: colors.muted, fontSize: 10 }]}>collected</Text>
      </View>
    </AnimatedPressable>
  );
}

function SummaryTile({
  hint,
  icon: Icon,
  label,
  onPress,
  value,
}: {
  hint: string;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        flexDirection: "row",
        gap: spacing.sm,
        minHeight: 104,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 3, width: 0 },
        shadowOpacity: 0.75,
        shadowRadius: 9,
      }}
    >
      <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
        <Icon color={colors.ink} size={38} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={[type.caption, { color: colors.muted, fontSize: 13, lineHeight: 17 }]}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            // Shrinks with the figure's length. adjustsFontSizeToFit does
            // nothing on web, so a long amount ellipsised there.
            fontSize: metricFontSize(value, 23),
            lineHeight: metricFontSize(value, 23) + 5,
          }}
        >
          {value}
        </Text>
        <Text
          numberOfLines={2}
          style={[type.description, { color: colors.muted }]}>
          {hint}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sansBold, }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// LOCAL VARIANT — deliberately NOT the shared ActionButton in
// `@/features/owner/owner-ui`. It differs (opt-in `fill` instead of always flex:1, 13px label, no danger variant), so editing the shared
// one does NOT change this screen. Unify before adding behaviour to either.
function ActionButton({
  disabled,
  fill,
  icon: Icon,
  label,
  onPress,
  variant = "primary",
}: {
  disabled?: boolean;
  // Grow to fill the row. Off by default because most buttons in this file sit
  // in content-width rows; the bill action row wants the opposite.
  fill?: boolean;
  icon: typeof Search;
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { colors, fonts } = useTheme();
  const primary = variant === "primary";
  const danger = variant === "danger";
  const foreground = disabled ? colors.muted : primary ? colors.onPrimary : danger ? colors.danger : colors.primary;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled
          ? colors.neutralSoft
          : primary
            ? colors.primary
            : danger
              ? colors.dangerSoft
              : colors.primarySoft,
        borderRadius: 14,
        flex: fill ? 1 : undefined,
        flexDirection: "row",
        gap: spacing.xs,
        justifyContent: "center",
        opacity: disabled ? 0.65 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Icon color={foreground} size={16} strokeWidth={2.2} />
      <Text style={{ color: foreground, fontFamily: fonts.sansBold, fontSize: 13, }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// How the cycle lifecycle works, for an owner who has just watched a bill
// appear on its own and wants to know what they can still change.
/** Billing's own copy. The sheet around it is shared with payment claims. */
/**
 * What each status chip on a bill means, with the chip itself.
 *
 * <p>The chips are BillStatusPill, the component the bill cards render, fed a
 * minimal bill in each state. A hand-drawn copy would drift the day a chip's
 * colour or icon changed on the card.
 */
const STATUS_LEGEND: { cycle: Pick<BillingCycle, "paidAt" | "rentDueDate" | "status">; meaning: string }[] = [
  {
    cycle: { paidAt: null, rentDueDate: "2026-01-05", status: "UPCOMING" },
    meaning: "Created early and not payable yet. You can still add a discount or a charge.",
  },
  {
    cycle: { paidAt: null, rentDueDate: "2026-01-05", status: "UNPAID" },
    meaning: "Live and waiting for the tenant to pay.",
  },
  {
    cycle: { paidAt: null, rentDueDate: "2026-01-05", status: "OVERDUE" },
    meaning: "Past its due date and still unpaid. A late fee applies if the property has one.",
  },
  {
    cycle: { paidAt: null, rentDueDate: "2026-01-05", status: "CONFIRMATION_PENDING" },
    meaning: "The tenant says they paid. Confirm or reject their payment.",
  },
  {
    cycle: { paidAt: "2026-01-04T10:00:00Z", rentDueDate: "2026-01-05", status: "PAID" },
    meaning: "Paid on or before the due date.",
  },
  {
    cycle: { paidAt: "2026-01-09T10:00:00Z", rentDueDate: "2026-01-05", status: "PAID" },
    meaning: "Paid, but after the due date.",
  },
  {
    cycle: { paidAt: null, rentDueDate: "2026-01-05", status: "CANCELLED" },
    meaning: "A one-off bill that was cancelled. It no longer counts as owed.",
  },
];

function BillStatusLegend() {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      {STATUS_LEGEND.map((entry) => (
        <View
          key={`${entry.cycle.status}-${entry.cycle.paidAt ?? "none"}`}
          style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
        >
          {/* A fixed column so every meaning starts at the same edge. */}
          <View style={{ width: 96 }}>
            <BillStatusPill cycle={entry.cycle as BillingCycle} />
          </View>
          {/* Same colour and line height as every point's own description. */}
          <Text style={[type.caption, { color: colors.muted, flex: 1, lineHeight: 18 }]}>{entry.meaning}</Text>
        </View>
      ))}
    </View>
  );
}

function BillingRulesModal({ onClose }: { onClose: () => void }) {
  const rules: HowItWorksStep[] = [
    {
      title: "What each status on a bill means",
      body: "Every bill carries one of these chips, in the same colour and icon as on the bill.",
      extra: <BillStatusLegend />,
    },
    {
      title: "The first bill of a tenancy stays open",
      body: "It is created and opened the moment you onboard the tenant, so it never gets an early window like the others. Discounts, extra charges and reverting them all stay available on it until it is paid.",
    },
    {
      title: "Every later bill appears about 10 days early",
      body: "Cycle 2 onwards is created ahead of its due date and sits as UPCOMING — visible to you, not yet payable by the tenant.",
    },
    {
      title: "UPCOMING is your window on those",
      body: "On cycle 2 onwards, discounts and extra charges can only be added while the bill is UPCOMING. That is the whole reason it appears early.",
    },
    {
      title: "Going live freezes a later bill",
      body: "On its start date the cycle turns UNPAID and its total is fixed, so the tenant owes exactly what they were shown. Charges and discounts are refused from then on — the first cycle is the only exception.",
    },
    {
      title: "After that, raise a one-off bill",
      body: "A charge that arrives once a later cycle is live goes on its own bill, due immediately. Nothing waits in a queue for the next cycle any more.",
    },
    {
      title: "What you add by hand can be undone",
      body: "The history icon on a bill lists every discount and charge someone added, and who added it. Reverting sets that line to zero and recalculates the bill — available for as long as the bill itself is still editable.",
    },
    {
      title: "Due date already includes grace",
      body: "The due date is the period start plus the property's grace days — grace is inside it, not added on top of it.",
    },
    {
      title: "Late fees use the rate at go-live",
      body: "The daily late-fee rate is stamped onto the cycle when it goes live. Changing the property rate afterwards applies from the next cycle, never to a bill already running.",
    },
    {
      title: "You record the payment",
      body: "Rent is collected outside the app. Use Mark paid on the bill once the tenant has paid you, and the receipt keeps the method and reference.",
    },
  ];

  return <HowItWorksSheet eyebrow="Billing" onClose={onClose} steps={rules} title="How cycles work" />;
}

// Explains when this bill has to be paid and what being late costs.
//
// The pay window runs from the period start to the due date, because the due
// date IS start + grace days (BillingCycleService.calculateMonthlyDueDate) —
// the grace is already inside it, not added on top.
/** What each owner action is called when it needs naming — a toast, a dialog. */
const ACTION_LABEL: Record<string, string> = {
  DISCOUNT: "Discount",
  EXTRA_CHARGE: "Extra charge",
  LATE_FEE: "Late fee",
};

/**
 * The name the person gave the action, title-cased.
 *
 * <p>A history row used to carry three headings that all said "discount": the
 * type, the generic "Owner discount" label the form stamps on every one, and
 * the note actually typed. Only the last distinguishes one row from another, so
 * it is the only one kept — falling back to the label when no note was written.
 */
/** Cleared to zero and marked waived — the shape a reverted line is left in. */
function isReverted(item: BillingCycleLineItem): boolean {
  return item.amountPaise === 0 && item.settlementAction === "WAIVED";
}

function actionName(item: BillingCycleLineItem): string {
  const given = item.description?.trim() || item.label?.trim() || "";
  if (!given) {
    return ACTION_LABEL[item.type] ?? humanizeToken(item.type);
  }
  return given
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Everything an owner has done to one bill, newest first, each reversible.
 *
 * <p>Reverting zeroes the line rather than deleting it, so the row stays in the
 * list marked "Reverted". A bill's history is the record of what was done to it,
 * and an entry that disappears leaves the reader wondering why the total moved.
 *
 * <p>Only owner actions. The rent and deposit lines are the bill itself, and
 * listing them here would bury the two or three things a person actually did.
 */
function BillHistorySheet({
  cycle,
  onClose,
  readOnly,
}: {
  cycle: BillingCycle;
  onClose: () => void;
  readOnly: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const revertErrors = useFormErrors<never>();
  const [clearLineItem] = useClearBillingLineItemMutation();
  const [pending, setPending] = useState<BillingCycleLineItem | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  // Live actions first, newest within each group. A reverted line still counts
  // as history — it says the total moved and then moved back — but it is not a
  // thing anyone can act on, so it should never sit above one that is.
  const actions = (cycle.lineItems ?? [])
    .filter(isOwnerAction)
    .slice()
    .sort((left, right) => {
      const byState = Number(isReverted(left)) - Number(isReverted(right));
      return byState !== 0 ? byState : right.createdAt.localeCompare(left.createdAt);
    });

  const editable = isCycleEditable(cycle);

  async function revert(item: BillingCycleLineItem) {
    setRevertingId(item.id);
    try {
      await clearLineItem({ billingCycleId: cycle.id, lineItemId: item.id, version: cycle.version }).unwrap();
      toast.success(`${ACTION_LABEL[item.type] ?? "Action"} reverted.`);
    } catch (caught) {
      revertErrors.failFromServer(
        errorMessage(caught) || "Could not revert this action. The bill may no longer be editable.",
      );
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <>
      <SheetShell onClose={onClose} title="Action history">
        <Text style={[type.modalDescription, { color: colors.muted }]}>
          Everything added to {cycle.referenceCode} by hand. Reverting sets the line to zero and
          recalculates the bill.
        </Text>

        <View style={{ gap: spacing.sm }}>
          {actions.map((item) => {
            const reverted = isReverted(item);
            return (
              <View
                key={item.id}
                style={{
                  borderColor: colors.border,
                  borderRadius: 14,
                  borderWidth: 1,
                  gap: spacing.sm,
                  opacity: reverted ? 0.6 : 1,
                  padding: spacing.md,
                }}
              >
                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    {/* Kind first, then the name the person gave it. What was
                        removed was the FORM's generic "Owner discount" label
                        sitting between them, which repeated the kind and said
                        nothing about this particular one. */}
                    <Text style={[type.eyebrow, { color: colors.kicker }]}>
                      {ACTION_LABEL[item.type] ?? humanizeToken(item.type)}
                    </Text>
                    <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                      {actionName(item)}
                    </Text>
                    {/* Who, then when. The actor matters more than the clock on a
                        property with a manager, and it is the one thing the row
                        could not previously answer. */}
                    <Text style={[type.caption, { color: colors.kicker }]}>
                      {item.createdByName ? `${item.createdByName} · ` : ""}
                      {formatDateTime(item.createdAt)}
                    </Text>
                    {/* Borderless and inline, under the line that says who did
                        it — the thing being undone is fully described by the
                        time you reach it. Not an ActionButton: every variant
                        fills or tints its background, and a filled block inside
                        an already-bordered row reads as a second card rather
                        than a control. The blue is carried by glyph and label.
                        */}
                    {!reverted && !readOnly && editable ? (
                      <AnimatedPressable
                        accessibilityLabel={`Revert ${actionName(item)}`}
                        accessibilityRole="button"
                        disabled={revertingId === item.id}
                        hitSlop={8}
                        onPress={() => setPending(item)}
                        style={{
                          alignItems: "center",
                          alignSelf: "flex-start",
                          flexDirection: "row",
                          gap: spacing.xs,
                          paddingVertical: 2,
                        }}
                      >
                        <Undo2
                          color={revertingId === item.id ? colors.muted : colors.primary}
                          size={15}
                          strokeWidth={2.3}
                        />
                        <Text
                          style={{
                            color: revertingId === item.id ? colors.muted : colors.primary,
                            fontFamily: fonts.sansBold,
                            fontSize: 13,
                          }}
                        >
                          {revertingId === item.id ? "Reverting…" : "Revert"}
                        </Text>
                      </AnimatedPressable>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text
                      style={{
                        color: item.type === "DISCOUNT" ? colors.jade : colors.ink,
                        fontFamily: fonts.sansBold,
                        fontSize: 15,
                        textDecorationLine: reverted ? "line-through" : "none",
                      }}
                    >
                      {item.type === "DISCOUNT" ? "−" : ""}
                      {formatMoney(reverted ? item.settlementAmountPaise || item.amountPaise : item.amountPaise)}
                    </Text>
                    {reverted ? (
                      <View style={{ backgroundColor: colors.neutralSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                        <Text style={{ color: colors.neutralText, fontFamily: fonts.sansBold, fontSize: 11 }}>
                          Reverted
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

              </View>
            );
          })}
        </View>

        {/* Says why the buttons are missing rather than leaving a list of rows
            that look like they should be actionable. */}
        {!editable ? (
          <Text style={[type.modalDescription, { color: colors.muted }]}>
            This bill is no longer editable, so its actions cannot be reverted.
          </Text>
        ) : null}
      </SheetShell>

      {pending ? (
        <ConfirmDialog
          confirmLabel="Revert"
          message={`Revert "${pending.label}"? The line is set to zero and ${cycle.referenceCode} is recalculated.`}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const target = pending;
            setPending(null);
            void revert(target);
          }}
          title="Revert this action?"
        />
      ) : null}

      {revertErrors.serverError ? (
        <AlertModal message={revertErrors.serverError} onClose={revertErrors.dismissServerError} />
      ) : null}
    </>
  );
}

function CycleWindowModal({
  cycle,
  fallbackLateFeePerDayPaise,
  onClose,
}: {
  cycle: BillingCycle;
  fallbackLateFeePerDayPaise?: number | null;
  onClose: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  // Null while UPCOMING — and the API omits nulls, so this can be undefined.
  const stampedRate = cycle.lateFeePerDayPaise;
  const rate = stampedRate != null ? stampedRate : fallbackLateFeePerDayPaise;
  const rateIsProvisional = stampedRate == null;

  return (
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Closes by its × or the device back button, not a tap on the scrim
          (user, 2026-09-29). */}
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <HelpModalClose onClose={onClose} />
        <View
          style={{
            alignSelf: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: DIALOG_MAX_WIDTH,
            maxHeight: "72%",
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <HelpModalHeader />

          {/* The tenant's rows, icon, label and value (user, 2026-09-29). The
              words below stay the owner's own. */}
          <View style={{ borderTopColor: colors.border, borderTopWidth: 1 }}>
            <PaymentWindowLine
              icon={CalendarRange}
              label="Cycle period"
              value={`${formatDate(cycle.periodStartDate)} – ${formatDate(cycle.periodEndDate)}`}
            />
            <PaymentWindowLine
              icon={CalendarCheck2}
              label="Billing window"
              value={`${formatDate(cycle.periodStartDate)} – ${formatDate(cycle.rentDueDate)}`}
            />
            <PaymentWindowLine
              icon={Clock3}
              label="Grace days"
              last
              value={cycle.rentGraceDays === 0 ? "None" : `${cycle.rentGraceDays} day${cycle.rentGraceDays === 1 ? "" : "s"}`}
            />
          </View>

          {/* A precaution about what paying late costs — which is what NoticeBar
              is for. A sunken grey block read as one more section of the sheet,
              and the one paragraph here that changes a decision got skimmed with
              the rest. */}
          <NoticeBar
            message={
              rate != null && rate > 0
                ? `${formatMoney(rate)} per day, charged from the day after ${formatDate(cycle.rentDueDate)}.${
                    rateIsProvisional
                      ? " The rate is locked in when this cycle goes live, so a change made before then still applies to it."
                      : " This rate was locked in when the cycle went live — changing it now applies from the next cycle, not this one."
                  }`
                : `No late fee is set for this property, so paying after ${formatDate(cycle.rentDueDate)} costs nothing extra. You can set a daily rate in property billing settings.`
            }
            title="IF PAID LATE?"
            tone="warning"
          />

          {/* Says where the fee came FROM, because that used to be a different
              answer. Late fees were once carried onto the next upcoming cycle,
              which meant a tenant who went overdue early in a month saw nothing
              for weeks and then met the whole run as one lump on a later bill.
              They now accrue on the overdue bill itself — see
              docs/modules/billing.md. The old wording outlived the old
              behaviour and was telling owners the fee came from somewhere it
              no longer comes from. */}
          {cycle.lateFeeAmountPaise > 0 ? (
            <Text style={[type.modalDescription, { color: colors.muted }]}>
              This bill has already accrued {formatMoney(cycle.lateFeeAmountPaise)} of late fee. It sits on
              this bill as a line item and is recalculated each night it stays overdue.
            </Text>
          ) : null}
        </View>
      </View>
    </CenterModal>
  );
}

// An UPCOMING bill keeps the "Mark paid" wording, greyed — the action is real,
// it just isn't open yet. Only a settled bill states its outcome instead.
function markPaidLabel(cycle: BillingCycle): string {
  if (cycle.status === "PAID") {
    return "Paid";
  }
  if (cycle.status === "CANCELLED") {
    return "Cancelled";
  }
  return "Mark paid";
}

// Whether the backend will accept a discount or extra charge on this bill.
// Mirrors BillingCycleLineItemService.ensureCycleStillEditable: a rent cycle
// freezes the moment its payment window opens, so only UPCOMING can be changed;
// one-off bills stay editable until they are settled.
// A rent cycle is editable during the ten days it sits UPCOMING. The FIRST
// cycle of a tenancy never gets that window — it is created and activated in
// the same transaction at onboarding — so it stays editable until it is paid,
// which is the only reason a new tenant's bill could not be discounted at all.
//
// Later cycles keep the lock: once live, a new charge belongs on a one-off bill.
/** Whether the signed-in account owns this property (not manages it). */
function useOwnsProperty(propertyId: string): boolean {
  const accountId = useAppSelector((state) => state.auth.user?.id);
  const property = useListMyPropertiesQuery().data?.find((item) => item.id === propertyId);
  return Boolean(accountId && property && property.ownerId === accountId);
}

/**
 * Something a person did to a bill after it was issued: a discount, or a charge
 * added to it. Never the bill's own lines, which reverting would zero out.
 */
function isOwnerAction(item: BillingCycleLineItem): boolean {
  return !item.systemGenerated && !item.issuedWithBill;
}

function isCycleEditable(cycle: BillingCycle): boolean {
  if (cycle.status === "PAID" || cycle.status === "CANCELLED") {
    return false;
  }
  return cycle.category === "ONE_OFF" || cycle.status === "UPCOMING" || cycle.cycleNumber === 1;
}

// Circular overflow control pinned to the action row's height, so its diameter
// always equals the Mark-paid button's height instead of drifting past it.
function OverflowDotsButton({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderRadius: 999,
        borderWidth: 1,
        height: BILL_ACTION_ROW_HEIGHT,
        justifyContent: "center",
        width: BILL_ACTION_ROW_HEIGHT,
      }}
    >
      <MoreHorizontal color={colors.ink} size={18} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}


async function downloadTextFile(fileName: string, content: string, mimeType: string) {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  await Linking.openURL(dataUrl);
}



function reportMonthOptions() {
  const options: { label: string; value: string }[] = [];
  const cursor = new Date();
  cursor.setDate(1);

  for (let index = 0; index < 12; index += 1) {
    const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    options.push({ label: monthLabel(value), value });
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return options;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map((part) => Number(part));
  if (!year || !month) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

function billingCycleStatusDisplay(cycle: BillingCycle): { label: string; tone: "danger" | "muted" | "primary" | "success" | "warning" } {
  if (cycle.status === "PAID" && paymentHistoryStatus(cycle) === "OVERDUE") {
    return { label: "Late Pay", tone: "warning" };
  }

  if (cycle.status === "PAID") {
    return { label: "Paid", tone: "success" };
  }

  if (cycle.status === "OVERDUE") {
    return { label: "Overdue", tone: "danger" };
  }

  if (cycle.status === "CANCELLED") {
    return { label: "Cancelled", tone: "muted" };
  }
  // Its own label rather than a humanized enum name. "Confirmation Pending"
  // reads as a system state; the owner needs to know a person is waiting on
  // them, and the tenant needs to know the bill is not theirs to act on.
  if (cycle.status === "CONFIRMATION_PENDING") {
    return { label: "Awaiting", tone: "warning" };
  }

  return { label: humanizeToken(cycle.status), tone: "primary" };
}

function paymentHistoryStatus(cycle: BillingCycle): PaymentHistoryStatus {
  if (cycle.status === "UNPAID") {
    return "UNPAID";
  }

  if (cycle.status === "OVERDUE") {
    return "OVERDUE";
  }

  if (cycle.paidAt && dateOnlyKey(cycle.paidAt) > dateOnlyKey(cycle.rentDueDate)) {
    return "OVERDUE";
  }

  return "ON_TIME";
}

function comparePaymentHistoryCycles(left: BillingCycle, right: BillingCycle) {
  const leftDate = left.paidAt ?? left.rentDueDate;
  const rightDate = right.paidAt ?? right.rentDueDate;
  const dateDifference = new Date(rightDate).getTime() - new Date(leftDate).getTime();
  if (dateDifference !== 0) {
    return dateDifference;
  }

  return (right.cycleNumber ?? 0) - (left.cycleNumber ?? 0);
}

function dateOnlyKey(value: string) {
  return value.slice(0, 10);
}
import { BillingCyclesIcon, OverdueBillIcon, OtherBillsIcon, PaidBillIcon, UnpaidBillIcon, DiscountBillIcon, PaymentHistoryIcon, TenantBillsIcon, MonthlyReportIcon, PaymentSetupIcon } from "@/components/billing-vector-icons";
import { CircleHelp } from "lucide-react-native";
import { HelpModalClose, HelpModalHeader } from "@/components/help-modal-header";
