import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Easing, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarClock,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileDown,
  ImagePlus,
  IndianRupee,
  MoreHorizontal,
  Percent,
  Plus,
  ReceiptText,
  Search,
  TimerReset,
  X,
} from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { StatusPill as Pill } from "@/components/status-pill";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { Section } from "@/components/section";
import { useAppSelector } from "@/store/hooks";
import {
  type BillingCycle,
  type BillingCycleLineItem,
  type BillingMonthSummary,
  type ManualPaymentMethod,
  useAddTenancyDiscountMutation,
  useAddTenancyExtraChargesMutation,
  useGetPropertyMonthSummaryQuery,
  useLazyExportPropertyBillingCyclesQuery,
  useListPropertyBillingCyclesQuery,
  useListUpcomingPropertyCyclesQuery,
  useRecordManualPaymentMutation,
} from "@/store/services/billing-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ActionMode = "menu" | "manual-payment" | "discount" | "extra-charge";
type CycleView = "cycles" | "history";
type PaymentHistoryStatus = "ON_TIME" | "OVERDUE" | "UNPAID";
type ReportActionMode = "actions" | "month-picker";
type SummaryFilter = "all" | "overdue" | "paid" | "unpaid" | "outstanding" | "collectable" | "discount" | "manual";

const CYCLE_LIST_MAX_HEIGHT = 440;
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
    case "overdue":
      return cycles.filter((cycle) => cycle.status === "OVERDUE");
    case "paid":
    case "manual":
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

function summaryFilterTitle(filter: SummaryFilter): string {
  switch (filter) {
    case "overdue":
      return "Overdue cycles";
    case "paid":
      return "Paid cycles";
    case "manual":
      return "Manually paid cycles";
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

const manualPaymentMethods: ManualPaymentMethod[] = ["CASH", "UPI", "CARD", "CHEQUE", "OTHER"];

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
  const setStatusMessage = (value: string | null) => {
    if (value) {
      toast.show(value, /could not|cannot|unable|failed|not finalized|not available|no report/i.test(value) ? "error" : "success");
    }
  };
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter | null>(null);
  const [receiptCycle, setReceiptCycle] = useState<BillingCycle | null>(null);
  const [page, setPage] = useState(0);
  const summaryMonth = selectedMonth;
  // Search only applies to the Billing cycles tab; Payment history always shows
  // every cycle for the month.
  const cycleSearchQuery = cycleView === "cycles" ? searchQuery : "";

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
  const visibleQuery = cycleSearchQuery;
  // For the current month, cycles are generated lazily on each tenancy's due
  // date, so the summary can project more cycles than have actually been created.
  // The gap is how many are still pending generation, used to explain an empty or
  // short cycle list instead of a misleading "no cycles" message.
  const monthSummary = monthSummaryQuery.data;
  const notGeneratedCount =
    monthSummary && summaryMonth === currentMonth()
      ? Math.max(
          0,
          monthSummary.activeCycleCount
            - (monthSummary.paidCycleCount + monthSummary.unpaidCycleCount + monthSummary.overdueCount),
        )
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
      <ScreenHeader onBack={() => router.back()}
        eyebrow="Owner billing"
        title="Billing"
        italicTail="control."
        subtitle={selectedProperty ? `Billing workspace for ${selectedProperty.name}.` : "Select a property on Home first."}
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={Banknote}
          eyebrow="Property required"
          title="Select a property"
          description="Billing is scoped to the active owner property selected on Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <MonthDropdown
            active={summaryMonth}
            label="Billing month"
            onChange={handleSummaryMonthChange}
          />

          <ActiveSummarySection
            loading={monthSummaryQuery.isFetching}
            month={summaryMonth}
            onOpenFilter={setSummaryFilter}
            summary={monthSummaryQuery.data}
          />

          <SegmentedControl
            active={cycleView}
            onChange={changeCycleView}
            options={[
              { label: "Billing cycles", value: "cycles" },
              { label: "Payment history", value: "history" },
            ]}
          />

          {cycleView === "cycles" ? (
            <CycleSearchCard
              onClear={clearSearch}
              onSearch={runSearch}
              placeholder="Search tenant, bill ID or tenancy reference"
              value={searchDraft}
              onChange={setSearchDraft}
            />
          ) : null}

          {cycleView === "cycles" ? (
            <>
              <BillingCyclesSection
                cycles={visibleCycles}
                month={summaryMonth}
                notGeneratedCount={notGeneratedCount}
                onAction={(cycle) => openAction(cycle, "menu")}
                onDownloadReceipt={downloadCycleReceipt}
                onPageChange={setPage}
                onViewReceipt={setReceiptCycle}
                page={page}
                query={visibleQuery}
              />
              <UpcomingCyclesLink
                month={summaryMonth}
                onPress={() => router.push({ params: { month: summaryMonth }, pathname: "/owner-upcoming-cycles" })}
                propertyId={selectedProperty.id}
              />
            </>
          ) : (
            <PaymentHistorySection cycles={visibleCycles} month={summaryMonth} onPageChange={setPage} page={page} query={visibleQuery} />
          )}

          {cycleView === "cycles" ? (
            <ReportDownloadCard
              busy={exportState.isFetching}
              month={reportMonth}
              onOpenActions={() => setReportActionMode("actions")}
              onOpenMonthPicker={() => setReportActionMode("month-picker")}
            />
          ) : null}

        </>
      ) : null}

      {selectedCycle && actionMode ? (
        <BillingActionModal cycle={selectedCycle} mode={actionMode} onClose={closeAction} onSelectMode={setActionMode} />
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
    </ScreenScrollView>
  );
}

