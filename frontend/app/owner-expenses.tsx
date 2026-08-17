import { useMemo, useState, type ReactNode } from "react";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { CalendarClock, Plus, Repeat2, Undo2, Wallet, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MarqueeText } from "@/components/marquee-text";
import { MetricTile } from "@/components/metric-tile";
import { MoneyText } from "@/components/money-text";
import { ProgressBar } from "@/components/progress-bar";
import { SheetShell } from "@/components/sheet-shell";
import { StatusPill } from "@/components/status-pill";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { SkeletonList, SkeletonScreen } from "@/components/skeleton";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ActionButton, BackButton, ChoiceButton, ConfirmDialog, FormInput, IconButton, formatMoneyPaise, rupeesToPaise } from "@/features/owner/owner-ui";
import { MonthSelector } from "@/components/month-selector";
import { useAppSelector } from "@/store/hooks";
import {
  useCreateExpenseCategoryMutation,
  useCreateExpenseMutation,
  useCreateRecurringExpenseMutation,
  useDeactivateRecurringExpenseMutation,
  useGetBudgetOverviewQuery,
  useGetBudgetTrendQuery,
  useGetExpenseSummaryQuery,
  useListExpenseCategoriesQuery,
  useListExpensesQuery,
  useListRecurringExpensesQuery,
  useRaiseBudgetMutation,
  useReverseExpenseMutation,
  useSetDefaultBudgetMutation,
  useUpdateRecurringExpenseMutation,
  type Expense,
  type ExpenseBudgetTrendPoint,
  type ExpenseEntryType,
  type RecurringExpense,
} from "@/store/services/expense-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PAGE_SIZE = 20;

export default function OwnerExpensesScreen() {
  const router = useGuardedRouter();
  const { colors } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const [month, setMonth] = useState(firstOfMonth());
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState<"add" | "recurring" | "set-budget" | "raise-budget" | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Expense | null>(null);

  const skip = !propertyId;
  const summaryQuery = useGetExpenseSummaryQuery({ propertyId, month }, { skip });
  const budgetQuery = useGetBudgetOverviewQuery({ propertyId, month }, { skip });
  const trendQuery = useGetBudgetTrendQuery({ propertyId, month, months: 6 }, { skip });
  const expensesQuery = useListExpensesQuery({ propertyId, month, page, size: PAGE_SIZE }, { skip });
  const categoriesQuery = useListExpenseCategoriesQuery(propertyId, { skip });

  const summary = summaryQuery.data;
  const budget = budgetQuery.data;
  const trend = trendQuery.data;
  const expensesPage = expensesQuery.data;
  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((category) => category.active), [categoriesQuery.data]);

  return (
    <>
      <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
        <ScreenHeader onBack={() => router.back()}
          eyebrow="Owner tool"
          title="Expense"
          italicTail="tracker."
          subtitle={property ? `Track spending, budgets and recurring costs for ${property.name}.` : "Select a property from Home to manage expenses."}
        />

        {!property ? (
          <EmptyState
            icon={Wallet}
            eyebrow="Property required"
            title="No property selected"
            description="Choose an active property from Home before opening the expense tracker."
          />
        ) : (
          <>
            <MonthSelector onChange={(picked) => setMonth(`${picked}-01`)} value={month.slice(0, 7)} />

            {budgetQuery.isLoading && !budget ? (
              <SkeletonScreen tiles={3} rows={0} />
            ) : budget ? (
              <BudgetHero budget={budget} onRaise={() => setSheet("raise-budget")} onSetBudget={() => setSheet("set-budget")} />
            ) : null}

            {budget ? <BudgetTiles budget={budget} /> : null}

            {trend && trend.points.length > 0 ? (
              <Section eyebrow="Trends" title="Last 6 months">
                <BudgetSpendChart points={trend.points} />
                <BudgetTrendChart points={trend.points} />
                {trend.points.some((point) => point.raisedPaise > 0) ? <RaisedTrendChart points={trend.points} /> : null}
              </Section>
            ) : null}

            <Section eyebrow="Actions" title="Expense tools">
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ToolBox icon={Plus} label="Add expense" onPress={() => setSheet("add")} />
                <ToolBox icon={Repeat2} label="Recurring" onPress={() => setSheet("recurring")} />
                <ToolBox icon={CalendarClock} label="Set budget" onPress={() => setSheet("set-budget")} />
              </View>
            </Section>

            <CategoryBreakdown loading={summaryQuery.isFetching && !summary} totals={summary?.byCategory ?? []} totalSpentPaise={summary?.totalSpentPaise ?? 0} />

            <Section eyebrow="Ledger" title="This month">
              {expensesQuery.isFetching && !expensesPage ? (
                <SkeletonList rows={4} />
              ) : null}

              {expensesPage && expensesPage.items.length === 0 ? (
                <EmptyState icon={Wallet} eyebrow="Nothing yet" title="No expenses this month" description="Add a manual expense or set up recurring costs to start the ledger." />
              ) : null}

              <View style={{ gap: spacing.sm }}>
                {expensesPage?.items.map((expense) => (
                  <ExpenseRow expense={expense} key={expense.id} onReverse={() => setReverseTarget(expense)} />
                ))}
              </View>

              {expensesPage && expensesPage.totalElements > 0 ? (
                <PaginationBar
                  hasNext={expensesPage.hasNext}
                  hasPrevious={expensesPage.hasPrevious}
                  onNext={() => setPage((current) => current + 1)}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  page={expensesPage.page}
                  totalElements={expensesPage.totalElements}
                  totalPages={expensesPage.totalPages}
                />
              ) : null}
            </Section>
          </>
        )}
      </ScreenScrollView>

      {sheet === "add" && property ? (
        <AddExpenseSheet
          categories={categories}
          month={month}
          onClose={() => setSheet(null)}
          propertyId={propertyId}
        />
      ) : null}
      {sheet === "recurring" && property ? (
        <RecurringSheet categories={categories} onClose={() => setSheet(null)} propertyId={propertyId} />
      ) : null}
      {sheet === "set-budget" && property && budget ? (
        <SetBudgetSheet budget={budget} month={month} onClose={() => setSheet(null)} propertyId={propertyId} />
      ) : null}
      {sheet === "raise-budget" && property ? (
        <RaiseBudgetSheet month={month} onClose={() => setSheet(null)} propertyId={propertyId} />
      ) : null}
      {reverseTarget && property ? (
        <ReverseSheet expense={reverseTarget} onClose={() => setReverseTarget(null)} propertyId={propertyId} />
      ) : null}
    </>
  );
}



