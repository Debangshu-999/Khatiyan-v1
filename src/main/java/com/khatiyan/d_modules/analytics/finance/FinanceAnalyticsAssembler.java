package com.khatiyan.d_modules.analytics.finance;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.function.ToDoubleFunction;
import java.util.function.ToLongFunction;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.analytics.metric.AnalyticsContext;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.metric.DivisionAssembler;
import com.khatiyan.d_modules.analytics.metric.MetricGuard;
import com.khatiyan.d_modules.analytics.metric.MetricKey;
import com.khatiyan.d_modules.analytics.metric.MetricResult;
import com.khatiyan.d_modules.analytics.metric.MetricStatus;
import com.khatiyan.d_modules.analytics.metric.Unit;
import com.khatiyan.d_modules.analytics.period.DateRange;
import com.khatiyan.d_modules.analytics.period.ResolvedPeriod;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;
import com.khatiyan.d_modules.billing.api.dto.BillingMonthSummary;
import com.khatiyan.d_modules.expense.analytics.ExpenseAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics;

/**
 * The Finance division, spec §5.2.
 *
 * <p><b>Monthly, like the P&L screen.</b> Income is the billing month summary the
 * P&L reads (projected rent included for the current month) plus manual income;
 * expense is the P&L's monthly total (projected salary included). Finance sums
 * those same months over every calendar month the period touches, so its figures
 * always equal the P&L screen's. A custom range therefore counts whole months.
 */
@Component
public class FinanceAnalyticsAssembler implements DivisionAssembler {

    private static final int TOP_CATEGORIES = 4;
    private static final int TOP_NAMES = 5;
    private static final int TOP_FIXED_LINES = 3;
    /** The part key for the estimated salary, on both the categories and the fixed-cost lines. */
    private static final String SALARY_ESTIMATED = "SALARY_ESTIMATED";
    private static final ExpenseAnalytics.MonthTotals NO_TOTALS = new ExpenseAnalytics.MonthTotals(0, 0);

    private final BillingModule billingModule;
    private final BillingAnalytics billing;
    private final ExpenseAnalytics expenses;
    private final TenancyAnalytics tenancy;

    public FinanceAnalyticsAssembler(
            BillingModule billingModule, BillingAnalytics billing, ExpenseAnalytics expenses, TenancyAnalytics tenancy) {
        this.billingModule = billingModule;
        this.billing = billing;
        this.expenses = expenses;
        this.tenancy = tenancy;
    }

    @Override
    public AnalyticsDivision division() {
        return AnalyticsDivision.FINANCE;
    }

    /** One month exactly as the P&L statement shows it. */
    record MonthRow(YearMonth month, long billedPaise, long collectedPaise, long manualIncomePaise, long expensePaise, boolean hasData) {
        long income() {
            return billedPaise + manualIncomePaise;
        }

        long net() {
            return income() - expensePaise;
        }

        long cashNet() {
            return collectedPaise + manualIncomePaise - expensePaise;
        }
    }

