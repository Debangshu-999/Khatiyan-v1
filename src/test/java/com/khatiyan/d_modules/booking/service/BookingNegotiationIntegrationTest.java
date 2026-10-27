package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.support.IntegrationTest;

/**
 * Answering a booking request, against the real schema (user's rules,
 * 2026-10-09 and 10): offers back and forth, agreeing terms, and every way a
 * booking can end before the stay starts.
 *
 * <p>Fixture PG takes a Rs 2,000 token that does not come back, with a
 * Rs 10,000 deposit and rooms at Rs 8,000. Open House, a second property,
 * takes no token at all, so agreeing terms there confirms the booking.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingNegotiationIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingSettingsService settings;
    @Autowired private SettableClock clock;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID openHouse;
    private UUID openOwner;
    private UUID openRoom;
    private UUID tenant;
    private LocalDate today;

    @BeforeEach
    void seed() {
        clock.set(null);
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerOf(property);
        jdbc.update("UPDATE property.properties SET standard_deposit_paise = 1000000 WHERE id = ?", property);
        room = fx.room(property, 6, 0);
        settings.create(owner, property, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
        openHouse = fx.property();
        openOwner = fx.ownerOf(openHouse);
        openRoom = fx.room(openHouse, 6, 0);
        settings.create(openOwner, openHouse, new SaveBookingSettingsRequest(false, null, null, 21, true));
        tenant = fx.person();
    }

    @AfterEach
    void remove() {
        clock.set(null);
        fx.remove();
    }

    // ---- Agreeing ------------------------------------------------------------

    @Test
    void acceptingTheTenantsOfferFixesTheTermsAndKeepsTheBedForTheToken() {
        BookingRequestResponse sent = send(tenant, property, room, null);
        BookingRequestResponse agreed = negotiation.acceptForProperty(owner, property, sent.id(), 1);

        assertThat(agreed.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(agreed.agreedRentPaise()).isEqualTo(800_000L);
        assertThat(agreed.tokenPaise()).isEqualTo(200_000L);
        assertThat(agreed.tokenDueAt()).isEqualTo(agreed.agreedAt().plus(48, ChronoUnit.HOURS));
        assertThat(agreed.confirmedAt()).isNull();
        // Deposit plus the first month, less the token.
        assertThat(agreed.dueAtMoveInPaise()).isEqualTo(1_600_000L);
        // Answering it first made the owner its handler, a step before the answer itself.
        assertThat(agreed.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactly(BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.AGREED);
        assertThat(agreed.history().get(2).party()).isEqualTo(BookingParty.MANAGEMENT);
        assertThat(agreed.handlerUserId()).isEqualTo(owner);
        // Nothing left to negotiate: either side may only cancel.
        assertThat(agreed.allowedActions()).containsExactly(BookingAction.CANCEL);
        assertThat(bookings.forTenant(tenant, sent.id()).allowedActions()).containsExactly(BookingAction.CANCEL);
        // Agreeing touched no bed: the one it has held since it was sent is still its own.
        assertThat(holdStateOf(sent.id())).isEqualTo("HELD");
        assertThat(reservedIn(room)).isEqualTo(1);
        // The request clock is spent, and the offer cannot be answered again.
        assertThatThrownBy(() -> negotiation.acceptForProperty(owner, property, sent.id(), 1))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> negotiation.counter(tenant, sent.id(), 1, 700_000L))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void offersGoBackAndForthEveryOneIsKeptAndTheClockNeverMoves() {
        BookingRequestResponse sent = send(tenant, property, room, 700_000L);
        assertThat(sent.currentRentPaise()).isEqualTo(700_000L);

        BookingRequestResponse countered = negotiation.offer(owner, property, sent.id(), 1, 780_000L, true);
        assertThat(countered.status()).isEqualTo(BookingStatus.AWAITING_TENANT);
        assertThat(countered.currentOfferSequence()).isEqualTo(2);
        assertThat(bookings.forTenant(tenant, sent.id()).allowedActions())
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.COUNTER, BookingAction.CANCEL);
        // Its own offer is on the table: the property can only withdraw from the whole thing.
        assertThat(countered.allowedActions()).containsExactly(BookingAction.CANCEL);

        BookingRequestResponse back = negotiation.counter(tenant, sent.id(), 2, 750_000L);
        assertThat(back.status()).isEqualTo(BookingStatus.AWAITING_HANDLER);

        // The property's last word. The tenant may take it or leave it, and cannot counter.
        BookingRequestResponse last = negotiation.offer(owner, property, sent.id(), 3, 760_000L, false);
        assertThat(last.currentOfferNegotiable()).isFalse();
        assertThat(bookings.forTenant(tenant, sent.id()).allowedActions())
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);
        assertThatThrownBy(() -> negotiation.counter(tenant, sent.id(), 4, 755_000L))
                .isInstanceOf(ValidationException.class);

        BookingRequestResponse agreed = negotiation.accept(tenant, sent.id(), 4);
        assertThat(agreed.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(agreed.agreedRentPaise()).isEqualTo(760_000L);
        assertThat(agreed.listedRentPaise()).isEqualTo(800_000L);
        assertThat(agreed.offers()).extracting(BookingRequestResponse.Offer::monthlyRentPaise)
                .containsExactly(700_000L, 780_000L, 750_000L, 760_000L);
        assertThat(agreed.offers()).extracting(BookingRequestResponse.Offer::madeBy).containsExactly(
                BookingParty.TENANT, BookingParty.MANAGEMENT, BookingParty.TENANT, BookingParty.MANAGEMENT);
        assertThat(agreed.offers()).extracting(BookingRequestResponse.Offer::negotiable)
                .containsExactly(true, true, true, false);
        assertThat(agreed.history()).extracting(BookingRequestResponse.HistoryItem::type).containsExactly(
                BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.COUNTERED,
                BookingActionType.COUNTERED, BookingActionType.FINAL_OFFER, BookingActionType.AGREED);
        // Four offers later the request clock and the dates are exactly what they were when it was sent.
        assertThat(agreed.expiresAt()).isEqualTo(sent.expiresAt());
        assertThat(agreed.bookingDate()).isEqualTo(sent.bookingDate());
        assertThat(agreed.earliestMoveInDate()).isEqualTo(sent.earliestMoveInDate());
        assertThat(agreed.latestMoveInDate()).isEqualTo(sent.latestMoveInDate());
        assertThat(reservedIn(room)).isEqualTo(1);
    }

    /**
     * The user's rule, 2026-10-11: "block counter offer on handler side if the
     * person has raised a booking request at the room rent". Someone who asks
     * for the room at its own price has left nothing to bargain over. The
     * property may take the request or decline it.
     */
    @Test
    void aRequestAtTheListedRentCanBeTakenOrDeclinedByThePropertyButNotCountered() {
        BookingRequestResponse sent = send(tenant, property, room, null);
        assertThat(sent.currentRentPaise()).isEqualTo(sent.listedRentPaise());

        assertThat(bookings.forProperty(owner, property, sent.id()).allowedActions())
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);
        // Refused on the server too, whatever a screen sends, and in words that say why.
        assertThatThrownBy(() -> negotiation.offer(owner, property, sent.id(), 1, 780_000L, true))
                .isInstanceOf(ValidationException.class).hasMessageContaining("asked at the room's listed rent");
        assertThatThrownBy(() -> negotiation.offer(owner, property, sent.id(), 1, null, false))
                .isInstanceOf(ValidationException.class).hasMessageContaining("nothing to counter");
        assertThat(bookings.forProperty(owner, property, sent.id()).currentOfferSequence()).isEqualTo(1);

        // It is still theirs to take as asked.
        assertThat(negotiation.acceptForProperty(owner, property, sent.id(), 1).agreedRentPaise())
                .isEqualTo(sent.listedRentPaise());
    }

    /** Asking below the listed rent is bargaining, and the property may answer it as before. */
    @Test
    void aRequestBelowTheListedRentIsStillThePropertysToCounter() {
        BookingRequestResponse sent = send(tenant, property, room, 700_000L);

        assertThat(bookings.forProperty(owner, property, sent.id()).allowedActions())
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.COUNTER, BookingAction.CANCEL);
        assertThat(negotiation.offer(owner, property, sent.id(), 1, 780_000L, true).status())
                .isEqualTo(BookingStatus.AWAITING_TENANT);
    }

    /** The same holds later in the talk: a tenant who comes up to the listed rent has ended the bargaining. */
    @Test
    void aTenantWhoCountersUpToTheListedRentAlsoLeavesNothingToCounter() {
        BookingRequestResponse sent = send(tenant, property, room, 700_000L);
        negotiation.offer(owner, property, sent.id(), 1, 780_000L, true);
        negotiation.counter(tenant, sent.id(), 2, sent.listedRentPaise());

        assertThat(bookings.forProperty(owner, property, sent.id()).allowedActions())
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);
        assertThatThrownBy(() -> negotiation.offer(owner, property, sent.id(), 3, 790_000L, true))
                .isInstanceOf(ValidationException.class).hasMessageContaining("asked at the room's listed rent");
        // The tenant's own choices are untouched by the rule: it is the property's answer that is narrowed.
        assertThat(bookings.forTenant(tenant, sent.id()).allowedActions()).containsExactly(BookingAction.CANCEL);
    }

    @Test
    void aFinalOfferWithNoRentIsTheRoomsRentAsItStandsThatDay() {
        BookingRequestResponse sent = send(tenant, property, room, 700_000L);
        // A counter the tenant may answer has to name its rent.
        assertThatThrownBy(() -> negotiation.offer(owner, property, sent.id(), 1, null, true))
                .isInstanceOf(ValidationException.class).hasMessageContaining("monthly rent");
        jdbc.update("UPDATE property.rooms SET base_rent_paise = 850000 WHERE id = ?", room);

        BookingRequestResponse last = negotiation.offer(owner, property, sent.id(), 1, null, false);
        // Written down as a figure, never left as "the room's rent".
        assertThat(last.currentRentPaise()).isEqualTo(850_000L);
        assertThat(last.offers().get(1).monthlyRentPaise()).isEqualTo(850_000L);
        // What the tenant was shown when they asked does not move.
        assertThat(last.listedRentPaise()).isEqualTo(800_000L);
    }

    @Test
    void agreedTermsDoNotMoveWhenThePropertyChangesItsPricesOrItsRules() {
        BookingRequestResponse sent = send(tenant, property, room, 750_000L);
        BookingRequestResponse agreed = negotiation.acceptForProperty(owner, property, sent.id(), 1);

        // The room goes up, the deposit goes up, and the owner asks for a bigger token that now comes back.
        jdbc.update("UPDATE property.rooms SET base_rent_paise = 990000 WHERE id = ?", room);
        jdbc.update("UPDATE property.properties SET standard_deposit_paise = 2500000 WHERE id = ?", property);
        settings.save(owner, property, new SaveBookingSettingsRequest(true, 500_000L, true, 21, true));

        BookingRequestResponse later = bookings.forTenant(tenant, sent.id());
        assertThat(later.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(later.agreedRentPaise()).isEqualTo(750_000L);
        assertThat(later.currentRentPaise()).isEqualTo(750_000L);
        assertThat(later.listedRentPaise()).isEqualTo(800_000L);
        assertThat(later.depositPaise()).isEqualTo(1_000_000L);
        assertThat(later.tokenPaise()).isEqualTo(200_000L);
        assertThat(later.tokenRefundable()).isFalse();
        assertThat(later.tokenDueAt()).isEqualTo(agreed.tokenDueAt());
        assertThat(later.dueAtMoveInPaise()).isEqualTo(1_550_000L);
        assertThat(later.moveInDate()).isEqualTo(sent.moveInDate());
        assertThat(later.latestMoveInDate()).isEqualTo(sent.latestMoveInDate());
        assertThat(later.roomNumber()).isEqualTo(sent.roomNumber());
        assertThat(later.agreementMonths()).isEqualTo(sent.agreementMonths());
    }

    @Test
    void anAnswerToAnOfferThatIsNoLongerOnTheTableIsRefused() {
        BookingRequestResponse sent = send(tenant, property, room, 700_000L);
        negotiation.offer(owner, property, sent.id(), 1, 780_000L, true);

        // The tenant's screen still shows their own first offer.
        assertThatThrownBy(() -> negotiation.accept(tenant, sent.id(), 1)).isInstanceOf(StaleVersionException.class);
        assertThatThrownBy(() -> negotiation.counter(tenant, sent.id(), 1, 720_000L))
                .isInstanceOf(StaleVersionException.class);
        // And nobody accepts their own offer.
        assertThatThrownBy(() -> negotiation.acceptForProperty(owner, property, sent.id(), 2))
                .isInstanceOf(ValidationException.class);
        BookingRequestResponse read = bookings.forTenant(tenant, sent.id());
        assertThat(read.status()).isEqualTo(BookingStatus.AWAITING_TENANT);
        assertThat(read.offers()).hasSize(2);
        assertThat(read.agreedAt()).isNull();
    }

    @Test
    void twoAnswersFromOnePersonAtTheSameMomentOneCounts() throws Exception {
        BookingRequestResponse sent = send(tenant, property, room, 700_000L);
        negotiation.offer(owner, property, sent.id(), 1, 780_000L, true);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        try {
            var accepts = threads.submit(together(() -> negotiation.accept(tenant, sent.id(), 2), ready, go));
            var counters = threads.submit(together(() -> negotiation.counter(tenant, sent.id(), 2, 720_000L), ready, go));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            assertThat(List.of(accepts.get(30, TimeUnit.SECONDS), counters.get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        } finally {
            go.countDown();
            threads.shutdownNow();
        }
        BookingRequestResponse read = bookings.forTenant(tenant, sent.id());
        // Either it was accepted at the property's rent, or countered: never both.
        if (read.status() == BookingStatus.AWAITING_TOKEN) {
            assertThat(read.agreedRentPaise()).isEqualTo(780_000L);
            assertThat(read.offers()).hasSize(2);
        } else {
            assertThat(read.status()).isEqualTo(BookingStatus.AWAITING_HANDLER);
            assertThat(read.offers()).hasSize(3);
            assertThat(read.agreedAt()).isNull();
        }
    }

    @Test
    void thePropertyAcceptingAsTheTenantWithdrawsLeavesItCancelledAndTheBedFreedOnce() throws Exception {
        BookingRequestResponse sent = send(tenant, property, room, null);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        boolean accepted;
        try {
            var accepts = threads.submit(together(
                    () -> negotiation.acceptForProperty(owner, property, sent.id(), 1), ready, go));
            var cancels = threads.submit(together(() -> negotiation.cancel(tenant, sent.id()), ready, go));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            accepted = accepts.get(30, TimeUnit.SECONDS);
            // A tenant may walk away before terms are agreed and after, so the withdrawal lands whichever came first.
            assertThat(cancels.get(30, TimeUnit.SECONDS)).isTrue();
        } finally {
            go.countDown();
            threads.shutdownNow();
        }
        BookingRequestResponse read = bookings.forTenant(tenant, sent.id());
        assertThat(read.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(read.endCause()).isEqualTo(BookingEndCause.TENANT_CANCELLED);
        assertThat(read.agreedAt() != null).isEqualTo(accepted);
        assertThat(read.history()).extracting(BookingRequestResponse.HistoryItem::type).containsExactlyElementsOf(
                accepted
                        ? List.of(BookingActionType.SUBMITTED, BookingActionType.AGREED, BookingActionType.CANCELLED)
                        : List.of(BookingActionType.SUBMITTED, BookingActionType.CANCELLED));
        assertThat(holdStateOf(sent.id())).isEqualTo("RELEASED");
        assertThat(reservedIn(room)).isZero();
        assertThat(cooldownOf(sent.id())).isNull();
    }

    @Test
    void twoPropertiesAcceptingTheSamePersonAtTheSameMomentOneBookingIsConfirmed() throws Exception {
        UUID third = fx.property();
        UUID thirdOwner = fx.ownerOf(third);
        settings.create(thirdOwner, third, new SaveBookingSettingsRequest(false, null, null, 21, true));
        UUID thirdRoom = fx.room(third, 2, 0);
        BookingRequestResponse here = send(tenant, openHouse, openRoom, null);
        BookingRequestResponse there = send(tenant, third, thirdRoom, null);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        try {
            var one = threads.submit(together(
                    () -> negotiation.acceptForProperty(openOwner, openHouse, here.id(), 1), ready, go));
            var other = threads.submit(together(
                    () -> negotiation.acceptForProperty(thirdOwner, third, there.id(), 1), ready, go));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            assertThat(List.of(one.get(30, TimeUnit.SECONDS), other.get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        } finally {
            go.countDown();
            threads.shutdownNow();
        }
        BookingRequestResponse atHere = bookings.forProperty(openOwner, openHouse, here.id());
        BookingRequestResponse atThere = bookings.forProperty(thirdOwner, third, there.id());
        assertThat(List.of(atHere.status(), atThere.status()))
                .containsExactlyInAnyOrder(BookingStatus.CONFIRMED, BookingStatus.CANCELLED);
        BookingRequestResponse lost = atHere.status() == BookingStatus.CANCELLED ? atHere : atThere;
        // The one that lost was withdrawn by the other's confirmation. It was never agreed.
        assertThat(lost.endCause()).isEqualTo(BookingEndCause.BOOKED_ELSEWHERE);
        assertThat(lost.agreedAt()).isNull();
        assertThat(holdStateOf(lost.id())).isEqualTo("RELEASED");
        assertThat(reservedIn(openRoom) + reservedIn(thirdRoom)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM booking.requests WHERE prospect_user_id = ? AND status = 'CONFIRMED'",
                Integer.class, tenant)).isEqualTo(1);
    }

    // ---- Confirming ----------------------------------------------------------

    @Test
    void whereNoTokenIsTakenAgreeingConfirmsAndEverythingElseThePersonHasIsWithdrawn() {
        // Three properties, a visit at each. Terms are agreed at the first, and its token is awaited.
        BookingRequestResponse awaitingToken = send(tenant, property, room, null);
        negotiation.acceptForProperty(owner, property, awaitingToken.id(), 1);
        UUID third = fx.property();
        UUID thirdOwner = fx.ownerOf(third);
        settings.create(thirdOwner, third, new SaveBookingSettingsRequest(false, null, null, 21, true));
        UUID thirdRoom = fx.room(third, 2, 0);
        BookingRequestResponse pending = send(tenant, third, thirdRoom, 700_000L);
        BookingRequestResponse there = send(tenant, openHouse, openRoom, null);
        assertThat(there.tokenRequired()).isFalse();

        BookingRequestResponse confirmed = negotiation.acceptForProperty(openOwner, openHouse, there.id(), 1);
        assertThat(confirmed.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(confirmed.confirmedAt()).isEqualTo(confirmed.agreedAt());
        assertThat(confirmed.tokenPaise()).isZero();
        assertThat(confirmed.tokenDueAt()).isNull();
        assertThat(confirmed.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactly(BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.AGREED,
                        BookingActionType.CONFIRMED);
        assertThat(holdStateOf(there.id())).isEqualTo("HELD");

        // One confirmed booking per person: whatever else they had going, anywhere, is withdrawn and its bed freed.
        BookingRequestResponse agreedElsewhere = bookings.forProperty(owner, property, awaitingToken.id());
        BookingRequestResponse askedElsewhere = bookings.forProperty(thirdOwner, third, pending.id());
        assertThat(agreedElsewhere.history()).extracting(BookingRequestResponse.HistoryItem::type).containsExactly(
                BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.AGREED,
                BookingActionType.WITHDRAWN);
        assertThat(askedElsewhere.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactly(BookingActionType.SUBMITTED, BookingActionType.WITHDRAWN);
        for (BookingRequestResponse withdrawn : List.of(agreedElsewhere, askedElsewhere)) {
            assertThat(withdrawn.status()).isEqualTo(BookingStatus.CANCELLED);
            assertThat(withdrawn.endCause()).isEqualTo(BookingEndCause.BOOKED_ELSEWHERE);
            assertThat(withdrawn.cancelledBy()).isNull();
            assertThat(withdrawn.allowedActions()).isEmpty();
            assertThat(holdStateOf(withdrawn.id())).isEqualTo("RELEASED");
            assertThat(cooldownOf(withdrawn.id())).isNull();
        }
        assertThat(reservedIn(room)).isZero();
        assertThat(reservedIn(thirdRoom)).isZero();
        assertThat(reservedIn(openRoom)).isEqualTo(1);

        // And they cannot ask for another bed while that booking stands.
        UUID fourth = fx.property();
        settings.create(fx.ownerOf(fourth), fourth, new SaveBookingSettingsRequest(false, null, null, 21, true));
        UUID fourthRoom = fx.room(fourth, 2, 0);
        assertThatThrownBy(() -> send(tenant, fourth, fourthRoom, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("confirmed booking");
    }

    // ---- Ending --------------------------------------------------------------

    @Test
    void tenantWithdrawalReasonIsSavedForBothSidesAndItsHistoryWithoutChangingThePenalty() {
        BookingRequestResponse sent = send(tenant, property, room, null);
        BookingRequestResponse withdrawn = negotiation.cancel(tenant, sent.id(), "  My move-in plans changed  ");
        assertThat(withdrawn.cancelReason()).isEqualTo("My move-in plans changed");
        assertThat(withdrawn.history().getLast().note()).isEqualTo("My move-in plans changed");
        BookingRequestResponse propertyView = bookings.forProperty(owner, property, sent.id());
        assertThat(propertyView.cancelReason()).isEqualTo("My move-in plans changed");
        assertThat(propertyView.history().getLast().note()).isEqualTo("My move-in plans changed");
        assertThat(jdbc.queryForObject("SELECT cancel_reason FROM booking.requests WHERE id = ?", String.class, sent.id()))
                .isEqualTo("My move-in plans changed");
        assertThat(holdStateOf(sent.id())).isEqualTo("RELEASED");
        assertThat(reservedIn(room)).isZero();
        assertThat(cooldownOf(sent.id())).isNull();
        assertThat(slotOf(sent.id())).isEqualTo(1);
    }

    @Test
    void invalidTenantWithdrawalReasonsDoNotEndTheRequestOrReleaseItsBed() {
        BookingRequestResponse sent = send(tenant, property, room, null);
        for (String invalid : List.of("   ", "x".repeat(501))) {
            assertThatThrownBy(() -> negotiation.cancel(tenant, sent.id(), invalid))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("reason within 500");
        }
        assertThat(bookings.forTenant(tenant, sent.id()).status()).isEqualTo(BookingStatus.AWAITING_HANDLER);
        assertThat(bookings.forTenant(tenant, sent.id()).history()).hasSize(1);
        assertThat(holdStateOf(sent.id())).isEqualTo("HELD");
        assertThat(reservedIn(room)).isEqualTo(1);
    }

    @Test
    void aTenantWithdrawingARequestGetsNoPenaltyAndTheBedGoesBack() {
        BookingRequestResponse sent = send(tenant, property, room, null);
        BookingRequestResponse withdrawn = negotiation.cancel(tenant, sent.id());

        assertThat(withdrawn.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(withdrawn.endCause()).isEqualTo(BookingEndCause.TENANT_CANCELLED);
        assertThat(withdrawn.cancelledBy()).isEqualTo(BookingParty.TENANT);
        assertThat(withdrawn.allowedActions()).isEmpty();
        assertThat(withdrawn.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactly(BookingActionType.SUBMITTED, BookingActionType.CANCELLED);
        assertThat(holdStateOf(sent.id())).isEqualTo("RELEASED");
        assertThat(reservedIn(room)).isZero();
        assertThat(cooldownOf(sent.id())).isNull();
        // It used one of the visit's two requests, and the other is still theirs.
        assertThat(slotOf(sent.id())).isEqualTo(1);
        UUID enquiry = jdbc.queryForObject("SELECT enquiry_id FROM booking.requests WHERE id = ?", UUID.class, sent.id());
        BookingRequestResponse again = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10)));
        assertThat(slotOf(again.id())).isEqualTo(2);
        // Withdrawing twice changes nothing.
        assertThatThrownBy(() -> negotiation.cancel(tenant, sent.id())).isInstanceOf(ValidationException.class);
    }

    @Test
    void thePropertyDecliningNeedsAReasonAndCostsTheTenantNothingButTheRequest() {
        BookingRequestResponse sent = send(tenant, property, room, null);
        for (String blank : new String[]{null, "", "   "}) {
            assertThatThrownBy(() -> negotiation.cancelForProperty(owner, property, sent.id(), blank))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("reason");
        }
        assertThat(holdStateOf(sent.id())).isEqualTo("HELD");

        BookingRequestResponse declined = negotiation.cancelForProperty(owner, property, sent.id(),
                "  That bed is being kept for a returning tenant.  ");
        assertThat(declined.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(declined.endCause()).isEqualTo(BookingEndCause.MANAGEMENT_CANCELLED);
        assertThat(declined.cancelledBy()).isEqualTo(BookingParty.MANAGEMENT);
        assertThat(declined.cancelReason()).isEqualTo("That bed is being kept for a returning tenant.");
        assertThat(bookings.forTenant(tenant, sent.id()).cancelReason())
                .isEqualTo("That bed is being kept for a returning tenant.");
        assertThat(holdStateOf(sent.id())).isEqualTo("RELEASED");
        assertThat(cooldownOf(sent.id())).isNull();
        // Declined before anything was agreed: the request was used.
        assertThat(slotOf(sent.id())).isEqualTo(1);
    }

    @Test
    void cancellingWhileTheTokenIsAwaitedFreesTheBedAndOnlyThePropertysCancellationGivesTheRequestBack() {
        BookingRequestResponse tenants = send(tenant, property, room, null);
        negotiation.acceptForProperty(owner, property, tenants.id(), 1);
        BookingRequestResponse byTenant = negotiation.cancel(tenant, tenants.id());
        assertThat(byTenant.endCause()).isEqualTo(BookingEndCause.TENANT_CANCELLED);
        assertThat(holdStateOf(tenants.id())).isEqualTo("RELEASED");
        // No token was received and nothing was held for nothing: no cooldown.
        assertThat(cooldownOf(tenants.id())).isNull();
        assertThat(slotOf(tenants.id())).isEqualTo(1);

        UUID other = fx.person();
        BookingRequestResponse propertys = send(other, property, room, null);
        negotiation.acceptForProperty(owner, property, propertys.id(), 1);
        BookingRequestResponse byProperty = negotiation.cancelForProperty(owner, property, propertys.id(),
                "The room has a leak.");
        assertThat(byProperty.endCause()).isEqualTo(BookingEndCause.MANAGEMENT_CANCELLED);
        assertThat(holdStateOf(propertys.id())).isEqualTo("RELEASED");
        // The property agreed and then pulled out, so the visit gets its request back.
        assertThat(slotOf(propertys.id())).isNull();
        assertThat(reservedIn(room)).isZero();
    }

    /** The one cancellation that costs a tenant more than the request: a confirmed bed held for nothing. */
    @Test
    void walkingAwayFromAConfirmedBedThatTookNoTokenClosesThatVisitAndThePropertyForAWhile() {
        BookingRequestResponse sent = send(tenant, openHouse, openRoom, null);
        negotiation.acceptForProperty(openOwner, openHouse, sent.id(), 1);
        Instant before = Instant.now();
        BookingRequestResponse cancelled = negotiation.cancel(tenant, sent.id());

        assertThat(cancelled.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(cancelled.endCause()).isEqualTo(BookingEndCause.TENANT_CANCELLED);
        assertThat(holdStateOf(sent.id())).isEqualTo("RELEASED");
        assertThat(cooldownOf(sent.id())).isBetween(before.plus(30, ChronoUnit.DAYS).minusSeconds(5),
                Instant.now().plus(30, ChronoUnit.DAYS).plusSeconds(5));
        UUID enquiry = jdbc.queryForObject("SELECT enquiry_id FROM booking.requests WHERE id = ?", UUID.class, sent.id());
        assertThat(jdbc.queryForObject("SELECT booking_window_closed_at FROM enquiry.enquiries WHERE id = ?",
                Timestamp.class, enquiry)).isNotNull();
        // That visit can no longer be booked on.
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, openRoom, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("closed for this visit");
        // Cancelling again is refused, and does not push the 30 days out.
        Instant until = cooldownOf(sent.id());
        assertThatThrownBy(() -> negotiation.cancel(tenant, sent.id())).isInstanceOf(ValidationException.class);
        assertThat(cooldownOf(sent.id())).isEqualTo(until);
    }

    @Test
    void thePropertyCancellingAConfirmedBookingNeverPenalisesTheTenant() {
        BookingRequestResponse sent = send(tenant, openHouse, openRoom, null);
        negotiation.acceptForProperty(openOwner, openHouse, sent.id(), 1);
        BookingRequestResponse cancelled = negotiation.cancelForProperty(openOwner, openHouse, sent.id(),
                "The property is closing for repairs.");

        assertThat(cancelled.endCause()).isEqualTo(BookingEndCause.MANAGEMENT_CANCELLED);
        assertThat(holdStateOf(sent.id())).isEqualTo("RELEASED");
        assertThat(cooldownOf(sent.id())).isNull();
        assertThat(slotOf(sent.id())).isNull();
        UUID enquiry = jdbc.queryForObject("SELECT enquiry_id FROM booking.requests WHERE id = ?", UUID.class, sent.id());
        assertThat(jdbc.queryForObject("SELECT booking_window_closed_at FROM enquiry.enquiries WHERE id = ?",
                Timestamp.class, enquiry)).isNull();
        // They may ask again on the same visit, here or anywhere.
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, openRoom, today.plusDays(10))).status())
                .isEqualTo(BookingStatus.AWAITING_HANDLER);
    }

    // ---- Who may answer ------------------------------------------------------

    @Test
    void onlyTheOwnerOrTheRequestsHandlerAnswersIt() {
        UUID anita = fx.manager(property, "Anita");
        UUID bilal = fx.manager(property, "Bilal");
        UUID chitra = fx.manager(property, "Chitra");
        fx.grantBookings(property, anita);
        fx.grantBookings(property, bilal);
        BookingRequestResponse sent = send(tenant, property, room, 700_000L);

        // On the access list and nobody has it. Opening it is only a look: her answer is what makes it hers
        // (user, 2026-10-11).
        assertThat(bookings.open(anita, property, sent.id()).handlerUserId()).isNull();
        BookingRequestResponse countered = negotiation.offer(anita, property, sent.id(), 1, 780_000L, true);
        assertThat(countered.status()).isEqualTo(BookingStatus.AWAITING_TENANT);
        assertThat(countered.handlerUserId()).isEqualTo(anita);

        negotiation.counter(tenant, sent.id(), 2, 750_000L);
        assertThatThrownBy(() -> negotiation.acceptForProperty(bilal, property, sent.id(), 3))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Someone else is handling");
        assertThatThrownBy(() -> negotiation.cancelForProperty(bilal, property, sent.id(), "Not mine to decline."))
                .isInstanceOf(ValidationException.class);
        // Not on the access list at all, and a stranger.
        assertThatThrownBy(() -> negotiation.acceptForProperty(chitra, property, sent.id(), 3))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> negotiation.acceptForProperty(fx.person(), property, sent.id(), 3))
                .isInstanceOf(ForbiddenException.class);
        // Another property's owner cannot reach it through their own property.
        assertThatThrownBy(() -> negotiation.acceptForProperty(openOwner, openHouse, sent.id(), 3))
                .isInstanceOf(NotFoundException.class);
        // Nor can another tenant answer or withdraw it.
        UUID someoneElse = fx.person();
        assertThatThrownBy(() -> negotiation.cancel(someoneElse, sent.id())).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> negotiation.counter(someoneElse, sent.id(), 3, 1L)).isInstanceOf(NotFoundException.class);

        assertThat(bookings.forProperty(owner, property, sent.id()).status()).isEqualTo(BookingStatus.AWAITING_HANDLER);
        // The owner may always answer, whoever handles it.
        assertThat(negotiation.acceptForProperty(owner, property, sent.id(), 3).status())
                .isEqualTo(BookingStatus.AWAITING_TOKEN);
    }

    @Test
    void aRequestOutOfTimeTakesNoAnswerFromEitherSide() {
        BookingRequestResponse sent = send(tenant, property, room, 700_000L);
        negotiation.offer(owner, property, sent.id(), 1, 780_000L, true);
        clock.set(sent.expiresAt());

        assertThatThrownBy(() -> negotiation.accept(tenant, sent.id(), 2)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> negotiation.counter(tenant, sent.id(), 2, 720_000L)).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> negotiation.cancel(tenant, sent.id())).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> negotiation.cancelForProperty(owner, property, sent.id(), "Too late."))
                .isInstanceOf(ValidationException.class);
        assertThat(jdbc.queryForObject("SELECT status FROM booking.requests WHERE id = ?", String.class, sent.id()))
                .isEqualTo("AWAITING_TENANT");
        assertThat(bookings.forTenant(tenant, sent.id()).status()).isEqualTo(BookingStatus.EXPIRED);
    }

    // ---- Helpers -------------------------------------------------------------

    /** A request for day +10 on a visit made yesterday, at the listed rent unless one is proposed. */
    private BookingRequestResponse send(UUID person, UUID atProperty, UUID inRoom, Long proposedRentPaise) {
        UUID enquiry = fx.attendedEnquiry(atProperty, person, today.minusDays(1));
        return bookings.create(person, new CreateBookingRequest(enquiry, inRoom, null, today.plusDays(10),
                proposedRentPaise, null, "Asha Rao", "9007433360", null, Gender.FEMALE, LocalDate.of(2000, 1, 1),
                UUID.randomUUID().toString()));
    }

    private static Callable<Boolean> together(Runnable call, CountDownLatch ready, CountDownLatch go) {
        return () -> {
            ready.countDown();
            if (!go.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("start timeout");
            }
            try {
                call.run();
                return true;
            } catch (ValidationException | StaleVersionException refused) {
                return false;
            }
        };
    }

    private String holdStateOf(UUID request) {
        return jdbc.queryForObject(
                "SELECT state FROM tenancy.bed_holds WHERE owner_kind = 'BOOKING' AND owner_id = ?",
                String.class, request);
    }

    private int reservedIn(UUID theRoom) {
        return jdbc.queryForObject("SELECT reserved_count FROM property.rooms WHERE id = ?", Integer.class, theRoom);
    }

    private Integer slotOf(UUID request) {
        return jdbc.queryForObject("SELECT visit_slot FROM booking.requests WHERE id = ?", Integer.class, request);
    }

    private Instant cooldownOf(UUID request) {
        Timestamp until = jdbc.queryForObject("SELECT cooldown_until FROM booking.requests WHERE id = ?",
                Timestamp.class, request);
        return until == null ? null : until.toInstant();
    }
}
