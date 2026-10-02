package com.khatiyan.d_modules.analytics;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.analytics.service.AnalyticsService;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.dashboard.service.ActivityEventService;
import com.khatiyan.d_modules.dashboard.service.OwnerDashboardService;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.expense.ExpenseModule;
import com.khatiyan.d_modules.expense.analytics.ExpenseAnalytics;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.staff.StaffModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.support.IntegrationTest;

/**
 * How long each dashboard takes on a large property (ROADMAP P2.5.a).
 *
 * <p>The target is p95 under 300 ms per section on a 150-bed property three
 * years old. This builds that property in the throwaway test database, calls
 * each section the way its controller does, and writes the timings to
 * {@code target/dashboard-speed.md}.
 *
 * <p><b>It measures, it does not judge.</b> Nothing here fails on a slow number:
 * a container on a laptop is not the production database, and a red build over
 * a machine having a busy minute teaches nobody anything. Read the report.
 *
 * <p>Off unless asked for, because it writes some forty thousand rows:
 *
 * <pre>mvn -o surefire:test -Dtest=DashboardSpeedTest -Dkhatiyan.perf=true</pre>
 *
 * <p>{@code -Dkhatiyan.perf.beds} and {@code -Dkhatiyan.perf.years} change the
 * size, to see how a section grows.
 */
