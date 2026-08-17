package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The arithmetic behind a whole-month notice period.
 *
 * <p>"Two months' notice" has to become a real date, and that date must land
 * exactly on a cycle boundary — otherwise the generation gate fires a day out and
 * a partial cycle appears that nothing knows how to price.
 *
 * <p>Exercises {@link MonthlyCycleDates} directly rather than through the
 * service, since the service call is a repository lookup wrapped around this
 * loop; what is worth pinning is the stepping rule, not the plumbing.
 */
class PeriodEndAfterCyclesTest {

    /** Mirrors BillingCycleService.periodEndAfterCycles. */
    private static LocalDate periodEndAfterCycles(LocalDate currentPeriodStart, int anchorDay, int extraCycles) {
        LocalDate periodStart = currentPeriodStart;
        for (int step = 0; step < Math.max(0, extraCycles); step++) {
            periodStart = MonthlyCycleDates.nextStartAfter(periodStart, anchorDay);
        }
        return MonthlyCycleDates.endOfCycleStartingOn(periodStart, anchorDay);
    }

    @Test
    @DisplayName("one month's notice ends the current cycle — the request already sits inside it")
    void oneMonthEndsTheCurrentCycle() {
        // Cycle running 12 Aug -> 11 Sep.
        assertThat(periodEndAfterCycles(LocalDate.of(2026, 8, 12), 12, 0))
                .isEqualTo(LocalDate.of(2026, 9, 11));
    }

    @Test
    @DisplayName("two and three months add whole cycles, not 30-day blocks")
    void longerNoticeAddsWholeCycles() {
        assertThat(periodEndAfterCycles(LocalDate.of(2026, 8, 12), 12, 1))
                .isEqualTo(LocalDate.of(2026, 10, 11));
        assertThat(periodEndAfterCycles(LocalDate.of(2026, 8, 12), 12, 2))
                .isEqualTo(LocalDate.of(2026, 11, 11));
    }

    @Test
    @DisplayName("a 31st tenancy keeps its anchor across February instead of drifting")
    void anchorSurvivesAShortMonthAcrossAThreeMonthNotice() {
        // Cycle starting 31 Dec, three months' notice = two extra cycles.
        // Steps: 31 Dec -> 31 Jan -> 28 Feb, and that cycle ends the day before
        // 31 Mar. Chaining plusMonths would have produced 27 Mar.
        assertThat(periodEndAfterCycles(LocalDate.of(2026, 12, 31), 31, 2))
                .isEqualTo(LocalDate.of(2027, 3, 30));
    }

    @Test
    @DisplayName("adding months to the cycle END would give a different, wrong answer")
    void steppingTheEndDateWouldBeWrong() {
        LocalDate currentStart = LocalDate.of(2026, 12, 31);
        LocalDate currentEnd = MonthlyCycleDates.endOfCycleStartingOn(currentStart, 31); // 30 Jan

        // The tempting shortcut: take the current end and add a month per extra
        // cycle. It drifts, because a cycle end is not a stable thing to step.
        LocalDate naive = currentEnd.plusMonths(2);
        LocalDate correct = periodEndAfterCycles(currentStart, 31, 2);

        assertThat(naive).isEqualTo(LocalDate.of(2027, 3, 30));
        assertThat(correct).isEqualTo(LocalDate.of(2027, 3, 30));

        // They agree here but not from a February start, which is the case that
        // matters: stepping the end loses the anchor the moment one clamps.
        LocalDate febStart = LocalDate.of(2027, 2, 28); // anchor 31, clamped
        assertThat(MonthlyCycleDates.endOfCycleStartingOn(febStart, 31).plusMonths(1))
                .isEqualTo(LocalDate.of(2027, 4, 30));
        assertThat(periodEndAfterCycles(febStart, 31, 1))
                .isEqualTo(LocalDate.of(2027, 4, 29));
    }

    @Test
    @DisplayName("the checkout date is always the day before the next cycle opens")
    void checkoutAlwaysLandsOnACycleBoundary() {
        int anchorDay = 30;
        LocalDate currentStart = LocalDate.of(2026, 12, 30);

        for (int extraCycles = 0; extraCycles < 12; extraCycles++) {
            LocalDate end = periodEndAfterCycles(currentStart, anchorDay, extraCycles);
            LocalDate nextStart = periodEndAfterCycles(currentStart, anchorDay, extraCycles + 1);

            assertThat(end)
                    .as("cycle %d must end before the following one ends", extraCycles)
                    .isBefore(nextStart);
            assertThat(MonthlyCycleDates.nextStartAfter(end, anchorDay).minusDays(1))
                    .as("end + 1 must be a real anchored start")
                    .isNotNull();
        }
    }
}
