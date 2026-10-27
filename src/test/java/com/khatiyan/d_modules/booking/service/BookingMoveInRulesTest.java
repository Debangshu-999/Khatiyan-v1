package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.model.BookingMoveInAction;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;

/** What can be done about a confirmed booking on and after its move-in day (user's rules, 2026-10-10). */
class BookingMoveInRulesTest {

    private static final LocalDate MOVE_IN = LocalDate.of(2026, 10, 20);

    @Test
    void nothingHappensBeforeTheMoveInDay() {
        for (BookingParty party : BookingParty.values()) {
            assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.minusDays(1), true, party, true, true)).isEmpty();
            assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.minusDays(1), false, party, true, true)).isEmpty();
        }
    }

    @Test
    void onlyAConfirmedBookingThatHasNotBeenConvertedCanBeActedOn() {
        for (BookingStatus status : BookingStatus.values()) {
            if (status == BookingStatus.CONFIRMED) {
                continue;
            }
            assertThat(allowed(status, false, MOVE_IN.plusDays(10), true, BookingParty.MANAGEMENT, true, true)).isEmpty();
            assertThat(allowed(status, false, MOVE_IN.plusDays(10), false, BookingParty.TENANT, true, true)).isEmpty();
        }
        assertThat(allowed(BookingStatus.CONFIRMED, true, MOVE_IN.plusDays(10), true, BookingParty.MANAGEMENT, true, true))
                .isEmpty();
        assertThat(allowed(BookingStatus.CONFIRMED, true, MOVE_IN.plusDays(10), false, BookingParty.TENANT, true, true))
                .isEmpty();
    }

    @Test
    void anyoneWhoMayOnboardConvertsFromTheMoveInDayWhileTheBedIsReady() {
        // Not the handler, and may onboard: converting is theirs. Closing it as a no-show is not.
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN, true, BookingParty.MANAGEMENT, true, false))
                .containsExactly(BookingMoveInAction.CONVERT);
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(5), true, BookingParty.MANAGEMENT, true, false))
                .containsExactly(BookingMoveInAction.CONVERT);
        // The handler who may not onboard cannot convert.
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN, true, BookingParty.MANAGEMENT, false, true)).isEmpty();
        // The tenant never converts their own booking.
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN, true, BookingParty.TENANT, true, true)).isEmpty();
    }

    @Test
    void aNoShowIsClosedByTheOwnerOrHandlerFromTheDayAfter() {
        // The move-in day is the tenant's (user, 2026-10-28).
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN, true, BookingParty.MANAGEMENT, false, true)).isEmpty();
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(1), true, BookingParty.MANAGEMENT, false, true))
                .containsExactly(BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(2), true, BookingParty.MANAGEMENT, false, true))
                .containsExactly(BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(2), true, BookingParty.MANAGEMENT, true, true))
                .containsExactlyInAnyOrder(BookingMoveInAction.CONVERT, BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);
        // Someone who may onboard but does not handle it cannot call it a no-show.
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(2), true, BookingParty.MANAGEMENT, true, false))
                .containsExactly(BookingMoveInAction.CONVERT);
    }

    @Test
    void anOccupiedBedIsSwappedByTheHandlerAndANoShowStillClosesFromTheDayAfter() {
        for (int day = 0; day <= 30; day++) {
            var actions = allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(day), false,
                    BookingParty.MANAGEMENT, true, true);
            // Never converted onto an occupied bed. The handler moves them from the move-in day (user, 2026-10-27).
            assertThat(actions).doesNotContain(BookingMoveInAction.CONVERT).contains(BookingMoveInAction.MOVE_TO_ANOTHER_BED);
            assertThat(actions.contains(BookingMoveInAction.CLOSE_DID_NOT_ARRIVE)).isEqualTo(day >= 1);
        }
        // Not someone who does not handle it.
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN, false, BookingParty.MANAGEMENT, true, false))
                .doesNotContain(BookingMoveInAction.MOVE_TO_ANOTHER_BED);
    }

    @Test
    void theTenantMayLeaveOnceThePropertysThreeMoreDaysAreUp() {
        // The move-in day and three more are the property's.
        for (int day = 0; day <= 3; day++) {
            assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(day), false,
                    BookingParty.TENANT, false, false)).isEmpty();
        }
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(4), false, BookingParty.TENANT, false, false))
                .containsExactly(BookingMoveInAction.LEAVE_BED_NOT_READY);
        // And for as long after as they choose to keep waiting.
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(40), false, BookingParty.TENANT, false, false))
                .containsExactly(BookingMoveInAction.LEAVE_BED_NOT_READY);
        // A bed that is ready is no reason to leave with the token owed back.
        assertThat(allowed(BookingStatus.CONFIRMED, false, MOVE_IN.plusDays(4), true, BookingParty.TENANT, false, false))
                .isEmpty();
    }

    @Test
    void aRefusalSaysWhatIsActuallyInTheWay() {
        assertThatThrownBy(() -> require(BookingMoveInAction.CONVERT, BookingStatus.CONFIRMED, true, MOVE_IN, true))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already been converted");
        assertThatThrownBy(() -> require(BookingMoveInAction.CONVERT, BookingStatus.AWAITING_TOKEN, false, MOVE_IN, true))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Record its token first");
        assertThatThrownBy(() -> require(BookingMoveInAction.CONVERT, BookingStatus.CANCELLED, false, MOVE_IN, true))
                .isInstanceOf(ValidationException.class).hasMessageContaining("no longer open");
        assertThatThrownBy(() -> require(BookingMoveInAction.CONVERT, BookingStatus.CONFIRMED, false,
                MOVE_IN.minusDays(2), true))
                .isInstanceOf(ValidationException.class).hasMessageContaining("2026-10-20");
        assertThatThrownBy(() -> require(BookingMoveInAction.CONVERT, BookingStatus.CONFIRMED, false, MOVE_IN, false))
                .isInstanceOf(ValidationException.class).hasMessageContaining("not free yet");
        assertThatThrownBy(() -> require(BookingMoveInAction.CLOSE_DID_NOT_ARRIVE, BookingStatus.CONFIRMED, false,
                MOVE_IN, true))
                .isInstanceOf(ValidationException.class).hasMessageContaining("2026-10-21");
    }

    @Test
    void theTenantPushesTheDateOnceAndOnlyBeforeTheDay() {
        var notPushed = new BookingMoveInRules.State(BookingStatus.CONFIRMED, false, MOVE_IN, MOVE_IN.minusDays(1),
                false, false, false);
        assertThat(BookingMoveInRules.allowedActions(notPushed, BookingParty.TENANT, false, false))
                .containsExactly(BookingMoveInAction.PUSH_DATE);
        // The property never moves the tenant's date.
        assertThat(BookingMoveInRules.allowedActions(notPushed, BookingParty.MANAGEMENT, true, true)).isEmpty();
        var pushed = new BookingMoveInRules.State(BookingStatus.CONFIRMED, false, MOVE_IN, MOVE_IN.minusDays(1),
                false, true, false);
        assertThat(BookingMoveInRules.allowedActions(pushed, BookingParty.TENANT, false, false)).isEmpty();
        var onTheDay = new BookingMoveInRules.State(BookingStatus.CONFIRMED, false, MOVE_IN, MOVE_IN, true, false,
                false);
        assertThat(BookingMoveInRules.allowedActions(onTheDay, BookingParty.TENANT, false, false)).isEmpty();
        var awaitingToken = new BookingMoveInRules.State(BookingStatus.AWAITING_TOKEN, false, MOVE_IN,
                MOVE_IN.minusDays(1), false, false, false);
        assertThat(BookingMoveInRules.allowedActions(awaitingToken, BookingParty.TENANT, false, false)).isEmpty();
    }

    @Test
    void aPushGoesLaterAndNoFurtherThanSevenDays() {
        assertThat(BookingPolicy.latestPushDate(MOVE_IN)).isEqualTo(LocalDate.of(2026, 10, 27));
        BookingPolicy.requireDatePush(MOVE_IN, MOVE_IN.plusDays(1));
        BookingPolicy.requireDatePush(MOVE_IN, MOVE_IN.plusDays(7));
        for (LocalDate refused : new LocalDate[]{null, MOVE_IN.minusDays(1), MOVE_IN, MOVE_IN.plusDays(8)}) {
            assertThatThrownBy(() -> BookingPolicy.requireDatePush(MOVE_IN, refused))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("2026-10-27");
        }
    }

    @Test
    void anotherBedIsOfferedAndAnsweredOnlyOnceThePropertysDaysAreUp() {
        // Through day three nobody offers or answers. The handler can still move them, or close a no-show.
        var dayThree = new BookingMoveInRules.State(BookingStatus.CONFIRMED, false, MOVE_IN, MOVE_IN.plusDays(3),
                false, false, true);
        assertThat(BookingMoveInRules.allowedActions(dayThree, BookingParty.MANAGEMENT, true, true))
                .containsExactlyInAnyOrder(BookingMoveInAction.MOVE_TO_ANOTHER_BED, BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);
        assertThat(BookingMoveInRules.allowedActions(dayThree, BookingParty.TENANT, false, false)).isEmpty();

        var dayFour = new BookingMoveInRules.State(BookingStatus.CONFIRMED, false, MOVE_IN, MOVE_IN.plusDays(4),
                false, false, false);
        // The owner or the handler offers. Someone who only onboards does not.
        assertThat(BookingMoveInRules.allowedActions(dayFour, BookingParty.MANAGEMENT, true, true))
                .containsExactlyInAnyOrder(BookingMoveInAction.OFFER_ANOTHER_BED,
                        BookingMoveInAction.MOVE_TO_ANOTHER_BED, BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);
        assertThat(BookingMoveInRules.allowedActions(dayFour, BookingParty.MANAGEMENT, true, false)).isEmpty();
        assertThat(BookingMoveInRules.allowedActions(dayFour, BookingParty.TENANT, false, false))
                .containsExactly(BookingMoveInAction.LEAVE_BED_NOT_READY);

        var offered = new BookingMoveInRules.State(BookingStatus.CONFIRMED, false, MOVE_IN, MOVE_IN.plusDays(4),
                false, false, true);
        assertThat(BookingMoveInRules.allowedActions(offered, BookingParty.TENANT, false, false))
                .containsExactlyInAnyOrder(BookingMoveInAction.LEAVE_BED_NOT_READY,
                        BookingMoveInAction.ACCEPT_ANOTHER_BED, BookingMoveInAction.DECLINE_ANOTHER_BED);
        // The property may replace its own offer.
        assertThat(BookingMoveInRules.allowedActions(offered, BookingParty.MANAGEMENT, false, true))
                .containsExactlyInAnyOrder(BookingMoveInAction.OFFER_ANOTHER_BED,
                        BookingMoveInAction.MOVE_TO_ANOTHER_BED, BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);

        // Once the booked bed is free, there is nothing to offer and nothing to take.
        var ready = new BookingMoveInRules.State(BookingStatus.CONFIRMED, false, MOVE_IN, MOVE_IN.plusDays(4),
                true, false, true);
        assertThat(BookingMoveInRules.allowedActions(ready, BookingParty.TENANT, false, false)).isEmpty();
        assertThat(BookingMoveInRules.allowedActions(ready, BookingParty.MANAGEMENT, true, true))
                .containsExactlyInAnyOrder(BookingMoveInAction.CONVERT, BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);
    }

    private static Set<BookingMoveInAction> allowed(BookingStatus status, boolean converted, LocalDate today,
            boolean bedReady, BookingParty actor, boolean mayOnboard, boolean managementMayAct) {
        return BookingMoveInRules.allowedActions(status, converted, MOVE_IN, today, bedReady, actor, mayOnboard,
                managementMayAct);
    }

    private static void require(BookingMoveInAction action, BookingStatus status, boolean converted, LocalDate today,
            boolean bedReady) {
        BookingMoveInRules.require(action, status, converted, MOVE_IN, today, bedReady, BookingParty.MANAGEMENT,
                true, true);
    }
}
