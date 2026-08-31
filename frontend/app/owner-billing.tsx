import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Animated, Easing, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, ArrowLeft, ArrowRight, Banknote, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Download, Eye, FileDown, History, IndianRupee, Info, type LucideProps, MoreHorizontal, Percent, Plus, ReceiptText, Repeat, Search, TimerReset, Undo2, Users, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { StatusPill as Pill } from "@/components/status-pill";
import { MonthSelector } from "@/components/month-selector";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { AlertModal } from "@/components/alert-modal";
import { classifyToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { NoticeBar, RequiredMark } from "@/features/owner/owner-ui";
import { SheetShell } from "@/components/sheet-shell";
import { BillTotal } from "@/features/owner/bill-views";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { FieldError } from "@/components/field-error";
import { SingleOptionPicker } from "@/components/option-picker";
import { TabSwitcher } from "@/components/tab-switcher";
import { useToast } from "@/components/toast";
import { MultiImageField } from "@/features/uploads/multi-image-field";
import { SingleImageField } from "@/features/uploads/single-image-field";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { BackButton, FormInput, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { Section } from "@/components/section";
import { useAppSelector } from "@/store/hooks";
import {
  useClearBillingLineItemMutation,
  type BillingCycle,
  type BillingCycleLineItem,
  type BillingMonthSummary,
  type ManualPaymentMethod,
  billTitle,
  useAddTenancyDiscountMutation,
  useAddTenancyExtraChargesMutation,
  useGetPropertyMonthSummaryQuery,
  useLazyExportPropertyBillingCyclesQuery,
  useListPropertyBillingCyclesQuery,
  useListUpcomingPropertyCyclesQuery,
  useListManualPaymentsQuery,
  useRecordManualPaymentMutation,
} from "@/store/services/billing-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ActionMode = "menu" | "manual-payment" | "discount" | "extra-charge";
type CycleView = "cycles" | "other";
type PaymentHistoryStatus = "ON_TIME" | "OVERDUE" | "UNPAID";
type ReportActionMode = "actions" | "month-picker";
type SummaryFilter = "all" | "cycles" | "other" | "overdue" | "paid" | "unpaid" | "outstanding" | "collectable" | "discount";

// Both controls in a bill card's action row are locked to this, so the circle
// can never render larger than the button beside it.
const BILL_ACTION_ROW_HEIGHT = 48;
const CYCLE_PAGE_SIZE = 8;

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
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = selectedPropertyId
    ? properties.find((property) => property.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;

  const [cycleView, setCycleView] = useState<CycleView>("cycles");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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
  const [page, setPage] = useState(0);
  const summaryMonth = selectedMonth;
  // Search applies to both bill lists (rent cycles and other bills).
  const cycleSearchQuery = searchQuery;

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
  const [exportMonthlyReport, exportState] = useLazyExportPropertyBillingCyclesQuery();

  const visibleCycles = cyclesQuery.data ?? [];
  // Rent cycles vs one-off bills (penalties, ad-hoc charges) shown as separate
  // segmented lists. The summary filter modal still spans all categories.
  const rentCycles = visibleCycles.filter((cycle) => cycle.category === "RENT_CYCLE");
  const oneOffCycles = visibleCycles.filter((cycle) => cycle.category === "ONE_OFF");
  const listedCycles = cycleView === "cycles" ? rentCycles : oneOffCycles;
  const visibleQuery = cycleSearchQuery;
  // For the current month, cycles are generated lazily on each tenancy's due
  // date, so the summary can project more cycles than have actually been created.
  // The gap is how many are still pending generation, used to explain an empty or
  // short cycle list instead of a misleading "no cycles" message.
  const monthSummary = monthSummaryQuery.data;
  // Cycles that exist already — including UPCOMING ones, which are generated
  // ahead of their due date. Counting only paid/unpaid/overdue told the owner a
  // cycle was still pending when it was already sitting in the list above.
  // Suppressed while searching: the list is filtered then, so the projection
  // (which is property-wide) has nothing to subtract against.
  const createdRentCycleCount = rentCycles.filter((cycle) => cycle.status !== "CANCELLED").length;
  const notGeneratedCount =
    monthSummary && summaryMonth === currentMonth() && !cycleSearchQuery
      ? Math.max(0, monthSummary.activeCycleCount - createdRentCycleCount)
      : 0;

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
      const html = buildReceiptHtml(cycle, selectedProperty?.name ?? null);

      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        setStatusMessage(`Receipt ready to print or save for ${cycle.referenceCode}.`);
        return;
      }

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: "com.adobe.pdf",
          dialogTitle: `Receipt ${cycle.referenceCode}`,
          mimeType: "application/pdf",
        });
      }
      setStatusMessage(`Receipt PDF prepared for ${cycle.referenceCode}.`);
    } catch {
      setStatusMessage("Could not generate the receipt PDF. Please try again.");
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

  function runSearch() {
    setSearchQuery(searchDraft);
    setPage(0);
  }

  function clearSearch() {
    setSearchDraft("");
    setSearchQuery("");
    setPage(0);
  }
  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />
      <ScreenHeader
        badge={!canManageBilling ? <ViewOnlyChip /> : null}
        title="Billing"
        italicTail="control."
        subtitle={selectedProperty ? `Billing workspace for ${selectedProperty.name}.` : "Select a property on Home first."}
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={Banknote}

          title="Select a property"
          description="Billing is scoped to the active owner property selected on Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <MonthSelector onChange={handleSummaryMonthChange} value={summaryMonth} />

          <ActiveSummarySection
            loading={monthSummaryQuery.isFetching}
            month={summaryMonth}
            onOpenFilter={setSummaryFilter}
            oneOffCount={oneOffCycles.length}
            rentCycleCount={rentCycles.length}
            summary={monthSummaryQuery.data}
          />

          <BillToolsGrid
            reportBusy={exportState.isFetching}
            onOpenPaymentHistory={() => router.push({ params: { month: summaryMonth }, pathname: "/owner-payment-history" })}
            onOpenReport={() => setReportActionMode("actions")}
            onOpenTenantBills={() => router.push("/owner-tenant-bills")}
          />

          <SegmentedControl
            active={cycleView}
            onChange={changeCycleView}
            options={[
              { label: "Billing cycles", value: "cycles" },
              { label: "Other bills", value: "other" },
            ]}
          />

          <CycleSearchCard
            onClear={clearSearch}
            onSearch={runSearch}
            placeholder="Search tenant name, phone or tenancy reference"
            value={searchDraft}
            onChange={setSearchDraft}
          />

          <BillingCyclesSection
            cycles={listedCycles}
            fallbackLateFeePerDayPaise={selectedProperty.rentLateFeePerDayPaise}
            month={summaryMonth}
            noun={cycleView === "cycles" ? "billing cycle" : "other bill"}
            notGeneratedCount={cycleView === "cycles" ? notGeneratedCount : 0}
            canManage={canManageBilling}
            onAction={openAction}
            onPageChange={setPage}
            page={page}
            query={visibleQuery}
          />

          {cycleView === "cycles" ? (
            <UpcomingCyclesLink
              month={summaryMonth}
              onPress={() => router.push({ params: { month: summaryMonth }, pathname: "/owner-upcoming-cycles" })}
              propertyId={selectedProperty.id}
            />
          ) : null}
        </>
      ) : null}

      {selectedCycle && actionMode ? (
        <BillingActionModal
          canManage={canManageBilling}
          cycle={selectedCycle}
          mode={actionMode}
          onClose={closeAction}
          onDownloadReceipt={downloadCycleReceipt}
          onSelectMode={setActionMode}
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
      {summaryFilter ? (
        <SummaryCyclesModal
          cycles={filterSummaryCycles(visibleCycles, summaryFilter)}
          notGeneratedCount={notGeneratedCount}
          onClose={() => setSummaryFilter(null)}
          title={summaryFilterTitle(summaryFilter)}
        />
      ) : null}
      {receiptCycle ? (
        <ReceiptModal
          cycle={receiptCycle}
          onClose={() => setReceiptCycle(null)}
          onDownload={() => downloadCycleReceipt(receiptCycle)}
          propertyName={selectedProperty?.name ?? null}
        />
      ) : null}
      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

function ActiveSummarySection({
  loading,
  month,
  onOpenFilter,
  oneOffCount,
  rentCycleCount,
  summary,
}: {
  loading: boolean;
  month: string;
  onOpenFilter: (filter: SummaryFilter) => void;
  // Counted from the same rows the drill-down lists, not from the summary. The
  // summary's counts run through countsAsBilled(), which drops UPCOMING so that
  // money totals stay honest — correct for rupees, wrong for "how many bills",
  // and it showed 0 while two cycles sat in the list below.
  oneOffCount: number;
  rentCycleCount: number;
  summary?: BillingMonthSummary;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      {!summary && loading ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          Loading summary...
        </Text>
      ) : null}

      {summary && !summary.hasData ? (
        <EmptyState
          icon={ReceiptText}

          title="No data available"
          description="No billing cycles started in this month."
        />
      ) : null}

      {summary && summary.hasData ? (
        <View style={{ gap: spacing.sm }}>
          {/* Collected against billed is the number the month is judged on, so
              it leads at full width. Everything below is a breakdown of it. */}
          <SummaryTile
            label="Collectable amount"
            large
            leadValue={formatMoney(summary.collectedPaise)}
            value={`/${formatMoney(summary.billedPaise)}`}
            hint="Collected / billed"
            onPress={() => onOpenFilter("collectable")}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile label="Billing cycles" value={String(rentCycleCount)} hint="Rent cycles" onPress={() => onOpenFilter("cycles")} />
            <SummaryTile label="Overdue" value={String(summary.overdueCount)} hint={formatMoney(summary.overduePaise)} onPress={() => onOpenFilter("overdue")} />
            <SummaryTile label="Other bills" value={String(oneOffCount)} hint="Bills raised" onPress={() => onOpenFilter("other")} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile label="Paid" value={String(summary.paidCycleCount)} hint="Cycles settled" onPress={() => onOpenFilter("paid")} />
            <SummaryTile label="Unpaid" value={String(summary.unpaidCycleCount)} hint="Awaiting payment" onPress={() => onOpenFilter("unpaid")} />
            <SummaryTile label="Discount given" value={formatMoney(summary.totalDiscountPaise)} hint="This month" onPress={() => onOpenFilter("discount")} />
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
            icon={ReceiptText}

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
    <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
      {count} more cycle{count === 1 ? "" : "s"} will appear here shortly before {count === 1 ? "its" : "their"} due
      date{count === 1 ? "" : "s"} this month.
    </Text>
  );
}

function BillingCyclesSection({
  cycles,
  fallbackLateFeePerDayPaise,
  month,
  noun = "billing cycle",
  canManage,
  notGeneratedCount,
  onAction,
  onPageChange,
  page,
  query,
}: {
  cycles: BillingCycle[];
  fallbackLateFeePerDayPaise?: number | null;
  month: string;
  noun?: string;
  notGeneratedCount: number;
  // False for a view-only manager: mutating controls are greyed and disabled
  // rather than removed, so the manager can see the action exists and is simply
  // not theirs.
  canManage: boolean;
  onAction?: (cycle: BillingCycle, mode: ActionMode) => void;
  onPageChange: (page: number) => void;
  page: number;
  query: string;
}) {
  const { colors } = useTheme();
  const paged = paginateArray(cycles, page, CYCLE_PAGE_SIZE);
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <Section

      title={`${cycles.length} ${noun}${cycles.length === 1 ? "" : "s"}`}
      trailing={
        <AnimatedPressable
          accessibilityLabel="How billing cycles work"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => setRulesOpen(true)}
          style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
          tapLockMs={0}
        >
          <Info color={colors.kicker} size={17} strokeWidth={2.4} />
        </AnimatedPressable>
      }
    >
      {rulesOpen ? <BillingRulesModal onClose={() => setRulesOpen(false)} /> : null}
      {cycles.length === 0 ? (
        <EmptyState
          icon={ReceiptText}

          title={!query && notGeneratedCount > 0 ? "Cycles not generated yet" : "No billing cycles found"}
          description={
            query
              ? "No cycle matched that tenant name or tenancy ID for this billing month."
              : notGeneratedCount > 0
                ? `${notGeneratedCount} cycle${notGeneratedCount === 1 ? "" : "s"} ${notGeneratedCount === 1 ? "has" : "have"} not been generated yet — each appears automatically a few days before its due date, so you can adjust it before it goes live.`
                : "No billing cycles started in this month."
          }
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <CycleListFrame>
            <CycleCardList
              canManage={canManage}
              cycles={paged.pageItems}
              fallbackLateFeePerDayPaise={fallbackLateFeePerDayPaise}
              onAction={onAction}
            />
          </CycleListFrame>
          {notGeneratedCount > 0 ? <PendingGenerationNote count={notGeneratedCount} /> : null}
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
        </View>
      )}
    </Section>
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

// Square tiles, three to a row, matching the pinned-module grid on Home.
function BillToolsGrid({
  onOpenPaymentHistory,
  onOpenReport,
  onOpenTenantBills,
  reportBusy,
}: {
  onOpenPaymentHistory: () => void;
  onOpenReport: () => void;
  onOpenTenantBills: () => void;
  reportBusy: boolean;
}) {
  const tools: { icon: ComponentType<LucideProps>; key: string; label: string; onPress: () => void }[] = [
    { icon: History, key: "history", label: "Payment history", onPress: onOpenPaymentHistory },
    { icon: Users, key: "tenant-bills", label: "Tenant bills", onPress: onOpenTenantBills },
    { icon: FileDown, key: "report", label: reportBusy ? "Preparing…" : "Monthly report", onPress: onOpenReport },
  ];

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {tools.map((tool) => (
        <BillToolTile icon={tool.icon} key={tool.key} label={tool.label} onPress={tool.onPress} />
      ))}
    </View>
  );
}

// Matches HomeToolBox (home Quick access) and TenancyToolBox: a large bare icon
// IS the tile's visual, not a small glyph inside a soft box. Billing previously
// copied the pinned-modules grid instead, so these three read differently from
// every other tool row in the app.
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
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 112,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.md,
      }}
    >
      <Icon color={colors.primary} size={48} strokeWidth={1.8} />
      <Text
        style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 15, textAlign: "center" }}
        numberOfLines={2}
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
  const { data } = useListUpcomingPropertyCyclesQuery({ month, page: 0, propertyId, size: 1 }, { skip: !propertyId });
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

  return (
    <AnimatedPressable
      accessibilityLabel={hasUpcoming ? "View upcoming cycles" : "All cycles generated"}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        alignSelf: "center",
        backgroundColor: hasUpcoming ? colors.primarySoft : colors.surfaceSunken,
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

  async function handleDownload() {
    await onDownload();
    onClose();
  }

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
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
            <IconButton accessibilityLabel="Close monthly report" icon={X} onPress={onClose} />
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
              <ActionButton disabled={busy} icon={Download} label={busy ? "Preparing" : "Download CSV"} onPress={handleDownload} />
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
      </View>
    </Modal>
  );
}

