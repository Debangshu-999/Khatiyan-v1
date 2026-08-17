package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * These assert PROPERTIES, not the formula.
 *
 * <p>The existing billing tests build fixtures with
 * {@code periodStart.plusMonths(1).minusDays(1)} — the very expression under
 * test — so they would have passed just as happily while the dates were wrong.
 * That is why the anchor drift survived to production. Everything here is
 * phrased as something that must be true of a rent schedule: no gaps, no
 * overlaps, and the tenant's day is honoured whenever the month is long enough.
 */
class MonthlyCycleDatesTest {

    private static List<LocalDate> schedule(LocalDate firstStart, int months) {
        int anchor = MonthlyCycleDates.anchorDayOf(firstStart);
        List<LocalDate> starts = new ArrayList<>();
        LocalDate current = firstStart;
        for (int index = 0; index < months; index++) {
            starts.add(current);
            current = MonthlyCycleDates.nextStartAfter(current, anchor);
        }
        return starts;
    }

    @Test
    @DisplayName("a 31st tenancy returns to the 31st after February instead of drifting")
    void anchorRecoversAfterAShortMonth() {
        assertThat(schedule(LocalDate.of(2026, 1, 31), 5)).containsExactly(
                LocalDate.of(2026, 1, 31),
                LocalDate.of(2026, 2, 28),
                LocalDate.of(2026, 3, 31),
                LocalDate.of(2026, 4, 30),
                LocalDate.of(2026, 5, 31));
    }

    @Test
    @DisplayName("February is 29 in a leap year without any leap-specific handling")
    void leapFebruaryIsHandledByMonthLength() {
        assertThat(schedule(LocalDate.of(2024, 1, 31), 3)).containsExactly(
                LocalDate.of(2024, 1, 31),
                LocalDate.of(2024, 2, 29),
                LocalDate.of(2024, 3, 31));
    }

    @Test
    @DisplayName("a 29th tenancy sits on 29 Feb in a leap year and clamps in a common one")
    void twentyNinthAnchorAcrossLeapAndCommonYears() {
        assertThat(MonthlyCycleDates.startIn(YearMonth.of(2024, 2), 29)).isEqualTo(LocalDate.of(2024, 2, 29));
        assertThat(MonthlyCycleDates.startIn(YearMonth.of(2026, 2), 29)).isEqualTo(LocalDate.of(2026, 2, 28));
    }

    @ParameterizedTest(name = "anchor {0}: consecutive cycles leave no gap and no overlap")
    @ValueSource(ints = {1, 5, 15, 28, 29, 30, 31})
    void cyclesAreContiguousForEveryAnchor(int anchorDay) {
        LocalDate first = MonthlyCycleDates.startIn(YearMonth.of(2026, 1), anchorDay);
        List<LocalDate> starts = schedule(first, 26);

        for (int index = 0; index < starts.size() - 1; index++) {
            LocalDate start = starts.get(index);
            LocalDate end = MonthlyCycleDates.endOfCycleStartingOn(start, anchorDay);
            LocalDate nextStart = starts.get(index + 1);

            assertThat(end)
                    .as("cycle starting %s must end the day before %s", start, nextStart)
                    .isEqualTo(nextStart.minusDays(1));
            assertThat(end).as("a cycle cannot end before it starts").isAfterOrEqualTo(start);
        }
    }

    @ParameterizedTest(name = "anchor {0}: every month bills on the tenant's day when it exists")
    @ValueSource(ints = {1, 15, 28, 29, 30, 31})
    void theAnchorDayIsHonouredWheneverTheMonthIsLongEnough(int anchorDay) {
        LocalDate first = MonthlyCycleDates.startIn(YearMonth.of(2026, 1), anchorDay);

        for (LocalDate start : schedule(first, 26)) {
            int lengthOfMonth = YearMonth.from(start).lengthOfMonth();
            int expected = Math.min(anchorDay, lengthOfMonth);
            assertThat(start.getDayOfMonth())
                    .as("%s should bill on day %d", start, expected)
                    .isEqualTo(expected);
        }
    }

    @Test
    @DisplayName("chaining plusMonths would drift; anchoring does not")
    void anchoringBeatsChaining() {
        LocalDate start = LocalDate.of(2026, 1, 31);
        int anchor = MonthlyCycleDates.anchorDayOf(start);

        LocalDate chained = start;
        LocalDate anchored = start;
        for (int index = 0; index < 3; index++) {
            chained = chained.plusMonths(1);
            anchored = MonthlyCycleDates.nextStartAfter(anchored, anchor);
        }

        assertThat(chained).isEqualTo(LocalDate.of(2026, 4, 28));
        assertThat(anchored).isEqualTo(LocalDate.of(2026, 4, 30));
    }

    @Test
    @DisplayName("the anchor comes from the tenancy start date, unclamped")
    void anchorIsTheRawStartDay() {
        assertThat(MonthlyCycleDates.anchorDayOf(LocalDate.of(2026, 1, 31))).isEqualTo(31);
        assertThat(MonthlyCycleDates.anchorDayOf(LocalDate.of(2026, 2, 28))).isEqualTo(28);
    }
}
