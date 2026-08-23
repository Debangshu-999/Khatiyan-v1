import { useState, type ReactNode } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, Linking, Platform, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Download, FileText, Plus, Receipt, TrendingUp, Undo2, Wallet } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MoneyText } from "@/components/money-text";
import { ProgressBar } from "@/components/progress-bar";
import { SheetShell } from "@/components/sheet-shell";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { AlertModal } from "@/components/alert-modal";
import { FieldError } from "@/components/field-error";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { SkeletonList, SkeletonScreen } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ActionButton, FormInput, formatMoneyPaise, rupeesToPaise } from "@/features/owner/owner-ui";
import { PnlTrendChart } from "@/features/owner/pnl-trend-chart";
import { MonthSelector } from "@/components/month-selector";
import { useAppSelector } from "@/store/hooks";
import {
  useCreateIncomeMutation,
  useGetPnlStatementQuery,
  useGetPnlTrendQuery,
  useLazyExportPnlReportQuery,
  useListIncomeQuery,
  useReverseIncomeMutation,
  type IncomeEntry,
  type PnlLine,
  type PnlStatement,
} from "@/store/services/pnl-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PAGE_SIZE = 20;

export default function OwnerPnlScreen() {
  const router = useGuardedRouter();
  const toast = useToast();
  // The report export fails outside any form — a modal is the only place for it.
  const reportErrors = useFormErrors<never>();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const [month, setMonth] = useState(firstOfMonth());
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState<"add-income" | "report" | null>(null);
  const [reverseTarget, setReverseTarget] = useState<IncomeEntry | null>(null);

  const skip = !propertyId;
  const statementQuery = useGetPnlStatementQuery({ propertyId, month }, { skip, refetchOnMountOrArgChange: true });
  const trendQuery = useGetPnlTrendQuery({ propertyId, month, months: 6 }, { skip });
  const incomeQuery = useListIncomeQuery({ propertyId, month, page, size: PAGE_SIZE }, { skip });

  const statement = statementQuery.data;
  const trend = trendQuery.data;
  const incomePage = incomeQuery.data;

  return (
    <>
      <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
        <ScreenHeader
          onBack={() => router.back()}
          eyebrow="Owner tool"
          title="Profit"
          italicTail="& loss."
          subtitle={property ? `Income, expenses and net for ${property.name}.` : "Select a property from Home to view P&L."}
        />

        {!property ? (
          <EmptyState
            icon={TrendingUp}
            title="No property selected"
            description="Choose an active property from Home before opening the P&L statement."
          />
        ) : (
          <>
            <MonthSelector onChange={(picked) => setMonth(`${picked}-01`)} value={month.slice(0, 7)} />

            {statementQuery.isLoading && !statement ? (
              <SkeletonScreen tiles={3} rows={0} />
            ) : statement ? (
              <>
                <NetHero statement={statement} />

                {trend && trend.points.length > 0 ? (
                  <Section title="Last 6 months">
                    <PnlTrendChart points={trend.points} />
                  </Section>
                ) : null}

                <Section title="P&L tools">
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <ToolBox icon={Plus} label="Add income" onPress={() => setSheet("add-income")} />
                    <ToolBox icon={FileText} label="Summary report" onPress={() => setSheet("report")} />
                    <ToolBox icon={Receipt} label="View bills" onPress={() => router.push("/owner-billing")} />
                  </View>
                </Section>

                <Breakdown
                  accent
                  emptyText="No income recorded for this month yet."
                  eyebrow="Breakdown"
                  lines={incomeLines(statement)}
                  title="Income"
                  totalLabel="Total income"
                  totalPaise={statement.totalIncomePaise}
                />

                <Breakdown
                  emptyText="No spending recorded for this month yet."
                  eyebrow="Breakdown"
                  lines={statement.expenseBreakdown}
                  title="Expenses"
                  totalLabel="Total expense"
                  totalPaise={statement.expensePaise}
                />

                <Section title="Manual income this month">
                  {incomeQuery.isFetching && !incomePage ? <SkeletonList rows={3} /> : null}

                  {incomePage && incomePage.items.length === 0 ? (
                    <EmptyState icon={Wallet} title="No manual income" description="Add ad-hoc income (parking, laundry, misc) that doesn't flow through billing." />
                  ) : null}

                  <View style={{ gap: spacing.sm }}>
                    {incomePage?.items.map((entry) => (
                      <IncomeRow entry={entry} key={entry.id} onReverse={() => setReverseTarget(entry)} />
                    ))}
                  </View>

                  {incomePage && incomePage.totalElements > 0 ? (
                    <PaginationBar
                      hasNext={incomePage.hasNext}
                      hasPrevious={incomePage.hasPrevious}
                      onNext={() => setPage((current) => current + 1)}
                      onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                      page={incomePage.page}
                      totalElements={incomePage.totalElements}
                      totalPages={incomePage.totalPages}
                    />
                  ) : null}
                </Section>
              </>
            ) : null}
          </>
        )}
      </ScreenScrollView>

      {reportErrors.serverError ? <AlertModal message={reportErrors.serverError} onClose={reportErrors.dismissServerError} /> : null}

      {sheet === "add-income" && property ? (
        <AddIncomeSheet month={month} onClose={() => setSheet(null)} propertyId={propertyId} />
      ) : null}
      {sheet === "report" && property && statement ? (
        <ReportSheet
          month={month}
          onClose={() => setSheet(null)}
          onDownloaded={() => toast.success("Report download started.")}
          onError={() => reportErrors.failFromServer("Could not generate the report.")}
          propertyId={propertyId}
          statement={statement}
        />
      ) : null}
      {reverseTarget && property ? (
        <ReverseIncomeSheet entry={reverseTarget} onClose={() => setReverseTarget(null)} propertyId={propertyId} />
      ) : null}
    </>
  );
}