    @Override
    public List<MetricResult> assemble(AnalyticsContext context) {
        UUID p = context.propertyId();
        ResolvedPeriod period = context.period();
        // Built once and shared by the four money metrics.
        Supplier<List<MonthRow>> now = memo(() -> monthRows(p, period.range(), context.today()));
        Supplier<List<MonthRow>> before = memo(() -> period.hasComparison() ? monthRows(p, period.comparison(), context.today()) : null);
        List<MetricResult> out = new ArrayList<>();

        MetricGuard.add(out, context, MetricKey.FINANCE_DEPOSITS, () -> deposits(p));
        MetricGuard.add(out, context, MetricKey.FINANCE_FIXED_VS_VARIABLE, () -> fixedVsVariable(p, period.range(), now.get()));
        MetricGuard.add(out, context, MetricKey.FINANCE_INCOME_VS_EXPENSES, () -> incomeVsExpenses(period, now.get(), before.get()));
        MetricGuard.add(out, context, MetricKey.FINANCE_PROFIT_MARGIN, () -> profitMargin(period, now.get(), before.get()));
        MetricGuard.add(out, context, MetricKey.FINANCE_ACCRUAL_VS_CASH, () -> accrualVsCash(now.get()));
        MetricGuard.add(out, context, MetricKey.FINANCE_PER_BED, () -> perBed(p, period, now.get(), before.get()));
        MetricGuard.add(out, context, MetricKey.FINANCE_EXPENSE_CATEGORIES, () -> categories(p, period));
        MetricGuard.add(out, context, MetricKey.FINANCE_BUDGET_VS_ACTUAL, () -> budget(p, period.range(), context.today()));
        MetricGuard.add(out, context, MetricKey.FINANCE_TOP_PAYEES, () -> named(MetricKey.FINANCE_TOP_PAYEES,
                expenses.payees(p, monthsStart(period.range()), monthsEnd(period.range()))));
        MetricGuard.add(out, context, MetricKey.FINANCE_OTHER_INCOME, () -> named(MetricKey.FINANCE_OTHER_INCOME,
                expenses.incomeBySource(p, monthsStart(period.range()), monthsEnd(period.range()))));
        return out;
    }

    // ---- Months -------------------------------------------------------------

    /**
     * The months of a range, read in one pass: three queries for the whole span,
     * where it used to be three for every month in it.
     *
     * <p>Past months come from the billing and expense modules' own month totals,
     * which are held equal to the P&L's by {@code FinanceMonthsMatchThePnlTest}.
     * The current month still goes through the P&L's summary itself, because it
     * also carries the rent not yet billed, and only the summary projects that.
     */
    private List<MonthRow> monthRows(UUID p, DateRange range, LocalDate today) {
        YearMonth first = YearMonth.from(range.from());
        YearMonth last = YearMonth.from(range.to());
        YearMonth current = YearMonth.from(today);
        Map<YearMonth, BillingAnalytics.MonthBilling> billed = billing.monthBilling(p, first, last);
        Map<YearMonth, ExpenseAnalytics.MonthTotals> totalsByMonth = expenses.monthTotalsBetween(p, first, last);

        List<MonthRow> rows = new ArrayList<>();
        for (YearMonth m = first; !m.isAfter(last); m = m.plusMonths(1)) {
            ExpenseAnalytics.MonthTotals totals = totalsByMonth.getOrDefault(m, NO_TOTALS);
            long billedPaise;
            long collectedPaise;
            boolean hasBills;
            if (m.isBefore(current)) {
                BillingAnalytics.MonthBilling month = billed.get(m);
                billedPaise = month == null ? 0 : month.billedPaise();
                collectedPaise = month == null ? 0 : month.collectedPaise();
                hasBills = month != null && month.bills() > 0;
            } else {
                BillingMonthSummary summary = billingModule.getPropertyMonthSummaryForDashboard(p, m.toString());
                billedPaise = summary.rentBilledPaise() + summary.oneOffBilledPaise();
                collectedPaise = summary.collectedPaise();
                hasBills = summary.hasData();
            }
            rows.add(new MonthRow(m, billedPaise, collectedPaise, totals.manualIncomePaise(), totals.expensePaise(),
                    hasBills || totals.manualIncomePaise() != 0 || totals.expensePaise() != 0));
        }
        return rows;
    }

    private static LocalDate monthsStart(DateRange range) {
        return range.from().withDayOfMonth(1);
    }

    private static LocalDate monthsEnd(DateRange range) {
        return YearMonth.from(range.to()).atEndOfMonth();
    }

    private static List<MonthRow> inBucket(List<MonthRow> rows, DateRange bucket) {
        YearMonth first = YearMonth.from(bucket.from());
        YearMonth last = YearMonth.from(bucket.to());
        return rows.stream().filter(row -> !row.month().isBefore(first) && !row.month().isAfter(last)).toList();
    }

