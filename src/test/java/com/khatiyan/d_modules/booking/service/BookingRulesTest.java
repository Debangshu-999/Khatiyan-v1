package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.api.dto.BookingWindowResponse;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingMoveInWindow;
import com.khatiyan.d_modules.booking.model.BookingOffer;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTiming;
import com.khatiyan.d_modules.booking.model.BookingTokenHold;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.property.model.PgFor;

/** Pure booking rules; no database, application startup, identity or inventory mocks. */
class BookingRulesTest {

    private static final Instant SUBMITTED = Instant.parse("2026-10-07T11:30:00Z"); // 7 Oct, 5pm IST
    private static final LocalDate BOOKING_DAY = LocalDate.of(2026, 10, 7);
    private static final Instant DURING_REVIEW = SUBMITTED.plusSeconds(3600);
    private static final BookingOffer TENANT_OFFER = BookingOffer.tenantProposal(880_000L);
    private static final BookingOffer HANDLER_OFFER = BookingOffer.managementOffer(920_000L, 950_000L, true);
    private static final BookingOffer FINAL_OFFER = BookingOffer.managementOffer(920_000L, 950_000L, false);
    private static final BookingTokenHold TOKEN_TO_AGREE = BookingTokenHold.toBeAgreed();
    private static final BookingTokenHold TOKEN_WAIVED = BookingTokenHold.waived();
    private final MutableClock clock = new MutableClock(SUBMITTED);
    private final BookingPolicy policy = new BookingPolicy(clock);

    @Test
    void submissionProducesSeparateCalendarBoundsAndExactElapsedExpiry() {
        BookingTiming timing = policy.newRequestTiming();
        assertThat(timing.submittedAt()).isEqualTo(SUBMITTED);
        assertThat(timing.bookingDate()).isEqualTo(BOOKING_DAY);
        assertThat(timing.earliestMoveInDate()).isEqualTo(LocalDate.of(2026, 10, 10));
        assertThat(timing.latestMoveInDate()).isEqualTo(LocalDate.of(2026, 10, 28));
        assertThat(timing.expiresAt()).isEqualTo(Instant.parse("2026-10-14T11:30:00Z"));
    }