function NetHero({ statement }: { statement: PnlStatement }) {
  const { colors, type } = useTheme();
  const profit = statement.netPaise >= 0;
  const accent = profit ? colors.jade : colors.danger;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            {profit ? "Net profit" : "Net loss"}
          </Text>
          <MoneyText animate color={accent} paise={Math.abs(statement.netPaise)} size={32} weight="700" />
          <Text style={[type.caption, { color: colors.muted }]}>
            {profit ? "What you kept after expenses this month" : "You spent more than you earned this month"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MiniStat color={colors.jade} label="Income" sub={incomeComposition(statement)} value={formatMoneyPaise(statement.totalIncomePaise)} />
          <MiniStat color={colors.danger} label="Expense" sub="This month" value={formatMoneyPaise(statement.expensePaise)} />
          <MiniStat color={accent} label="Net" sub={`Cash: ${signedMoney(statement.netRealizedPaise)}`} value={signedMoney(statement.netPaise)} />
        </View>

        <CollectionStatus uncollectedPaise={statement.billUncollectedPaise} />
      </View>
    </Card>
  );
}

function MiniStat({ color, label, sub, value }: { color: string; label: string; sub?: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, gap: 2, padding: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: 14, fontVariant: ["tabular-nums"], }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? (
        <Text style={[type.caption, { color: colors.kicker, fontSize: 10 }]} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function CollectionStatus({ uncollectedPaise }: { uncollectedPaise: number }) {
  const { colors, type } = useTheme();
  const pending = uncollectedPaise > 0;
  const dot = pending ? colors.warningText : colors.jade;
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 12, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
      <View style={{ backgroundColor: dot, borderRadius: 999, height: 8, width: 8 }} />
      <Text style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>
        {pending ? `Collection pending · ${formatMoneyPaise(uncollectedPaise)} yet to be collected` : "All bills collected"}
      </Text>
    </View>
  );
}

// "Rent + other bills + custom" — only the parts actually present this month.
function incomeComposition(s: PnlStatement) {
  const parts: string[] = [];
  if (s.billRentPaise > 0) parts.push("Rent");
  if (s.billOneOffPaise > 0) parts.push("other bills");
  if (s.manualIncomePaise > 0) parts.push("custom");
  return parts.length > 0 ? parts.join(" + ") : "No income yet";
}

// Income breakdown lines: rent bills + other bills (each with a count) + manual sources.
function incomeLines(s: PnlStatement): PnlLine[] {
  const lines: PnlLine[] = [];
  if (s.billRentCount > 0 || s.billRentPaise > 0) {
    lines.push({ amountPaise: s.billRentPaise, label: `Rent bills (${s.billRentCount})` });
  }
  if (s.billOneOffCount > 0) {
    lines.push({ amountPaise: s.billOneOffPaise, label: `Other bills (${s.billOneOffCount})` });
  }
  return [...lines, ...s.manualIncomeBreakdown];
}

function signedMoney(paise: number) {
  return `${paise < 0 ? "−" : ""}${formatMoneyPaise(Math.abs(paise))}`;
}

function Breakdown({
  accent = false,
  emptyText,
  eyebrow,
  footer,
  lines,
  title,
  totalLabel,
  totalPaise,
}: {
  accent?: boolean;
  emptyText: string;
  eyebrow: string;
  footer?: ReactNode;
  lines: PnlLine[];
  title: string;
  totalLabel: string;
  totalPaise: number;
}) {
  const { colors, fonts, type } = useTheme();
  const max = lines.reduce((peak, item) => Math.max(peak, Math.abs(item.amountPaise)), 0);

  return (
    <Section title={title}>
      <Card>
        {lines.length === 0 ? (
          <Text style={[type.body, { color: colors.muted }]}>
            {emptyText}
          </Text>
        ) : (
          <View style={{ gap: spacing.md }}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                {totalLabel}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontVariant: ["tabular-nums"], }}>
                {formatMoneyPaise(totalPaise)}
              </Text>
            </View>
            {lines.map((item) => (
              <View key={item.label} style={{ gap: spacing.xs }}>
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13, fontVariant: ["tabular-nums"], }}>
                    {formatMoneyPaise(item.amountPaise)}
                  </Text>
                </View>
                <ProgressBar color={accent ? colors.jade : colors.primary} height={8} ratio={max > 0 ? Math.max(0.04, Math.abs(item.amountPaise) / max) : 0} />
              </View>
            ))}
            {footer ? <View style={{ flexDirection: "row" }}>{footer}</View> : null}
          </View>
        )}
      </Card>
    </Section>
  );
}