function BudgetHero({ budget, onRaise, onSetBudget }: { budget: NonNullable<ReturnType<typeof useGetBudgetOverviewQuery>["data"]>; onRaise: () => void; onSetBudget: () => void }) {
  const { colors, fonts, type } = useTheme();
  const effective = budget.effectiveBudgetPaise;
  const hasBudget = effective != null && effective > 0;
  const over = hasBudget && effective != null && budget.spentPaise > effective;
  const ratio = hasBudget && effective != null && effective > 0 ? Math.min(1, budget.spentPaise / effective) : 0;
  const statusKey = budgetStatusKey(effective, budget.spentPaise);

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ gap: 2 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              {hasBudget ? "Monthly budget" : "No budget set"}
            </Text>
            {hasBudget && effective != null ? (
              <MoneyText animate paise={effective} size={30} />
            ) : (
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.5 }}>
                —
              </Text>
            )}
            {budget.raisedThisMonthPaise > 0 ? (
              <Text style={[type.caption, { color: colors.muted }]}>
                Incl. {formatMoneyPaise(budget.raisedThisMonthPaise)} raised this month
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <StatusPill label={statusLabel(statusKey)} tone={budgetStatusTone(statusKey)} />
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              {over ? "Over by" : "Remaining"}
            </Text>
            {hasBudget ? (
              <MoneyText color={over ? colors.danger : colors.jade} paise={Math.abs(budget.remainingPaise ?? 0)} size={20} weight="700" />
            ) : (
              <Text style={{ color: colors.muted, fontFamily: fonts.display, fontSize: 20, }}>
                —
              </Text>
            )}
          </View>
        </View>

        {hasBudget ? <ProgressBar color={over ? colors.danger : colors.jade} ratio={ratio} /> : null}

        <Text style={[type.caption, { color: colors.muted }]}>
          {hasBudget ? `${formatMoneyPaise(budget.spentPaise)} spent of ${formatMoneyPaise(effective)}` : "Set a monthly budget to track spending and savings."}
        </Text>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton icon={Wallet} label={hasBudget ? "Edit budget" : "Set budget"} onPress={onSetBudget} variant={hasBudget ? "secondary" : "primary"} />
          {hasBudget ? <ActionButton icon={Plus} label="Raise budget" onPress={onRaise} variant="primary" /> : null}
        </View>
      </View>
    </Card>
  );
}

