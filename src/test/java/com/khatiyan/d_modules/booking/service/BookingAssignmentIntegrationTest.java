package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestListItemResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingSettingsResponse;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingAssignmentMode;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.support.IntegrationTest;

/**
 * Who sees a property's bookings and who handles each request, against the
 * real schema (user's rules, 2026-10-09).
 *
 * <p>Fixture PG has an owner and three managers. Anita and Bilal are on the
 * bookings access list. Chitra manages the property and is not on it.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingAssignmentIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingSettingsService settings;
    @Autowired private BookingHandlerService handlers;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private SettableClock clock;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID anita;
    private UUID bilal;
    private UUID chitra;
    private LocalDate today;

    @BeforeEach
    void seed() {
        clock.set(null);
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerOf(property);
        room = fx.room(property, 8, 0);
        anita = fx.manager(property, "Anita");
        bilal = fx.manager(property, "Bilal");
        chitra = fx.manager(property, "Chitra");
        fx.grantBookings(property, anita);
        fx.grantBookings(property, bilal);
        settings.create(owner, property, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
    }

    @AfterEach
    void remove() {
        clock.set(null);
        fx.remove();
    }

    // ---- The first to respond (user, 2026-10-11) -------------------------------

    @Test
    void whereTheFirstToRespondHandlesItARequestWaitsForSomeoneToAnswerIt() {
        UUID tenant = fx.person();
        UUID request = send(tenant).id();

        // Reading it, listing it, counting it and opening it take nothing.
        assertThat(bookings.forProperty(anita, property, request).handlerUserId()).isNull();
        assertThat(bookings.pageForProperty(bilal, property, BookingListFilter.OPEN, 0, 20).items()).singleElement()
                .satisfies(item -> {
                    assertThat(item.handlerUserId()).isNull();
                    assertThat(item.handledByReader()).isFalse();
                });
        bookings.countsForProperty(anita, property);
        assertThat(bookings.open(anita, property, request).handlerUserId()).isNull();
        assertThat(bookings.open(owner, property, request).handlerUserId()).isNull();
        assertThat(storedHandler(request)).isNull();
        // Nobody handles it yet, so anyone with booking access may answer it. It was asked at the listed
        // rent, so there is nothing to counter: take it or decline it.
        for (UUID person : List.of(owner, anita, bilal)) {
            assertThat(bookings.forProperty(person, property, request).allowedActions())
                    .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);
        }
        // It waits under All requests, and is nobody's.
        assertThat(unassignedOf(anita)).containsExactly(request);
        assertThat(mineOf(anita)).isEmpty();

        // The first to answer it is its handler from then on.
        BookingRequestResponse anitasView = negotiation.acceptForProperty(anita, property, request, 1);
        assertThat(anitasView.handlerUserId()).isEqualTo(anita);
        assertThat(anitasView.handlerName()).isEqualTo("Anita");
        assertThat(anitasView.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactlyInAnyOrder(BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.AGREED);
        assertThat(anitasView.history()).filteredOn(step -> step.type() == BookingActionType.ASSIGNED)
                .singleElement().satisfies(step -> assertThat(step.party()).isEqualTo(BookingParty.MANAGEMENT));

        // Assigned, it leaves All requests for her Assigned to me, and for nobody else's.
        for (UUID person : List.of(owner, anita, bilal)) {
            assertThat(unassignedOf(person)).isEmpty();
        }
        assertThat(mineOf(anita)).containsExactly(request);
        assertThat(mineOf(bilal)).isEmpty();
        assertThat(mineOf(owner)).isEmpty();
        // Her own row says it is hers. Anyone else's names her.
        assertThat(bookings.pageForProperty(anita, property, BookingListFilter.OPEN, 0, 20).items()).singleElement()
                .satisfies(item -> assertThat(item.handledByReader()).isTrue());
        assertThat(bookings.pageForProperty(owner, property, BookingListFilter.OPEN, 0, 20).items()).singleElement()
                .satisfies(item -> {
                    assertThat(item.handledByReader()).isFalse();
                    assertThat(item.handlerUserId()).isEqualTo(anita);
                    assertThat(item.handlerName()).isEqualTo("Anita");
                });

        // Another manager looks, and no more.
        BookingRequestResponse bilalsView = bookings.open(bilal, property, request);
        assertThat(bilalsView.handlerUserId()).isEqualTo(anita);
        assertThat(bilalsView.allowedActions()).isEmpty();
        assertThatThrownBy(() -> negotiation.cancelForProperty(bilal, property, request, "Not mine to cancel"))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Someone else is handling");
        // The owner may still act on it, and the tenant is told who has it.
        assertThat(bookings.forProperty(owner, property, request).allowedActions()).contains(BookingAction.CANCEL);
        assertThat(bookings.forTenant(tenant, request).handlerName()).isEqualTo("Anita");
    }

    /**
     * The owner is one of them (user, 2026-10-11: "A request handled did not
     * move to assigned to me"). An owner who answers a request nobody has is
     * its handler, and finds it under Assigned to me.
     */
    @Test
    void theOwnerAnsweringARequestNobodyHandlesTakesItAndItIsUnderAssignedToMe() {
        UUID request = send(fx.person()).id();
        assertThat(mineOf(owner)).isEmpty();
        // Opening it is only a look.
        assertThat(bookings.open(owner, property, request).handlerUserId()).isNull();

        BookingRequestResponse answered = negotiation.acceptForProperty(owner, property, request, 1);

        assertThat(answered.handlerUserId()).isEqualTo(owner);
        assertThat(mineOf(owner)).containsExactly(request);
        assertThat(unassignedOf(owner)).isEmpty();
        // A manager who opens it afterwards looks, and no more.
        BookingRequestResponse anitasView = bookings.open(anita, property, request);
        assertThat(anitasView.handlerUserId()).isEqualTo(owner);
        assertThat(anitasView.allowedActions()).isEmpty();
        assertThat(mineOf(anita)).isEmpty();

        // One a manager answered first stays the manager's when the owner acts on it.
        UUID other = send(fx.person()).id();
        negotiation.acceptForProperty(bilal, property, other, 1);
        negotiation.cancelForProperty(owner, property, other, "The room is being repaired");
        assertThat(storedHandler(other)).isEqualTo(bilal);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM booking.actions WHERE request_id = ? AND type = 'ASSIGNED'",
                Integer.class, other)).isEqualTo(1);
    }

    /** What is under this person's Assigned to me, among the bookings still going. */
    private List<UUID> mineOf(UUID person) {
        return bookings.pageForProperty(person, property, BookingListFilter.OPEN, null, true, null, 0, 20).items()
                .stream().map(BookingRequestListItemResponse::id).toList();
    }

    /** What is under All requests: the bookings still going that nobody handles. The same for whoever reads it. */
    private List<UUID> unassignedOf(UUID person) {
        return bookings.pageForProperty(person, property, BookingListFilter.OPEN, null, false, true, null, 0, 20)
                .items().stream().map(BookingRequestListItemResponse::id).toList();
    }

    @Test
    void twoManagersAnsweringTheSameRequestTogetherOneTakesIt() throws Exception {
        UUID request = send(fx.person()).id();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        try {
            var first = threads.submit(answers(anita, request, ready, go));
            var second = threads.submit(answers(bilal, request, ready, go));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            // One answer stands, and the request is that person's. The other is told someone else has it.
            boolean firstStood = first.get(30, TimeUnit.SECONDS);
            boolean secondStood = second.get(30, TimeUnit.SECONDS);
            assertThat(firstStood ^ secondStood).isTrue();
            assertThat(storedHandler(request)).isEqualTo(firstStood ? anita : bilal);
        } finally {
            go.countDown();
            threads.shutdownNow();
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM booking.actions WHERE request_id = ? AND type = 'ASSIGNED'",
                Integer.class, request)).isEqualTo(1);
    }

    @Test
    void anAnswerToARequestThatHasRunOutOfTimeTakesNothing() {
        BookingRequestResponse sent = send(fx.person());
        clock.set(sent.expiresAt());
        assertThat(bookings.open(anita, property, sent.id()).allowedActions()).isEmpty();
        // The answer is refused, and the name it would have written goes with it.
        assertThatThrownBy(() -> negotiation.acceptForProperty(anita, property, sent.id(), 1))
                .isInstanceOf(ValidationException.class);
        assertThat(storedHandler(sent.id())).isNull();
    }

    // ---- Turns ---------------------------------------------------------------

    @Test
    void whereTheSystemTakesTurnsEachNewRequestGoesToTheNextManager() {
        settings.save(owner, property, turns(false));
        List<UUID> inOrder = Stream.of(anita, bilal).sorted().toList();

        List<UUID> handlersGiven = new ArrayList<>();
        UUID first = null;
        for (int i = 0; i < 4; i++) {
            BookingRequestResponse sent = send(fx.person());
            handlersGiven.add(sent.handlerUserId());
            first = first == null ? sent.id() : first;
        }
        assertThat(handlersGiven).containsExactly(inOrder.get(0), inOrder.get(1), inOrder.get(0), inOrder.get(1));

        // The system did it, so the history names nobody.
        BookingRequestResponse read = bookings.forProperty(owner, property, first);
        assertThat(read.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactly(BookingActionType.SUBMITTED, BookingActionType.ASSIGNED);
        assertThat(read.history().get(1).party()).isNull();
        // Its handler may answer it without opening it first, and the other manager may only look.
        assertThat(bookings.forProperty(inOrder.get(0), property, first).allowedActions()).contains(BookingAction.ACCEPT);
        assertThat(bookings.open(inOrder.get(1), property, first).handlerUserId()).isEqualTo(inOrder.get(0));
        assertThat(bookings.forProperty(inOrder.get(1), property, first).allowedActions()).isEmpty();
    }

    @Test
    void theOwnerTakesATurnUnlessTheyOptedOutAndEveryTurnWhenThereIsNobodyElse() {
        // Turned on with nothing said about the owner: the owner is in the turns (user, 2026-10-11).
        settings.save(owner, property, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true,
                BookingAssignmentMode.SYSTEM_TURNS, null));
        List<UUID> given = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            given.add(send(fx.person()).handlerUserId());
        }
        assertThat(given).containsExactlyInAnyOrder(owner, anita, bilal);
        // Assigned on arrival, so none of them ever waits under All requests.
        assertThat(unassignedOf(owner)).isEmpty();
        assertThat(mineOf(owner)).hasSize(1);

        // Opted out, and nobody on the access list: a request must not end up with nobody.
        settings.save(owner, property, turns(false));
        fx.revokeBookings(property, anita);
        fx.revokeBookings(property, bilal);
        assertThat(send(fx.person()).handlerUserId()).isEqualTo(owner);
    }

    // ---- Who may see ---------------------------------------------------------

    @Test
    void aManagerWhoIsNotOnTheAccessListSeesNoBookings() {
        UUID request = send(fx.person()).id();
        assertThatThrownBy(() -> bookings.pageForProperty(chitra, property, BookingListFilter.OPEN, 0, 20))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> bookings.countsForProperty(chitra, property)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> bookings.forProperty(chitra, property, request)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> bookings.open(chitra, property, request)).isInstanceOf(ForbiddenException.class);
        assertThat(storedHandler(request)).isNull();
        // Nor may a manager change the owner's settings, on the list or not.
        assertThatThrownBy(() -> settings.save(anita, property, turns(false))).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> settings.forOwner(anita, property)).isInstanceOf(ForbiddenException.class);

        // Put on the list, she may answer it like anyone else, and the first to answer takes it.
        fx.grantBookings(property, chitra);
        assertThat(bookings.open(chitra, property, request).handlerUserId()).isNull();
        assertThat(negotiation.acceptForProperty(chitra, property, request, 1).handlerUserId()).isEqualTo(chitra);
    }

    // ---- A handler who can no longer handle it --------------------------------

    /** Nothing tells bookings when an owner edits the access list, so the stored name is never trusted alone. */
    @Test
    void aHandlerTakenOffTheAccessListIsNoLongerItsHandler() {
        UUID request = send(fx.person()).id();
        negotiation.acceptForProperty(anita, property, request, 1);
        fx.revokeBookings(property, anita);

        assertThatThrownBy(() -> bookings.forProperty(anita, property, request)).isInstanceOf(ForbiddenException.class);
        assertThat(bookings.forProperty(owner, property, request).handlerUserId()).isNull();
        assertThat(bookings.pageForProperty(owner, property, BookingListFilter.OPEN, 0, 20).items())
                .extracting(BookingRequestListItemResponse::handlerUserId).containsOnlyNulls();
        // It is back among the requests nobody handles, though her name is still stored on it.
        assertThat(storedHandler(request)).isEqualTo(anita);
        assertThat(unassignedOf(owner)).containsExactly(request);

        // It is not stranded: the next manager to answer it takes it.
        assertThat(bookings.forProperty(bilal, property, request).allowedActions()).contains(BookingAction.CANCEL);
        negotiation.cancelForProperty(bilal, property, request, "The room is being repaired");
        assertThat(storedHandler(request)).isEqualTo(bilal);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM booking.actions WHERE request_id = ? AND type = 'ASSIGNED'",
                Integer.class, request)).isEqualTo(2);
    }

    @Test
    void whereTheSystemTakesTurnsARequestWhoseHandlerLostAccessGoesToTheNextTurnWhenOpened() {
        settings.save(owner, property, turns(false));
        BookingRequestResponse sent = send(fx.person());
        UUID had = sent.handlerUserId();
        UUID other = had.equals(anita) ? bilal : anita;
        fx.revokeBookings(property, had);

        // The owner opens it. In turns the opener takes nothing: the next turn does.
        assertThat(bookings.open(owner, property, sent.id()).handlerUserId()).isEqualTo(other);
        assertThat(storedHandler(sent.id())).isEqualTo(other);
    }

    @Test
    void aManagerWhoLeavesHandsOnWhatTheyWereHandling() {
        UUID first = send(fx.person()).id();
        UUID second = send(fx.person()).id();
        negotiation.acceptForProperty(anita, property, first, 1);
        negotiation.acceptForProperty(bilal, property, second, 1);

        fx.leave(property, anita);
        assertThat(handlers.handOn(property, anita)).isEqualTo(1);
        // Safe to hear twice: there is nothing left in her name.
        assertThat(handlers.handOn(property, anita)).isZero();

        BookingRequestResponse back = bookings.forProperty(owner, property, first);
        assertThat(back.handlerUserId()).isNull();
        assertThat(back.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .contains(BookingActionType.ASSIGNED, BookingActionType.UNASSIGNED);
        assertThat(storedHandler(first)).isNull();
        assertThat(storedHandler(second)).isEqualTo(bilal);
        // Back under All requests, where whoever answers it next takes it.
        assertThat(unassignedOf(bilal)).containsExactly(first);
        negotiation.cancelForProperty(bilal, property, first, "The room is being repaired");
        assertThat(storedHandler(first)).isEqualTo(bilal);
    }

    @Test
    void whereTheSystemTakesTurnsALeaversRequestsGoToTheNextTurnAtOnce() {
        settings.save(owner, property, turns(false));
        BookingRequestResponse sent = send(fx.person());
        UUID had = sent.handlerUserId();
        UUID other = had.equals(anita) ? bilal : anita;

        fx.leave(property, had);
        assertThat(handlers.handOn(property, had)).isEqualTo(1);
        assertThat(storedHandler(sent.id())).isEqualTo(other);
        assertThat(bookings.forProperty(other, property, sent.id()).allowedActions()).contains(BookingAction.ACCEPT);
    }

    // ---- The setting ---------------------------------------------------------

    @Test
    void theOwnerChoosesHowRequestsAreHandledAndItStandsUntilChanged() {
        BookingSettingsResponse first = settings.forOwner(owner, property);
        assertThat(first.assignmentMode()).isEqualTo(BookingAssignmentMode.FIRST_VIEW);
        // The owner takes a turn unless they opt out (user, 2026-10-11).
        assertThat(first.includeOwnerInTurns()).isTrue();

        BookingSettingsResponse turns = settings.save(owner, property, turns(true));
        assertThat(turns.assignmentMode()).isEqualTo(BookingAssignmentMode.SYSTEM_TURNS);
        assertThat(turns.includeOwnerInTurns()).isTrue();

        // A save that does not mention it, such as a change to the token, leaves it as it stands.
        BookingSettingsResponse tokenOnly = settings.save(owner, property,
                new SaveBookingSettingsRequest(true, 300_000L, true, 21, true));
        assertThat(tokenOnly.assignmentMode()).isEqualTo(BookingAssignmentMode.SYSTEM_TURNS);
        assertThat(tokenOnly.includeOwnerInTurns()).isTrue();
        assertThat(tokenOnly.tokenAmountPaise()).isEqualTo(300_000L);

        // Going back to the first to respond: a new request waits for someone to answer it.
        settings.save(owner, property, new SaveBookingSettingsRequest(true, 300_000L, true, 21, true,
                BookingAssignmentMode.FIRST_VIEW, false));
        assertThat(send(fx.person()).handlerUserId()).isNull();
    }

    // ---- Helpers -------------------------------------------------------------

    private BookingRequestResponse send(UUID tenant) {
        return bookings.create(tenant,
                BookingFixtures.ask(fx.attendedEnquiry(property, tenant, today.minusDays(1)), room, today.plusDays(10)));
    }

    private static SaveBookingSettingsRequest turns(boolean includeOwner) {
        return new SaveBookingSettingsRequest(true, 200_000L, false, 21, true,
                BookingAssignmentMode.SYSTEM_TURNS, includeOwner);
    }

    private UUID storedHandler(UUID request) {
        return jdbc.queryForObject("SELECT handler_user_id FROM booking.requests WHERE id = ?", UUID.class, request);
    }

    /** True when this person's answer stood, false when they were told someone else has it. */
    private Callable<Boolean> answers(UUID manager, UUID request, CountDownLatch ready, CountDownLatch go) {
        return () -> {
            ready.countDown();
            if (!go.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("start timeout");
            }
            try {
                negotiation.acceptForProperty(manager, property, request, 1);
                return true;
            } catch (ValidationException someoneElseHasIt) {
                return false;
            }
        };
    }
}