function ToolBox({ icon: Icon, label, onPress }: { icon: typeof Plus; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, flex: 1, gap: spacing.xs, justifyContent: "center", minHeight: 96, paddingHorizontal: spacing.xs, paddingVertical: spacing.md }}
    >
      <Icon color={colors.primary} size={30} strokeWidth={2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, textAlign: "center" }} numberOfLines={2}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function IncomeRow({ entry, onReverse }: { entry: IncomeEntry; onReverse: () => void }) {
  const { colors, fonts, type } = useTheme();
  const negative = entry.amountPaise < 0;
  const canReverse = entry.entryType !== "REVERSAL" && !entry.reversed;

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: 14, borderWidth: 1, gap: spacing.sm, opacity: entry.reversed ? 0.6 : 1, padding: spacing.md }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
            {entry.source}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {entry.receivedFrom ? `${entry.receivedFrom} · ` : ""}{formatDate(entry.receivedDate)}
          </Text>
        </View>
        <MoneyText color={negative ? colors.danger : colors.jade} paise={entry.amountPaise} weight="700" />
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <IncomeBadge entryType={entry.entryType} />
          {entry.reversed ? (
            <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
              <Text style={{ color: colors.danger, fontFamily: fonts.sansBold, fontSize: 11, }}>
                Reversed
              </Text>
            </View>
          ) : null}
        </View>
        {canReverse ? (
          <AnimatedPressable
            accessibilityRole="button"
            onPress={onReverse}
            style={{ alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6 }}
          >
            <Undo2 color={colors.danger} size={14} strokeWidth={2.4} />
            <Text style={{ color: colors.danger, fontFamily: fonts.sansBold, fontSize: 12, }}>
              Reverse
            </Text>
          </AnimatedPressable>
        ) : null}
      </View>
      {entry.description ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          {entry.description}
        </Text>
      ) : null}
    </View>
  );
}