function CategoryBreakdown({ loading, totalSpentPaise, totals }: { loading: boolean; totalSpentPaise: number; totals: { categoryId: string | null; categoryName: string; amountPaise: number }[] }) {
  const { colors, fonts, type } = useTheme();
  const max = totals.reduce((peak, item) => Math.max(peak, item.amountPaise), 0);

  return (
    <Section eyebrow="Breakdown" title="By category">
      <Card>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : totals.length === 0 ? (
          <Text style={[type.body, { color: colors.muted }]}>
            No spending recorded for this month yet.
          </Text>
        ) : (
          <View style={{ gap: spacing.md }}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Total spend
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontVariant: ["tabular-nums"], }}>
                {formatMoneyPaise(totalSpentPaise)}
              </Text>
            </View>
            {totals.map((item) => (
              <View key={item.categoryId ?? item.categoryName} style={{ gap: spacing.xs }}>
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} numberOfLines={1}>
                    {item.categoryName}
                  </Text>
                  <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13, fontVariant: ["tabular-nums"], }}>
                    {formatMoneyPaise(item.amountPaise)}
                  </Text>
                </View>
                <ProgressBar color={item.categoryId == null ? colors.accent : colors.primary} height={8} ratio={max > 0 ? Math.max(0.04, item.amountPaise / max) : 0} />
              </View>
            ))}
          </View>
        )}
      </Card>
    </Section>
  );
}

function BudgetTrendChart({ points }: { points: ExpenseBudgetTrendPoint[] }) {
  const { colors, fonts, type } = useTheme();
  const [width, setWidth] = useState(0);
  const hasBudget = points.some((point) => point.effectiveBudgetPaise != null);
  const latest = points[points.length - 1];

  const height = 160;
  const padX = 12;
  const padTop = 16;
  const padBottom = 26;
  const plotW = Math.max(0, width - padX * 2);
  const plotH = height - padTop - padBottom;

  const values = points.map((point) => point.savingsPaise / 100);
  const maxV = Math.max(0, ...values);
  const minV = Math.min(0, ...values);
  const spread = Math.max(1, maxV - minV);
  const top = maxV + spread * 0.15;
  const bottom = minV - spread * 0.15;
  const range = top - bottom || 1;
  const x = (index: number) => padX + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => padTop + ((top - value) / range) * plotH;
  const zeroY = y(0);
  const linePoints = points.map((point, index) => `${x(index)},${y(point.savingsPaise / 100)}`).join(" ");

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", columnGap: spacing.sm, flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>
              Savings by month
            </Text>
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
              {monthShort(points[0]?.month)} – {monthShort(latest?.month)}
            </Text>
          </View>
          {hasBudget && latest ? (
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Latest
              </Text>
              <Text numberOfLines={1} style={{ color: latest.savingsPaise >= 0 ? colors.jade : colors.danger, fontFamily: fonts.display, fontSize: 18, fontVariant: ["tabular-nums"], }}>
                {formatMoneyPaise(latest.savingsPaise)}
              </Text>
            </View>
          ) : null}
        </View>

        {!hasBudget ? (
          <Text style={[type.body, { color: colors.muted }]}>
            Set a monthly budget to chart savings across months.
          </Text>
        ) : (
          <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
            {width > 0 ? (
              <Svg height={height} width={width}>
                <Line stroke={colors.border} strokeDasharray="4 5" strokeWidth={1} x1={padX} x2={width - padX} y1={zeroY} y2={zeroY} />
                <Polyline fill="none" points={linePoints} stroke={colors.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} />
                {points.map((point, index) => (
                  <Circle cx={x(index)} cy={y(point.savingsPaise / 100)} fill={point.savingsPaise >= 0 ? colors.jade : colors.danger} key={`dot-${point.month}`} r={3.6} />
                ))}
                {points.map((point, index) => (
                  <SvgText fill={colors.muted} fontFamily={fonts.sans} fontSize={10} key={`label-${point.month}`} textAnchor={labelAnchor(index, points.length)} x={x(index)} y={height - 8}>
                    {monthShort(point.month)}
                  </SvgText>
                ))}
              </Svg>
            ) : null}
          </View>
        )}

        <Text style={[type.caption, { color: colors.muted }]}>
          Savings = budget − spend (incl. projected salary). A point below the line means that month went over budget.
        </Text>
      </View>
    </Card>
  );
}

type BudgetStatusKey = "none" | "on-track" | "approaching" | "crossed";

