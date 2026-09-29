package com.khatiyan.d_modules.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.expense.analytics.ExpenseAnalytics;
import com.khatiyan.d_modules.expense.analytics.ExpenseAnalytics.NamedAmount;
import com.khatiyan.support.IntegrationTest;

@IntegrationTest
@Transactional
class ExpenseAnalyticsQueriesTest {

    private static final LocalDate JUL = LocalDate.of(2026, 7, 1);
    private static final LocalDate AUG_END = LocalDate.of(2026, 8, 31);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ExpenseAnalytics expenses;

    private AnalyticsFixtures fx;
    private UUID p;
    private UUID other;
    private UUID cooking;
    private UUID repairs;

    @BeforeEach
    void seed() {
        fx = new AnalyticsFixtures(jdbc);
        p = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
        other = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
        cooking = fx.expenseCategory(p, "Cooking");
        repairs = fx.expenseCategory(p, "Repairs");
    }

    @Test
    void spendNetsReversalsAndGroupsByTheOwnersCategories() {
        fx.expense(p, cooking, "Ramesh Stores", 800000, LocalDate.of(2026, 7, 5), "RECURRING", null);
        fx.expense(p, cooking, "Ramesh Stores", 800000, LocalDate.of(2026, 8, 5), "RECURRING", null);
        UUID mistake = fx.expense(p, repairs, "Electrician", 300000, LocalDate.of(2026, 8, 9), "MANUAL", null);
        fx.expense(p, repairs, "Electrician", -300000, LocalDate.of(2026, 8, 10), "REVERSAL", mistake);
        fx.expense(p, repairs, "Plumber", 150000, LocalDate.of(2026, 8, 12), "MANUAL", null);
        fx.expense(p, repairs, "Plumber", 999999, LocalDate.of(2026, 9, 2), "MANUAL", null);
        fx.expense(other, fx.expenseCategory(other, "Cooking"), "Elsewhere", 777777, LocalDate.of(2026, 7, 5), "MANUAL", null);

        assertThat(expenses.spendByCategory(p, JUL, AUG_END)).containsExactly(
                new NamedAmount("Cooking", 1600000, 2),
                new NamedAmount("Repairs", 150000, 2));
        assertThat(expenses.payees(p, JUL, AUG_END)).containsExactly(
                new NamedAmount("Ramesh Stores", 1600000, 2),
                new NamedAmount("Plumber", 150000, 1));
    }

    @Test
    void fixedSpendIsRecurringByPayeeNetOfItsReversals() {
        UUID july = fx.expense(p, cooking, "Ramesh Stores", 800000, LocalDate.of(2026, 7, 5), "RECURRING", null);
        fx.expense(p, cooking, "Ramesh Stores", 800000, LocalDate.of(2026, 8, 5), "RECURRING", null);
        fx.expense(p, cooking, "Ramesh Stores", -800000, LocalDate.of(2026, 8, 6), "REVERSAL", july);
        fx.expense(p, repairs, "Water", 200000, LocalDate.of(2026, 7, 7), "RECURRING", null);
        // Neither is fixed: a one-off and a deposit payout.
        fx.expense(p, repairs, "Plumber", 150000, LocalDate.of(2026, 7, 12), "MANUAL", null);
        fx.expense(p, repairs, "Deposit payout", 70000, LocalDate.of(2026, 7, 20), "AUTO", null);

        ExpenseAnalytics.FixedSpend spend = expenses.fixedSpend(p, JUL, AUG_END);
        assertThat(spend.recurring()).containsExactly(
                new NamedAmount("Ramesh Stores", 800000, 2),
                new NamedAmount("Water", 200000, 1));
        // Past months carry no salary: the P&L only estimates the current month.
        assertThat(spend.salaryEstimatedPaise()).isZero();
        assertThat(spend.totalPaise()).isEqualTo(1000000);
    }

    @Test
    void incomeGroupsBySource() {
        fx.income(p, "Laundry", 20000, LocalDate.of(2026, 7, 3), "MANUAL");
        fx.income(p, "laundry ", 10000, LocalDate.of(2026, 8, 3), "MANUAL");
        fx.income(p, "Parking", 5000, LocalDate.of(2026, 8, 4), "MANUAL");
        fx.income(p, "Parking", -5000, LocalDate.of(2026, 8, 5), "REVERSAL");

        assertThat(expenses.incomeBySource(p, JUL, AUG_END)).containsExactly(new NamedAmount("Laundry", 30000, 2));
    }

    @Test
    void monthTotalsAreTheSameFiguresTheProfitAndLossScreenUses() {
        fx.expense(p, cooking, "Ramesh Stores", 800000, LocalDate.of(2026, 7, 5), "MANUAL", null);
        fx.income(p, "Laundry", 20000, LocalDate.of(2026, 7, 3), "MANUAL");

        assertThat(expenses.monthTotals(p, YearMonth.of(2026, 7)))
                .isEqualTo(new ExpenseAnalytics.MonthTotals(20000, 800000));
    }
}