@IntegrationTest
@EnabledIfSystemProperty(named = "khatiyan.perf", matches = "true")
class DashboardSpeedTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final int WARM_UP_RUNS = 5;
    private static final int TIMED_RUNS = 30;
    private static final double TARGET_MS = 300;

    private static final PeriodPreset[] PERIODS = {
            PeriodPreset.THIS_MONTH, PeriodPreset.LAST_MONTH, PeriodPreset.LAST_3_MONTHS,
            PeriodPreset.LAST_6_MONTHS, PeriodPreset.CURRENT_FY, PeriodPreset.ALL_TIME };
    private static final AnalyticsDivision[] DIVISIONS = {
            AnalyticsDivision.BILLING, AnalyticsDivision.FINANCE, AnalyticsDivision.TENANTS };

    @Autowired private JdbcTemplate jdbc;
    @Autowired private AnalyticsService analytics;
    @Autowired private OwnerDashboardService actionCentre;
    // The parts the two heaviest sections are made of, timed on their own so a
    // slow section names its cause.
    @Autowired private PropertyModule propertyModule;
    @Autowired private TenancyModule tenancyModule;
    @Autowired private BillingModule billingModule;
    @Autowired private ConcernModule concernModule;
    @Autowired private EnquiryModule enquiryModule;
    @Autowired private StaffModule staffModule;
    @Autowired private ExpenseModule expenseModule;
    @Autowired private ExpenseAnalytics expenseAnalytics;
    @Autowired private ActivityEventService activityEvents;

    private record Timing(String section, double p50, double p95, double max) {
    }

    @Test
    void timesEveryDashboardSectionOnALargeProperty() throws IOException {
        int beds = Integer.getInteger("khatiyan.perf.beds", 150);
        int years = Integer.getInteger("khatiyan.perf.years", 3);
        LocalDate today = LocalDate.now(IST);

        long seedStart = System.nanoTime();
        Seeded seeded = LargePropertySeeder.seed(jdbc, today, beds, years, 20261002L);
        double seedSeconds = (System.nanoTime() - seedStart) / 1e9;
        try {
            // A database that has been running has statistics. One filled a second
            // ago has none, and would be timed on plans nobody would ever get.
            jdbc.execute("ANALYZE");

            List<Timing> timings = new ArrayList<>();
            timings.add(time("Home action centre",
                    () -> actionCentre.getPropertyActionCenter(seeded.ownerId(), seeded.propertyId())));
            for (AnalyticsDivision division : DIVISIONS) {
                for (PeriodPreset period : PERIODS) {
                    timings.add(time(label(division) + ", " + label(period), () -> analytics.divisionAnalytics(
                            seeded.ownerId(), seeded.propertyId(), division, period, null, null)));
                }
            }

            String report = report(seeded, beds, years, seedSeconds, timings) + parts(seeded, today);
            Files.createDirectories(Path.of("target"));
            Files.writeString(Path.of("target", "dashboard-speed.md"), report);
            System.out.println(report);
        } finally {
            LargePropertySeeder.remove(jdbc, seeded);
        }
    }

    /** Each call the Home action centre and one Finance month are made of, so a slow section names its cause. */
    private String parts(Seeded seeded, LocalDate today) {
        var owner = seeded.ownerId();
        var property = seeded.propertyId();
        LocalDate monthStart = today.withDayOfMonth(1);
        String thisMonth = YearMonth.from(today).toString();
        YearMonth lastMonth = YearMonth.from(today).minusMonths(1);

        List<Timing> home = new ArrayList<>();
        home.add(time("rooms", () -> propertyModule.listRooms(owner, property)));
        home.add(time("live stays", () -> tenancyModule.findActiveByPropertyId(property)));
        home.add(time("stays ended since last month", () -> tenancyModule.findInactiveEndedOnOrAfter(property, monthStart.minusMonths(1))));
        home.add(time("live exit requests", () -> tenancyModule.listOpenPropertyExitRequests(owner, property)));
        home.add(time("pending room change requests", () -> tenancyModule.listPendingPropertyRoomChangeRequests(owner, property)));
        home.add(time("billing summary", () -> billingModule.getPropertyBillingSummaryForDashboard(property)));
        home.add(time("billing, last month and this", () -> billingModule.getPropertyDashboardMonths(property, monthStart)));
        home.add(time("concern summary", () -> concernModule.getPropertyConcernSummary(owner, property)));
        home.add(time("deposits to settle", () -> billingModule.countPropertyDepositsPendingSettlement(property)));
        home.add(time("payment claims", () -> billingModule.getPaymentIntentDigestForDashboard(property)));
        home.add(time("new enquiries", () -> enquiryModule.countNewForProperty(property)));
        home.add(time("salaries due", () -> staffModule.countSalaryPaymentDue(property, today)));
        home.add(time("budget", () -> expenseModule.budgetSnapshot(property, monthStart)));
        home.add(time("blocked bookings", () -> tenancyModule.findBlockedBookings(property)));
        home.add(time("activity feed", () -> activityEvents.listRecent(property, 10)));

        List<Timing> finance = new ArrayList<>();
        finance.add(time("billing summary, a past month",
                () -> billingModule.getPropertyMonthSummaryForDashboard(property, lastMonth.toString())));
        finance.add(time("billing summary, this month",
                () -> billingModule.getPropertyMonthSummaryForDashboard(property, thisMonth)));
        finance.add(time("income and expense totals, one month", () -> expenseAnalytics.monthTotals(property, lastMonth)));

        StringBuilder out = new StringBuilder();
        table(out, "Home action centre, by part", home);
        table(out, "Finance, one month's parts", finance);
        return out.toString();
    }

    private static void table(StringBuilder out, String title, List<Timing> timings) {
        out.append(String.format(Locale.ROOT, "%n## %s%n%n| Part | p50 ms | p95 ms |%n|---|---:|---:|%n", title));
        for (Timing timing : timings) {
            out.append(String.format(Locale.ROOT, "| %s | %.1f | %.1f |%n", timing.section(), timing.p50(), timing.p95()));
        }
    }

    private static Timing time(String section, Runnable call) {
        for (int run = 0; run < WARM_UP_RUNS; run++) {
            call.run();
        }
        double[] millis = new double[TIMED_RUNS];
        for (int run = 0; run < TIMED_RUNS; run++) {
            long start = System.nanoTime();
            call.run();
            millis[run] = (System.nanoTime() - start) / 1e6;
        }
        Arrays.sort(millis);
        return new Timing(section, percentile(millis, 0.50), percentile(millis, 0.95), millis[millis.length - 1]);
    }

    /** Nearest rank, on an array already sorted. */
    private static double percentile(double[] sorted, double fraction) {
        int rank = (int) Math.ceil(fraction * sorted.length);
        return sorted[Math.max(0, Math.min(sorted.length - 1, rank - 1))];
    }

    private static String report(Seeded seeded, int beds, int years, double seedSeconds, List<Timing> timings) {
        StringBuilder out = new StringBuilder();
        out.append("# Dashboard speed\n\n");
        out.append(String.format(Locale.ROOT,
                "Property: %d beds in %d rooms, joined %s (%d years). Seeded in %.1f s.%n%n",
                beds, seeded.rooms(), seeded.registeredOn(), years, seedSeconds));
        out.append(String.format(Locale.ROOT,
                "Rows: %d stays (%d live), %d bills, %d bill lines, %d payments, %d expenses, %d concerns, "
                        + "%d exit requests, %d activity events.%n%n",
                seeded.stays(), seeded.liveStays(), seeded.bills(), seeded.lineItems(), seeded.payments(),
                seeded.expenses(), seeded.concerns(), seeded.exitRequests(), seeded.activityEvents()));
        out.append(String.format(Locale.ROOT, "Each section: %d warm-up calls, then %d timed. Target p95: %.0f ms.%n%n",
                WARM_UP_RUNS, TIMED_RUNS, TARGET_MS));
        out.append("| Section | p50 ms | p95 ms | max ms | Target |\n|---|---:|---:|---:|---|\n");
        for (Timing timing : timings) {
            out.append(String.format(Locale.ROOT, "| %s | %.0f | %.0f | %.0f | %s |%n",
                    timing.section(), timing.p50(), timing.p95(), timing.max(),
                    timing.p95() <= TARGET_MS ? "met" : "MISSED"));
        }
        return out.toString();
    }

    private static String label(Enum<?> value) {
        String text = value.name().toLowerCase(Locale.ROOT).replace('_', ' ');
        return Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }
}