function budgetStatusKey(effective: number | null, spent: number): BudgetStatusKey {
  if (effective == null || effective <= 0) return "none";
  if (spent > effective) return "crossed";
  if (spent * 100 >= effective * 80) return "approaching";
  return "on-track";
}

function statusLabel(key: BudgetStatusKey) {
  return key === "crossed" ? "Crossed" : key === "approaching" ? "Approaching" : key === "on-track" ? "On track" : "No budget";
}

function budgetStatusTone(key: BudgetStatusKey) {
  return key === "crossed" ? ("danger" as const) : key === "approaching" ? ("warning" as const) : key === "on-track" ? ("success" as const) : ("neutral" as const);
}

function StatusValueTile({ color, hint, label, value }: { color: string; hint?: string; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: 12, borderWidth: 1, flex: 1, gap: spacing.xs, padding: spacing.md }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} numberOfLines={1}>
        {label}
      </Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={{ color, fontFamily: fonts.display, fontSize: 19, fontVariant: ["tabular-nums"], letterSpacing: -0.5, lineHeight: 23 }}>
        {value}
      </Text>
      {hint ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function BudgetTiles({ budget }: { budget: { effectiveBudgetPaise: number | null; spentPaise: number; savingsPaise: number; raisedThisMonthPaise: number } }) {
  const { colors } = useTheme();
  const effective = budget.effectiveBudgetPaise;
  const hasBudget = effective != null && effective > 0;
  const over = hasBudget && effective != null && budget.spentPaise > effective;
  const key = budgetStatusKey(effective, budget.spentPaise);
  const statusColor = key === "crossed" ? colors.danger : key === "approaching" ? colors.warningText : key === "on-track" ? colors.jade : colors.muted;
  const crossedBy = over && effective != null ? budget.spentPaise - effective : 0;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <StatusValueTile color={statusColor} hint={hasBudget && effective != null ? formatMoneyPaise(effective) : "Set a budget"} label="Budget status" value={statusLabel(key)} />
        <MetricTile dense hint="This month" label="Raised" value={budget.raisedThisMonthPaise > 0 ? formatMoneyPaise(budget.raisedThisMonthPaise) : "None"} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <MetricTile dense hint={over ? "Over budget" : "Within budget"} label="Crossed by" tone={over ? "danger" : "default"} value={over ? formatMoneyPaise(crossedBy) : "—"} />
        <MetricTile dense hint="Projected" label="Savings" tone={budget.savingsPaise > 0 ? "primary" : "default"} value={hasBudget ? formatMoneyPaise(budget.savingsPaise) : "—"} />
      </View>
    </View>
  );
}

function ChartLegend({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
      <View style={line ? { backgroundColor: color, height: 2, width: 14 } : { backgroundColor: color, borderRadius: 3, height: 10, width: 10 }} />
      <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
    </View>
  );
}

// SVG month labels sit exactly at the plot edges; anchoring the first label to
// its start and the last to its end keeps them from bleeding past the chart on
// narrow screens (unlike a centered anchor).
function labelAnchor(index: number, count: number): "start" | "middle" | "end" {
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
}

function BudgetSpendChart({ points }: { points: ExpenseBudgetTrendPoint[] }) {
  const { colors, fonts, type } = useTheme();
  const [width, setWidth] = useState(0);
  const hasBudget = points.some((point) => point.effectiveBudgetPaise != null);

  const height = 170;
  const padX = 12;
  const padTop = 14;
  const padBottom = 26;
  const plotW = Math.max(0, width - padX * 2);
  const plotH = height - padTop - padBottom;
  const spents = points.map((point) => point.spentPaise / 100);
  const budgets = points.map((point) => (point.effectiveBudgetPaise ?? 0) / 100);
  const top = Math.max(1, ...spents, ...budgets) * 1.15;
  const baseY = padTop + plotH;
  const x = (index: number) => padX + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => padTop + (1 - value / top) * plotH;
  const barW = points.length > 0 ? Math.min(24, (plotW / points.length) * 0.55) : 0;
  const budgetLine = points.map((point, index) => `${x(index)},${y((point.effectiveBudgetPaise ?? 0) / 100)}`).join(" ");

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Budget vs spent
          </Text>
          <View style={{ alignItems: "center", columnGap: spacing.md, flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs }}>
            <ChartLegend color={colors.primary} label="Spent" />
            <ChartLegend color={colors.danger} label="Over" />
            <ChartLegend color={colors.muted} label="Budget" line />
          </View>
        </View>
        {!hasBudget ? (
          <Text style={[type.body, { color: colors.muted }]}>
            Set a monthly budget to compare spend against it.
          </Text>
        ) : (
          <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
            {width > 0 ? (
              <Svg height={height} width={width}>
                {points.map((point, index) => {
                  const barY = y(point.spentPaise / 100);
                  const over = point.effectiveBudgetPaise != null && point.spentPaise > point.effectiveBudgetPaise;
                  return <Rect fill={over ? colors.danger : colors.primary} height={Math.max(1, baseY - barY)} key={`bar-${point.month}`} rx={4} width={barW} x={x(index) - barW / 2} y={barY} />;
                })}
                <Polyline fill="none" points={budgetLine} stroke={colors.muted} strokeDasharray="4 4" strokeLinecap="round" strokeWidth={1.5} />
                {points.map((point, index) => (
                  <SvgText fill={colors.muted} fontFamily={fonts.sans} fontSize={10} key={`label-${point.month}`} textAnchor={labelAnchor(index, points.length)} x={x(index)} y={height - 8}>
                    {monthShort(point.month)}
                  </SvgText>
                ))}
              </Svg>
            ) : null}
          </View>
        )}
      </View>
    </Card>
  );
}

