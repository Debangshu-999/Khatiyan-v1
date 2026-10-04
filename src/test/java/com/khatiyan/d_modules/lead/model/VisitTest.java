package com.khatiyan.d_modules.lead.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * A visit's own rules: where it sits, who may move it and when, and how it is
 * checked in (user, 2026-10-04). The slot here is Sunday 4 to 5 pm, so half the
 * slot is 4:30, the pass opens at 3, and the property's last say is at 2.
 */
class VisitTest {

    private static final LocalDate SUNDAY = LocalDate.of(2026, 10, 4);
    private static final LocalTime FOUR_PM = LocalTime.of(16, 0);
    private static final LocalTime FIVE_PM = LocalTime.of(17, 0);
    private static final LocalTime SIX_PM = LocalTime.of(18, 0);
    private static final Instant AT = Instant.parse("2026-10-04T10:40:00Z");
    private static final LocalDateTime DAYS_BEFORE = SUNDAY.minusDays(3).atTime(10, 0);

    private static Visit visit() {
        return Visit.schedule(
                "VIS-2026-000001", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                SUNDAY, FOUR_PM, FIVE_PM, VisitBookedBy.TENANT, UUID.randomUUID());
    }

    private static LocalDateTime sunday(int hour, int minute) {
        return SUNDAY.atTime(hour, minute);
    }

    private static Visit visitOn(LocalDate date) {
        return Visit.schedule(
                "VIS-2026-000002", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                date, FOUR_PM, FIVE_PM, VisitBookedBy.TENANT, UUID.randomUUID());
    }

