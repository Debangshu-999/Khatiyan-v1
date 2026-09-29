package com.khatiyan.d_modules.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.billing.analytics.BillingAnalytics;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics.AgeingBucket;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics.CategoryTotal;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics.LabelTotal;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics.MethodTotal;
import com.khatiyan.d_modules.billing.analytics.BillingAnalytics.StatusCount;
import com.khatiyan.support.IntegrationTest;

@IntegrationTest
@Transactional
class BillingAnalyticsQueriesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);
    private static final LocalDate JUL = LocalDate.of(2026, 7, 1);
    private static final LocalDate AUG = LocalDate.of(2026, 8, 1);
    private static final LocalDate SEP = LocalDate.of(2026, 9, 1);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BillingAnalytics billing;

    private AnalyticsFixtures fx;
    private UUID p;
    private UUID other;

    @BeforeEach
    void seed() {
        fx = new AnalyticsFixtures(jdbc);
        p = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
        other = fx.property(Instant.parse("2026-01-01T00:00:00Z"));
    }

    @Test
    void duesSplitByHowSoonTheyFallDue() {
        fx.cycle(p, "OVERDUE", "RENT_CYCLE", SEP, LocalDate.of(2026, 9, 10), 3, 5000, 0, 0, null);
        fx.cycle(p, "UNPAID", "RENT_CYCLE", SEP, TODAY, 3, 3000, 0, 0, null);
        fx.cycle(p, "UNPAID", "RENT_CYCLE", SEP, LocalDate.of(2026, 9, 24), 3, 1000, 0, 0, null);
        fx.cycle(p, "UPCOMING", "RENT_CYCLE", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1), 3, 2000, 0, 0, null);
        fx.cycle(p, "UPCOMING", "RENT_CYCLE", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 10), 3, 4000, 0, 0, null);
        fx.cycle(p, "PAID", "RENT_CYCLE", SEP, SEP, 3, 9000, 0, 0, Instant.parse("2026-09-02T05:00:00Z"));
        fx.cycle(other, "OVERDUE", "RENT_CYCLE", SEP, SEP, 3, 7000, 0, 0, null);

        assertThat(billing.dues(p, TODAY)).isEqualTo(new BillingAnalytics.DuesBreakdown(5000, 4000, 2000, 4000, 5));
    }

    @Test
    void overdueBillsAgeByDaysPastTheirDueDate() {
        fx.cycle(p, "OVERDUE", "RENT_CYCLE", SEP, LocalDate.of(2026, 9, 20), 0, 1000, 0, 0, null);
        fx.cycle(p, "OVERDUE", "RENT_CYCLE", SEP, LocalDate.of(2026, 9, 1), 0, 2000, 0, 0, null);
        fx.cycle(p, "OVERDUE", "RENT_CYCLE", JUL, LocalDate.of(2026, 7, 1), 0, 3000, 0, 0, null);

        assertThat(billing.overdueAgeing(p, TODAY)).containsExactlyInAnyOrder(
                new AgeingBucket("D1_7", 1000, 1),
                new AgeingBucket("D16_30", 2000, 1),
                new AgeingBucket("D60_PLUS", 3000, 1));
    }

    @Test
    void statusCategoryFeesAndReasonsFollowTheBillsMonth() {
        UUID oneOff = fx.cycle(p, "PAID", "ONE_OFF", JUL, JUL, 0, 1800, 0, 0, Instant.parse("2026-07-01T06:00:00Z"));
        fx.extraCharge(p, oneOff, "Electricity", 1000, "ADDED");
        fx.extraCharge(p, oneOff, "electricity ", 500, "ADDED");
        fx.extraCharge(p, oneOff, "Laundry", 300, "ADDED");
        fx.extraCharge(p, oneOff, "Laundry", 999, "CANCELLED");
        fx.cycle(p, "UNPAID", "RENT_CYCLE", AUG, AUG, 0, 8000, 500, 0, null);
        fx.cycle(p, "OVERDUE", "RENT_CYCLE", AUG, AUG, 0, 8000, 0, 200, null);
        fx.cycle(p, "CANCELLED", "RENT_CYCLE", AUG, AUG, 0, 8000, 900, 900, null);
        fx.cycle(p, "PAID", "RENT_CYCLE", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 1), 0, 8000, 0, 0, Instant.parse("2026-06-01T06:00:00Z"));

        assertThat(billing.statusCounts(p, JUL, TODAY)).containsExactlyInAnyOrder(
                new StatusCount("PAID", 1), new StatusCount("UNPAID", 1), new StatusCount("OVERDUE", 1), new StatusCount("CANCELLED", 1));
        assertThat(billing.billedByCategory(p, JUL, TODAY)).containsExactlyInAnyOrder(
                new CategoryTotal("ONE_OFF", 1800, 1), new CategoryTotal("RENT_CYCLE", 16000, 2));
        assertThat(billing.oneOffReasons(p, JUL, TODAY)).containsExactly(
                new LabelTotal("Electricity", 1500, 2), new LabelTotal("Laundry", 300, 1));
        assertThat(billing.feesAndDiscounts(p, JUL, TODAY)).isEqualTo(new BillingAnalytics.FeesAndDiscounts(500, 1, 200, 1, 3));
    }

    @Test
    void paymentsCountByTheIstDayTheyWereMade() {
        UUID bill = fx.cycle(p, "PAID", "RENT_CYCLE", JUL, JUL, 0, 10000, 0, 0, Instant.parse("2026-07-01T06:00:00Z"));
        fx.payment(p, bill, "UPI", 6000, Instant.parse("2026-06-30T18:31:00Z"));
        fx.payment(p, bill, "CASH", 4000, Instant.parse("2026-07-10T10:00:00Z"));
        fx.payment(p, bill, "CASH", 999, Instant.parse("2026-06-30T18:29:00Z"));

        assertThat(billing.paymentsByMethod(p, JUL, TODAY)).containsExactlyInAnyOrder(
                new MethodTotal("UPI", 6000, 1), new MethodTotal("CASH", 4000, 1));
    }

    @Test
    void collectionCountsOnlyBillsThatHaveFallenDue() {
        UUID a = fx.cycle(p, "PAID", "RENT_CYCLE", JUL, JUL, 0, 10000, 0, 0, Instant.parse("2026-07-02T06:00:00Z"));
        fx.payment(p, a, "UPI", 10000, Instant.parse("2026-07-02T06:00:00Z"));
        UUID b = fx.cycle(p, "UNPAID", "RENT_CYCLE", AUG, AUG, 0, 5000, 0, 0, null);
        fx.payment(p, b, "CASH", 2000, Instant.parse("2026-08-03T06:00:00Z"));
        fx.cycle(p, "UPCOMING", "RENT_CYCLE", SEP, LocalDate.of(2026, 9, 30), 0, 7000, 0, 0, null);
        fx.cycle(p, "CANCELLED", "RENT_CYCLE", AUG, AUG, 0, 9000, 0, 0, null);
        // Paid before the payment log existed: PAID with no payment row. Still collected.
        fx.cycle(p, "PAID", "RENT_CYCLE", JUL, JUL, 0, 3000, 0, 0, Instant.parse("2026-07-01T06:00:00Z"));

        assertThat(billing.collection(p, JUL, TODAY, TODAY)).isEqualTo(new BillingAnalytics.CollectionTotals(18000, 15000, 3));
    }

    @Test
    void paidBillsWithNoPaymentRecordAreCountedSoTheModeCardCanSaySo() {
        fx.cycle(p, "PAID", "RENT_CYCLE", JUL, JUL, 0, 3000, 0, 0, Instant.parse("2026-07-01T06:00:00Z"));
        fx.cycle(p, "PAID", "RENT_CYCLE", JUL, JUL, 0, 2000, 0, 0, Instant.parse("2026-07-02T06:00:00Z"));
        UUID recorded = fx.cycle(p, "PAID", "RENT_CYCLE", JUL, JUL, 0, 9000, 0, 0, Instant.parse("2026-07-03T06:00:00Z"));
        fx.payment(p, recorded, "UPI", 9000, Instant.parse("2026-07-03T06:00:00Z"));
        fx.cycle(p, "PAID", "RENT_CYCLE", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 1), 0, 7000, 0, 0, Instant.parse("2026-06-02T06:00:00Z"));

        assertThat(billing.paidWithoutRecord(p, JUL, TODAY)).isEqualTo(new BillingAnalytics.Unrecorded(5000, 2));
    }

    /**
     * The due date is the LAST day of the payment window: the period start plus
     * the grace days, already. A bill cannot be paid before the window opens, so
     * there are two outcomes only. Grace used to be added a second time on top.
     */
    @Test
    void timelinessComparesTheIstPaidDayWithTheDueDate() {
        LocalDate due = LocalDate.of(2026, 7, 5);
        fx.cycle(p, "PAID", "RENT_CYCLE", JUL, due, 3, 1000, 0, 0, Instant.parse("2026-07-03T06:00:00Z"));
        fx.cycle(p, "PAID", "RENT_CYCLE", JUL, due, 3, 1000, 0, 0, Instant.parse("2026-07-05T06:00:00Z"));
        fx.cycle(p, "PAID", "RENT_CYCLE", JUL, due, 3, 1000, 0, 0, Instant.parse("2026-07-04T19:00:00Z"));
        fx.cycle(p, "PAID", "RENT_CYCLE", JUL, due, 3, 1000, 0, 0, Instant.parse("2026-07-05T19:00:00Z"));
        fx.cycle(p, "PAID", "RENT_CYCLE", JUL, due, 3, 1000, 0, 0, Instant.parse("2026-07-09T06:00:00Z"));
        // Rent only: a one-off bill never goes overdue and never carries a late fee.
        fx.cycle(p, "PAID", "ONE_OFF", JUL, due, 3, 1000, 0, 0, Instant.parse("2026-07-20T06:00:00Z"));

        // On the due day is on time. 19:00 UTC on 4 Jul is 00:30 IST on the 5th:
        // on time. 19:00 UTC on 5 Jul is 00:30 IST on the 6th: late.
        assertThat(billing.timeliness(p, JUL, TODAY)).isEqualTo(new BillingAnalytics.Timeliness(3, 2));
    }

    @Test
    void onlyTenantConfirmedClaimsWaitForTheOwner() {
        UUID first = fx.cycle(p, "CONFIRMATION_PENDING", "RENT_CYCLE", SEP, SEP, 0, 1000, 0, 0, null);
        UUID second = fx.cycle(p, "CONFIRMATION_PENDING", "RENT_CYCLE", SEP, SEP, 0, 2000, 0, 0, null);
        fx.paymentIntent(p, first, "TENANT_CONFIRMED", 1000);
        fx.paymentIntent(p, second, "TENANT_CONFIRMED", 2000);
        fx.paymentIntent(p, first, "OWNER_VERIFIED", 4000);

        assertThat(billing.pendingUpiClaims(p)).isEqualTo(new BillingAnalytics.PendingClaims(2, 3000));
    }
}
