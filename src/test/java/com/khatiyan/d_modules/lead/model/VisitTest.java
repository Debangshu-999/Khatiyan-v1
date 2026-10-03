package com.khatiyan.d_modules.lead.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/** A visit's own rules: where it sits, and who may move it how often. */
class VisitTest {

    private static final LocalDate SUNDAY = LocalDate.of(2026, 10, 4);
    private static final LocalTime FOUR_PM = LocalTime.of(16, 0);
    private static final LocalTime FIVE_PM = LocalTime.of(17, 0);

    private static Visit visit() {
        return Visit.schedule(
                "VIS-2026-000001", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                SUNDAY, FOUR_PM, FIVE_PM, VisitBookedBy.TENANT, UUID.randomUUID());
    }

    @Test
    void keepsTheSlotItWasBookedInto() {
        Visit visit = visit();

        assertThat(visit.isLive()).isTrue();
        assertThat(visit.getVisitDate()).isEqualTo(SUNDAY);
        assertThat(visit.getSlotStart()).isEqualTo(FOUR_PM);
        assertThat(visit.getSlotEnd()).isEqualTo(FIVE_PM);
        assertThat(visit.isIn(SUNDAY, FOUR_PM)).isTrue();
        assertThat(visit.isIn(SUNDAY.plusDays(1), FOUR_PM)).isFalse();
    }

    /** A visit whose date has passed still says scheduled until it is reviewed. It is not one to turn up to. */
    @Test
    void isUpcomingOnlyUntilItsDateHasPassed() {
        Visit visit = visit();

        assertThat(visit.isUpcoming(SUNDAY.minusDays(1))).isTrue();
        assertThat(visit.isUpcoming(SUNDAY)).isTrue();
        assertThat(visit.isUpcoming(SUNDAY.plusDays(1))).isFalse();
        assertThat(visit.isLive()).isTrue();
    }

    /** Before the day, and after it was missed. Never on the day itself. */
    @Test
    void canBeMovedBeforeItsDayAndAfterItWasMissedButNotOnTheDay() {
        Visit visit = visit();

        assertThat(visit.canBeMoved(SUNDAY.minusDays(1))).as("the day before").isTrue();
        assertThat(visit.canBeMoved(SUNDAY)).as("on the day").isFalse();
        assertThat(visit.canBeMoved(SUNDAY.plusDays(1))).as("after it was missed").isTrue();
        assertThat(visit.isMissed(SUNDAY)).isFalse();
        assertThat(visit.isMissed(SUNDAY.plusDays(1))).isTrue();
    }

    /** Twice before its date, then the property has to move it. */
    @Test
    void theProspectMovesItTwiceBeforeItsDate() {
        Visit visit = visit();
        LocalDate before = SUNDAY.minusDays(3);

        visit.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, before);
        assertThat(visit.tenantReschedulesLeft(before)).isEqualTo(1);
        visit.moveByTenant(SUNDAY.plusDays(2), FOUR_PM, FIVE_PM, before);
        assertThat(visit.tenantReschedulesLeft(before)).isZero();

        assertThatThrownBy(() -> visit.moveByTenant(SUNDAY.plusDays(3), FOUR_PM, FIVE_PM, before))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("rescheduled this visit twice");
        assertThat(visit.getVisitDate()).isEqualTo(SUNDAY.plusDays(2));
    }

    /**
     * And twice more once it was missed, on a count of its own, so neither
     * kind of move goes on for ever (owner's rule, 2026-10-03).
     */
    @Test
    void theProspectMovesAMissedVisitTwiceMoreOnItsOwnCount() {
        Visit visit = visit();
        LocalDate before = SUNDAY.minusDays(3);
        visit.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, before);
        visit.moveByTenant(SUNDAY.plusDays(2), FOUR_PM, FIVE_PM, before);

        // Missed: the before-date count is used up, the after-miss one is not.
        LocalDate missed = SUNDAY.plusDays(3);
        assertThat(visit.isMissed(missed)).isTrue();
        assertThat(visit.tenantReschedulesLeft(missed)).isEqualTo(2);
        visit.moveByTenant(SUNDAY.plusDays(5), FOUR_PM, FIVE_PM, missed);

        // Before its new date, the before-date count applies again, and it is used up.
        assertThat(visit.tenantReschedulesLeft(SUNDAY.plusDays(4))).isZero();

        LocalDate missedAgain = SUNDAY.plusDays(6);
        assertThat(visit.tenantReschedulesLeft(missedAgain)).isEqualTo(1);
        visit.moveByTenant(SUNDAY.plusDays(8), FOUR_PM, FIVE_PM, missedAgain);

        LocalDate missedThird = SUNDAY.plusDays(9);
        assertThat(visit.tenantReschedulesLeft(missedThird)).isZero();
        assertThatThrownBy(() -> visit.moveByTenant(SUNDAY.plusDays(11), FOUR_PM, FIVE_PM, missedThird))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("missed visit twice");
    }

    /** A rebooking after the tenant cancelled starts where the cancelled visit left off. */
    @Test
    void aRebookingCarriesTheTenantsCountsFromTheVisitTheyCancelled() {
        Visit cancelled = visit();
        LocalDate before = SUNDAY.minusDays(3);
        cancelled.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, before);
        cancelled.cancel(VisitBookedBy.TENANT, java.time.Instant.parse("2026-10-03T06:00:00Z"), "Plans changed");
        assertThat(cancelled.getStatus()).isEqualTo(VisitStatus.CANCELLED);
        assertThat(cancelled.getCancelledBy()).isEqualTo(VisitBookedBy.TENANT);

        Visit rebooked = visit();
        rebooked.carryTenantCountsFrom(cancelled);

        assertThat(rebooked.tenantReschedulesLeft(before)).isEqualTo(1);
    }

    /** The property's moves are not counted, and are still possible after the prospect's two. */
    @Test
    void theHandlerMovesItWithoutUsingTheProspectsTwo() {
        Visit visit = visit();
        LocalDate before = SUNDAY.minusDays(3);
        visit.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, before);
        visit.moveByTenant(SUNDAY.plusDays(2), FOUR_PM, FIVE_PM, before);

        visit.moveByHandler(SUNDAY.plusDays(5), LocalTime.of(10, 0), LocalTime.of(11, 0));
        visit.moveByHandler(SUNDAY.plusDays(6), LocalTime.of(10, 0), LocalTime.of(11, 0));

        assertThat(visit.getVisitDate()).isEqualTo(SUNDAY.plusDays(6));
        assertThat(visit.getSlotStart()).isEqualTo(LocalTime.of(10, 0));
        assertThat(visit.tenantReschedulesLeft(before)).isZero();
    }
}