function ActiveSummarySection({
  loading,
  month,
  onOpenFilter,
  summary,
}: {
  loading: boolean;
  month: string;
  onOpenFilter: (filter: SummaryFilter) => void;
  summary?: BillingMonthSummary;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      {!summary && loading ? (
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          Loading summary...
        </Text>
      ) : null}

      {summary && !summary.hasData ? (
        <EmptyState
          icon={ReceiptText}
          eyebrow={monthLabel(month)}
          title="No data available"
          description="No billing cycles started in this month."
        />
      ) : null}

      {summary && summary.hasData ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile label="Cycles" value={String(summary.activeCycleCount)} hint="Tap to view all" onPress={() => onOpenFilter("all")} />
            <SummaryTile label="Overdue" value={String(summary.overdueCount)} hint={formatMoney(summary.overduePaise)} tone="danger" onPress={() => onOpenFilter("overdue")} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile label="Paid" value={String(summary.paidCycleCount)} hint="Incl. manual" tone="success" onPress={() => onOpenFilter("paid")} />
            <SummaryTile label="Unpaid" value={String(summary.unpaidCycleCount)} hint="Awaiting payment" onPress={() => onOpenFilter("unpaid")} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile
              label="Collectable rent"
              value={`${formatMoney(summary.collectedPaise)}/${formatMoney(summary.billedPaise)}`}
              hint="Collected / billed"
              tone="success"
              onPress={() => onOpenFilter("collectable")}
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile label="Discount given" value={formatMoney(summary.totalDiscountPaise)} hint="This month" onPress={() => onOpenFilter("discount")} />
            <SummaryTile label="Manually paid" value={formatMoney(summary.manuallyPaidPaise)} hint={`${summary.manuallyPaidCycleCount} cycle(s)`} onPress={() => onOpenFilter("manual")} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MonthDropdown({ active, label, onChange }: { active: string; label: string; onChange: (value: string) => void }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => reportMonthOptions(), []);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
        {label}
      </Text>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          flexDirection: "row",
          justifyContent: "space-between",
          minHeight: 46,
          paddingHorizontal: spacing.md,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <CalendarDays color={colors.kicker} size={18} strokeWidth={2.2} />
          <Text style={[type.body, { color: colors.ink, fontWeight: "800" }]} selectable>
            {monthLabel(active)}
          </Text>
        </View>
        <ChevronDown color={colors.kicker} size={18} strokeWidth={2.2} />
      </AnimatedPressable>

      {open ? (
        <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible>
          <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
            <View
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 22,
                borderWidth: 1,
                gap: spacing.sm,
                padding: spacing.lg,
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} selectable>
                  Choose month
                </Text>
                <IconButton accessibilityLabel="Close month picker" icon={X} onPress={() => setOpen(false)} />
              </View>
              {options.map((option) => (
                <ChoiceButton
                  active={option.value === active}
                  key={option.value}
                  label={option.label}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                />
              ))}
            </View>
          </View>
        </Modal>
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
    <Section eyebrow={monthLabel(month)} title="Payment history">
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <HistorySummaryMetric label="Paid" tone="success" value={String(paidCount)} />
          <HistorySummaryMetric label="Late" tone="warning" value={String(lateCount)} />
          <HistorySummaryMetric label="Unpaid" tone="primary" value={String(unpaidCount)} />
        </View>

        {orderedCycles.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            eyebrow="No history"
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
    <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]} selectable>
      {count} more cycle{count === 1 ? "" : "s"} will be generated on {count === 1 ? "its" : "their"} due date
      {count === 1 ? "" : "s"} this month.
    </Text>
  );
}

function BillingCyclesSection({
  cycles,
  month,
  notGeneratedCount,
  onAction,
  onDownloadReceipt,
  onPageChange,
  onViewReceipt,
  page,
  query,
}: {
  cycles: BillingCycle[];
  month: string;
  notGeneratedCount: number;
  onAction: (cycle: BillingCycle) => void;
  onDownloadReceipt: (cycle: BillingCycle) => void;
  onPageChange: (page: number) => void;
  onViewReceipt: (cycle: BillingCycle) => void;
  page: number;
  query: string;
}) {
  const paged = paginateArray(cycles, page, CYCLE_PAGE_SIZE);

  return (
    <Section eyebrow={monthLabel(month)} title={`${cycles.length} billing cycle${cycles.length === 1 ? "" : "s"}`}>
      {cycles.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          eyebrow={!query && notGeneratedCount > 0 ? "Pending generation" : "No cycles"}
          title={!query && notGeneratedCount > 0 ? "Cycles not generated yet" : "No billing cycles found"}
          description={
            query
              ? "No cycle matched that tenant name or tenancy ID for this billing month."
              : notGeneratedCount > 0
                ? `${notGeneratedCount} cycle${notGeneratedCount === 1 ? "" : "s"} ${notGeneratedCount === 1 ? "has" : "have"} not been generated yet — each is created automatically on its tenancy's due date this month.`
                : "No billing cycles started in this month."
          }
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <CycleListFrame>
            <CycleCardList cycles={paged.pageItems} onAction={onAction} onDownloadReceipt={onDownloadReceipt} onViewReceipt={onViewReceipt} />
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

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.primarySoft,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: 14,
              borderWidth: 1,
              height: 46,
              justifyContent: "center",
              width: 46,
            }}
          >
            <ReceiptText color={colors.primary} size={21} strokeWidth={2.3} />
          </View>

          <View style={{ flex: 1, gap: spacing.xxs }}>
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  {cycle.referenceCode}
                </Text>
                <Text
                  style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: "600", lineHeight: 25 }}
                  numberOfLines={1}
                  selectable
                >
                  {tenantName}
                </Text>
              </View>
              <PaymentStatusBadge cycle={cycle} />
            </View>
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              Cycle #{cycle.cycleNumber} · {cycle.tenancyReferenceCode ?? shortId(cycle.tenancyId)}
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
      <Text style={[type.caption, { color: tone, fontWeight: "900" }]} selectable>
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
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: 2,
        padding: spacing.sm,
      }}
    >
      <Text style={[type.caption, { color: colors.muted }]} selectable>
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
        selectable
      >
        {value}
      </Text>
    </View>
  );
}
function CycleListFrame({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderRadius: 18,
        borderWidth: 1,
        maxHeight: CYCLE_LIST_MAX_HEIGHT,
        overflow: "hidden",
      }}
    >
      <ScrollView
        contentContainerStyle={{ gap: spacing.sm, padding: spacing.md }}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {children}
      </ScrollView>
    </View>
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
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: 2,
        padding: spacing.sm,
      }}
    >
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={{ color, fontFamily: fonts.display, fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: "700" }} selectable>
        {value}
      </Text>
    </View>
  );
}

