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

    /** Twice, then the property has to move it. */
    @Test
    void theProspectMovesItTwiceAndNoMore() {
        Visit visit = visit();

        visit.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM);
        assertThat(visit.tenantReschedulesLeft()).isEqualTo(1);
        visit.moveByTenant(SUNDAY.plusDays(2), FOUR_PM, FIVE_PM);
        assertThat(visit.tenantReschedulesLeft()).isZero();

        assertThatThrownBy(() -> visit.moveByTenant(SUNDAY.plusDays(3), FOUR_PM, FIVE_PM))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("moved this visit twice");
        assertThat(visit.getVisitDate()).isEqualTo(SUNDAY.plusDays(2));
    }

    /** The property's moves are not counted, and are still possible after the prospect's two. */
    @Test
    void theHandlerMovesItWithoutUsingTheProspectsTwo() {
        Visit visit = visit();
        visit.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM);
        visit.moveByTenant(SUNDAY.plusDays(2), FOUR_PM, FIVE_PM);

        visit.moveByHandler(SUNDAY.plusDays(5), LocalTime.of(10, 0), LocalTime.of(11, 0));
        visit.moveByHandler(SUNDAY.plusDays(6), LocalTime.of(10, 0), LocalTime.of(11, 0));

        assertThat(visit.getVisitDate()).isEqualTo(SUNDAY.plusDays(6));
        assertThat(visit.getSlotStart()).isEqualTo(LocalTime.of(10, 0));
        assertThat(visit.tenantReschedulesLeft()).isZero();
    }
}