    private static long sum(List<MonthRow> rows, ToLongFunction<MonthRow> field) {
        return rows.stream().mapToLong(field).sum();
    }

    private static boolean hasData(List<MonthRow> rows) {
        return rows != null && rows.stream().anyMatch(MonthRow::hasData);
    }

    /** The comparison's value, or null when there is no comparison or it recorded nothing. */
    private static Long previous(List<MonthRow> before, ToLongFunction<MonthRow> field) {
        return hasData(before) ? sum(before, field) : null;
    }

    private static Map<String, Long> values(Object... keyValues) {
        Map<String, Long> values = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            values.put((String) keyValues[i], (Long) keyValues[i + 1]);
        }
        return values;
    }

    // ---- Metrics --------------------------------------------------------------

    private MetricResult incomeVsExpenses(ResolvedPeriod period, List<MonthRow> now, List<MonthRow> before) {
        MetricResult.Builder builder = MetricResult.of(MetricKey.FINANCE_INCOME_VS_EXPENSES)
                .status(hasData(now) ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(now.size())
                .figure("income", Unit.PAISE, sum(now, MonthRow::income), previous(before, MonthRow::income))
                .figure("expenses", Unit.PAISE, sum(now, MonthRow::expensePaise), previous(before, MonthRow::expensePaise))
                .figure("net", Unit.PAISE, sum(now, MonthRow::net), previous(before, MonthRow::net))
                .seriesUnit(Unit.PAISE);
        for (DateRange bucket : period.buckets()) {
            List<MonthRow> rows = inBucket(now, bucket);
            builder.point(bucket.from(), bucket.to(), values(
                    "income", sum(rows, MonthRow::income),
                    "expenses", sum(rows, MonthRow::expensePaise),
                    "net", sum(rows, MonthRow::net)));
        }
        return builder.build();
    }

    /** Sends income and net per bucket; the app divides, so a margin is never rounded twice. */
    private MetricResult profitMargin(ResolvedPeriod period, List<MonthRow> now, List<MonthRow> before) {
        long income = sum(now, MonthRow::income);
        MetricResult.Builder builder = MetricResult.of(MetricKey.FINANCE_PROFIT_MARGIN)
                .status(income > 0 ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(now.size())
                .figure("income", Unit.PAISE, income, previous(before, MonthRow::income))
                .figure("net", Unit.PAISE, sum(now, MonthRow::net), previous(before, MonthRow::net))
                .seriesUnit(Unit.PAISE);
        for (DateRange bucket : period.buckets()) {
            List<MonthRow> rows = inBucket(now, bucket);
            builder.point(bucket.from(), bucket.to(), values("income", sum(rows, MonthRow::income), "net", sum(rows, MonthRow::net)));
        }
        return builder.build();
    }

    private MetricResult accrualVsCash(List<MonthRow> now) {
        return MetricResult.of(MetricKey.FINANCE_ACCRUAL_VS_CASH)
                .status(hasData(now) ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(now.size())
                .figure("accrual_net", Unit.PAISE, sum(now, MonthRow::net), null)
                .figure("cash_net", Unit.PAISE, sum(now, MonthRow::cashNet), null)
                .figure("billed", Unit.PAISE, sum(now, MonthRow::billedPaise), null)
                .figure("collected", Unit.PAISE, sum(now, MonthRow::collectedPaise), null)
                .build();
    }

    /**
     * Worked out month by month, then averaged (the owner's rule, 2026-09-26).
     * In each month: income per bed = money collected from tenants ÷ beds
     * occupied, cost per bed = expenses ÷ the same beds. Beds occupied is the
     * month's average, bed-days ÷ days, so a bed taken for half the month counts
     * as half. A month before the property joined, or with no bed occupied, has
     * no per-bed figure and is left out of the average. Stays count to each
     * month's end, as the P&L projects the current month.
     */
    private MetricResult perBed(UUID p, ResolvedPeriod period, List<MonthRow> now, List<MonthRow> before) {
        List<BedMonth> months = bedMonths(p, now, period.dataSince());
        List<BedMonth> earlier = hasData(before) ? bedMonths(p, before, period.dataSince()) : List.of();
        long income = average(months, BedMonth::income);
        long cost = average(months, BedMonth::cost);
        Long previousIncome = earlier.isEmpty() ? null : average(earlier, BedMonth::income);
        Long previousCost = earlier.isEmpty() ? null : average(earlier, BedMonth::cost);
        MetricResult.Builder builder = MetricResult.of(MetricKey.FINANCE_PER_BED)
                .status(!months.isEmpty() && hasData(now) ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(months.stream().mapToLong(BedMonth::bedDays).sum())
                .figure("income_per_bed", Unit.PAISE, income, previousIncome)
                .figure("expense_per_bed", Unit.PAISE, cost, previousCost)
                .figure("profit_per_bed", Unit.PAISE, income - cost, earlier.isEmpty() ? null : previousIncome - previousCost)
                .figure("months", Unit.COUNT, months.size(), null)
                .figure("occupied_bed_days", Unit.DAYS, months.stream().mapToLong(BedMonth::bedDays).sum(), null)
                .figure("days", Unit.DAYS, months.stream().mapToLong(BedMonth::days).sum(), null)
                .seriesUnit(Unit.PAISE);
        // A bucket longer than a month (quarters, years) averages its months the
        // same way the headline does. A bucket with no occupied bed sends no
        // values, so the line breaks there instead of dropping to zero.
        for (DateRange bucket : period.buckets()) {
            YearMonth first = YearMonth.from(bucket.from());
            YearMonth last = YearMonth.from(bucket.to());
            List<BedMonth> inBucket = months.stream().filter(m -> !m.month().isBefore(first) && !m.month().isAfter(last)).toList();
            Map<String, Long> values = new LinkedHashMap<>();
            if (!inBucket.isEmpty()) {
                long bucketIncome = average(inBucket, BedMonth::income);
                long bucketCost = average(inBucket, BedMonth::cost);
                values.put("income_per_bed", bucketIncome);
                values.put("expense_per_bed", bucketCost);
                values.put("profit_per_bed", bucketIncome - bucketCost);
            }
            builder.point(bucket.from(), bucket.to(), values);
        }
        return builder.build();
    }

    /** One month's money per occupied bed. */
    private record BedMonth(YearMonth month, double income, double cost, long bedDays, long days) {}

    /** The months that had a bed occupied, each worked out on its own; the rest are left out. */
    private List<BedMonth> bedMonths(UUID p, List<MonthRow> rows, LocalDate dataSince) {
        List<BedMonth> out = new ArrayList<>();
        for (MonthRow row : rows) {
            LocalDate from = row.month().atDay(1).isBefore(dataSince) ? dataSince : row.month().atDay(1);
            LocalDate to = row.month().atEndOfMonth();
            if (from.isAfter(to)) {
                continue;
            }
            long bedDays = tenancy.occupiedBedDays(p, from, to);
            if (bedDays <= 0) {
                continue;
            }
            long days = ChronoUnit.DAYS.between(from, to) + 1;
            double beds = (double) bedDays / days;
            out.add(new BedMonth(row.month(), row.collectedPaise() / beds, row.expensePaise() / beds, bedDays, days));
        }
        return out;
    }

    private static long average(List<BedMonth> months, ToDoubleFunction<BedMonth> field) {
        return Math.round(months.stream().mapToDouble(field).average().orElse(0));
    }

    /** A category's part key: its name in lower case, or SALARY_ESTIMATED for the P&L's projected salary line. */
    private static String categoryKey(String name) {
        return name.equals(ExpenseAnalytics.PROJECTED_SALARY) ? SALARY_ESTIMATED : name.toLowerCase(Locale.ROOT);
    }

    /** The owner's own categories: the top four by name, the rest folded into OTHER, each with its previous value. */
    private MetricResult categories(UUID p, ResolvedPeriod period) {
        List<ExpenseAnalytics.NamedAmount> rows = expenses.spendByCategory(p, monthsStart(period.range()), monthsEnd(period.range()));
        Map<String, Long> previous = null;
        if (period.hasComparison()) {
            previous = new HashMap<>();
            for (ExpenseAnalytics.NamedAmount row : expenses.spendByCategory(p, monthsStart(period.comparison()), monthsEnd(period.comparison()))) {
                previous.merge(categoryKey(row.name()), row.amountPaise(), Long::sum);
            }
        }
        MetricResult.Builder builder = MetricResult.of(MetricKey.FINANCE_EXPENSE_CATEGORIES).partUnit(Unit.PAISE);
        long otherAmount = 0;
        long otherItems = 0;
        long items = 0;
        long previousOfTop = 0;
        for (int i = 0; i < rows.size(); i++) {
            ExpenseAnalytics.NamedAmount row = rows.get(i);
            items += row.items();
            if (i < TOP_CATEGORIES) {
                String key = categoryKey(row.name());
                Long before = previous == null ? null : previous.getOrDefault(key, 0L);
                previousOfTop += before == null ? 0 : before;
                // The estimated salary is the system's line, not a name the owner typed: code only, the app names it.
                builder.part(key, key.equals(SALARY_ESTIMATED) ? null : row.name(), row.amountPaise(), (long) row.items());
                builder.figure(key, Unit.PAISE, row.amountPaise(), before);
            } else {
                otherAmount += row.amountPaise();
                otherItems += row.items();
            }
        }
        if (rows.size() > TOP_CATEGORIES) {
            Long before = previous == null ? null : previous.values().stream().mapToLong(Long::longValue).sum() - previousOfTop;
            builder.part("OTHER", null, otherAmount, otherItems);
            builder.figure("OTHER", Unit.PAISE, otherAmount, before);
        }
        return builder.sampleSize(items).status(rows.isEmpty() ? MetricStatus.NO_DATA : MetricStatus.OK).build();
    }

    /** Months that start inside the range and end inside it; the current month counts month-to-date. */
    private MetricResult budget(UUID p, DateRange range, LocalDate today) {
        YearMonth current = YearMonth.from(today);
        MetricResult.Builder builder = MetricResult.of(MetricKey.FINANCE_BUDGET_VS_ACTUAL).seriesUnit(Unit.PAISE);
        int counted = 0;
        int withBudget = 0;
        int over = 0;
        for (YearMonth m = YearMonth.from(range.from()); !m.isAfter(YearMonth.from(range.to())); m = m.plusMonths(1)) {
            boolean startsInside = !m.atDay(1).isBefore(range.from());
            boolean complete = !m.atEndOfMonth().isAfter(range.to());
            if (!startsInside || !(complete || m.equals(current))) {
                continue;
            }
            ExpenseAnalytics.MonthBudget month = expenses.budget(p, m);
            Map<String, Long> values = new LinkedHashMap<>();
            values.put("spent", month.spentPaise());
            if (month.budgetPaise() != null) {
                values.put("budget", month.budgetPaise());
                withBudget++;
                if (month.spentPaise() > month.budgetPaise()) {
                    over++;
                }
            }
            builder.point(m.atDay(1), complete ? m.atEndOfMonth() : range.to(), values);
            counted++;
        }
        return builder
                .figure("months_over", Unit.COUNT, over, null)
                .figure("months_with_budget", Unit.COUNT, withBudget, null)
                .sampleSize(counted)
                .status(counted == 0 ? MetricStatus.NO_DATA : MetricStatus.OK)
                .build();
    }

    /** A fixed cost line: the estimated salary (key only, the app names it) or a recurring payee (the name the owner typed). */
    private record FixedLine(String key, String label, long amountPaise, Long items) {}

    /**
     * Over the same months as every other Finance card. Fixed is the recurring
     * expenses recorded plus the estimated salary, as the P&L counts it (salary
     * is fixed, the owner's rule). Variable is the rest of the P&L's expense
     * total, so the two always add up to the Expenses on Income and expenses.
     */
    private MetricResult fixedVsVariable(UUID p, DateRange range, List<MonthRow> now) {
        ExpenseAnalytics.FixedSpend spend = expenses.fixedSpend(p, monthsStart(range), monthsEnd(range));
        long fixed = spend.totalPaise();
        long variable = sum(now, MonthRow::expensePaise) - fixed;
        List<FixedLine> lines = new ArrayList<>();
        if (spend.salaryEstimatedPaise() != 0) {
            lines.add(new FixedLine(SALARY_ESTIMATED, null, spend.salaryEstimatedPaise(), null));
        }
        spend.recurring().forEach(row -> lines.add(new FixedLine(row.name().toLowerCase(Locale.ROOT), row.name(), row.amountPaise(), (long) row.items())));
        lines.sort(Comparator.comparingLong(FixedLine::amountPaise).reversed());
        MetricResult.Builder builder = MetricResult.of(MetricKey.FINANCE_FIXED_VS_VARIABLE)
                .figure("fixed", Unit.PAISE, fixed, null)
                .figure("variable", Unit.PAISE, variable, null)
                .partUnit(Unit.PAISE)
                .sampleSize(lines.size());
        long other = 0;
        for (int i = 0; i < lines.size(); i++) {
            FixedLine line = lines.get(i);
            if (i < TOP_FIXED_LINES) {
                builder.part(line.key(), line.label(), line.amountPaise(), line.items());
            } else {
                other += line.amountPaise();
            }
        }
        if (lines.size() > TOP_FIXED_LINES) {
            builder.part("OTHER", null, other, null);
        }
        return builder.status(fixed == 0 && variable == 0 ? MetricStatus.NO_DATA : MetricStatus.OK).build();
    }

    /** Names the owner typed (payees, income sources): the top five, the rest folded into OTHER. */
    private MetricResult named(MetricKey key, List<ExpenseAnalytics.NamedAmount> rows) {
        MetricResult.Builder builder = MetricResult.of(key).partUnit(Unit.PAISE);
        long otherAmount = 0;
        long otherItems = 0;
        long items = 0;
        for (int i = 0; i < rows.size(); i++) {
            ExpenseAnalytics.NamedAmount row = rows.get(i);
            items += row.items();
            if (i < TOP_NAMES) {
                builder.part(row.name().toLowerCase(Locale.ROOT), row.name(), row.amountPaise(), (long) row.items());
            } else {
                otherAmount += row.amountPaise();
                otherItems += row.items();
            }
        }
        if (rows.size() > TOP_NAMES) {
            builder.part("OTHER", null, otherAmount, otherItems);
        }
        return builder.sampleSize(items).status(rows.isEmpty() ? MetricStatus.NO_DATA : MetricStatus.OK).build();
    }

    private MetricResult deposits(UUID p) {
        BillingAnalytics.Deposits deposits = billing.deposits(p);
        boolean any = deposits.heldAccounts() > 0 || deposits.awaitingSettlementAccounts() > 0;
        return MetricResult.of(MetricKey.FINANCE_DEPOSITS)
                .status(any ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(deposits.heldAccounts() + deposits.awaitingSettlementAccounts())
                .figure("held", Unit.PAISE, deposits.heldPaise(), null)
                .figure("held_accounts", Unit.COUNT, deposits.heldAccounts(), null)
                .figure("awaiting", Unit.PAISE, deposits.awaitingSettlementPaise(), null)
                .figure("awaiting_accounts", Unit.COUNT, deposits.awaitingSettlementAccounts(), null)
                .build();
    }

    private static <T> Supplier<T> memo(Supplier<T> source) {
        return new Supplier<>() {
            private boolean done;
            private T value;

            @Override
            public T get() {
                if (!done) {
                    value = source.get();
                    done = true;
                }
                return value;
            }
        };
    }
}