function ReportDownloadCard({
  busy,
  month,
  onOpenActions,
  onOpenMonthPicker,
}: {
  busy: boolean;
  month: string;
  onOpenActions: () => void;
  onOpenMonthPicker: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          Monthly report
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton icon={CalendarDays} label={monthLabel(month)} onPress={onOpenMonthPicker} variant="secondary" />
          <ActionButton disabled={busy} icon={MoreHorizontal} label={busy ? "Loading" : "Actions" } onPress={onOpenActions} />
        </View>
      </View>
    </Card>
  );
}

// Lightweight highlighted CTA that replaces the old upcoming-cycles card: a
// pill of bold accent text with a gently nudging arrow to pull the eye, sitting
// directly under the billing cycles list. Once every tenancy is billed for the
// month there is nothing upcoming — the arrow animation stops and it turns into
// a quiet "No upcoming cycles this month" status.
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
      <Text style={{ color: tint, fontFamily: fonts.sans, fontSize: 14, fontWeight: hasUpcoming ? "900" : "700", letterSpacing: 0.3 }} selectable>
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
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Monthly report
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "600" }} selectable>
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
                  <Text style={[type.caption, { color: colors.muted }]} selectable>
                    Selected month
                  </Text>
                  <Text style={[type.body, { color: colors.ink, fontWeight: "900" }]} selectable>
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