function RaisedTrendChart({ points }: { points: ExpenseBudgetTrendPoint[] }) {
  const { colors, fonts, type } = useTheme();
  const [width, setWidth] = useState(0);

  const height = 140;
  const padX = 12;
  const padTop = 14;
  const padBottom = 26;
  const plotW = Math.max(0, width - padX * 2);
  const plotH = height - padTop - padBottom;
  const top = Math.max(1, ...points.map((point) => point.raisedPaise / 100)) * 1.2;
  const baseY = padTop + plotH;
  const x = (index: number) => padX + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => padTop + (1 - value / top) * plotH;
  const barW = points.length > 0 ? Math.min(24, (plotW / points.length) * 0.55) : 0;
  const totalRaised = points.reduce((sum, point) => sum + point.raisedPaise, 0);

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", columnGap: spacing.sm, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.xs }}>
          <Text style={[type.eyebrow, { color: colors.kicker, flexShrink: 1 }]} numberOfLines={1}>
            Raised per month
          </Text>
          <Text numberOfLines={1} style={{ color: colors.warningText, fontFamily: fonts.display, fontSize: 18, fontVariant: ["tabular-nums"], }}>
            {formatMoneyPaise(totalRaised)}
          </Text>
        </View>
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
          {width > 0 ? (
            <Svg height={height} width={width}>
              {points.map((point, index) => {
                const value = point.raisedPaise / 100;
                const barY = value > 0 ? y(value) : baseY;
                return <Rect fill={colors.warningText} height={Math.max(0, baseY - barY)} key={`raise-${point.month}`} rx={4} width={barW} x={x(index) - barW / 2} y={barY} />;
              })}
              {points.map((point, index) => (
                <SvgText fill={colors.muted} fontFamily={fonts.sans} fontSize={10} key={`raise-label-${point.month}`} textAnchor={labelAnchor(index, points.length)} x={x(index)} y={height - 8}>
                  {monthShort(point.month)}
                </SvgText>
              ))}
            </Svg>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function ExpenseRow({ expense, onReverse }: { expense: Expense; onReverse: () => void }) {
  const { colors, fonts, type } = useTheme();
  const negative = expense.amountPaise < 0;
  const canReverse = expense.entryType !== "REVERSAL" && !expense.reversed;

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: 14, borderWidth: 1, gap: spacing.sm, opacity: expense.reversed ? 0.6 : 1, padding: spacing.md }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
            {expense.paidTo}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {expense.categoryName} · {formatDate(expense.incurredDate)}
          </Text>
        </View>
        <MoneyText color={negative ? colors.danger : colors.ink} paise={expense.amountPaise} weight="700" />
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <EntryBadge entryType={expense.entryType} />
          {expense.reversed ? (
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
      {expense.description ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          {expense.description}
        </Text>
      ) : null}
    </View>
  );
}

function EntryBadge({ entryType }: { entryType: ExpenseEntryType }) {
  const { colors, fonts } = useTheme();
  const map: Record<ExpenseEntryType, { bg: string; fg: string; label: string }> = {
    MANUAL: { bg: colors.primarySoft, fg: colors.primary, label: "Manual" },
    RECURRING: { bg: colors.accentSoft, fg: colors.accent, label: "Recurring" },
    AUTO: { bg: colors.surfaceSunken, fg: colors.muted, label: "Auto" },
    REVERSAL: { bg: colors.dangerSoft, fg: colors.danger, label: "Reversal" },
  };
  const tone = map[entryType];
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      <Text style={{ color: tone.fg, fontFamily: fonts.sansBold, fontSize: 11, }}>
        {tone.label}
      </Text>
    </View>
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

// ---------------------------------------------------------------- sheets

function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <SheetShell onClose={onClose} title={title}>
      {children}
    </SheetShell>
  );
}

function InlineError({ message }: { message: string | null }) {
  const { colors, type } = useTheme();
  if (!message) return null;
  return (
    <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]}>
      {message}
    </Text>
  );
}

