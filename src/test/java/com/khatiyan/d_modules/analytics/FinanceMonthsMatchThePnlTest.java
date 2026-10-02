package com.khatiyan.d_modules.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;
import com.khatiyan.d_modules.billing.api.dto.BillingMonthSummary;
import com.khatiyan.d_modules.expense.analytics.ExpenseAnalytics;
import com.khatiyan.support.IntegrationTest;

/**
 * Finance must never disagree with the P&L screen.
 *
 * <p>It used to be safe by construction: Finance called the P&L's own month
 * summary, once per month. That cost a summary for every month in the period,
 * so past months now come from two span queries ({@code monthBilling},
 * {@code monthTotalsBetween}) that restate the summary's rules in SQL.
 *
 * <p>Restated rules drift. This puts a year of realistic bills in front of both
 * and requires the same answer for every month: paid, unpaid, overdue and
 * cancelled bills, one-off bills, late fees, discounts, expenses and income.
 * Change how the P&L counts a month and this fails until the span query follows.
 */
@IntegrationTest
class FinanceMonthsMatchThePnlTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BillingModule billingModule;
    @Autowired private BillingAnalytics billing;
    @Autowired private ExpenseAnalytics expenses;

    @Test
    void everyMonthOfAYearEqualsThePnlsOwnFigures() {
        LocalDate today = LocalDate.now(IST);
        Seeded seeded = LargePropertySeeder.seed(jdbc, today, 20, 1, 7L);
        try {
            YearMonth first = YearMonth.from(seeded.registeredOn());
            YearMonth current = YearMonth.from(today);
            Map<YearMonth, BillingAnalytics.MonthBilling> months = billing.monthBilling(seeded.propertyId(), first, current);
            Map<YearMonth, ExpenseAnalytics.MonthTotals> totals = expenses.monthTotalsBetween(seeded.propertyId(), first, current);

            int monthsWithBills = 0;
            // Past months only: the current one carries projected rent, and Finance
            // still takes that from the summary itself.
            for (YearMonth month = first; month.isBefore(current); month = month.plusMonths(1)) {
                BillingMonthSummary summary = billingModule.getPropertyMonthSummaryForDashboard(seeded.propertyId(), month.toString());
                BillingAnalytics.MonthBilling mine = months.get(month);

                assertThat(mine != null && mine.bills() > 0).as("has bills, %s", month).isEqualTo(summary.hasData());
                assertThat(mine == null ? 0 : mine.billedPaise())
                        .as("billed, %s", month)
                        .isEqualTo(summary.rentBilledPaise() + summary.oneOffBilledPaise());
                assertThat(mine == null ? 0 : mine.collectedPaise()).as("collected, %s", month).isEqualTo(summary.collectedPaise());
                if (mine != null) {
                    monthsWithBills++;
                }
            }
            // The comparison means nothing if the seed left the months empty.
            assertThat(monthsWithBills).isGreaterThanOrEqualTo(9);

            for (YearMonth month = first; !month.isAfter(current); month = month.plusMonths(1)) {
                assertThat(totals.get(month)).as("income and expenses, %s", month).isEqualTo(expenses.monthTotals(seeded.propertyId(), month));
            }
        } finally {
            LargePropertySeeder.remove(jdbc, seeded);
        }
    }
}