function CycleTable({
  cycles,
  expandedCycleId,
  onAction,
  onDownloadReceipt,
  onViewReceipt,
  onToggleLineItems,
  readOnly = false,
}: {
  cycles: BillingCycle[];
  expandedCycleId: string | null;
  onAction?: (cycle: BillingCycle) => void;
  onDownloadReceipt?: (cycle: BillingCycle) => void;
  onViewReceipt?: (cycle: BillingCycle) => void;
  onToggleLineItems: (cycle: BillingCycle) => void;
  readOnly?: boolean;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.xs }}>
          <Text style={[type.caption, { color: colors.muted, flex: 1.2, fontWeight: "800" }]}>Cycle</Text>
          <Text style={[type.caption, { color: colors.muted, flex: 0.9, fontWeight: "800" }]}>Status</Text>
          <Text style={[type.caption, { color: colors.muted, flex: 1, fontWeight: "800" }]}>Due</Text>
          <Text style={[type.caption, { color: colors.muted, flex: 1, fontWeight: "800", textAlign: "right" }]}>Total</Text>
        </View>
        {cycles.map((cycle) => (
          <View
            key={cycle.id}
            style={{
              borderColor: colors.border,
              borderTopWidth: 1,
              gap: spacing.sm,
              paddingTop: spacing.sm,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1.2 }}>
                <Text style={[type.body, { color: colors.ink, fontWeight: "800" }]} selectable>
                  {cycle.referenceCode}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]} selectable>
                  {cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}`}
                </Text>
                <Text style={[type.caption, { color: colors.kicker }]} selectable>
                  #{cycle.cycleNumber} · Tenancy {shortId(cycle.tenancyId)}
                </Text>
              </View>
              <StatusText cycle={cycle} />
              <Text style={[type.caption, { color: colors.ink, flex: 1 }]} selectable>
                {formatDate(cycle.rentDueDate)}
              </Text>
              <Text style={[type.body, { color: colors.primary, flex: 1, fontWeight: "900", textAlign: "right" }]} selectable>
                {formatMoney(cycle.totalAmountPaise)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              <ActionButton
                icon={expandedCycleId === cycle.id ? ChevronUp : ChevronDown}
                label="Line items"
                onPress={() => onToggleLineItems(cycle)}
                variant="secondary"
              />
              {!readOnly && onAction ? (
                <ActionButton icon={MoreHorizontal} label="Actions" onPress={() => onAction(cycle)} variant="secondary" />
              ) : null}
              {!readOnly && onViewReceipt ? (
                <ActionButton icon={Eye} label="View receipt" onPress={() => onViewReceipt(cycle)} variant="secondary" />
              ) : null}
              {!readOnly && onDownloadReceipt ? (
                <ActionButton icon={FileDown} label="Download" onPress={() => onDownloadReceipt(cycle)} variant="secondary" />
              ) : null}
            </View>
            {expandedCycleId === cycle.id ? <LineItemTable items={cycle.lineItems} /> : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

function CycleCardList({
  cycles,
  onAction,
  onDownloadReceipt,
  onViewReceipt,
  readOnly = false,
}: {
  cycles: BillingCycle[];
  onAction?: (cycle: BillingCycle) => void;
  onDownloadReceipt?: (cycle: BillingCycle) => void;
  onViewReceipt?: (cycle: BillingCycle) => void;
  readOnly?: boolean;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {cycles.map((cycle) => (
        <BillingCycleCard
          cycle={cycle}
          key={cycle.id}
          onAction={onAction}
          onDownloadReceipt={onDownloadReceipt}
          onViewReceipt={onViewReceipt}
          readOnly={readOnly}
        />
      ))}
    </View>
  );
}

function BillingCycleCard({
  cycle,
  onAction,
  onDownloadReceipt,
  onViewReceipt,
  readOnly,
}: {
  cycle: BillingCycle;
  onAction?: (cycle: BillingCycle) => void;
  onDownloadReceipt?: (cycle: BillingCycle) => void;
  onViewReceipt?: (cycle: BillingCycle) => void;
  readOnly: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const mutable = cycle.status === "UNPAID" || cycle.status === "OVERDUE";
  const tenantName = cycle.tenantNameSnapshot || `Tenant ${shortId(cycle.tenantUserId)}`;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: mutable ? colors.primarySoft : colors.surfaceSunken,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            height: 44,
            justifyContent: "center",
            width: 44,
          }}
        >
          <ReceiptText color={mutable ? colors.primary : colors.kicker} size={20} strokeWidth={2.2} />
        </View>

        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                {cycle.referenceCode}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: "600", lineHeight: 25 }} selectable>
                {tenantName}
              </Text>
            </View>
            <StatusPill cycle={cycle} />
          </View>

          <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginTop: spacing.xxs }}>
            <View style={{ gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Total payable
              </Text>
              <Text
                style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "600", letterSpacing: -0.3 }}
                numberOfLines={1}
                selectable
              >
                {formatMoney(cycle.totalAmountPaise)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Due date
              </Text>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                <CalendarDays color={cycle.status === "OVERDUE" ? colors.danger : colors.muted} size={14} strokeWidth={2.3} />
                <Text
                  style={{
                    color: cycle.status === "OVERDUE" ? colors.danger : colors.inkSoft,
                    fontFamily: fonts.sans,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                  selectable
                >
                  {formatDate(cycle.rentDueDate)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[type.caption, { color: colors.kicker }]} selectable>
            Cycle #{cycle.cycleNumber} · {formatDate(cycle.periodStartDate)} – {formatDate(cycle.periodEndDate)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {!readOnly && onAction ? (
          <ActionButton icon={MoreHorizontal} label="Actions" onPress={() => onAction(cycle)} variant="secondary" />
        ) : null}
        {onViewReceipt ? (
          <ActionButton icon={Eye} label="View receipt" onPress={() => onViewReceipt(cycle)} variant="secondary" />
        ) : null}
        {!readOnly && onDownloadReceipt ? (
          <ActionButton icon={FileDown} label="Download" onPress={() => onDownloadReceipt(cycle)} variant="secondary" />
        ) : null}
      </View>

      {readOnly && !onViewReceipt ? (
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          Open the billing screen to manage receipts and cycle actions.
        </Text>
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
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
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
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                {cycles.length} cycle{cycles.length === 1 ? "" : "s"}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} selectable>
                {title}
              </Text>
            </View>
            <IconButton accessibilityLabel="Close cycle list" icon={X} onPress={onClose} />
          </View>

          {cycles.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              eyebrow={notGeneratedCount > 0 ? "Pending generation" : "No cycles"}
              title={notGeneratedCount > 0 ? "Cycles not generated yet" : "No matching cycles"}
              description={
                notGeneratedCount > 0
                  ? `${notGeneratedCount} cycle${notGeneratedCount === 1 ? "" : "s"} ${notGeneratedCount === 1 ? "has" : "have"} not been generated yet — each is created automatically on its tenancy's due date this month.`
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
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        No line items available.
      </Text>
    );
  }

  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.sm }}>
      {items.map((item) => (
        <View key={item.id} style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.caption, { color: colors.ink, fontWeight: "800" }]} selectable>
              {item.label}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              {humanizeToken(item.type)} · {humanizeToken(item.settlementAction)}
            </Text>
          </View>
          <Text style={[type.caption, { color: colors.ink, fontWeight: "900" }]} selectable>
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
    <Text style={[type.caption, { color: tone, flex: 0.9, fontWeight: "900" }]} selectable>
      {statusDisplay.label}
    </Text>
  );
}