    /**
     * Moved on or after the day it was booked for: it did not happen when it
     * was due and was given a new time, which the enquiry's card says as
     * "Visit rescheduled" (user, 2026-10-04). A move made ahead of its day is
     * an ordinary change of plan. A move is stamped by the real clock, so the
     * dates here are counted from today.
     */
    @Test
    void aMoveOnOrAfterItsDayIsARescheduleOfAVisitThatWasDue() {
        ZoneId india = ZoneId.of("Asia/Kolkata");
        LocalDate today = LocalDate.now(india);

        Visit dueToday = visitOn(today);
        assertThat(dueToday.wasRescheduledOnOrAfterItsDay(india)).as("never moved").isFalse();
        dueToday.moveByTenant(today.plusDays(1), FOUR_PM, FIVE_PM, today.atTime(16, 40));
        assertThat(dueToday.wasRescheduledOnOrAfterItsDay(india)).isTrue();

        Visit ahead = visitOn(today.plusDays(5));
        ahead.moveByTenant(today.plusDays(6), FOUR_PM, FIVE_PM, today.atTime(10, 0));
        assertThat(ahead.wasRescheduledOnOrAfterItsDay(india)).isFalse();
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

    /** A visit whose date has passed is not one to turn up to, whatever its status still says. */
    @Test
    void isUpcomingOnlyUntilItsDateHasPassed() {
        Visit visit = visit();

        assertThat(visit.isUpcoming(SUNDAY.minusDays(1))).isTrue();
        assertThat(visit.isUpcoming(SUNDAY)).isTrue();
        assertThat(visit.isUpcoming(SUNDAY.plusDays(1))).isFalse();
        assertThat(visit.isMissed(SUNDAY)).isFalse();
        assertThat(visit.isMissed(SUNDAY.plusDays(1))).isTrue();
    }

    // ---- Who may change it, and when -------------------------------------

    /** The property moves or cancels it until two hours before the slot, and not after. */
    @Test
    void thePropertyMayChangeItUntilTwoHoursBeforeTheSlot() {
        Visit visit = visit();

        assertThat(visit.managementMayChange(DAYS_BEFORE)).isTrue();
        assertThat(visit.managementMayChange(sunday(13, 59))).isTrue();
        assertThat(visit.managementMayChange(sunday(14, 0))).isFalse();
        assertThat(visit.managementMayChange(sunday(16, 10))).isFalse();
        assertThat(visit.managementMayChange(SUNDAY.plusDays(1).atTime(9, 0))).as("missed").isFalse();
    }

    /** Inside the last two hours a move by the property is refused, not just hidden. */
    @Test
    void theHandlerCannotMoveItInsideTheLastTwoHours() {
        Visit visit = visit();

        assertThatThrownBy(() -> visit.moveByHandler(SUNDAY.plusDays(2), FOUR_PM, FIVE_PM, sunday(14, 30)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("two hours");
        assertThat(visit.getVisitDate()).isEqualTo(SUNDAY);
    }

    /** What the prospect may do follows the clock on the visit day. */
    @Test
    void theProspectsWindowFollowsTheClock() {
        Visit visit = visit();

        assertThat(visit.prospectWindow(DAYS_BEFORE)).isEqualTo(VisitWindow.BEFORE_DAY);
        assertThat(visit.prospectWindow(sunday(15, 59))).isEqualTo(VisitWindow.DAY_BEFORE_SLOT);
        assertThat(visit.prospectWindow(sunday(16, 0))).isEqualTo(VisitWindow.IN_SLOT);
        assertThat(visit.prospectWindow(sunday(16, 29))).isEqualTo(VisitWindow.IN_SLOT);
        // Half the slot gone and nobody checked them in: running late.
        assertThat(visit.prospectWindow(sunday(16, 30))).isEqualTo(VisitWindow.RUNNING_LATE);
        assertThat(visit.prospectWindow(sunday(22, 0))).isEqualTo(VisitWindow.RUNNING_LATE);
        assertThat(visit.prospectWindow(SUNDAY.plusDays(1).atTime(0, 5))).isEqualTo(VisitWindow.MISSED);
    }

    /** Twice before its day. Past that they are told so, and nothing moves. */
    @Test
    void theProspectMovesItTwiceBeforeItsDay() {
        Visit visit = visit();

        visit.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, DAYS_BEFORE);
        assertThat(visit.tenantReschedulesLeft(DAYS_BEFORE)).isEqualTo(1);
        visit.moveByTenant(SUNDAY.plusDays(2), FOUR_PM, FIVE_PM, DAYS_BEFORE);
        assertThat(visit.tenantReschedulesLeft(DAYS_BEFORE)).isZero();

        assertThatThrownBy(() -> visit.moveByTenant(SUNDAY.plusDays(3), FOUR_PM, FIVE_PM, DAYS_BEFORE))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("rescheduled this visit twice");
        assertThat(visit.getVisitDate()).isEqualTo(SUNDAY.plusDays(2));
    }

    /** On the day, before the slot starts: another slot that day is free, another day is one of the two. */
    @Test
    void aSlotChangeOnTheDayIsFreeAndAnotherDayIsCounted() {
        Visit visit = visit();

        visit.moveByTenant(SUNDAY, FIVE_PM, SIX_PM, sunday(10, 0));
        assertThat(visit.getSlotStart()).isEqualTo(FIVE_PM);
        assertThat(visit.getTenantReschedules()).isZero();

        visit.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, sunday(10, 5));
        assertThat(visit.getTenantReschedules()).isEqualTo(1);
        assertThat(visit.getTenantMissedReschedules()).isZero();
    }

    /**
     * Their slot having started does not hold them to it (user, 2026-10-04):
     * a later slot that day is free, and another day is one of their two.
     */
    @Test
    void onceTheSlotHasStartedItCanStillBeMoved() {
        Visit later = visit();
        later.moveByTenant(SUNDAY, FIVE_PM, SIX_PM, sunday(16, 10));
        assertThat(later.getSlotStart()).isEqualTo(FIVE_PM);
        assertThat(later.getTenantReschedules()).isZero();
        assertThat(later.getTenantMissedReschedules()).isZero();

        Visit anotherDay = visit();
        anotherDay.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, sunday(16, 10));
        assertThat(anotherDay.getTenantReschedules()).isEqualTo(1);
        assertThat(anotherDay.getTenantMissedReschedules()).isZero();
    }