function IncomeBadge({ entryType }: { entryType: IncomeEntry["entryType"] }) {
  const { colors, fonts } = useTheme();
  const tone = entryType === "REVERSAL"
    ? { bg: colors.dangerSoft, fg: colors.danger, label: "Reversal" }
    : { bg: colors.primarySoft, fg: colors.primary, label: "Manual" };
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      <Text style={{ color: tone.fg, fontFamily: fonts.sansBold, fontSize: 11, }}>
        {tone.label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- sheets

function FieldLabel({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>
      {children}
    </Text>
  );
}

function BodyNote({ children }: { children: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.caption, { color: colors.muted }]}>
      {children}
    </Text>
  );
}

function AddIncomeSheet({ month, onClose, propertyId }: { month: string; onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [source, setSource] = useState("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedDate, setReceivedDate] = useState(defaultReceivedDate(month));
  const [description, setDescription] = useState("");
  const form = useFormErrors<"amount" | "receivedDate" | "source">();
  const [createIncome, state] = useCreateIncomeMutation();

  async function submit() {
    const amountPaise = rupeesToPaise(amount);
    const cleared = form.validate({
      ...(source.trim() ? {} : { source: "Enter an income source." }),
      ...(amountPaise ? {} : { amount: "Enter a valid amount." }),
      ...(receivedDate ? {} : { receivedDate: "Pick the date." }),
    });
    if (!cleared || !amountPaise) {
      return;
    }
    try {
      await createIncome({
        payload: {
          amountPaise,
          description: description.trim() || undefined,
          receivedDate,
          receivedFrom: receivedFrom.trim() || undefined,
          source: source.trim(),
        },
        propertyId,
      }).unwrap();
      onClose();
      toast.success("Income added.");
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not save the income.");
    }
  }

  return (
    <SheetShell onClose={onClose} title="Add income">
      <FormInput
        error={form.errors.source}
        label="Source"
        onChangeText={(next) => {
          setSource(next);
          form.clearField("source");
        }}
        placeholder="e.g. Parking, Laundry, Misc"
        required
        value={source}
      />
      <FormInput label="Received from" onChangeText={setReceivedFrom} placeholder="Optional payer" value={receivedFrom} />
      <FormInput
        error={form.errors.amount}
        keyboardType="decimal-pad"
        label="Amount"
        onChangeText={(next) => {
          setAmount(next);
          form.clearField("amount");
        }}
        placeholder="0"
        prefix="₹"
        required
        value={amount}
      />
      <IncomeDateField
        error={form.errors.receivedDate}
        label="Received date"
        onChange={(next) => {
          setReceivedDate(next);
          form.clearField("receivedDate");
        }}
        value={receivedDate}
      />
      <FormInput label="Note" multiline onChangeText={setDescription} placeholder="Optional description" value={description} />
      <ActionButton disabled={state.isLoading || form.blocked} icon={Plus} label={state.isLoading ? "Saving" : "Save income"} onPress={() => void submit()} />
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}

function ReverseIncomeSheet({ entry, onClose, propertyId }: { entry: IncomeEntry; onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const form = useFormErrors<"reason">();
  const [reverseIncome, state] = useReverseIncomeMutation();

  async function submit() {
    if (!form.validate(reason.trim() ? {} : { reason: "A reason is required to reverse an entry." })) {
      return;
    }
    try {
      await reverseIncome({ incomeId: entry.id, propertyId, reason: reason.trim() }).unwrap();
      onClose();
      toast.success("Income reversed.");
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not reverse the income.");
    }
  }

  return (
    <SheetShell onClose={onClose} title="Reverse income">
      <BodyNote>
        Reversing posts a correcting entry of {formatMoneyPaise(-entry.amountPaise)} against {entry.source}. The original row is kept for the audit trail.
      </BodyNote>
      <FormInput
        error={form.errors.reason}
        label="Reason"
        multiline
        onChangeText={(next) => {
          setReason(next);
          form.clearField("reason");
        }}
        placeholder="Why is this being reversed?"
        required
        value={reason}
      />
      <ActionButton disabled={state.isLoading || form.blocked} icon={Undo2} label={state.isLoading ? "Reversing" : "Reverse income"} onPress={() => void submit()} variant="danger" />
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}

function ReportSheet({
  month,
  onClose,
  onDownloaded,
  onError,
  propertyId,
  statement,
}: {
  month: string;
  onClose: () => void;
  onDownloaded: () => void;
  onError: () => void;
  propertyId: string;
  statement: PnlStatement;
}) {
  const [exportReport, state] = useLazyExportPnlReportQuery();

  async function download() {
    try {
      const csv = await exportReport({ month, propertyId }).unwrap();
      await downloadTextFile(`pnl-${month.slice(0, 7)}.csv`, csv, "text/csv");
      onDownloaded();
    } catch {
      onError();
    }
  }

  return (
    <SheetShell onClose={onClose} title={`Summary — ${monthLabel(month)}`}>
      <ReportBlock title="Income" lines={incomeLines(statement)} />
      <ReportRow bold label="Total income" paise={statement.totalIncomePaise} />
      <ReportRow label="Collected" paise={statement.totalRealizedIncomePaise} />
      <ReportRow label="Yet to be collected" paise={statement.billUncollectedPaise} />
      <ReportBlock title="Expenses" lines={statement.expenseBreakdown} />
      <ReportRow bold label="Total expense" paise={statement.expensePaise} />
      <Divider />
      <ReportRow bold label="Net profit / loss" paise={statement.netPaise} signed />
      <ReportRow label="Net (cash basis)" paise={statement.netRealizedPaise} signed />
      <ActionButton disabled={state.isLoading} icon={Download} label={state.isLoading ? "Preparing" : "Download CSV"} onPress={() => void download()} />
    </SheetShell>
  );
}

function ReportBlock({ lines, title }: { lines: PnlLine[]; title: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        {title}
      </Text>
      {lines.length === 0 ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          None
        </Text>
      ) : (
        lines.map((line) => <ReportRow key={line.label} label={line.label} paise={line.amountPaise} />)
      )}
    </View>
  );
}

function ReportRow({ bold = false, label, paise, signed = false }: { bold?: boolean; label: string; paise: number; signed?: boolean }) {
  const { colors, fonts, type } = useTheme();
  const negative = signed && paise < 0;
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: bold ? colors.ink : colors.muted, fontWeight: bold ? "800" : "500" }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ color: negative ? colors.danger : bold ? colors.ink : colors.inkSoft, fontFamily: fonts.sans, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: bold ? "800" : "700" }}>
        {signed && paise < 0 ? "−" : ""}{formatMoneyPaise(Math.abs(paise))}
      </Text>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, height: 1 }} />;
}