function BillingActionModal({
  cycle,
  mode,
  onClose,
  onSelectMode,
}: {
  cycle: BillingCycle;
  mode: ActionMode;
  onClose: () => void;
  onSelectMode: (mode: ActionMode) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [method, setMethod] = useState<ManualPaymentMethod>("CASH");
  const [referenceText, setReferenceText] = useState("");
  const [proofImageUrl, setProofImageUrl] = useState("");
  const [note, setNote] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [chargeLabel, setChargeLabel] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAdjustFromDeposit, setChargeAdjustFromDeposit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; title: string } | null>(null);
  const [recordManualPayment, manualPaymentState] = useRecordManualPaymentMutation();
  const [addDiscount, discountState] = useAddTenancyDiscountMutation();
  const [addExtraCharges, extraChargeState] = useAddTenancyExtraChargesMutation();
  const busy = manualPaymentState.isLoading || discountState.isLoading || extraChargeState.isLoading;
  const mutable = cycle.status === "UNPAID" || cycle.status === "OVERDUE";

  const title = useMemo(() => {
    if (mode === "menu") {
      return "Cycle actions";
    }
    if (mode === "manual-payment") {
      return "Mark manually paid";
    }
    if (mode === "discount") {
      return "Add discount";
    }
    return "Add extra charge";
  }, [mode]);

  // Validates the active form, then shows a final confirmation dialog before
  // performing the action.
  function handleSave() {
    if (busy) {
      return;
    }
    setError(null);

    if (mode === "manual-payment") {
      setConfirm({
        message: `Mark ${cycle.referenceCode} as paid for ${formatMoney(cycle.totalAmountPaise)} via ${humanizeToken(method)}?`,
        title: "Mark manually paid?",
      });
      return;
    }

    if (mode === "discount") {
      const percent = Number(discountPercent);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        setError("Enter a discount percentage between 0 and 100.");
        return;
      }
      setConfirm({
        message: `Apply a ${percent}% discount to ${cycle.referenceCode}?`,
        title: "Apply discount?",
      });
      return;
    }

    if (mode === "extra-charge") {
      const amountPaise = Math.round(Number(chargeAmount) * 100);
      if (!chargeLabel.trim()) {
        setError("Enter a charge label.");
        return;
      }
      if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
        setError("Enter a valid charge amount.");
        return;
      }
      setConfirm({
        message: chargeAdjustFromDeposit
          ? `Add a ${formatMoney(amountPaise)} charge "${chargeLabel.trim()}" to ${cycle.referenceCode} and adjust it from the deposit?`
          : `Add a ${formatMoney(amountPaise)} charge "${chargeLabel.trim()}" to ${cycle.referenceCode} and bill it to the tenant?`,
        title: "Add extra charge?",
      });
    }
  }

  async function submit() {
    setError(null);
    try {
      if (mode === "manual-payment") {
        await recordManualPayment({
          billingCycleId: cycle.id,
          payload: {
            method,
            note: note.trim() || null,
            proofImageUrl: proofImageUrl.trim() || null,
            referenceText: referenceText.trim() || null,
          },
        }).unwrap();
      } else if (mode === "discount") {
        const percent = Number(discountPercent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
          setError("Enter a discount percentage between 0 and 100.");
          return;
        }
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
        if (!chargeLabel.trim()) {
          setError("Enter a charge label.");
          return;
        }
        if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
          setError("Enter a valid charge amount.");
          return;
        }
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
    } catch {
      setError("Action failed. Refresh and try again.");
    }
  }

  return (
    <>
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "90%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: spacing.sm }}>
              {mode !== "menu" ? (
                <IconButton
                  accessibilityLabel="Back to actions"
                  icon={ArrowLeft}
                  onPress={() => {
                    setError(null);
                    onSelectMode("menu");
                  }}
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  {cycle.referenceCode}
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "600" }} selectable>
                  {title}
                </Text>
              </View>
            </View>
            <IconButton accessibilityLabel="Close billing action" icon={X} onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
          {mode === "menu" ? (
            <View style={{ gap: spacing.sm }}>
              <ActionButton disabled={!mutable} icon={Banknote} label="Mark manually paid" onPress={() => onSelectMode("manual-payment")} />
              <ActionButton disabled={!mutable} icon={Percent} label="Add discount" onPress={() => onSelectMode("discount")} variant="secondary" />
              <ActionButton disabled={!mutable} icon={Plus} label="Add extra charge" onPress={() => onSelectMode("extra-charge")} variant="secondary" />
              {!mutable ? (
                <Text style={[type.caption, { color: colors.muted }]} selectable>
                  Paid or cancelled cycles cannot be edited.
                </Text>
              ) : null}
            </View>
          ) : null}

          {mode === "manual-payment" ? (
            <>
              <Text style={[type.caption, { color: colors.muted }]} selectable>
                This marks the full cycle amount {formatMoney(cycle.totalAmountPaise)} as manually collected.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                {manualPaymentMethods.map((item) => (
                  <ChoiceButton active={item === method} key={item} label={humanizeToken(item)} onPress={() => setMethod(item)} />
                ))}
              </View>
              <FormInput label="Reference" onChangeText={setReferenceText} placeholder="UPI ref, cheque no, cash note" value={referenceText} />
              <ProofImageField onChange={setProofImageUrl} uri={proofImageUrl} />
              <FormInput label="Note" onChangeText={setNote} placeholder="Optional note" value={note} />
            </>
          ) : null}

          {mode === "discount" ? (
            <>
              <FormInput
                keyboardType="decimal-pad"
                label="Discount percentage"
                onChangeText={setDiscountPercent}
                placeholder="Example: 10"
                value={discountPercent}
              />
              <DiscountPreview percent={discountPercent} totalPaise={cycle.totalAmountPaise} />
              <FormInput label="Reason" onChangeText={setNote} placeholder="Optional reason" value={note} />
            </>
          ) : null}

          {mode === "extra-charge" ? (
            <>
              <FormInput label="Charge label" onChangeText={setChargeLabel} placeholder="Damage, cleaning, extra usage" value={chargeLabel} />
              <FormInput keyboardType="decimal-pad" label="Amount" onChangeText={setChargeAmount} placeholder="Amount in rupees" value={chargeAmount} />
              <FormInput label="Description" onChangeText={setChargeDescription} placeholder="Optional description" value={chargeDescription} />
              <View style={{ gap: spacing.xs }}>
                <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
                  Settlement
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  <ChoiceButton active={!chargeAdjustFromDeposit} label="Add to bill" onPress={() => setChargeAdjustFromDeposit(false)} />
                  <ChoiceButton active={chargeAdjustFromDeposit} label="Adjust from deposit" onPress={() => setChargeAdjustFromDeposit(true)} />
                </View>
              </View>
            </>
          ) : null}

          {error ? (
            <Text style={[type.caption, { color: colors.danger }]} selectable>
              {error}
            </Text>
          ) : null}
          </ScrollView>

          {mode !== "menu" ? <ActionButton disabled={busy} icon={IndianRupee} label={busy ? "Saving" : "Save"} onPress={handleSave} /> : null}
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
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 420,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: "600" }} selectable>
            {title}
          </Text>
          <Text style={[type.body, { color: colors.muted }]} selectable>
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
              <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 14, fontWeight: "800" }} selectable>
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
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 14, fontWeight: "800" }} selectable>
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
    <Text style={[type.caption, { color: valid ? colors.primary : colors.danger }]} selectable>
      {valid
        ? `Amounts to ${formatMoney(discountPaise)} off · new total ${formatMoney(netPaise)}`
        : "Enter a percentage between 0 and 100."}
    </Text>
  );
}