    @ParameterizedTest
    @ValueSource(ints = {3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21})
    void liveBedsAcceptEveryDateFromDayThreeThroughDayTwentyOne(int days) {
        policy.requireMoveInDate(policy.liveMoveInWindow(policy.newRequestTiming()), BOOKING_DAY.plusDays(days));
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 0, 1, 2, 22, 30})
    void moveInOutsideOriginalInclusiveBoundsIsRejected(int days) {
        assertThatThrownBy(() -> policy.requireMoveInDate(
                policy.liveMoveInWindow(policy.newRequestTiming()), BOOKING_DAY.plusDays(days)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("2026-10-10").hasMessageContaining("2026-10-28");
    }

    @Test
    void aMissingMoveInDateIsRejected() {
        assertThatThrownBy(() -> policy.requireMoveInDate(policy.liveMoveInWindow(policy.newRequestTiming()), null))
                .isInstanceOf(ValidationException.class);
    }

    /** User's correction: an early checkout does NOT force an early move-in. */
    @ParameterizedTest
    @ValueSource(ints = {-5, 0, 1, 2})
    void checkoutBeforeDayThreeStillAcceptsEveryLaterDateThroughDayTwentyOne(int exitDays) {
        BookingTiming timing = policy.newRequestTiming();
        BookingMoveInWindow window = policy.futureMoveInWindow(timing, BOOKING_DAY.plusDays(exitDays)).orElseThrow();
        assertThat(window.earliest()).isEqualTo(BOOKING_DAY.plusDays(3));
        assertThat(window.latest()).isEqualTo(BOOKING_DAY.plusDays(21));
        assertThatThrownBy(() -> policy.requireMoveInDate(window, BOOKING_DAY.plusDays(2)))
                .isInstanceOf(ValidationException.class);
        for (int days = 3; days <= 21; days++) {
            policy.requireMoveInDate(window, BOOKING_DAY.plusDays(days));
        }
    }

    @Test
    void checkoutOnDayThreeRaisesTheMinimumToDayFour() {
        BookingMoveInWindow window = policy.futureMoveInWindow(
                policy.newRequestTiming(), BOOKING_DAY.plusDays(3)).orElseThrow();
        assertThat(window.earliest()).isEqualTo(BOOKING_DAY.plusDays(4));
        assertThat(window.contains(BOOKING_DAY.plusDays(3))).isFalse();
    }

    @Test
    void futureBedsMustStartStrictlyAfterCheckoutButMayMoveInLater() {
        BookingMoveInWindow window = policy.futureMoveInWindow(
                policy.newRequestTiming(), LocalDate.of(2026, 10, 16)).orElseThrow();
        assertThat(window.earliest()).isEqualTo(LocalDate.of(2026, 10, 17));
        assertThat(window.latest()).isEqualTo(LocalDate.of(2026, 10, 28));
        assertThatThrownBy(() -> policy.requireMoveInDate(window, LocalDate.of(2026, 10, 16)))
                .isInstanceOf(ValidationException.class);
        policy.requireMoveInDate(window, LocalDate.of(2026, 10, 17));
        policy.requireMoveInDate(window, LocalDate.of(2026, 10, 21));
        policy.requireMoveInDate(window, LocalDate.of(2026, 10, 28));
    }

    @Test
    void checkoutOnDaySevenDoesNotAllowMoveInOnTheCheckoutDate() {
        BookingMoveInWindow window = policy.futureMoveInWindow(
                policy.newRequestTiming(), BOOKING_DAY.plusDays(7)).orElseThrow();
        assertThat(window.earliest()).isEqualTo(BOOKING_DAY.plusDays(8));
        assertThat(window.contains(BOOKING_DAY.plusDays(7))).isFalse();
    }

    @Test
    void checkoutOnDayEightRaisesTheMinimumToDayNine() {
        BookingMoveInWindow window = policy.futureMoveInWindow(
                policy.newRequestTiming(), BOOKING_DAY.plusDays(8)).orElseThrow();
        assertThat(window.earliest()).isEqualTo(BOOKING_DAY.plusDays(9));
        assertThat(window.latest()).isEqualTo(BOOKING_DAY.plusDays(21));
        assertThatThrownBy(() -> policy.requireMoveInDate(window, BOOKING_DAY.plusDays(8)))
                .isInstanceOf(ValidationException.class);
        policy.requireMoveInDate(window, BOOKING_DAY.plusDays(9));
        policy.requireMoveInDate(window, BOOKING_DAY.plusDays(21));
    }

    @Test
    void checkoutOnDayTwentyLeavesOneSelectableDate() {
        BookingMoveInWindow window = policy.futureMoveInWindow(
                policy.newRequestTiming(), BOOKING_DAY.plusDays(20)).orElseThrow();
        assertThat(window.earliest()).isEqualTo(BOOKING_DAY.plusDays(21));
        assertThat(window.latest()).isEqualTo(window.earliest());
        policy.requireMoveInDate(window, window.earliest());
    }

    @ParameterizedTest
    @ValueSource(ints = {21, 22, 90})
    void aFutureExitWithNoDateInsideTheWindowIsNotBookable(int exitDays) {
        assertThat(policy.futureMoveInWindow(policy.newRequestTiming(), BOOKING_DAY.plusDays(exitDays))).isEmpty();
    }

    @Test
    void moveInBoundsSurviveMonthAndYearRollover() {
        BookingTiming timing = policy.timingFor(Instant.parse("2026-12-30T12:00:00Z"));
        assertThat(timing.earliestMoveInDate()).isEqualTo(LocalDate.of(2027, 1, 2));
        assertThat(timing.latestMoveInDate()).isEqualTo(LocalDate.of(2027, 1, 20));
        BookingTiming leap = policy.timingFor(Instant.parse("2024-02-27T12:00:00Z"));
        assertThat(leap.earliestMoveInDate()).isEqualTo(LocalDate.of(2024, 3, 1));
        assertThat(leap.latestMoveInDate()).isEqualTo(LocalDate.of(2024, 3, 19));
    }

    @Test
    void bookingDatesUseIndiaEvenWhenClockUsesAnotherZone() {
        BookingPolicy otherZone = new BookingPolicy(Clock.fixed(
                Instant.parse("2026-10-06T18:30:00Z"), ZoneId.of("America/Los_Angeles")));
        assertThat(otherZone.newRequestTiming().bookingDate()).isEqualTo(BOOKING_DAY);
        assertThat(policy.timingFor(Instant.parse("2026-10-06T18:29:59.999999999Z")).bookingDate())
                .isEqualTo(BOOKING_DAY.minusDays(1));
    }

    @Test
    void postVisitEligibilityIncludesTheLastLocalDayAndClosesAtNextMidnight() {
        LocalDate visit = LocalDate.of(2026, 9, 7);
        assertThat(policy.postVisitWindowEndsOn(visit)).isEqualTo(BOOKING_DAY);
        Instant closes = Instant.parse("2026-10-07T18:30:00Z");
        assertThat(policy.postVisitWindowExpiresAt(visit)).isEqualTo(closes);
        clock.set(closes.minusNanos(1));
        assertThat(policy.isWithinPostVisitWindow(visit)).isTrue();
        clock.set(closes);
        assertThat(policy.isWithinPostVisitWindow(visit)).isFalse();
        assertThatThrownBy(() -> policy.requirePostVisitWindow(visit)).isInstanceOf(ValidationException.class);
    }

    @Test
    void absentOrFutureAttendanceDateIsNotEligible() {
        assertThat(policy.isWithinPostVisitWindow(null)).isFalse();
        assertThat(policy.isWithinPostVisitWindow(BOOKING_DAY.plusDays(1))).isFalse();
        assertThat(policy.isWithinPostVisitWindow(BOOKING_DAY)).isTrue();
    }

    @Test
    void lateSubmissionKeepsItsSevenDaysAfterPostVisitEligibilityEnds() {
        LocalDate visit = LocalDate.of(2026, 9, 7);
        policy.requirePostVisitWindow(visit);
        BookingTiming timing = policy.newRequestTiming();
        clock.set(Instant.parse("2026-10-08T00:00:00Z"));
        assertThat(policy.isWithinPostVisitWindow(visit)).isFalse();
        assertThat(policy.effectiveStatus(BookingStatus.AWAITING_TENANT, timing, TOKEN_TO_AGREE))
                .isEqualTo(BookingStatus.AWAITING_TENANT);
        assertThat(actions(BookingStatus.AWAITING_TENANT, timing, FINAL_OFFER, BookingParty.TENANT, true, false, clock.instant()))
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);
    }

    @Test
    void theExactEighteenthBirthdayIsAcceptedButTheDayBeforeIsNot() {
        BookingTiming timing = policy.newRequestTiming();
        policy.requireAdult(LocalDate.of(2008, 10, 7), timing);
        assertThatThrownBy(() -> policy.requireAdult(LocalDate.of(2008, 10, 8), timing))
                .isInstanceOf(ValidationException.class).hasMessageContaining("18");
    }

    @Test
    void leapDayBirthdayUsesTheExistingTenancyEighteenthBirthdayRule() {
        LocalDate dob = LocalDate.of(2008, 2, 29);
        assertThatThrownBy(() -> policy.requireAdult(dob, policy.timingFor(Instant.parse("2026-02-27T12:00:00Z"))))
                .isInstanceOf(ValidationException.class);
        policy.requireAdult(dob, policy.timingFor(Instant.parse("2026-02-28T12:00:00Z")));
        policy.requireAdult(dob, policy.timingFor(Instant.parse("2026-03-01T12:00:00Z")));
    }

    @Test
    void birthDateIsRequiredAndCannotBeTodayOrInTheFuture() {
        BookingTiming timing = policy.newRequestTiming();
        for (LocalDate dob : new LocalDate[]{null, BOOKING_DAY, BOOKING_DAY.plusDays(1)}) {
            assertThatThrownBy(() -> policy.requireAdult(dob, timing)).isInstanceOf(ValidationException.class);
        }
    }

    @Test
    void indefiniteAndOneThroughElevenMonthsMatchExistingAgreementRules() {
        policy.requireAgreementValidity(null);
        for (int months = 1; months <= 11; months++) {
            policy.requireAgreementValidity(months);
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 0, 12, 24})
    void agreementDurationOutsideOneThroughElevenIsRejected(int months) {
        assertThatThrownBy(() -> policy.requireAgreementValidity(months)).isInstanceOf(ValidationException.class);
    }

    @Test
    void rentIsPositiveWholePaiseAndCannotBeMissing() {
        assertThat(BookingOffer.tenantProposal(1L).monthlyRentPaise()).isEqualTo(1L);
        for (Long rent : new Long[]{null, 0L, -1L}) {
            assertThatThrownBy(() -> BookingOffer.tenantProposal(rent)).isInstanceOf(ValidationException.class);
        }
    }

    @Test
    void tenantsCannotIssueFinalOffers() {
        assertThatThrownBy(() -> new BookingOffer(880_000L, BookingParty.TENANT, false))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Only management");
        assertThatThrownBy(() -> new BookingOffer(880_000L, null, true)).isInstanceOf(ValidationException.class);
    }

    @Test
    void finalOfferWithoutReplacementRentSnapshotsTheListedRate() {
        BookingOffer offer = BookingOffer.managementOffer(null, 950_000L, false);
        assertThat(offer.monthlyRentPaise()).isEqualTo(950_000L);
        assertThat(offer.negotiable()).isFalse();
        assertThat(BookingOffer.managementOffer(920_000L, 950_000L, false).monthlyRentPaise()).isEqualTo(920_000L);
        assertThatThrownBy(() -> BookingOffer.managementOffer(null, null, false)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> BookingOffer.managementOffer(null, 950_000L, true)).isInstanceOf(ValidationException.class);
    }

    @Test
    void handlerCanAcceptCounterOrCancelATenantProposal() {
        assertThat(actions(BookingStatus.AWAITING_HANDLER, policy.newRequestTiming(), TENANT_OFFER,
                BookingParty.MANAGEMENT, true, false, DURING_REVIEW)).containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.COUNTER, BookingAction.CANCEL);
        assertThat(actions(BookingStatus.AWAITING_HANDLER, policy.newRequestTiming(), TENANT_OFFER,
                BookingParty.TENANT, true, false, DURING_REVIEW)).containsExactly(BookingAction.CANCEL);
    }

    @Test
    void negotiableHandlerOfferAllowsTenantAcceptCounterOrCancel() {
        assertThat(actions(BookingStatus.AWAITING_TENANT, policy.newRequestTiming(), HANDLER_OFFER,
                BookingParty.TENANT, true, false, DURING_REVIEW)).containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.COUNTER, BookingAction.CANCEL);
        assertThat(actions(BookingStatus.AWAITING_TENANT, policy.newRequestTiming(), HANDLER_OFFER,
                BookingParty.MANAGEMENT, true, false, DURING_REVIEW)).containsExactly(BookingAction.CANCEL);
    }

    @Test
    void finalOfferAllowsAcceptOrCancelButNeverCounter() {
        assertThat(actions(BookingStatus.AWAITING_TENANT, policy.newRequestTiming(), FINAL_OFFER,
                BookingParty.TENANT, true, false, DURING_REVIEW))
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);
        assertThatThrownBy(() -> next(BookingAction.COUNTER, BookingStatus.AWAITING_TENANT, FINAL_OFFER, BookingParty.TENANT))
                .isInstanceOf(ValidationException.class);
    }

    /** Agreement is the moment a bed is held, and the token is what confirms it. */
    @Test
    void eitherReceivingSideAcceptingAgreesTheTermsAndAwaitsTheToken() {
        assertThat(next(BookingAction.ACCEPT, BookingStatus.AWAITING_HANDLER, TENANT_OFFER, BookingParty.MANAGEMENT))
                .isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(next(BookingAction.ACCEPT, BookingStatus.AWAITING_TENANT, HANDLER_OFFER, BookingParty.TENANT))
                .isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(next(BookingAction.ACCEPT, BookingStatus.AWAITING_TENANT, FINAL_OFFER, BookingParty.TENANT))
                .isEqualTo(BookingStatus.AWAITING_TOKEN);
    }

    @Test
    void acceptingWhereTheOwnerTakesNoTokenConfirmsAtOnce() {
        assertThat(next(BookingAction.ACCEPT, BookingStatus.AWAITING_HANDLER, TENANT_OFFER, TOKEN_WAIVED,
                BookingParty.MANAGEMENT)).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(next(BookingAction.ACCEPT, BookingStatus.AWAITING_TENANT, FINAL_OFFER, TOKEN_WAIVED,
                BookingParty.TENANT)).isEqualTo(BookingStatus.CONFIRMED);
    }

    /** One bed, one request: held from the moment of asking until the booking is over. */
    @Test
    void everyBookingStillGoingHoldsABedAndOneThatIsOverHoldsNone() {
        for (BookingStatus going : new BookingStatus[]{BookingStatus.AWAITING_HANDLER,
                BookingStatus.AWAITING_TENANT, BookingStatus.AWAITING_TOKEN, BookingStatus.CONFIRMED}) {
            assertThat(going.holdsBed()).as(going.name()).isTrue();
        }
        assertThat(BookingStatus.CANCELLED.holdsBed()).isFalse();
        assertThat(BookingStatus.EXPIRED.holdsBed()).isFalse();
        // Agreed is narrower: the terms are no longer on the table.
        assertThat(BookingStatus.AWAITING_TOKEN.isAgreed()).isTrue();
        assertThat(BookingStatus.CONFIRMED.isAgreed()).isTrue();
        assertThat(BookingStatus.AWAITING_HANDLER.isAgreed()).isFalse();
        assertThat(BookingStatus.AWAITING_TENANT.isAgreed()).isFalse();
        assertThat(BookingStatus.AWAITING_TOKEN.isPending()).isFalse();
    }

    /** A tenant's offer at the room's listed rent leaves the property accept and cancel only (user, 2026-10-11). */
    @Test
    void anOfferAtTheListedRentIsNotThePropertysToCounter() {
        BookingTiming timing = policy.newRequestTiming();
        long asked = TENANT_OFFER.monthlyRentPaise();

        assertThat(BookingActionRules.allowedActions(BookingStatus.AWAITING_HANDLER, timing, TENANT_OFFER,
                TOKEN_TO_AGREE, BookingParty.MANAGEMENT, true, false, SUBMITTED, asked))
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);
        // Listed higher than what was asked, it is a bargain to answer.
        assertThat(BookingActionRules.allowedActions(BookingStatus.AWAITING_HANDLER, timing, TENANT_OFFER,
                TOKEN_TO_AGREE, BookingParty.MANAGEMENT, true, false, SUBMITTED, asked + 70_000L))
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.COUNTER, BookingAction.CANCEL);
        // The rule narrows the property's answer and nobody else's: the tenant may still counter the property at any figure.
        assertThat(BookingActionRules.allowedActions(BookingStatus.AWAITING_TENANT, timing, HANDLER_OFFER,
                TOKEN_TO_AGREE, BookingParty.TENANT, true, false, SUBMITTED, HANDLER_OFFER.monthlyRentPaise()))
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.COUNTER, BookingAction.CANCEL);
        assertThatThrownBy(() -> BookingActionRules.nextStatus(BookingAction.COUNTER, BookingStatus.AWAITING_HANDLER,
                timing, TENANT_OFFER, TOKEN_TO_AGREE, BookingParty.MANAGEMENT, true, false, SUBMITTED, asked))
                .isInstanceOf(ValidationException.class).hasMessageContaining("nothing to counter");
        // With no listed rent to read, the older rule stands as it was.
        assertThat(BookingActionRules.allowedActions(BookingStatus.AWAITING_HANDLER, timing, TENANT_OFFER,
                TOKEN_TO_AGREE, BookingParty.MANAGEMENT, true, false, SUBMITTED))
                .contains(BookingAction.COUNTER);
    }

    @Test
    void countersReturnToTheOtherSideAndDoNotChangeOriginalTiming() {
        BookingTiming timing = policy.newRequestTiming();
        assertThat(next(BookingAction.COUNTER, BookingStatus.AWAITING_HANDLER, TENANT_OFFER, BookingParty.MANAGEMENT))
                .isEqualTo(BookingStatus.AWAITING_TENANT);
        assertThat(next(BookingAction.COUNTER, BookingStatus.AWAITING_TENANT, HANDLER_OFFER, BookingParty.TENANT))
                .isEqualTo(BookingStatus.AWAITING_HANDLER);
        clock.set(SUBMITTED.plus(Duration.ofDays(6)));
        assertThat(policy.timingFor(timing.submittedAt())).isEqualTo(timing);
        assertThat(timing.earliestMoveInDate()).isEqualTo(BOOKING_DAY.plusDays(3));
        assertThat(timing.latestMoveInDate()).isEqualTo(BOOKING_DAY.plusDays(21));
        assertThat(timing.expiresAt()).isEqualTo(SUBMITTED.plus(Duration.ofDays(7)));
    }

    @Test
    void aNewSubmissionGetsNewBoundsRatherThanExtendingTheOldRequest() {
        BookingTiming original = policy.newRequestTiming();
        clock.set(SUBMITTED.plus(Duration.ofDays(7)));
        BookingTiming fresh = policy.newRequestTiming();
        assertThat(fresh.bookingDate()).isEqualTo(BOOKING_DAY.plusDays(7));
        assertThat(fresh.earliestMoveInDate()).isEqualTo(BOOKING_DAY.plusDays(10));
        assertThat(fresh.latestMoveInDate()).isEqualTo(BOOKING_DAY.plusDays(28));
        assertThat(original.expiresAt()).isEqualTo(SUBMITTED.plus(Duration.ofDays(7)));
    }

    @Test
    void aCloseMoveInDateEndsTheRequestTwoEveningsBefore() {
        // Six in the evening IST, two days before, is 12:30 UTC.
        assertThat(policy.timingFor(SUBMITTED, LocalDate.of(2026, 10, 10)).expiresAt())
                .isEqualTo(Instant.parse("2026-10-08T12:30:00Z"));
        assertThat(policy.timingFor(SUBMITTED, LocalDate.of(2026, 10, 14)).expiresAt())
                .isEqualTo(Instant.parse("2026-10-12T12:30:00Z"));
        assertThat(policy.timingFor(SUBMITTED, LocalDate.of(2026, 10, 15)).expiresAt())
                .isEqualTo(Instant.parse("2026-10-13T12:30:00Z"));
        // From day nine the seven days come first for a 5pm submission.
        assertThat(policy.timingFor(SUBMITTED, LocalDate.of(2026, 10, 16)).expiresAt())
                .isEqualTo(Instant.parse("2026-10-14T11:30:00Z"));
        assertThat(policy.timingFor(SUBMITTED, LocalDate.of(2026, 10, 28)).expiresAt())
                .isEqualTo(Instant.parse("2026-10-14T11:30:00Z"));
        BookingTiming chosen = policy.timingFor(SUBMITTED, LocalDate.of(2026, 10, 10));
        assertThat(chosen.earliestMoveInDate()).isEqualTo(LocalDate.of(2026, 10, 10));
        assertThat(chosen.latestMoveInDate()).isEqualTo(LocalDate.of(2026, 10, 28));
    }

    @Test
    void aChosenDateOutsideTheBoundsHasNoTiming() {
        for (LocalDate date : new LocalDate[]{null, BOOKING_DAY, BOOKING_DAY.plusDays(2), BOOKING_DAY.plusDays(22)}) {
            assertThatThrownBy(() -> policy.timingFor(SUBMITTED, date)).isInstanceOf(ValidationException.class);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "2026-10-06T18:30:00Z", // Exactly midnight IST.
            "2026-10-06T18:30:00.000000001Z",
            "2026-10-07T06:30:00Z", // Noon IST.
            "2026-10-07T11:30:00Z", // 5pm IST.
            "2026-10-07T18:29:59.999999999Z" // Last instant of the local submission date.
    })
    void aRequestAlwaysEndsWithAFullDayLeftToPayTheToken(String submittedAt) {
        Instant submitted = Instant.parse(submittedAt);
        Instant sevenDays = submitted.plus(Duration.ofDays(7));
        for (int days = BookingPolicy.MINIMUM_MOVE_IN_DAYS; days <= BookingPolicy.DEFAULT_MAXIMUM_MOVE_IN_DAYS; days++) {
            LocalDate moveIn = BOOKING_DAY.plusDays(days);
            BookingTiming timing = policy.timingFor(submitted, moveIn);
            Instant cutoff = moveIn.minusDays(2).atTime(18, 0).atZone(BookingPolicy.ZONE).toInstant();
            assertThat(timing.bookingDate()).isEqualTo(BOOKING_DAY);
            assertThat(timing.expiresAt()).isEqualTo(cutoff.isBefore(sevenDays) ? cutoff : sevenDays);
            assertThat(timing.expiresAt()).isAfter(submitted)
                    .isBefore(moveIn.atStartOfDay(BookingPolicy.ZONE).toInstant());
            // Terms agreed at the last possible instant still leave more than a day.
            Instant lastAgreement = timing.expiresAt().minusNanos(1);
            assertThat(Duration.between(lastAgreement, BookingPolicy.tokenDueAt(lastAgreement, moveIn)))
                    .isGreaterThan(Duration.ofHours(24));
            assertThat(actions(BookingStatus.AWAITING_TENANT, timing, FINAL_OFFER,
                    BookingParty.TENANT, true, false, timing.expiresAt().minusNanos(1))).contains(BookingAction.ACCEPT);
            for (BookingStatus status : new BookingStatus[]{BookingStatus.AWAITING_HANDLER, BookingStatus.AWAITING_TENANT}) {
                assertThat(BookingPolicy.effectiveStatusAt(status, timing, TOKEN_TO_AGREE, timing.expiresAt()))
                        .isEqualTo(BookingStatus.EXPIRED);
                BookingOffer offer = status == BookingStatus.AWAITING_HANDLER ? TENANT_OFFER : HANDLER_OFFER;
                for (BookingParty actor : BookingParty.values()) {
                    assertThat(actions(status, timing, offer, actor, true, false, timing.expiresAt())).isEmpty();
                }
            }
        }
    }

    @Test
    void theAgreedBedIsHeldFortyEightHoursForTheTokenAndNeverIntoTheMoveInDay() {
        Instant agreed = SUBMITTED.plusSeconds(3600);
        assertThat(BookingPolicy.tokenDueAt(agreed, LocalDate.of(2026, 10, 15)))
                .isEqualTo(agreed.plus(Duration.ofHours(48)));
        // Agreed at 5:30pm two days before: the hold ends at midnight IST, 18:30 UTC, not 48 hours on.
        Instant justInsideTheCutoff = Instant.parse("2026-10-08T12:00:00Z");
        assertThat(BookingPolicy.tokenDueAt(justInsideTheCutoff, LocalDate.of(2026, 10, 10)))
                .isEqualTo(Instant.parse("2026-10-09T18:30:00Z"));
        for (String late : new String[]{"2026-10-09T18:30:00Z", "2026-10-10T06:00:00Z"}) {
            assertThatThrownBy(() -> BookingPolicy.tokenDueAt(Instant.parse(late), LocalDate.of(2026, 10, 10)))
                    .isInstanceOf(ValidationException.class);
        }
    }

    @Test
    void aRefusedClaimGivesBackTheTimeThatWasLeftAndNeverLessThanTwelveHours() {
        Instant due = Instant.parse("2026-10-09T12:30:00Z");
        Instant refused = due.plus(Duration.ofHours(5));
        assertThat(BookingPolicy.tokenDueAfterRefusedClaim(due, due.minus(Duration.ofHours(30)), refused))
                .isEqualTo(refused.plus(Duration.ofHours(30)));
        assertThat(BookingPolicy.tokenDueAfterRefusedClaim(due, due.minusSeconds(60), refused))
                .isEqualTo(refused.plus(Duration.ofHours(12)));
        assertThatThrownBy(() -> BookingPolicy.tokenDueAfterRefusedClaim(due, due, due.minusSeconds(1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void anAgreedBookingLapsesWhenItsTokenWindowEndsButNotOnTheRequestClock() {
        BookingTiming timing = policy.timingFor(SUBMITTED, LocalDate.of(2026, 10, 15));
        Instant due = timing.expiresAt().plus(Duration.ofHours(40)); // Agreed late: the hold outlives the request clock.
        BookingTokenHold hold = BookingTokenHold.due(due, false);
        assertThat(BookingPolicy.effectiveStatusAt(BookingStatus.AWAITING_TOKEN, timing, hold, timing.expiresAt().plusSeconds(1)))
                .isEqualTo(BookingStatus.AWAITING_TOKEN);
        for (BookingParty actor : BookingParty.values()) {
            assertThat(actions(BookingStatus.AWAITING_TOKEN, timing, FINAL_OFFER, hold, actor, true, false, due.minusNanos(1)))
                    .containsExactly(BookingAction.CANCEL);
            assertThat(actions(BookingStatus.AWAITING_TOKEN, timing, FINAL_OFFER, hold, actor, true, false, due)).isEmpty();
        }
        assertThat(BookingPolicy.effectiveStatusAt(BookingStatus.AWAITING_TOKEN, timing, hold, due))
                .isEqualTo(BookingStatus.EXPIRED);
    }

    /** A slow answer from the property must never cost the tenant the bed. */
    @Test
    void aClaimWaitingOnThePropertyStopsTheTokenClock() {
        BookingTiming timing = policy.timingFor(SUBMITTED, LocalDate.of(2026, 10, 15));
        Instant due = SUBMITTED.plus(Duration.ofHours(49));
        BookingTokenHold waiting = BookingTokenHold.due(due, true);
        Instant muchLater = due.plus(Duration.ofDays(5));
        assertThat(BookingPolicy.effectiveStatusAt(BookingStatus.AWAITING_TOKEN, timing, waiting, muchLater))
                .isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(actions(BookingStatus.AWAITING_TOKEN, timing, FINAL_OFFER, waiting,
                BookingParty.TENANT, true, false, muchLater)).containsExactly(BookingAction.CANCEL);
    }

    @Test
    void anAgreedBookingWithoutItsTokenDeadlineFailsClosed() {
        BookingTiming timing = policy.newRequestTiming();
        for (BookingTokenHold malformed : new BookingTokenHold[]{TOKEN_TO_AGREE, TOKEN_WAIVED}) {
            assertThat(actions(BookingStatus.AWAITING_TOKEN, timing, FINAL_OFFER, malformed,
                    BookingParty.MANAGEMENT, true, false, DURING_REVIEW)).isEmpty();
            assertThatThrownBy(() -> BookingPolicy.effectiveStatusAt(
                    BookingStatus.AWAITING_TOKEN, timing, malformed, DURING_REVIEW))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(actions(BookingStatus.AWAITING_HANDLER, timing, TENANT_OFFER, null,
                BookingParty.MANAGEMENT, true, false, DURING_REVIEW)).isEmpty();
        assertThatThrownBy(() -> new BookingTokenHold(false, DURING_REVIEW, false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BookingTokenHold(true, null, true)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void confirmedBookingsDoNotExpireAndEitherSideCanCancelUntilTheStayStarts() {
        BookingTiming timing = policy.newRequestTiming();
        Instant later = timing.expiresAt().plus(Duration.ofDays(30));
        for (BookingTokenHold hold : new BookingTokenHold[]{TOKEN_WAIVED, BookingTokenHold.due(timing.expiresAt(), false)}) {
            assertThat(BookingPolicy.effectiveStatusAt(BookingStatus.CONFIRMED, timing, hold, later))
                    .isEqualTo(BookingStatus.CONFIRMED);
            for (BookingParty actor : BookingParty.values()) {
                assertThat(actions(BookingStatus.CONFIRMED, timing, FINAL_OFFER, hold, actor, true, false, later))
                        .containsExactly(BookingAction.CANCEL);
                assertThat(actions(BookingStatus.CONFIRMED, timing, FINAL_OFFER, hold, actor, true, true, later)).isEmpty();
            }
        }
    }

    /** The cooldown is for a bed held for nothing. A token is its own consequence. */
    @Test
    void onlyWalkingAwayFromABedHeldWithoutATokenIsPenalised() {
        assertThat(BookingActionRules.tenantCancellationIsPenalised(
                BookingStatus.CONFIRMED, BookingTokenStatus.NOT_REQUIRED)).isTrue();
        assertThat(BookingActionRules.tenantCancellationIsPenalised(
                BookingStatus.CONFIRMED, BookingTokenStatus.RECEIVED)).isFalse();
        assertThat(BookingActionRules.tenantCancellationIsPenalised(
                BookingStatus.AWAITING_TOKEN, BookingTokenStatus.DUE)).isFalse();
        for (BookingStatus free : new BookingStatus[]{BookingStatus.AWAITING_HANDLER, BookingStatus.AWAITING_TENANT}) {
            assertThat(BookingActionRules.tenantCancellationIsPenalised(free, BookingTokenStatus.NOT_REQUIRED)).isFalse();
        }
    }

    @Test
    void cancelledAndExpiredRequestsNeverReopen() {
        for (BookingStatus status : new BookingStatus[]{BookingStatus.CANCELLED, BookingStatus.EXPIRED}) {
            for (BookingParty actor : BookingParty.values()) {
                assertThat(actions(status, policy.newRequestTiming(), TENANT_OFFER, actor, true, false, DURING_REVIEW)).isEmpty();
            }
        }
    }

    @Test
    void nonHandlerManagersReceiveNoMutationActions() {
        for (BookingStatus status : BookingStatus.values()) {
            assertThat(actions(status, policy.newRequestTiming(), TENANT_OFFER,
                    BookingParty.MANAGEMENT, false, false, DURING_REVIEW)).isEmpty();
        }
    }

    @Test
    void malformedOfferStateFailsClosedAndNeverAcceptsOnesOwnOffer() {
        assertThat(actions(BookingStatus.AWAITING_HANDLER, policy.newRequestTiming(), HANDLER_OFFER,
                BookingParty.MANAGEMENT, true, false, DURING_REVIEW)).isEmpty();
        assertThat(actions(BookingStatus.AWAITING_TENANT, policy.newRequestTiming(), TENANT_OFFER,
                BookingParty.TENANT, true, false, DURING_REVIEW)).isEmpty();
        assertThat(actions(BookingStatus.AWAITING_HANDLER, policy.newRequestTiming(), null,
                BookingParty.MANAGEMENT, true, false, DURING_REVIEW)).isEmpty();
    }

    @Test
    void managementCancellationRequiresANonblankReasonAndKeepsItsWords() {
        for (String reason : new String[]{null, "", "  \t\n", "\u2003"}) {
            assertThatThrownBy(() -> BookingActionRules.requireManagementCancellationReason(reason))
                    .isInstanceOf(ValidationException.class);
        }
        assertThat(BookingActionRules.requireManagementCancellationReason("  Room needs maintenance.  "))
                .isEqualTo("Room needs maintenance.");
        assertThat(next(BookingAction.CANCEL, BookingStatus.AWAITING_HANDLER, TENANT_OFFER, BookingParty.MANAGEMENT))
                .isEqualTo(BookingStatus.CANCELLED);
    }

    @Test
    void unknownActionOrMissingActorCannotEnableAMutation() {
        assertThatThrownBy(() -> next(null, BookingStatus.AWAITING_HANDLER, TENANT_OFFER, BookingParty.MANAGEMENT))
                .isInstanceOf(ValidationException.class);
        assertThat(actions(BookingStatus.AWAITING_HANDLER, policy.newRequestTiming(), TENANT_OFFER,
                null, true, false, DURING_REVIEW)).isEmpty();
    }

    @Test
    void roomPickerResponseExposesTheConstrainedFutureWindowAndOriginalExpiry() {
        BookingTiming timing = policy.newRequestTiming();
        BookingWindowResponse response = BookingWindowResponse.of(timing,
                policy.futureMoveInWindow(timing, LocalDate.of(2026, 10, 16)).orElseThrow());
        assertThat(response.earliestMoveInDate()).isEqualTo(LocalDate.of(2026, 10, 17));
        assertThat(response.latestMoveInDate()).isEqualTo(LocalDate.of(2026, 10, 28));
        assertThat(response.requestExpiresAt()).isEqualTo(timing.expiresAt());
        assertThat(response.minimumAdvanceDays()).isEqualTo(3);
        assertThat(response.maximumAdvanceDays()).isEqualTo(21);
        assertThat(response.postVisitDays()).isEqualTo(30);
        assertThatThrownBy(() -> BookingWindowResponse.of(timing,
                new BookingMoveInWindow(BOOKING_DAY.plusDays(2), BOOKING_DAY.plusDays(21))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void roomPickerResponseExposesDayThreeForLiveAndEarlyFutureVacancies() {
        BookingTiming timing = policy.newRequestTiming();
        for (BookingMoveInWindow window : new BookingMoveInWindow[]{
                policy.liveMoveInWindow(timing),
                policy.futureMoveInWindow(timing, BOOKING_DAY.plusDays(1)).orElseThrow()
        }) {
            BookingWindowResponse response = BookingWindowResponse.of(timing, window);
            assertThat(response.bookingDate()).isEqualTo(BOOKING_DAY);
            assertThat(response.earliestMoveInDate()).isEqualTo(LocalDate.of(2026, 10, 10));
            assertThat(response.latestMoveInDate()).isEqualTo(LocalDate.of(2026, 10, 28));
            assertThat(response.minimumAdvanceDays()).isEqualTo(3);
            assertThat(response.maximumAdvanceDays()).isEqualTo(21);
            assertThat(response.requestExpiresAt()).isEqualTo(Instant.parse("2026-10-14T11:30:00Z"));
        }
    }

    /** The owner's setting moves how far ahead a tenant may choose, and no other clock. */
    @Test
    void theOwnersLimitMovesTheLatestDateAndNothingElse() {
        BookingTiming timing = policy.timingFor(SUBMITTED, 45);
        assertThat(timing.earliestMoveInDate()).isEqualTo(BOOKING_DAY.plusDays(3));
        assertThat(timing.latestMoveInDate()).isEqualTo(BOOKING_DAY.plusDays(45));
        assertThat(timing.expiresAt()).isEqualTo(SUBMITTED.plus(Duration.ofDays(7)));
        assertThat(policy.timingFor(SUBMITTED, 45, BOOKING_DAY.plusDays(45)).expiresAt())
                .isEqualTo(SUBMITTED.plus(Duration.ofDays(7)));
        assertThatThrownBy(() -> policy.timingFor(SUBMITTED, 45, BOOKING_DAY.plusDays(46)))
                .isInstanceOf(ValidationException.class);
        // Without a setting the limit is the default, and the form is told the limit it was given.
        assertThat(policy.timingFor(SUBMITTED)).isEqualTo(policy.timingFor(SUBMITTED, 21));
        assertThat(BookingWindowResponse.of(timing, policy.liveMoveInWindow(timing)).maximumAdvanceDays()).isEqualTo(45);
        clock.set(SUBMITTED);
        assertThat(policy.newRequestTiming(10).latestMoveInDate()).isEqualTo(BOOKING_DAY.plusDays(10));
    }

    @Test
    void theOwnersLimitStaysBetweenThreeAndNinetyDays() {
        for (Integer days : new Integer[]{null, -1, 0, 2, 91, 365}) {
            assertThatThrownBy(() -> BookingPolicy.requireMaximumAdvanceDays(days))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("3").hasMessageContaining("90");
        }
        assertThat(BookingPolicy.requireMaximumAdvanceDays(3)).isEqualTo(3);
        assertThat(BookingPolicy.requireMaximumAdvanceDays(90)).isEqualTo(90);
        assertThatThrownBy(() -> policy.timingFor(SUBMITTED, 2)).isInstanceOf(ValidationException.class);
        // The shortest limit still leaves exactly one date to choose.
        BookingTiming shortest = policy.timingFor(SUBMITTED, 3);
        assertThat(shortest.earliestMoveInDate()).isEqualTo(shortest.latestMoveInDate());
    }

    @Test
    void aMensPgTakesMenAWomensPgTakesWomenAndEveryoneSaysWhoTheyAre() {
        BookingPolicy.requireGenderFits(PgFor.MALE, Gender.MALE);
        BookingPolicy.requireGenderFits(PgFor.FEMALE, Gender.FEMALE);
        for (Gender gender : new Gender[]{Gender.MALE, Gender.FEMALE, Gender.TRANSGENDER, Gender.OTHER}) {
            BookingPolicy.requireGenderFits(PgFor.ANYONE, gender);
            BookingPolicy.requireGenderFits(null, gender);
        }
        for (Gender gender : new Gender[]{Gender.FEMALE, Gender.TRANSGENDER, Gender.OTHER}) {
            assertThatThrownBy(() -> BookingPolicy.requireGenderFits(PgFor.MALE, gender))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("men only");
        }
        for (Gender gender : new Gender[]{Gender.MALE, Gender.TRANSGENDER, Gender.OTHER}) {
            assertThatThrownBy(() -> BookingPolicy.requireGenderFits(PgFor.FEMALE, gender))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("women only");
        }
        for (PgFor pgFor : PgFor.values()) {
            for (Gender unsaid : new Gender[]{null, Gender.UNDECLARED}) {
                assertThatThrownBy(() -> BookingPolicy.requireGenderFits(pgFor, unsaid))
                        .isInstanceOf(ValidationException.class);
            }
        }
    }

    private BookingStatus next(BookingAction action, BookingStatus status, BookingOffer offer, BookingParty actor) {
        return next(action, status, offer, TOKEN_TO_AGREE, actor);
    }

    private BookingStatus next(BookingAction action, BookingStatus status, BookingOffer offer,
            BookingTokenHold tokenHold, BookingParty actor) {
        return BookingActionRules.nextStatus(action, status, policy.newRequestTiming(), offer, tokenHold,
                actor, true, false, DURING_REVIEW);
    }

    private static Set<BookingAction> actions(BookingStatus status, BookingTiming timing, BookingOffer offer,
            BookingParty actor, boolean mayManage, boolean stayStarted, Instant now) {
        return actions(status, timing, offer, TOKEN_TO_AGREE, actor, mayManage, stayStarted, now);
    }

    private static Set<BookingAction> actions(BookingStatus status, BookingTiming timing, BookingOffer offer,
            BookingTokenHold tokenHold, BookingParty actor, boolean mayManage, boolean stayStarted, Instant now) {
        return BookingActionRules.allowedActions(status, timing, offer, tokenHold, actor, mayManage, stayStarted, now);
    }

    @Test
    void receivedTokensAwaitPropertyConfirmationWithoutAnyPaymentOrNegotiationClock() {
        var timing = policy.newRequestTiming();
        var overdue = BookingTokenHold.due(DURING_REVIEW, false);
        var later = timing.expiresAt().plusSeconds(86400);
        assertThat(BookingPolicy.effectiveStatusAt(BookingStatus.TOKEN_RECEIVED, timing, overdue, later))
                .isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(actions(BookingStatus.TOKEN_RECEIVED, timing, TENANT_OFFER, overdue,
                BookingParty.MANAGEMENT, true, false, later)).containsExactlyInAnyOrder(BookingAction.CONFIRM, BookingAction.CANCEL);
        // No cancelling by the tenant once the token is received (user, 2026-10-27).
        assertThat(actions(BookingStatus.TOKEN_RECEIVED, timing, TENANT_OFFER, overdue,
                BookingParty.TENANT, true, false, later)).isEmpty();
        assertThat(actions(BookingStatus.TOKEN_RECEIVED, timing, TENANT_OFFER, overdue,
                BookingParty.MANAGEMENT, false, false, later)).isEmpty();
        assertThat(BookingStatus.TOKEN_RECEIVED.holdsBed()).isTrue();
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void set(Instant instant) {
            this.instant = instant;
        }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(instant, zone); }
        @Override public Instant instant() { return instant; }
    }
}