function IncomeDateField({ error, label, onChange, value }: { error?: string; label: string; onChange: (value: string) => void; value: string }) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T12:00:00`) : new Date();

  function update(event: DateTimePickerEvent, picked?: Date) {
    setOpen(false);
    if (event.type === "dismissed" || !picked) return;
    onChange(toLocalIso(picked));
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <FieldLabel>{label}</FieldLabel>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{ backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border, borderRadius: 14, borderWidth: error ? 1.5 : 1, justifyContent: "center", minHeight: 50, paddingHorizontal: spacing.md }}
      >
        <Text style={[type.body, { color: value ? colors.ink : colors.muted }]}>
          {value ? formatDate(value) : "Select date"}
        </Text>
      </AnimatedPressable>
      <FieldError message={error} />
      {open ? <DateTimePicker display="default" maximumDate={new Date()} mode="date" onChange={update} value={selected} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- helpers

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

function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Derive "today"/current month in IST to match the backend, not device-local time.
function istIsoToday() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" }).formatToParts(new Date());
    const get = (kind: string) => parts.find((part) => part.type === kind)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall through to the device-local date.
  }
  return toLocalIso(new Date());
}

function firstOfMonth() {
  return `${istIsoToday().slice(0, 7)}-01`;
}


function defaultReceivedDate(month: string) {
  return month >= firstOfMonth() ? istIsoToday() : month;
}

function monthLabel(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