function ProofImageField({ onChange, uri }: { onChange: (value: string) => void; uri: string }) {
  const { colors, type } = useTheme();
  const [error, setError] = useState<string | null>(null);

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access to attach a proof image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      onChange(result.assets[0].uri);
      setError(null);
    }
  }

  async function capturePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Allow camera access to capture a proof image.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      onChange(result.assets[0].uri);
      setError(null);
    }
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
        Payment proof (optional)
      </Text>

      {uri ? (
        <View
          style={{
            alignItems: "center",
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            padding: spacing.sm,
          }}
        >
          <Image source={{ uri }} style={{ borderRadius: 8, height: 48, width: 48 }} resizeMode="cover" />
          <Text style={[type.caption, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
            Image attached
          </Text>
          <IconButton accessibilityLabel="Remove proof image" icon={X} onPress={() => onChange("")} />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ActionButton icon={ImagePlus} label={uri ? "Replace" : "Choose image"} onPress={pickFromLibrary} variant="secondary" />
        <ActionButton icon={Camera} label="Camera" onPress={capturePhoto} variant="secondary" />
      </View>

      {error ? (
        <Text style={[type.caption, { color: colors.danger }]} selectable>
          {error}
        </Text>
      ) : null}
    </View>
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
  const { colors, fonts } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 16, flexDirection: "row", padding: 4 }}>
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <AnimatedPressable
            accessibilityRole="button"
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              alignItems: "center",
              backgroundColor: selected ? colors.surface : "transparent",
              borderColor: selected ? colors.border : "transparent",
              borderRadius: 13,
              borderWidth: 1,
              flex: 1,
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text
              style={{
                color: selected ? colors.ink : colors.muted,
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: selected ? "900" : "700",
                textAlign: "center",
              }}
              selectable
            >
              {option.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function SummaryTile({
  hint,
  label,
  onPress,
  tone = "default",
  value,
}: {
  hint: string;
  label: string;
  onPress?: () => void;
  tone?: "danger" | "default" | "success";
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const accent = tone === "danger" ? colors.danger : tone === "success" ? colors.successText : colors.primary;
  const style = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  } as const;
  const content = (
    <>
      <Text style={[type.caption, { color: colors.muted }]} selectable={!onPress}>
        {label}
      </Text>
      <Text style={{ color: accent, fontFamily: fonts.display, fontSize: 20, fontWeight: "700" }} selectable={!onPress}>
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.kicker }]} selectable={!onPress}>
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

function FormInput({
  keyboardType,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: "decimal-pad";
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
        {label}
      </Text>
      <AppTextInput
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{ borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.ink, minHeight: 46, paddingHorizontal: spacing.md }}
        value={value}
      />
    </View>
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
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sans, fontWeight: "800" }} selectable>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function ActionButton({
  disabled,
  icon: Icon,
  label,
  onPress,
  variant = "primary",
}: {
  disabled?: boolean;
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
        flexDirection: "row",
        gap: spacing.xs,
        justifyContent: "center",
        opacity: disabled ? 0.65 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Icon color={foreground} size={16} strokeWidth={2.2} />
      <Text style={{ color: foreground, fontFamily: fonts.sans, fontSize: 13, fontWeight: "800" }} selectable>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function IconButton({ accessibilityLabel, icon: Icon, onPress }: { accessibilityLabel: string; icon: typeof X; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable accessibilityLabel={accessibilityLabel} onPress={onPress} style={{ alignItems: "center", borderRadius: 18, height: 36, justifyContent: "center", width: 36 }}>
      <Icon color={colors.ink} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      onPress={onPress}
      style={{ alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: spacing.xs, height: 36, paddingHorizontal: spacing.sm, width: 86 }}
    >
      <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700" }} selectable>
        Back
      </Text>
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
    { label: "Cycle number", value: `#${cycle.cycleNumber}` },
    { label: "Period", value: `${formatDate(cycle.periodStartDate)} – ${formatDate(cycle.periodEndDate)}` },
    { label: "Due date", value: formatDate(cycle.rentDueDate) },
    { label: "Paid at", value: cycle.paidAt ? formatDate(cycle.paidAt) : "—" },
  ];
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
  const lineItems = cycle.lineItems.length
    ? cycle.lineItems
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
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
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
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Receipt{propertyName ? ` · ${propertyName}` : ""}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} selectable>
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
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  Charges
                </Text>
                {receiptAmounts(cycle).map((row) => (
                  <ReceiptLine key={row.label} label={row.label} value={row.value} />
                ))}
                <View style={{ borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.xs, paddingTop: spacing.sm }}>
                  <ReceiptLine label="Total payable" strong value={formatMoney(cycle.totalAmountPaise)} />
                </View>
              </View>

              {cycle.lineItems.length ? (
                <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
                  <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                    Line items
                  </Text>
                  {cycle.lineItems.map((item) => (
                    <ReceiptLine key={item.id} label={`${item.label} · ${humanizeToken(item.type)}`} value={formatMoney(item.amountPaise)} />
                  ))}
                </View>
              ) : null}
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

function ReceiptLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: strong ? colors.ink : colors.muted, flex: 1, fontWeight: strong ? "800" : "400" }]} selectable>
        {label}
      </Text>
      <Text style={[type.caption, { color: strong ? colors.primary : colors.ink, fontWeight: strong ? "900" : "700", textAlign: "right" }]} selectable>
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
    return { label: "Late payment", tone: "warning" };
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

  return right.cycleNumber - left.cycleNumber;
}

function dateOnlyKey(value: string) {
  return value.slice(0, 10);
}