    /**
     * Running late: a later slot the same day is free. Another day is a
     * genuine miss, and uses one of the two missed moves.
     */
    @Test
    void runningLateALaterSlotTodayIsFreeAndAnotherDayIsAMissedMove() {
        Visit later = visit();
        later.moveByTenant(SUNDAY, SIX_PM, LocalTime.of(19, 0), sunday(16, 40));
        assertThat(later.getSlotStart()).isEqualTo(SIX_PM);
        assertThat(later.getTenantReschedules()).isZero();
        assertThat(later.getTenantMissedReschedules()).isZero();

        Visit anotherDay = visit();
        assertThat(anotherDay.tenantReschedulesLeft(sunday(16, 40))).isEqualTo(2);
        anotherDay.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, sunday(16, 40));
        assertThat(anotherDay.getTenantMissedReschedules()).isEqualTo(1);
        assertThat(anotherDay.getTenantReschedules()).isZero();
    }

    /** A rebooking after the tenant cancelled starts where the cancelled visit left off. */
    @Test
    void aRebookingCarriesTheTenantsCountsFromTheVisitTheyCancelled() {
        Visit cancelled = visit();
        cancelled.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, DAYS_BEFORE);
        cancelled.cancel(VisitBookedBy.TENANT, Instant.parse("2026-10-03T06:00:00Z"), "Plans changed");
        assertThat(cancelled.getStatus()).isEqualTo(VisitStatus.CANCELLED);
        assertThat(cancelled.getCancelledBy()).isEqualTo(VisitBookedBy.TENANT);

        Visit rebooked = visit();
        rebooked.carryTenantCountsFrom(cancelled);

        assertThat(rebooked.tenantReschedulesLeft(DAYS_BEFORE)).isEqualTo(1);
    }

    /** The property's moves are not counted, and are still possible after the prospect's two. */
    @Test
    void theHandlerMovesItWithoutUsingTheProspectsTwo() {
        Visit visit = visit();
        visit.moveByTenant(SUNDAY.plusDays(1), FOUR_PM, FIVE_PM, DAYS_BEFORE);
        visit.moveByTenant(SUNDAY.plusDays(2), FOUR_PM, FIVE_PM, DAYS_BEFORE);

        visit.moveByHandler(SUNDAY.plusDays(5), LocalTime.of(10, 0), LocalTime.of(11, 0), DAYS_BEFORE);
        visit.moveByHandler(SUNDAY.plusDays(6), LocalTime.of(10, 0), LocalTime.of(11, 0), DAYS_BEFORE);

        assertThat(visit.getVisitDate()).isEqualTo(SUNDAY.plusDays(6));
        assertThat(visit.getSlotStart()).isEqualTo(LocalTime.of(10, 0));
        assertThat(visit.tenantReschedulesLeft(DAYS_BEFORE)).isZero();
    }

    // ---- The pass and checking in -----------------------------------------

    /**
     * The pass opens an hour before the slot and stays for the rest of that
     * day, the slot having ended or not (user, 2026-10-04). It is gone at
     * midnight.
     */
    @Test
    void thePassOpensAnHourBeforeTheSlotAndStaysForTheDay() {
        Visit visit = visit();

        assertThat(visit.isPassOpen(sunday(14, 59))).isFalse();
        assertThat(visit.isPassOpen(sunday(15, 0))).isTrue();
        assertThat(visit.isPassOpen(sunday(17, 0))).isTrue();
        assertThat(visit.isPassOpen(sunday(17, 1))).as("the slot has ended").isTrue();
        assertThat(visit.isPassOpen(sunday(23, 59))).isTrue();
        assertThat(visit.isPassOpen(SUNDAY.plusDays(1).atStartOfDay())).as("the day is over").isFalse();
        assertThat(visit.isPassOpen(SUNDAY.minusDays(1).atTime(16, 0))).isFalse();
    }

    /** A pass belongs to one slot. Moving the visit throws it away. */
    @Test
    void aMoveThrowsThePassAway() {
        Visit visit = visit();
        visit.issuePass("token-one", "482913");
        assertThat(visit.hasPass()).isTrue();

        visit.moveByTenant(SUNDAY, FIVE_PM, SIX_PM, sunday(10, 0));

        assertThat(visit.hasPass()).isFalse();
        assertThat(visit.getPassCode()).isNull();
    }

    /**
     * Checked in once, from the start of the slot until the day is over: a
     * visitor who turns up after their slot is still let in with their pass
     * (user, 2026-10-04). It records who, how, and whether they were late.
     */
    @Test
    void checkingInRecordsWhoHowAndWhetherTheyWereLate() {
        UUID atTheDoor = UUID.randomUUID();
        Visit onTime = visit();
        assertThat(onTime.isCheckInOpen(sunday(15, 59))).isFalse();
        assertThat(onTime.isCheckInOpen(sunday(16, 0))).isTrue();
        assertThat(onTime.isCheckInOpen(sunday(17, 0))).isTrue();
        assertThat(onTime.isCheckInOpen(sunday(17, 1))).as("the slot has ended").isTrue();
        assertThat(onTime.isCheckInOpen(sunday(23, 59))).isTrue();
        assertThat(onTime.isCheckInOpen(SUNDAY.plusDays(1).atStartOfDay())).as("the day is over").isFalse();
        assertThatThrownBy(() -> onTime.checkIn(atTheDoor, VisitCheckInMethod.QR, AT, sunday(15, 30)))
                .isInstanceOf(ValidationException.class);

        onTime.checkIn(atTheDoor, VisitCheckInMethod.QR, AT, sunday(16, 10));
        assertThat(onTime.getStatus()).isEqualTo(VisitStatus.VISITED);
        assertThat(onTime.getCheckedInByUserId()).isEqualTo(atTheDoor);
        assertThat(onTime.getCheckInMethod()).isEqualTo(VisitCheckInMethod.QR);
        assertThat(onTime.getCheckedInAt()).isEqualTo(AT);
        assertThat(onTime.getArrivedMinute()).isEqualTo(16 * 60 + 10);
        assertThat(onTime.arrivedLate()).isFalse();
        assertThatThrownBy(() -> onTime.checkIn(atTheDoor, VisitCheckInMethod.CODE, AT, sunday(16, 20)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already checked in");

        // Past half the slot is late.
        Visit late = visit();
        late.checkIn(atTheDoor, VisitCheckInMethod.CODE, AT, sunday(16, 45));
        assertThat(late.arrivedLate()).isTrue();

        // And so is turning up once the slot is over.
        Visit afterTheSlot = visit();
        afterTheSlot.checkIn(atTheDoor, VisitCheckInMethod.QR, AT, sunday(19, 30));
        assertThat(afterTheSlot.getStatus()).isEqualTo(VisitStatus.VISITED);
        assertThat(afterTheSlot.arrivedLate()).isTrue();

        Visit nextDay = visit();
        assertThatThrownBy(() -> nextDay.checkIn(
                atTheDoor, VisitCheckInMethod.QR, AT, SUNDAY.plusDays(1).atTime(9, 0)))
                .isInstanceOf(ValidationException.class);
    }

    /** Nobody scanned them: the owner marks it, after the slot and before midnight. */
    @Test
    void theOwnerMarksAMissedCheckInAfterTheSlotAndBeforeMidnight() {
        UUID owner = UUID.randomUUID();
        Visit visit = visit();

        assertThat(visit.isMissedCheckInOpen(sunday(16, 30))).isFalse();
        assertThat(visit.isMissedCheckInOpen(sunday(17, 1))).isTrue();
        assertThat(visit.isMissedCheckInOpen(sunday(23, 59))).isTrue();
        assertThat(visit.isMissedCheckInOpen(SUNDAY.plusDays(1).atTime(0, 1))).isFalse();
        assertThatThrownBy(() -> visit.markMissedCheckIn(owner, AT, sunday(16, 30)))
                .isInstanceOf(ValidationException.class);

        visit.markMissedCheckIn(owner, AT, sunday(21, 0));
        assertThat(visit.getStatus()).isEqualTo(VisitStatus.VISITED);
        assertThat(visit.getCheckInMethod()).isEqualTo(VisitCheckInMethod.OWNER);
        assertThat(visit.getCheckedInByUserId()).isEqualTo(owner);
        // Nobody saw them arrive, so there is no arrival time to call late.
        assertThat(visit.getArrivedMinute()).isNull();
        assertThat(visit.arrivedLate()).isNull();
    }

    /** Not checked in by midnight: No visit. Never on its own day, and never one that was attended. */
    @Test
    void aVisitNobodyCheckedInBecomesNoVisitAfterMidnight() {
        Visit visit = visit();
        assertThat(visit.markNoVisit(AT, SUNDAY)).isFalse();
        assertThat(visit.getStatus()).isEqualTo(VisitStatus.SCHEDULED);

        assertThat(visit.markNoVisit(AT, SUNDAY.plusDays(1))).isTrue();
        assertThat(visit.getStatus()).isEqualTo(VisitStatus.NOT_VISITED);
        assertThat(visit.getNoVisitAt()).isEqualTo(AT);

        Visit attended = visit();
        attended.checkIn(UUID.randomUUID(), VisitCheckInMethod.QR, AT, sunday(16, 5));
        assertThat(attended.markNoVisit(AT, SUNDAY.plusDays(1))).isFalse();
        assertThat(attended.getStatus()).isEqualTo(VisitStatus.VISITED);
    }

    /**
     * A No visit is the prospect's to move, twice, on the missed count. Moved,
     * it is a visit to turn up to again. The property can no longer move it.
     */
    @Test
    void aNoVisitIsMovedByTheProspectOnlyOnTheMissedCount() {
        Visit visit = visit();
        LocalDateTime monday = SUNDAY.plusDays(1).atTime(9, 0);
        visit.markNoVisit(AT, monday.toLocalDate());

        assertThatThrownBy(() -> visit.moveByHandler(SUNDAY.plusDays(3), FOUR_PM, FIVE_PM, monday))
                .isInstanceOf(ValidationException.class);
        assertThat(visit.tenantReschedulesLeft(monday)).isEqualTo(2);

        visit.moveByTenant(SUNDAY.plusDays(3), FOUR_PM, FIVE_PM, monday);
        assertThat(visit.getStatus()).isEqualTo(VisitStatus.SCHEDULED);
        assertThat(visit.getNoVisitAt()).isNull();
        assertThat(visit.getTenantMissedReschedules()).isEqualTo(1);
        assertThat(visit.getTenantReschedules()).isZero();

        LocalDateTime missedAgain = SUNDAY.plusDays(4).atTime(9, 0);
        visit.moveByTenant(SUNDAY.plusDays(6), FOUR_PM, FIVE_PM, missedAgain);
        LocalDateTime missedThird = SUNDAY.plusDays(7).atTime(9, 0);
        assertThat(visit.tenantReschedulesLeft(missedThird)).isZero();
        assertThatThrownBy(() -> visit.moveByTenant(SUNDAY.plusDays(9), FOUR_PM, FIVE_PM, missedThird))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("missed visit twice");
    }

    /** A move remembers the date and slot it left, so that day's list can say it was rescheduled. */
    @Test
    void aMoveRemembersTheSlotItLeft() {
        Visit visit = visit();
        assertThat(visit.getMovedFromDate()).isNull();

        visit.moveByTenant(SUNDAY.plusDays(2), LocalTime.of(10, 0), LocalTime.of(11, 0), DAYS_BEFORE);

        assertThat(visit.getMovedFromDate()).isEqualTo(SUNDAY);
        assertThat(visit.getMovedFromSlotStartMinute()).isEqualTo(16 * 60);
        assertThat(visit.getMovedFromSlotEndMinute()).isEqualTo(17 * 60);
        assertThat(visit.getMovedAt()).isNotNull();
        assertThat(visit.wasMovedOffDate(SUNDAY)).isTrue();
        assertThat(visit.wasMovedOffDate(SUNDAY.plusDays(2))).isFalse();

        // Another slot the same day is not a move off that day.
        Visit sameDay = visit();
        sameDay.moveByTenant(SUNDAY, FIVE_PM, SIX_PM, sunday(10, 0));
        assertThat(sameDay.wasMovedOffDate(SUNDAY)).isFalse();
    }

    // ---- Reminders and running late ----------------------------------------

    /**
     * Reminded at 10 am the day before, and again two hours before their slot,
     * once each (user, 2026-10-04). Moving the visit starts both again: the
     * reminders are about a date and a slot.
     */
    @Test
    void theVisitorIsRemindedTheDayBeforeAndTwoHoursBeforeTheirSlot() {
        Visit visit = visit();
        LocalDate saturday = SUNDAY.minusDays(1);

        assertThat(visit.dueDayBeforeReminder(saturday.atTime(9, 59))).isFalse();
        assertThat(visit.dueDayBeforeReminder(saturday.atTime(10, 0))).isTrue();
        assertThat(visit.dueDayBeforeReminder(saturday.minusDays(1).atTime(12, 0))).as("two days before").isFalse();
        assertThat(visit.dueDayBeforeReminder(sunday(10, 30))).as("the day itself").isFalse();
        visit.markRemindedDayBefore(AT);
        assertThat(visit.dueDayBeforeReminder(saturday.atTime(11, 0))).as("once").isFalse();

        assertThat(visit.dueTodayReminder(sunday(13, 59))).isFalse();
        assertThat(visit.dueTodayReminder(sunday(14, 0))).isTrue();
        assertThat(visit.dueTodayReminder(sunday(16, 0))).as("their slot has started").isFalse();
        visit.markRemindedToday(AT);
        assertThat(visit.dueTodayReminder(sunday(14, 30))).as("once").isFalse();

        // Moved to the six o'clock slot: reminded for that one.
        visit.moveByTenant(SUNDAY, SIX_PM, LocalTime.of(19, 0), sunday(15, 0));
        assertThat(visit.dueTodayReminder(sunday(16, 5))).isTrue();
    }

    /** "I'm on my way": only once they are running late, and it counts once. */
    @Test
    void runningLateIsMarkedOnceAndOnlyPastHalfTheSlot() {
        Visit visit = visit();

        assertThatThrownBy(() -> visit.markRunningLate(AT, sunday(16, 10)))
                .isInstanceOf(ValidationException.class);
        assertThat(visit.markRunningLate(AT, sunday(16, 40))).isTrue();
        assertThat(visit.getRunningLateAt()).isEqualTo(AT);
        assertThat(visit.markRunningLate(AT, sunday(16, 45))).as("already said").isFalse();

        // A later slot is a fresh start.
        visit.moveByTenant(SUNDAY, SIX_PM, LocalTime.of(19, 0), sunday(16, 50));
        assertThat(visit.getRunningLateAt()).isNull();
    }

    // ---- The visit form ----------------------------------------------------

    /** Filled once they are checked in: when they left, how many came, what they made of it. */
    @Test
    void theVisitFormIsFilledAfterCheckIn() {
        UUID atTheDoor = UUID.randomUUID();
        Visit visit = visit();
        assertThatThrownBy(() -> visit.completeForm(atTheDoor, LocalTime.of(16, 50), 2, VisitImpression.LIKED, AT))
                .isInstanceOf(ValidationException.class);

        visit.checkIn(atTheDoor, VisitCheckInMethod.QR, AT, sunday(16, 10));
        assertThatThrownBy(() -> visit.completeForm(atTheDoor, LocalTime.of(16, 0), 2, VisitImpression.LIKED, AT))
                .as("left before they arrived")
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> visit.completeForm(atTheDoor, LocalTime.of(16, 50), 0, VisitImpression.LIKED, AT))
                .as("nobody came")
                .isInstanceOf(ValidationException.class);

        visit.completeForm(atTheDoor, LocalTime.of(16, 50), 2, VisitImpression.OKAY, AT);
        assertThat(visit.getDepartedMinute()).isEqualTo(16 * 60 + 50);
        assertThat(visit.getPartySize()).isEqualTo(2);
        assertThat(visit.getImpression()).isEqualTo(VisitImpression.OKAY);
        assertThat(visit.getFormCompletedAt()).isEqualTo(AT);
        assertThat(visit.isFormCompleted()).isTrue();
    }

    /**
     * Nothing on the form is required (user, 2026-10-04): it takes what whoever
     * received them knows. How many came and what they made of it may be left
     * out, and so may when they left.
     */
    @Test
    void theVisitFormTakesWhatIsKnown() {
        UUID atTheDoor = UUID.randomUUID();
        Visit visit = visit();
        visit.checkIn(atTheDoor, VisitCheckInMethod.QR, AT, sunday(16, 10));

        visit.completeForm(atTheDoor, LocalTime.of(16, 50), null, null, AT);
        assertThat(visit.isFormCompleted()).isTrue();
        assertThat(visit.getDepartedMinute()).isEqualTo(16 * 60 + 50);
        assertThat(visit.getPartySize()).isNull();
        assertThat(visit.getImpression()).isNull();

        // Saved again with more, it is replaced. A time they left that is not given stays as it was.
        visit.completeForm(atTheDoor, null, 3, VisitImpression.LIKED, AT);
        assertThat(visit.getDepartedMinute()).isEqualTo(16 * 60 + 50);
        assertThat(visit.getPartySize()).isEqualTo(3);
        assertThat(visit.getImpression()).isEqualTo(VisitImpression.LIKED);

        // With nothing at all there is nothing to save.
        Visit empty = visit();
        empty.checkIn(atTheDoor, VisitCheckInMethod.QR, AT, sunday(16, 10));
        assertThatThrownBy(() -> empty.completeForm(atTheDoor, null, null, null, AT))
                .isInstanceOf(ValidationException.class);
    }

    /**
     * Checked in, and nobody recorded when they left by the end of the day:
     * they left when their slot ended. Not on the visit's own day, never over
     * a time someone did record, and only for a visit that happened.
     */
    @Test
    void anUnrecordedDepartureIsTheEndOfTheSlot() {
        Visit visit = visit();
        visit.checkIn(UUID.randomUUID(), VisitCheckInMethod.QR, AT, sunday(16, 10));

        assertThat(visit.assumeLeftAtSlotEnd(SUNDAY)).as("still its day").isFalse();
        assertThat(visit.assumeLeftAtSlotEnd(SUNDAY.plusDays(1))).isTrue();
        assertThat(visit.getDepartedMinute()).isEqualTo(17 * 60);
        // The form was not filled: this is only the time they left.
        assertThat(visit.isFormCompleted()).isFalse();
        assertThat(visit.assumeLeftAtSlotEnd(SUNDAY.plusDays(1))).as("once").isFalse();

        Visit recorded = visit();
        recorded.checkIn(UUID.randomUUID(), VisitCheckInMethod.QR, AT, sunday(16, 10));
        recorded.completeForm(UUID.randomUUID(), LocalTime.of(16, 40), null, null, AT);
        assertThat(recorded.assumeLeftAtSlotEnd(SUNDAY.plusDays(1))).isFalse();
        assertThat(recorded.getDepartedMinute()).isEqualTo(16 * 60 + 40);

        assertThat(visit().assumeLeftAtSlotEnd(SUNDAY.plusDays(1))).as("never checked in").isFalse();
    }
}