function AddExpenseSheet({ categories, month, onClose, propertyId }: { categories: { id: string; name: string }[]; month: string; onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [paidTo, setPaidTo] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredDate, setIncurredDate] = useState(defaultIncurredDate(month));
  const [description, setDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createExpense, createState] = useCreateExpenseMutation();
  const [createCategory, categoryState] = useCreateExpenseCategoryMutation();

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const created = await createCategory({ name, propertyId }).unwrap();
      setCategoryId(created.id);
      setNewCategory("");
    } catch {
      setError("Could not add that category.");
    }
  }

  async function submit() {
    const amountPaise = rupeesToPaise(amount);
    if (!categoryId) return setError("Pick or create a category.");
    if (!paidTo.trim()) return setError("Enter who this was paid to.");
    if (!amountPaise) return setError("Enter a valid amount.");
    if (!incurredDate) return setError("Pick the date.");
    try {
      await createExpense({ payload: { amountPaise, categoryId, description: description.trim() || undefined, incurredDate, paidTo: paidTo.trim() }, propertyId }).unwrap();
      onClose();
      toast.success("Expense added.");
    } catch {
      setError("Could not save the expense.");
    }
  }

  return (
    <Sheet onClose={onClose} title="Add expense">
      <FieldLabel>Category</FieldLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {categories.map((category) => (
          <ChoiceButton active={category.id === categoryId} key={category.id} label={category.name} onPress={() => setCategoryId(category.id)} />
        ))}
      </View>
      <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <FormInput label="New category" onChangeText={setNewCategory} placeholder="e.g. Housekeeping" value={newCategory} />
        </View>
        <ActionButton disabled={!newCategory.trim() || categoryState.isLoading} icon={Plus} label="Add" onPress={() => void addCategory()} variant="secondary" />
      </View>
      <FormInput label="Paid to" onChangeText={setPaidTo} placeholder="Payee or vendor" value={paidTo} />
      <FormInput keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} placeholder="0" prefix="₹" value={amount} />
      <ExpenseDateField label="Incurred date" onChange={setIncurredDate} value={incurredDate} />
      <FormInput label="Note" multiline onChangeText={setDescription} placeholder="Optional description" value={description} />
      <InlineError message={error} />
      <ActionButton disabled={createState.isLoading} icon={Plus} label={createState.isLoading ? "Saving" : "Save expense"} onPress={() => void submit()} />
    </Sheet>
  );
}