function CycleSearchCard({
  onChange,
  onClear,
  onSearch,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  onClear: () => void;
  onSearch: () => void;
  placeholder: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
          }}
        >
          <Search color={colors.kicker} size={18} strokeWidth={2.2} />
          <AppTextInput
            autoCapitalize="none"
            onChangeText={onChange}
            onSubmitEditing={onSearch}
            placeholder={placeholder}
            placeholderTextColor={colors.kicker}
            returnKeyType="search"
            style={{ color: colors.ink, flex: 1, fontSize: 15, minHeight: 46 }}
            value={value}
          />
          {value ? <IconButton accessibilityLabel="Clear billing search" icon={X} onPress={onClear} /> : null}
        </View>
        <ActionButton icon={Search} label="Search" onPress={onSearch} />
      </View>
    </Card>
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
  // Owner actions only. System lines are the bill itself — rent, deposit — and
  // listing them as "history" would bury the two or three things a person
  // actually did among rows nobody performed.
  const ownerActions = (cycle.lineItems ?? []).filter((item) => !item.systemGenerated);
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
            <Info color={colors.kicker} size={16} strokeWidth={2.4} />
          </AnimatedPressable>
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
          {/* The pill shares a row with the short reference code only; the
              tenant name gets the full card width beneath, wrapping cleanly at
              word boundaries (surname to the next line) — never clipped. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>
              {cycle.referenceCode}
            </Text>
            <StatusPill cycle={cycle} />
          </View>
          {/* Due date rides with the tenant name, not with the total. Once a
              bill carries a discount the total line grows a struck-through
              price and a percentage chip, and sharing a row with the date
              pushed the date off the card entirely. */}
          {/* Top-aligned: the date block is two lines tall, and aligning to its
              END dragged the tenant name down to meet its baseline. */}
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text
              numberOfLines={2}
              style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 21, lineHeight: 25 }}
            >
              {tenantName}
            </Text>
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Due date
              </Text>
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

          <BillTotal cycle={cycle} />

          <Text style={[type.caption, { color: colors.kicker }]}>
            {billTitle(cycle)} · {formatDate(cycle.periodStartDate)} – {formatDate(cycle.periodEndDate)}
          </Text>
        </View>
      </View>

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
        <Text style={[type.caption, { color: colors.muted }]}>
          Open the billing screen to manage receipts and cycle actions.
        </Text>
      ) : null}

      {historyOpen ? (
        <BillHistorySheet cycle={cycle} onClose={() => setHistoryOpen(false)} readOnly={readOnly || !canManage} />
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

function StatusPill({ cycle }: { cycle: BillingCycle }) {
  const statusDisplay = billingCycleStatusDisplay(cycle);
  const tone: "success" | "danger" | "warning" | "neutral" | "primary" =
    statusDisplay.tone === "success"
      ? "success"
      : statusDisplay.tone === "danger"
        ? "danger"
        : statusDisplay.tone === "warning"
          ? "warning"
          : statusDisplay.tone === "muted"
            ? "neutral"
            : "primary";
  return <Pill label={statusDisplay.label} tone={tone} />;
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
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
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
            <IconButton accessibilityLabel="Close cycle list" icon={X} onPress={onClose} />
          </View>

          {cycles.length === 0 ? (
            <EmptyState
              icon={ReceiptText}

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
      </View>
    </Modal>
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
  onDownloadReceipt,
  onSelectMode,
  onViewReceipt,
}: {
  canManage: boolean;
  cycle: BillingCycle;
  mode: ActionMode;
  onClose: () => void;
  onDownloadReceipt: (cycle: BillingCycle) => void;
  onSelectMode: (mode: ActionMode) => void;
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
  const [chargeLabel, setChargeLabel] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAdjustFromDeposit, setChargeAdjustFromDeposit] = useState(false);
  // Per field, under the field. The old single line at the foot of the sheet
  // said "Enter a charge label" below a form of four inputs and left the reader
  // to work out which one, and it scrolled out of sight on a short screen.
  const form = useFormErrors<"amount" | "label" | "percent" | "method" | "proof">();
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
  const [addDiscount, discountState] = useAddTenancyDiscountMutation();
  const [addExtraCharges, extraChargeState] = useAddTenancyExtraChargesMutation();
  const busy = manualPaymentState.isLoading || discountState.isLoading || extraChargeState.isLoading;
  const payable = cycle.status === "UNPAID" || cycle.status === "OVERDUE";
  const editable = isCycleEditable(cycle);

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
  function problems(): Partial<Record<"amount" | "label" | "percent" | "method" | "proof", string>> {
    if (mode === "discount") {
      const percent = Number(discountPercent);
      if (!discountPercent.trim()) {
        return { percent: "Enter a discount percentage." };
      }
      return Number.isFinite(percent) && percent > 0 && percent <= 100
        ? {}
        : { percent: "Enter a percentage between 0 and 100." };
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
      setConfirm({
        message: `Mark ${cycle.referenceCode} as paid for ${formatMoney(cycle.totalAmountPaise)} via ${chosenMethod?.label ?? ""}?`,
        title: "Mark this bill paid?",
      });
      return;
    }

    if (mode === "discount") {
      const percent = Number(discountPercent);
      setConfirm({
        message: `Apply a ${percent}% discount to ${cycle.referenceCode}?`,
        title: "Apply discount?",
      });
      return;
    }

    if (mode === "extra-charge") {
      const amountPaise = Math.round(Number(chargeAmount) * 100);
      setConfirm({
        message: chargeAdjustFromDeposit
          ? `Add a ${formatMoney(amountPaise)} charge "${chargeLabel.trim()}" to ${cycle.referenceCode} and adjust it from the deposit?`
          : `Add a ${formatMoney(amountPaise)} charge "${chargeLabel.trim()}" to ${cycle.referenceCode} and bill it to the tenant?`,
        title: "Add extra charge?",
      });
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
            ? `${discountPercent}% discount applied to ${cycle.referenceCode}.`
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
        }).unwrap();
      } else if (mode === "discount") {
        const percent = Number(discountPercent);
        await addDiscount({
          discount: {
            description: note.trim() || null,
            discountPercent: percent,
            label: "Owner discount",
          },
          tenancyId: cycle.tenancyId,
        }).unwrap();
      } else if (mode === "extra-charge") {
        const amountPaise = Math.round(Number(chargeAmount) * 100);
        await addExtraCharges({
          charges: [
            {
              adjustFromDeposit: chargeAdjustFromDeposit,
              amountPaise,
              description: chargeDescription.trim() || null,
              label: chargeLabel.trim(),
            },
          ],
          tenancyId: cycle.tenancyId,
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
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView
        // Android drives itself from the measured inset below; handing it
        // "padding" too would apply the lift twice — and leave it applied.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
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
                  accessibilityLabel="Back to actions"
                  icon={ArrowLeft}
                  onPress={() => {
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
                  {title}
                </Text>
              </View>
            </View>
            <IconButton accessibilityLabel="Close billing action" icon={X} onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
          {mode === "menu" ? (
            <View style={{ gap: spacing.sm }}>
              <ActionButton disabled={!editable || !canManage} icon={Percent} label="Add discount" onPress={() => onSelectMode("discount")} variant="secondary" />
              <ActionButton disabled={!editable || !canManage} icon={Plus} label="Add extra charge" onPress={() => onSelectMode("extra-charge")} variant="secondary" />
              {/* Receipt actions stay available on paid and cancelled bills —
                  those are exactly the ones an owner comes back to print. */}
              <ActionButton
                icon={Eye}
                label="View receipt"
                onPress={() => {
                  onClose();
                  onViewReceipt(cycle);
                }}
                variant="secondary"
              />
              <ActionButton
                icon={FileDown}
                label="Download receipt"
                onPress={() => {
                  onClose();
                  onDownloadReceipt(cycle);
                }}
                variant="secondary"
              />
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

          {mode === "manual-payment" ? (
            <>
              <Text style={[type.caption, { color: colors.muted }]}>
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
                options={manualPaymentMethods.map((item) => ({ label: item.label, value: item.value }))}
                required
                showIcon={false}
                title="Payment method"
                value={method}
              />

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
              <FormInput
                error={form.errors.percent}
                keyboardType="decimal-pad"
                label="Discount percentage"
                onChangeText={(next) => {
                  setDiscountPercent(next);
                  form.clearField("percent");
                }}
                placeholder="Example: 10"
                required
                value={discountPercent}
              />
              <DiscountPreview percent={discountPercent} totalPaise={cycle.totalAmountPaise} />
              <FormInput label="Reason" onChangeText={setNote} placeholder="Optional reason" value={note} />
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
              <FormInput label="Description" onChangeText={setChargeDescription} placeholder="Optional description" value={chargeDescription} />
              <View style={{ gap: spacing.xs }}>
                <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
                  Settlement
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  <ChoiceButton active={!chargeAdjustFromDeposit} label="Add to bill" onPress={() => setChargeAdjustFromDeposit(false)} />
                  <ChoiceButton active={chargeAdjustFromDeposit} label="Adjust from deposit" onPress={() => setChargeAdjustFromDeposit(true)} />
                </View>
              </View>
            </>
          ) : null}

          </ScrollView>

          {mode !== "menu" ? (
            <ActionButton
              disabled={busy || form.blocked}
              icon={IndianRupee}
              label={busy ? "Saving" : "Save"}
              onPress={handleSave}
            />
          ) : null}
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
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
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onCancel} statusBarTranslucent transparent visible>
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
          <Text style={[type.body, { color: colors.muted }]}>
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
    </Modal>
  );
}

function DiscountPreview({ percent, totalPaise }: { percent: string; totalPaise: number }) {
  const { colors, type } = useTheme();
  const parsed = Number(percent);

  if (!percent.trim() || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const valid = parsed <= 100;
  const discountPaise = Math.min(Math.round((totalPaise * parsed) / 100), totalPaise);
  const netPaise = totalPaise - discountPaise;

  return (
    <Text style={[type.caption, { color: valid ? colors.primary : colors.danger }]}>
      {valid
        ? `Amounts to ${formatMoney(discountPaise)} off · new total ${formatMoney(netPaise)}`
        : "Enter a percentage between 0 and 100."}
    </Text>
  );
}

function SegmentedControl({
  active,
  onChange,
  options,
}: {
  active: CycleView;
  onChange: (value: CycleView) => void;
  options: { label: string; value: CycleView }[];
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
const TILE_LABEL_LINE_HEIGHT = 14;
const TILE_HINT_LINE_HEIGHT = 17;

function SummaryTile({
  hint,
  label,
  large,
  leadValue,
  onPress,
  value,
}: {
  hint: string;
  label: string;
  /** Full width and a bigger figure — for the one number that leads the month. */
  large?: boolean;
  /** Shown muted before `value`. The collected half of "collected / billed":
   *  it is the part already banked, so the eye should land on what is still
   *  outstanding rather than on money that is no longer a task. */
  leadValue?: string;
  onPress?: () => void;
  value: string;
}) {
  const { colors, type } = useTheme();
  const style = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: large ? undefined : 1,
    gap: spacing.xs,
    padding: large ? spacing.lg : spacing.md,
  } as const;
  // Figures are ink. Colouring them by tone made every tile shout at once —
  // red, green and blue side by side reads as five warnings rather than a
  // breakdown. Meaning lives in the label, emphasis in the size.
  const fontSize = large ? 30 : 20;
  // Only the small tiles share a row and need to line up. The large one is full
  // width, never wraps, and would just gain dead space.
  const content = (
    <>
      <Text
        numberOfLines={large ? 1 : 2}
        style={[
          type.eyebrow,
          { color: colors.kicker, lineHeight: TILE_LABEL_LINE_HEIGHT },
          large ? null : { height: TILE_LABEL_LINE_HEIGHT * 2 },
        ]}
      >
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        numberOfLines={1}
        style={[type.metric, { color: colors.ink, fontSize, lineHeight: fontSize + 4 }]}
      >
        {leadValue ? <Text style={{ color: colors.muted }}>{leadValue}</Text> : null}
        {value}
      </Text>
      <Text
        numberOfLines={large ? 1 : 2}
        style={[
          type.caption,
          { color: colors.muted },
          large ? null : { height: TILE_HINT_LINE_HEIGHT * 2 },
        ]}
      >
        {hint}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable accessibilityRole="button" onPress={onPress} style={style}>
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={style}>{content}</View>;
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
  variant?: "primary" | "secondary";
}) {
  const { colors, fonts } = useTheme();
  const primary = variant === "primary";
  const foreground = disabled ? colors.muted : primary ? colors.onPrimary : colors.primary;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? colors.neutralSoft : primary ? colors.primary : colors.primarySoft,
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
function BillingRulesModal({ onClose }: { onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  const rules: { body: string; title: string }[] = [
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

  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
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
                Billing
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
                How cycles work
              </Text>
            </View>
            <IconButton accessibilityLabel="Close billing rules" icon={X} onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {rules.map((rule, index) => (
              <View
                key={rule.title}
                style={{ backgroundColor: colors.surfaceSunken, borderRadius: radii.card, gap: 4, padding: spacing.md }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                  <View
                    style={{
                      alignItems: "center",
                      borderColor: colors.ink,
                      borderWidth: 1,
                      borderRadius: 999,
                      height: 22,
                      justifyContent: "center",
                      width: 22,
                    }}
                  >
                    <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 11, }}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14, }}>
                    {rule.title}
                  </Text>
                </View>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  {rule.body}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Every info panel ends in an acknowledgement, not just a corner ×. */}
          <AnimatedPressable
            accessibilityRole="button"
            onPress={onClose}
            style={{
              alignItems: "center",
              backgroundColor: colors.ink,
              borderCurve: "continuous",
              borderRadius: 14,
              justifyContent: "center",
              marginTop: spacing.sm,
              minHeight: 46,
            }}
          >
            <Text style={{ color: colors.surface, fontFamily: fonts.sansBold, fontSize: 15 }}>Got it</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
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
    .filter((item) => !item.systemGenerated)
    .slice()
    .sort((left, right) => {
      const byState = Number(isReverted(left)) - Number(isReverted(right));
      return byState !== 0 ? byState : right.createdAt.localeCompare(left.createdAt);
    });

  const editable = isCycleEditable(cycle);

  async function revert(item: BillingCycleLineItem) {
    setRevertingId(item.id);
    try {
      await clearLineItem({ billingCycleId: cycle.id, lineItemId: item.id }).unwrap();
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
        <Text style={[type.caption, { color: colors.muted }]}>
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
          <Text style={[type.caption, { color: colors.muted }]}>
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
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <AnimatedPressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}
        tapLockMs={0}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.md,
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                {cycle.referenceCode}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, }}>
                Payment window
              </Text>
            </View>
            <IconButton accessibilityLabel="Close payment window" icon={X} onPress={onClose} />
          </View>

          <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
            <ReceiptLine label="Billing period" value={`${formatDate(cycle.periodStartDate)} – ${formatDate(cycle.periodEndDate)}`} />
            <ReceiptLine label="Pay between" strong value={`${formatDate(cycle.periodStartDate)} – ${formatDate(cycle.rentDueDate)}`} />
            <ReceiptLine
              label="Grace"
              value={cycle.rentGraceDays === 0 ? "None — due on the start date" : `${cycle.rentGraceDays} day${cycle.rentGraceDays === 1 ? "" : "s"} (already in the due date)`}
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
            title="If paid late"
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
            <Text style={[type.caption, { color: colors.muted }]}>
              This bill has already accrued {formatMoney(cycle.lateFeeAmountPaise)} of late fee. It sits on
              this bill as a line item and is recalculated each night it stays overdue.
            </Text>
          ) : null}
        </View>
      </AnimatedPressable>
    </Modal>
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function receiptRows(cycle: BillingCycle): { label: string; value: string }[] {
  return [
    { label: "Reference", value: cycle.referenceCode },
    { label: "Status", value: humanizeToken(cycle.status) },
    { label: "Tenant", value: cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}` },
    { label: "Tenancy", value: cycle.tenancyReferenceCode ?? "Tenancy reference unavailable" },
    { label: "Room", value: cycle.roomNumber ? `Room ${cycle.roomNumber}` : "Room unavailable" },
    { label: "Bill", value: billTitle(cycle) },
    { label: "Period", value: `${formatDate(cycle.periodStartDate)} – ${formatDate(cycle.periodEndDate)}` },
    { label: "Due date", value: formatDate(cycle.rentDueDate) },
    { label: "Paid at", value: cycle.paidAt ? formatDate(cycle.paidAt) : "—" },
  ];
}

/**
 * The lines a receipt should show.
 *
 * <p>Reverting a line does not delete it. `clear()` sets its amount to zero and
 * stamps it WAIVED, so the row survives as an audit trail of what was charged
 * and then taken back. A receipt is a statement of what is owed rather than that
 * trail, so a waived line has nothing to say on it — and printing "₹0.00" next
 * to a discount invites the reader to work out why it is there.
 *
 * <p><b>Zero amount is not the test.</b> A line settled from the deposit is also
 * worth zero on the bill and must still appear, because the money genuinely
 * moved — it came out of the deposit instead of the payable. Only WAIVED means
 * "this was undone", and only `clear()` ever sets it.
 */
function receiptLineItems(cycle: BillingCycle) {
  return cycle.lineItems.filter((item) => item.settlementAction !== "WAIVED");
}

function receiptAmounts(cycle: BillingCycle): { label: string; value: string }[] {
  return [
    { label: "Base rent", value: formatMoney(cycle.baseAmountPaise) },
    { label: "Extra charges", value: formatMoney(cycle.extraChargePaise) },
    { label: "Late fee", value: formatMoney(cycle.lateFeeAmountPaise) },
    { label: "Discount", value: `- ${formatMoney(cycle.discountAmountPaise)}` },
  ];
}

function buildReceiptHtml(cycle: BillingCycle, propertyName: string | null) {
  const detailRows = receiptRows(cycle)
    .map((row) => `<tr><td class="k">${escapeHtml(row.label)}</td><td class="v">${escapeHtml(row.value)}</td></tr>`)
    .join("");
  const amountRows = receiptAmounts(cycle)
    .map((row) => `<tr><td class="k">${escapeHtml(row.label)}</td><td class="v">${escapeHtml(row.value)}</td></tr>`)
    .join("");
  // Same filter as the on-screen receipt. The PDF is the copy that gets sent
  // to a tenant, so a reverted line slipping through here would be the version
  // that actually gets argued about.
  const printableLines = receiptLineItems(cycle);
  const lineItems = printableLines.length
    ? printableLines
        .map(
          (item) =>
            `<tr><td>${escapeHtml(item.label)}</td><td class="muted">${escapeHtml(humanizeToken(item.type))}</td><td class="v">${escapeHtml(formatMoney(item.amountPaise))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No line items.</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <style>
      * { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1c1c1e; }
      body { padding: 28px; }
      h1 { font-size: 22px; margin: 0 0 2px; }
      .eyebrow { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #8a8a8e; margin-bottom: 18px; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #8a8a8e; margin: 22px 0 6px; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #ececec; vertical-align: top; }
      td.k { color: #6b6b70; }
      td.v { text-align: right; font-weight: 700; }
      td.muted { color: #8a8a8e; }
      .total { margin-top: 14px; padding: 12px 14px; background: #f4f4f5; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
      .total .label { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #6b6b70; }
      .total .amount { font-size: 22px; font-weight: 800; }
      .footer { margin-top: 26px; font-size: 11px; color: #a0a0a5; }
    </style></head><body>
      <div class="eyebrow">Billing receipt${propertyName ? " · " + escapeHtml(propertyName) : ""}</div>
      <h1>${escapeHtml(cycle.referenceCode)}</h1>
      <h2>Cycle details</h2>
      <table>${detailRows}</table>
      <h2>Charges</h2>
      <table>${amountRows}</table>
      <h2>Line items</h2>
      <table>${lineItems}</table>
      <div class="total"><span class="label">Total payable</span><span class="amount">${escapeHtml(formatMoney(cycle.totalAmountPaise))}</span></div>
      <div class="footer">Generated ${escapeHtml(formatDate(new Date().toISOString()))} · Khatiyan</div>
    </body></html>`;
}

function ReceiptModal({
  cycle,
  onClose,
  onDownload,
  propertyName,
}: {
  cycle: BillingCycle;
  onClose: () => void;
  onDownload: () => void;
  propertyName: string | null;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "88%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Receipt{propertyName ? ` · ${propertyName}` : ""}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
                {cycle.referenceCode}
              </Text>
            </View>
            <IconButton accessibilityLabel="Close receipt" icon={X} onPress={onClose} />
          </View>

          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
            <View style={{ gap: spacing.md }}>
              <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
                {receiptRows(cycle).map((row) => (
                  <ReceiptLine key={row.label} label={row.label} value={row.value} />
                ))}
              </View>

              <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  Charges
                </Text>
                {receiptAmounts(cycle).map((row) => (
                  <ReceiptLine key={row.label} label={row.label} value={row.value} />
                ))}
                <View style={{ borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.xs, paddingTop: spacing.sm }}>
                  <ReceiptLine label="Total payable" strong value={formatMoney(cycle.totalAmountPaise)} />
                </View>
              </View>

              {receiptLineItems(cycle).length ? (
                <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
                  <Text style={[type.eyebrow, { color: colors.kicker }]}>
                    Line items
                  </Text>
                  {receiptLineItems(cycle).map((item) => (
                    <ReceiptLine key={item.id} label={`${item.label} · ${humanizeToken(item.type)}`} value={formatMoney(item.amountPaise)} />
                  ))}
                </View>
              ) : null}

              <ManualPaymentsSection billingCycleId={cycle.id} />
            </View>
          </ScrollView>

          <ActionButton
            icon={FileDown}
            label="Download PDF"
            onPress={() => {
              void onDownload();
              onClose();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// How the money actually arrived. Every payment in the app is collected by the
// owner off-platform and recorded here, so this is the whole payment record —
// method, reference and when it was logged.
function ManualPaymentsSection({ billingCycleId }: { billingCycleId: string }) {
  const { colors, type } = useTheme();
  const paymentsQuery = useListManualPaymentsQuery(billingCycleId);
  const payments = paymentsQuery.data ?? [];

  if (paymentsQuery.isLoading) {
    return null;
  }

  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        Payments recorded
      </Text>
      {payments.length === 0 ? (
        <Text style={[type.body, { color: colors.muted }]}>
          No payment recorded yet. Use &ldquo;Mark paid&rdquo; on the bill once the tenant has paid you.
        </Text>
      ) : (
        payments.map((payment) => (
          <View key={payment.id} style={{ gap: 2, paddingVertical: spacing.xs }}>
            <ReceiptLine label={`${humanizeToken(payment.method)} · ${formatDate(payment.collectedAt)}`} value={formatMoney(payment.amountPaise)} />
            {payment.referenceText ? <ReceiptLine label="Reference" value={payment.referenceText} /> : null}
            {payment.note ? <ReceiptLine label="Note" value={payment.note} /> : null}
          </View>
        ))
      )}
    </View>
  );
}

function ReceiptLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: strong ? colors.ink : colors.muted, flex: 1, fontWeight: strong ? "800" : "400" }]}>
        {label}
      </Text>
      <Text style={[type.caption, { color: strong ? colors.primary : colors.ink, fontWeight: strong ? "900" : "700", textAlign: "right" }]}>
        {value}
      </Text>
    </View>
  );
}

function currentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
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
