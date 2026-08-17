package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins the anchored date rule against the rows that actually exist.
 *
 * <p>The expected values below are not computed — they were read out of
 * {@code billing.billing_cycles} for every ACTIVE tenancy on 2026-08-10, before
 * the anchor fix landed. The point is to prove the new rule <b>reproduces
 * history</b> for everyone currently being billed: if reconstructing a schedule
 * from nothing but {@code start_date} yields the stored dates, then the change
 * cannot silently re-date a live tenant's rent.
 *
 * <p>All four are anchored on days 5, 7, 12 and 14, so none of them can clamp —
 * which is exactly why no backfill was needed. That is a fact about today's
 * data, not a permanent property, so these fixtures are a snapshot: if a
 * tenancy anchored on the 29th–31st becomes active, its schedule diverges from
 * what the old code would have produced, and that divergence is the fix
 * working. Do not "repair" this test by regenerating the expectations from the
 * code under test — that is how the original bug stayed invisible.
 */
class MonthlyCycleDatesLiveDataTest {

    /** A tenancy as observed in the database, with its stored cycle boundaries. */
    private record ObservedTenancy(String referenceCode, LocalDate startDate, List<LocalDate[]> cycles) {
    }

    private static ObservedTenancy observed(String referenceCode, String startDate, String... boundaries) {
        List<LocalDate[]> cycles = new java.util.ArrayList<>();
        for (String boundary : boundaries) {
            String[] parts = boundary.split("\\.\\.");
            cycles.add(new LocalDate[] {LocalDate.parse(parts[0]), LocalDate.parse(parts[1])});
        }
        return new ObservedTenancy(referenceCode, LocalDate.parse(startDate), cycles);
    }

    private static final List<ObservedTenancy> ACTIVE_TENANCIES = List.of(
            observed("TEN-2026-000033", "2026-06-05",
                    "2026-06-05..2026-07-04", "2026-07-05..2026-08-04", "2026-08-05..2026-09-04"),
            observed("TEN-2026-000055", "2026-06-07",
                    "2026-06-07..2026-07-06", "2026-07-07..2026-08-06", "2026-08-07..2026-09-06"),
            observed("TEN-2026-000062", "2026-06-12",
                    "2026-06-12..2026-07-11", "2026-07-12..2026-08-11", "2026-08-12..2026-09-11"),
            observed("TEN-2026-000064", "2026-06-14",
                    "2026-06-14..2026-07-13", "2026-07-14..2026-08-13", "2026-08-14..2026-09-13"));

    @Test
    @DisplayName("every stored cycle of every active tenancy is reproduced from its start date alone")
    void theAnchoredRuleReproducesLiveRows() {
        for (ObservedTenancy tenancy : ACTIVE_TENANCIES) {
            int anchorDay = MonthlyCycleDates.anchorDayOf(tenancy.startDate());
            LocalDate periodStart = tenancy.startDate();

            for (int index = 0; index < tenancy.cycles().size(); index++) {
                LocalDate[] stored = tenancy.cycles().get(index);
                int cycleNumber = index + 1;

                assertThat(periodStart)
                        .as("%s cycle %d start", tenancy.referenceCode(), cycleNumber)
                        .isEqualTo(stored[0]);
                assertThat(MonthlyCycleDates.endOfCycleStartingOn(periodStart, anchorDay))
                        .as("%s cycle %d end", tenancy.referenceCode(), cycleNumber)
                        .isEqualTo(stored[1]);

                periodStart = MonthlyCycleDates.nextStartAfter(periodStart, anchorDay);
            }
        }
    }

    @Test
    @DisplayName("the next cycle generated for each active tenancy continues its stored schedule")
    void theNextGeneratedCycleIsContiguousWithStoredHistory() {
        for (ObservedTenancy tenancy : ACTIVE_TENANCIES) {
            int anchorDay = MonthlyCycleDates.anchorDayOf(tenancy.startDate());
            LocalDate[] lastStored = tenancy.cycles().get(tenancy.cycles().size() - 1);

            LocalDate nextStart = MonthlyCycleDates.nextStartAfter(lastStored[0], anchorDay);

            assertThat(nextStart)
                    .as("%s: the next cycle must open the day after the last stored one closed",
                            tenancy.referenceCode())
                    .isEqualTo(lastStored[1].plusDays(1));
        }
    }

    @Test
    @DisplayName("no active tenancy is anchored on a day that can clamp, so no backfill is owed")
    void noActiveTenancyCanClamp() {
        for (ObservedTenancy tenancy : ACTIVE_TENANCIES) {
            assertThat(MonthlyCycleDates.anchorDayOf(tenancy.startDate()))
                    .as("%s anchor day — a value >= 29 would mean stored rows need repair",
                            tenancy.referenceCode())
                    .isLessThanOrEqualTo(28);
        }
    }
}