function SetBudgetSheet({ budget, month, onClose, propertyId }: { budget: { defaultMonthlyBudgetPaise: number | null }; month: string; onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [amount, setAmount] = useState(budget.defaultMonthlyBudgetPaise != null ? String(Math.round(budget.defaultMonthlyBudgetPaise / 100)) : "");
  const [error, setError] = useState<string | null>(null);
  const [setDefaultBudget, state] = useSetDefaultBudgetMutation();

  async function submit() {
    const amountPaise = rupeesToPaise(amount);
    if (amountPaise == null) return setError("Enter a valid amount.");
    try {
      await setDefaultBudget({ amountPaise, month, propertyId }).unwrap();
      onClose();
      toast.success("Monthly budget updated.");
    } catch {
      setError("Could not update the budget.");
    }
  }

  return (
    <Sheet onClose={onClose} title="Monthly budget">
      <BodyNote>This is the recurring monthly budget. Set it once — it carries forward every month and can be edited anytime.</BodyNote>
      <FormInput keyboardType="decimal-pad" label="Monthly budget" onChangeText={setAmount} placeholder="0" prefix="₹" value={amount} />
      <InlineError message={error} />
      <ActionButton disabled={state.isLoading} label={state.isLoading ? "Saving" : "Save budget"} onPress={() => void submit()} />
    </Sheet>
  );
}

function RaiseBudgetSheet({ month, onClose, propertyId }: { month: string; onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [raiseBudget, state] = useRaiseBudgetMutation();

  async function submit() {
    const amountPaise = rupeesToPaise(amount);
    if (!amountPaise) return setError("Enter a valid amount.");
    try {
      await raiseBudget({ amountPaise, month, propertyId, reason: reason.trim() || undefined }).unwrap();
      onClose();
      toast.success("Budget raised for this month.");
    } catch {
      setError("Could not raise the budget.");
    }
  }

  return (
    <Sheet onClose={onClose} title="Raise budget">
      <BodyNote>A raise adds to this month&apos;s budget only and is tracked separately from the recurring default.</BodyNote>
      <FormInput keyboardType="decimal-pad" label="Raise amount" onChangeText={setAmount} placeholder="0" prefix="₹" value={amount} />
      <FormInput label="Reason" onChangeText={setReason} placeholder="Optional reason" value={reason} />
      <InlineError message={error} />
      <ActionButton disabled={state.isLoading} icon={Plus} label={state.isLoading ? "Saving" : "Raise budget"} onPress={() => void submit()} />
    </Sheet>
  );
}

function ReverseSheet({ expense, onClose, propertyId }: { expense: Expense; onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reverseExpense, state] = useReverseExpenseMutation();

  async function submit() {
    if (!reason.trim()) return setError("A reason is required to reverse an entry.");
    try {
      await reverseExpense({ expenseId: expense.id, propertyId, reason: reason.trim() }).unwrap();
      onClose();
      toast.success("Expense reversed.");
    } catch {
      setError("Could not reverse the expense.");
    }
  }

  return (
    <Sheet onClose={onClose} title="Reverse expense">
      <BodyNote>
        Reversing posts a correcting entry of {formatMoneyPaise(-expense.amountPaise)} against {expense.paidTo}. The original row is kept for the audit trail.
      </BodyNote>
      <FormInput label="Reason" multiline onChangeText={setReason} placeholder="Why is this being reversed?" value={reason} />
      <InlineError message={error} />
      <ActionButton disabled={state.isLoading} icon={Undo2} label={state.isLoading ? "Reversing" : "Reverse expense"} onPress={() => void submit()} variant="danger" />
    </Sheet>
  );
}

function RecurringSheet({ categories, onClose, propertyId }: { categories: { id: string; name: string }[]; onClose: () => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const recurringQuery = useListRecurringExpensesQuery(propertyId);
  const items = recurringQuery.data ?? [];
  const [editing, setEditing] = useState<RecurringExpense | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecurringExpense | null>(null);
  const [deactivate] = useDeactivateRecurringExpenseMutation();

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      await deactivate({ propertyId, recurringExpenseId: target.id }).unwrap();
      toast.success("Recurring expense removed.");
    } catch {
      toast.error("Could not remove the recurring expense.");
    }
  }

  if (editing) {
    return (
      <RecurringFormSheet
        categories={categories}
        editing={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        propertyId={propertyId}
      />
    );
  }

  return (
    <>
      <Sheet onClose={onClose} title="Recurring expenses">
        <BodyNote>Templates are posted automatically each month on their day. Salary is projected from current staff and managed by the system.</BodyNote>
        {recurringQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {items.length === 0 && !recurringQuery.isLoading ? (
          <Text style={[type.body, { color: colors.muted }]}>
            No recurring expenses yet.
          </Text>
        ) : null}
        <View style={{ gap: spacing.sm }}>
          {items.map((item) => (
            <View key={item.id} style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
                  {item.paidTo}
                </Text>
                {/* Three segments and a status pill competing for one row: the
                    last one ("projected monthly") was the one that got clipped.
                    Scrolls rather than ellipsises, per the app's overflow rule. */}
                <MarqueeText style={[type.caption, { color: colors.muted }]}>
                  {`${item.categoryName} · ${formatMoneyPaise(item.amountPaise)} · ${item.system ? "projected monthly" : `day ${item.dayOfMonth}`}`}
                </MarqueeText>
              </View>
              {item.system ? (
                <StatusPill label="System recurring" tone="accent" />
              ) : (
                <>
                  <AnimatedPressable accessibilityLabel="Edit" onPress={() => setEditing(item)} style={{ paddingHorizontal: spacing.xs, paddingVertical: 4 }}>
                    <Text style={[type.caption, { color: colors.primary, fontWeight: "800" }]}>
                      Edit
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable accessibilityLabel="Remove" onPress={() => setPendingDelete(item)} style={{ paddingHorizontal: spacing.xs, paddingVertical: 4 }}>
                    <X color={colors.danger} size={18} strokeWidth={2.2} />
                  </AnimatedPressable>
                </>
              )}
            </View>
          ))}
        </View>
        <ActionButton icon={Plus} label="Add recurring expense" onPress={() => setEditing("new")} />
      </Sheet>
      {pendingDelete ? (
        <ConfirmDialog
          confirmLabel="Remove"
          destructive
          message={`Stop generating the recurring expense to ${pendingDelete.paidTo}?`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
          title="Remove recurring expense?"
        />
      ) : null}
    </>
  );
}

function RecurringFormSheet({ categories, editing, onClose, propertyId }: { categories: { id: string; name: string }[]; editing: RecurringExpense | null; onClose: () => void; propertyId: string }) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? categories[0]?.id ?? "");
  const [paidTo, setPaidTo] = useState(editing?.paidTo ?? "");
  const [amount, setAmount] = useState(editing ? String(Math.round(editing.amountPaise / 100)) : "");
  const [dayOfMonth, setDayOfMonth] = useState(String(editing?.dayOfMonth ?? 1));
  const [description, setDescription] = useState(editing?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [create, createState] = useCreateRecurringExpenseMutation();
  const [update, updateState] = useUpdateRecurringExpenseMutation();
  const saving = createState.isLoading || updateState.isLoading;

  async function submit() {
    const amountPaise = rupeesToPaise(amount);
    const day = Number(dayOfMonth);
    if (!categoryId) return setError("Pick a category.");
    if (!paidTo.trim()) return setError("Enter who this is paid to.");
    if (!amountPaise) return setError("Enter a valid amount.");
    if (!Number.isInteger(day) || day < 1 || day > 28) return setError("Day of month must be between 1 and 28.");
    const payload = { amountPaise, categoryId, dayOfMonth: day, description: description.trim() || undefined, paidTo: paidTo.trim() };
    try {
      if (editing) await update({ payload, propertyId, recurringExpenseId: editing.id }).unwrap();
      else await create({ payload, propertyId }).unwrap();
      onClose();
      toast.success(editing ? "Recurring expense updated." : "Recurring expense added.");
    } catch {
      setError("Could not save the recurring expense.");
    }
  }

  return (
    <Sheet onClose={onClose} title={editing ? "Edit recurring" : "Add recurring"}>
      <FieldLabel>Category</FieldLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {categories.map((category) => (
          <ChoiceButton active={category.id === categoryId} key={category.id} label={category.name} onPress={() => setCategoryId(category.id)} />
        ))}
      </View>
      <FormInput label="Paid to" onChangeText={setPaidTo} placeholder="Payee or vendor" value={paidTo} />
      <FormInput keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} placeholder="0" prefix="₹" value={amount} />
      <FormInput keyboardType="number-pad" label="Day of month (1-28)" onChangeText={setDayOfMonth} placeholder="1" value={dayOfMonth} />
      <FormInput label="Note" multiline onChangeText={setDescription} placeholder="Optional description" value={description} />
      <InlineError message={error} />
      <ActionButton disabled={saving} label={saving ? "Saving" : editing ? "Save changes" : "Add recurring"} onPress={() => void submit()} />
    </Sheet>
  );
}

function ExpenseDateField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
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
        style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, justifyContent: "center", minHeight: 50, paddingHorizontal: spacing.md }}
      >
        <Text style={[type.body, { color: value ? colors.ink : colors.muted }]}>
          {value ? formatDate(value) : "Select date"}
        </Text>
      </AnimatedPressable>
      {open ? <DateTimePicker display="default" maximumDate={new Date()} mode="date" onChange={update} value={selected} /> : null}
    </View>
  );
}

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

// ---------------------------------------------------------------- helpers

function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The backend runs every month/day calculation in IST (Asia/Kolkata). Mirror that
// here so "today" and the current month match the server regardless of the
// device's own time zone — otherwise a phone set a few hours behind can land on
// the previous month near a month boundary (e.g. the 1st) and drop the newest
// month from the trend window. Falls back to the device date if the runtime
// lacks IANA time-zone support.
function istIsoToday() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Kolkata",
      year: "numeric",
    }).formatToParts(new Date());
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


function defaultIncurredDate(month: string) {
  // If viewing the current month, default to today (in IST, matching the server);
  // otherwise the 1st of that month.
  return month >= firstOfMonth() ? istIsoToday() : month;
}

function monthLabel(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function monthShort(iso?: string) {
  if (!iso) return "";
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(year, month - 1, 1));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
