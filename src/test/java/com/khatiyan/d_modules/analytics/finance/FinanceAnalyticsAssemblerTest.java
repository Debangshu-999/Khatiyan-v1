package com.khatiyan.d_modules.analytics.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.analytics.metric.AnalyticsContext;
import com.khatiyan.d_modules.analytics.metric.Figure;
import com.khatiyan.d_modules.analytics.metric.MetricKey;
import com.khatiyan.d_modules.analytics.metric.MetricResult;
import com.khatiyan.d_modules.analytics.metric.MetricStatus;
import com.khatiyan.d_modules.analytics.metric.Part;
import com.khatiyan.d_modules.analytics.period.AnalyticsPeriodResolver;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;
import com.khatiyan.d_modules.billing.api.dto.BillingMonthSummary;
import com.khatiyan.d_modules.expense.analytics.ExpenseAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics;

class FinanceAnalyticsAssemblerTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);
    private static final LocalDate LONG_AGO = LocalDate.of(2025, 1, 1);
    private final UUID property = UUID.randomUUID();

    private BillingModule billingModule;
    private BillingAnalytics billing;
    private ExpenseAnalytics expenses;
    private TenancyAnalytics tenancy;
    private FinanceAnalyticsAssembler assembler;

    @BeforeEach
    void setUp() {
        billingModule = mock(BillingModule.class);
        billing = mock(BillingAnalytics.class);
        expenses = mock(ExpenseAnalytics.class);
        tenancy = mock(TenancyAnalytics.class);
        assembler = new FinanceAnalyticsAssembler(billingModule, billing, expenses, tenancy);
        // Every month: ₹100 billed (₹80 collected), ₹10 manual income, ₹60 spent.
        when(billingModule.getPropertyMonthSummaryForDashboard(eq(property), anyString()))
                .thenAnswer(call -> month(call.getArgument(1), 10000, 8000));
        when(expenses.monthTotals(eq(property), any())).thenReturn(new ExpenseAnalytics.MonthTotals(1000, 6000));
    }

    private static BillingMonthSummary month(String month, long billed, long collected) {
        return new BillingMonthSummary(month, true, 1, 0, 0, 1, 0, billed, collected, 0, 0, 0, 1, billed, 0, 0);
    }

    private AnalyticsContext context(PeriodPreset preset, LocalDate dataSince, MetricKey key) {
        return new AnalyticsContext(property, AnalyticsPeriodResolver.resolve(preset, null, null, TODAY, dataSince), TODAY, EnumSet.of(key));
    }

    private MetricResult only(List<MetricResult> results) {
        assertThat(results).hasSize(1);
        return results.get(0);
    }

    private static Figure figure(MetricResult metric, String key) {
        return metric.figures().stream().filter(f -> f.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void incomeAndExpensesSumTheProfitAndLossMonthsIntoBucketsAndCompare() {
        MetricResult result = only(assembler.assemble(context(PeriodPreset.LAST_3_MONTHS, LONG_AGO, MetricKey.FINANCE_INCOME_VS_EXPENSES)));
        assertThat(figure(result, "income").value()).isEqualTo(33000);
        assertThat(figure(result, "expenses").value()).isEqualTo(18000);
        assertThat(figure(result, "net").value()).isEqualTo(15000);
        assertThat(figure(result, "net").previous()).isEqualTo(15000);
        assertThat(result.series()).hasSize(3);
        assertThat(result.series().get(0).values()).containsEntry("income", 11000L).containsEntry("net", 5000L);
    }

    @Test
    void aOneMonthPeriodIsOneBucket() {
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.FINANCE_PROFIT_MARGIN)));
        assertThat(result.series()).hasSize(1);
        assertThat(figure(result, "income").value()).isEqualTo(11000);
    }

    @Test
    void accrualAndCashProfitDifferByWhatIsStillUncollected() {
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.FINANCE_ACCRUAL_VS_CASH)));
        assertThat(figure(result, "accrual_net").value()).isEqualTo(5000);
        assertThat(figure(result, "cash_net").value()).isEqualTo(3000);
    }

    @Test
    void perBedDividesWhatWasCollectedAndSpentByTheBedsOccupied() {
        // 150 bed-days over 30 days is 5 beds. Income is the ₹80 collected, not the ₹100 billed or the manual ₹10.
        when(tenancy.occupiedBedDays(property, LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30))).thenReturn(150L);
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.FINANCE_PER_BED)));
        assertThat(figure(result, "income_per_bed").value()).isEqualTo(1600);
        assertThat(figure(result, "expense_per_bed").value()).isEqualTo(1200);
        assertThat(figure(result, "profit_per_bed").value()).isEqualTo(400);
        assertThat(figure(result, "months").value()).isEqualTo(1);
        assertThat(figure(result, "days").value()).isEqualTo(30);
    }

    @Test
    void perBedOverSeveralMonthsAveragesEachMonthsOwnFigure() {
        // July has 5 beds (₹16 a bed), August 10 (₹8 a bed), September none, so it is left out.
        when(tenancy.occupiedBedDays(property, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31))).thenReturn(155L);
        when(tenancy.occupiedBedDays(property, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31))).thenReturn(310L);
        MetricResult result = only(assembler.assemble(context(PeriodPreset.LAST_3_MONTHS, LONG_AGO, MetricKey.FINANCE_PER_BED)));
        assertThat(figure(result, "income_per_bed").value()).isEqualTo(1200);
        assertThat(figure(result, "expense_per_bed").value()).isEqualTo(900);
        assertThat(figure(result, "profit_per_bed").value()).isEqualTo(300);
        assertThat(figure(result, "months").value()).isEqualTo(2);
        // Month by month for the line. September had no bed, so it sends nothing and the line breaks.
        assertThat(result.series()).hasSize(3);
        assertThat(result.series().get(0).values()).containsEntry("income_per_bed", 1600L).containsEntry("expense_per_bed", 1200L).containsEntry("profit_per_bed", 400L);
        assertThat(result.series().get(1).values()).containsEntry("income_per_bed", 800L);
        assertThat(result.series().get(2).values()).isEmpty();
    }

    @Test
    void perBedThisMonthIsComparedWithLastMonthsOwnFigure() {
        when(tenancy.occupiedBedDays(property, LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30))).thenReturn(150L);
        when(tenancy.occupiedBedDays(property, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31))).thenReturn(310L);
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.FINANCE_PER_BED)));
        assertThat(figure(result, "income_per_bed").previous()).isEqualTo(800);
        assertThat(figure(result, "expense_per_bed").previous()).isEqualTo(600);
        assertThat(figure(result, "profit_per_bed").previous()).isEqualTo(200);
    }

    @Test
    void perBedCountsTheJoiningMonthFromTheDayThePropertyJoined() {
        // Joined 16 Aug: 80 bed-days over 16 days is 5 beds, not 80 ÷ 31.
        when(tenancy.occupiedBedDays(property, LocalDate.of(2026, 8, 16), LocalDate.of(2026, 8, 31))).thenReturn(80L);
        MetricResult result = only(assembler.assemble(context(PeriodPreset.LAST_MONTH, LocalDate.of(2026, 8, 16), MetricKey.FINANCE_PER_BED)));
        assertThat(figure(result, "income_per_bed").value()).isEqualTo(1600);
        assertThat(figure(result, "days").value()).isEqualTo(16);
    }

    @Test
    void categoriesKeepTheOwnersTopFourAndFoldTheRest() {
        when(expenses.spendByCategory(eq(property), any(), any())).thenReturn(List.of(
                new ExpenseAnalytics.NamedAmount("Cooking", 46000, 3),
                new ExpenseAnalytics.NamedAmount("Deposit payout", 27000, 3),
                new ExpenseAnalytics.NamedAmount("Utilities", 8000, 1),
                new ExpenseAnalytics.NamedAmount("Maintenance", 5000, 5),
                new ExpenseAnalytics.NamedAmount("Keys", 300, 1),
                new ExpenseAnalytics.NamedAmount("Other", 200, 2)));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.FINANCE_EXPENSE_CATEGORIES)));
        assertThat(result.parts()).extracting(Part::key).containsExactly("cooking", "deposit payout", "utilities", "maintenance", "OTHER");
        assertThat(result.parts().get(4).value()).isEqualTo(500);
        assertThat(result.parts().get(0).label()).isEqualTo("Cooking");
        assertThat(figure(result, "cooking").previous()).isEqualTo(46000);
    }

    @Test
    void theEstimatedSalaryCategoryIsSentAsACodeNotItsText() {
        when(expenses.spendByCategory(eq(property), any(), any())).thenReturn(List.of(
                new ExpenseAnalytics.NamedAmount(ExpenseAnalytics.PROJECTED_SALARY, 37885, 0),
                new ExpenseAnalytics.NamedAmount("Utilities", 8000, 1)));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.FINANCE_EXPENSE_CATEGORIES)));
        assertThat(result.parts()).extracting(Part::key).containsExactly("SALARY_ESTIMATED", "utilities");
        assertThat(result.parts().get(0).label()).isNull();
        assertThat(result.parts().get(1).label()).isEqualTo("Utilities");
    }

    @Test
    void budgetCountsWholeMonthsAndTheCurrentMonthSoFar() {
        when(expenses.budget(property, YearMonth.of(2026, 7))).thenReturn(new ExpenseAnalytics.MonthBudget(5000L, 6000));
        when(expenses.budget(property, YearMonth.of(2026, 8))).thenReturn(new ExpenseAnalytics.MonthBudget(5000L, 4000));
        when(expenses.budget(property, YearMonth.of(2026, 9))).thenReturn(new ExpenseAnalytics.MonthBudget(null, 1000));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.LAST_3_MONTHS, LONG_AGO, MetricKey.FINANCE_BUDGET_VS_ACTUAL)));
        assertThat(result.series()).hasSize(3);
        assertThat(figure(result, "months_over").value()).isEqualTo(1);
        assertThat(figure(result, "months_with_budget").value()).isEqualTo(2);
        assertThat(result.series().get(2).values()).containsOnlyKeys("spent");
    }

    @Test
    void fixedIsRecurringPlusEstimatedSalaryAndVariableIsTheRestOfTheExpenses() {
        // Jul–Sep spent ₹60 a month, ₹180 in all. ₹32 of it was recurring payees and the estimated salary.
        when(expenses.fixedSpend(property, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 9, 30))).thenReturn(new ExpenseAnalytics.FixedSpend(List.of(
                new ExpenseAnalytics.NamedAmount("Ramesh Stores", 1500, 3),
                new ExpenseAnalytics.NamedAmount("Cleaner", 900, 3),
                new ExpenseAnalytics.NamedAmount("Internet", 400, 3),
                new ExpenseAnalytics.NamedAmount("Water", 300, 3)), 800));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.LAST_3_MONTHS, LONG_AGO, MetricKey.FINANCE_FIXED_VS_VARIABLE)));
        assertThat(figure(result, "fixed").value()).isEqualTo(3900);
        assertThat(figure(result, "variable").value()).isEqualTo(14100);
        // The three largest fixed lines, the rest folded into OTHER. The salary line carries no typed name.
        assertThat(result.parts()).extracting(Part::key).containsExactly("ramesh stores", "cleaner", "SALARY_ESTIMATED", "OTHER");
        assertThat(result.parts().get(2).label()).isNull();
        assertThat(result.parts().get(3).value()).isEqualTo(700);
    }

    @Test
    void fixedAndVariableFollowAOneMonthPeriod() {
        when(expenses.fixedSpend(property, LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30)))
                .thenReturn(new ExpenseAnalytics.FixedSpend(List.of(), 2500));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.FINANCE_FIXED_VS_VARIABLE)));
        assertThat(figure(result, "fixed").value()).isEqualTo(2500);
        assertThat(figure(result, "variable").value()).isEqualTo(3500);
        assertThat(result.parts()).extracting(Part::key).containsExactly("SALARY_ESTIMATED");
    }

    @Test
    void oneFailingQueryTakesOnlyItsOwnCardDown() {
        when(expenses.payees(eq(property), any(), any())).thenThrow(new IllegalStateException("boom"));
        when(billing.deposits(property)).thenReturn(new BillingAnalytics.Deposits(4000000, 5, 0, 0));
        AnalyticsContext context = new AnalyticsContext(property,
                AnalyticsPeriodResolver.resolve(PeriodPreset.THIS_MONTH, null, null, TODAY, LONG_AGO), TODAY,
                EnumSet.of(MetricKey.FINANCE_TOP_PAYEES, MetricKey.FINANCE_DEPOSITS));
        List<MetricResult> results = assembler.assemble(context);
        assertThat(results).extracting(MetricResult::key).containsExactly("finance.deposits", "finance.top_payees");
        assertThat(results).extracting(MetricResult::status).containsExactly(MetricStatus.OK, MetricStatus.UNAVAILABLE);
    }
}
