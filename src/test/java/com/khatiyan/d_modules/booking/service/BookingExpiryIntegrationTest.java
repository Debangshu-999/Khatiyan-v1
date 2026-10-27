package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.support.IntegrationTest;

/**
 * The request clock against the real schema: seven days, or six in the evening
 * two days before move-in, whichever comes first. The clock is the test's own,
 * so every edge is checked at that instant whatever hour the build runs at.
 *
 * <p>The sweep writes EXPIRED and gives the bed back. A request out of time
 * already reads as expired, and takes no action, before the sweep has touched
 * it.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingExpiryIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingSettingsService settings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingRequestExpiryScheduler sweep;
    @Autowired private SettableClock clock;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private LocalDate today;

    @BeforeEach
    void seed() {
        clock.set(null);
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerOf(property);
        room = fx.room(property, 3, 0);
        settings.create(owner, property, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
    }

    @AfterEach
    void remove() {
        clock.set(null);
        fx.remove();
    }

    @Test
    void theSweepExpiresOnlyWhatIsDueAndOnlyOnce() {
        // Day +4 ends two evenings before it. Day +10 ends at seven days.
        BookingRequestResponse soon = send(fx.person(), today.plusDays(4));
        BookingRequestResponse later = send(fx.person(), today.plusDays(10));
        assertThat(soon.expiresAt()).isEqualTo(today.plusDays(2).atTime(18, 0).atZone(IST).toInstant());
        assertThat(later.expiresAt()).isEqualTo(later.submittedAt().plus(7, ChronoUnit.DAYS));
        assertThat(reserved()).isEqualTo(2);

        clock.set(soon.expiresAt().minusNanos(1_000));
        assertThat(sweep.expireDue()).isZero();
        assertThat(reserved()).isEqualTo(2);

        clock.set(soon.expiresAt());
        assertThat(sweep.expireDue()).isEqualTo(1);
        assertThat(sweep.expireDue()).isZero();
        // Its bed went back, once, and the other request still holds its own.
        assertThat(holdStateOf(soon.id())).isEqualTo("RELEASED");
        assertThat(holdStateOf(later.id())).isEqualTo("HELD");
        assertThat(reserved()).isEqualTo(1);

        BookingRequestResponse expired = bookings.forProperty(owner, property, soon.id());
        assertThat(expired.status()).isEqualTo(BookingStatus.EXPIRED);
        assertThat(expired.closedAt()).isEqualTo(soon.expiresAt());
        assertThat(expired.allowedActions()).isEmpty();
        assertThat(expired.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactly(BookingActionType.SUBMITTED, BookingActionType.EXPIRED);
        // Nobody did it: the clock did.
        assertThat(expired.history().get(1).party()).isNull();
        assertThat(expired.history().get(1).statusAfter()).isEqualTo(BookingStatus.EXPIRED);
        assertThat(stored(later.id())).isEqualTo("AWAITING_HANDLER");

        clock.set(later.expiresAt());
        assertThat(sweep.expireDue()).isEqualTo(1);
        assertThat(stored(later.id())).isEqualTo("EXPIRED");
        assertThat(reserved()).isZero();
    }

    @Test
    void aRequestOutOfTimeReadsExpiredAndTakesNoActionBeforeTheSweep() {
        UUID tenant = fx.person();
        BookingRequestResponse sent = send(tenant, today.plusDays(10));
        clock.set(sent.expiresAt().minusNanos(1_000));
        // Asked at the listed rent, so the property's live choices are to take it or decline it.
        assertThat(bookings.forProperty(owner, property, sent.id()).allowedActions())
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);
        assertThat(bookings.countsForProperty(owner, property).open()).isEqualTo(1);

        clock.set(sent.expiresAt());
        assertThat(stored(sent.id())).isEqualTo("AWAITING_HANDLER");
        BookingRequestResponse read = bookings.forTenant(tenant, sent.id());
        assertThat(read.status()).isEqualTo(BookingStatus.EXPIRED);
        assertThat(read.allowedActions()).isEmpty();
        assertThat(bookings.forProperty(owner, property, sent.id()).allowedActions()).isEmpty();
        assertThat(bookings.pageForTenant(tenant, 0, 20).items()).singleElement()
                .satisfies(item -> assertThat(item.status()).isEqualTo(BookingStatus.EXPIRED));
        assertThat(bookings.pageForProperty(owner, property, BookingListFilter.OPEN, 0, 20).items()).isEmpty();
        assertThat(bookings.pageForProperty(owner, property, BookingListFilter.HISTORY, 0, 20).items()).hasSize(1);
        assertThat(bookings.countsForProperty(owner, property).open()).isZero();
        // The bed is the one thing that waits: it goes back when the sweep, or the next person to ask, writes the expiry.
        assertThat(reserved()).isEqualTo(1);
        assertThat(sweep.expireDue()).isEqualTo(1);
        assertThat(reserved()).isZero();
    }

    /** The slot comes back only where the property was the one who never answered. */
    @Test
    void aRequestWaitingOnTheTenantKeepsItsSlotWhenItExpiresAndOneWaitingOnThePropertyGivesItBack() {
        BookingRequestResponse propertysTurn = send(fx.person(), today.plusDays(10));
        // Asked below the listed rent, since a request at the listed rent is not the property's to counter.
        UUID bargainer = fx.person();
        BookingRequestResponse tenantsTurn = bookings.create(bargainer, BookingFixtures.askAt(
                fx.attendedEnquiry(property, bargainer, today.minusDays(1)), room, today.plusDays(10), 700_000L));
        // The property has answered with an offer of its own, and it is the tenant's move.
        negotiation.offer(owner, property, tenantsTurn.id(), 1, 780_000L, true);

        clock.set(tenantsTurn.expiresAt().plusSeconds(1));
        assertThat(sweep.expireDue()).isEqualTo(2);

        assertThat(slotOf(propertysTurn.id())).isNull();
        assertThat(slotOf(tenantsTurn.id())).isEqualTo(1);
        assertThat(stored(tenantsTurn.id())).isEqualTo("EXPIRED");
        // Whoever's turn it was, the bed goes back.
        assertThat(reserved()).isZero();
    }

    /** Once terms are agreed the request clock is done with it. Only the token clock can end it. */
    @Test
    void anAgreedBookingLapsesOnItsTokenClockAndNotOnTheRequestClock() {
        // Asked for day +3: the request clock runs out tomorrow evening, always inside the token's 48 hours.
        BookingRequestResponse sent = send(fx.person(), today.plusDays(3));
        BookingRequestResponse agreed = negotiation.acceptForProperty(owner, property, sent.id(), 1);
        assertThat(agreed.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(agreed.tokenDueAt()).isEqualTo(agreed.agreedAt().plus(48, ChronoUnit.HOURS))
                .isAfter(sent.expiresAt());

        clock.set(sent.expiresAt().plusSeconds(1));
        assertThat(sweep.expireDue()).isZero();
        assertThat(bookings.forProperty(owner, property, sent.id()).status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(reserved()).isEqualTo(1);

        clock.set(agreed.tokenDueAt().minusNanos(1_000));
        assertThat(sweep.expireDue()).isZero();
        // At the deadline it reads as lapsed at once, and the sweep writes it and frees the bed.
        clock.set(agreed.tokenDueAt());
        assertThat(bookings.forProperty(owner, property, sent.id()).status()).isEqualTo(BookingStatus.EXPIRED);
        assertThat(bookings.pageForProperty(owner, property, BookingListFilter.OPEN, 0, 20).items()).isEmpty();
        assertThat(sweep.expireDue()).isEqualTo(1);
        assertThat(sweep.expireDue()).isZero();
        BookingRequestResponse lapsed = bookings.forProperty(owner, property, sent.id());
        assertThat(lapsed.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactly(BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.AGREED,
                        BookingActionType.TOKEN_LAPSED);
        assertThat(lapsed.allowedActions()).isEmpty();
        assertThat(holdStateOf(sent.id())).isEqualTo("RELEASED");
        assertThat(reserved()).isZero();
        // Not paying the token costs the visit nothing more than the request it used.
        assertThat(slotOf(sent.id())).isEqualTo(1);
    }

    @Test
    void theSweepLeavesConfirmedAndCancelledBookingsAlone() {
        // A second property that takes no token, so its owner accepting confirms the booking.
        UUID noToken = fx.property();
        UUID itsOwner = fx.ownerOf(noToken);
        UUID itsRoom = fx.room(noToken, 2, 0);
        settings.create(itsOwner, noToken, new SaveBookingSettingsRequest(false, null, null, 21, true));
        UUID tenant = fx.person();
        BookingRequestResponse confirmed = bookings.create(tenant,
                BookingFixtures.ask(fx.attendedEnquiry(noToken, tenant, today.minusDays(1)), itsRoom, today.plusDays(10)));
        negotiation.acceptForProperty(itsOwner, noToken, confirmed.id(), 1);
        BookingRequestResponse cancelled = send(fx.person(), today.plusDays(10));
        negotiation.cancelForProperty(owner, property, cancelled.id(), "The room is being repaired.");

        clock.set(confirmed.expiresAt().plus(30, ChronoUnit.DAYS));
        assertThat(sweep.expireDue()).isZero();
        assertThat(stored(confirmed.id())).isEqualTo("CONFIRMED");
        assertThat(stored(cancelled.id())).isEqualTo("CANCELLED");
        // No clock reads a confirmed booking as expired, and it keeps its bed.
        assertThat(bookings.forProperty(itsOwner, noToken, confirmed.id()).status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(holdStateOf(confirmed.id())).isEqualTo("HELD");
        assertThat(reserved()).isZero();
    }

    /**
     * The 30 days decide who may send a request. Once sent, the request runs
     * on its own clock: the window ending does not end it.
     */
    @Test
    void aRequestSentOnTheLastDayOutlivesTheWindowButANewOneAfterItIsRefused() {
        UUID tenant = fx.person();
        LocalDate visitedOn = today.minusDays(PostVisitBookingWindow.DAYS);
        UUID enquiry = fx.attendedEnquiry(property, tenant, visitedOn);
        BookingRequestResponse sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10)));
        Instant windowEnds = PostVisitBookingWindow.expiresAt(visitedOn);
        assertThat(sent.expiresAt()).isAfter(windowEnds);

        // The day after: the window is over and the request is still alive.
        clock.set(windowEnds.plus(6, ChronoUnit.HOURS));
        assertThat(sweep.expireDue()).isZero();
        BookingRequestResponse read = bookings.forProperty(owner, property, sent.id());
        assertThat(read.status()).isEqualTo(BookingStatus.AWAITING_HANDLER);
        assertThat(read.allowedActions()).contains(BookingAction.ACCEPT);

        // But nothing new can be sent on that visit once its 30 days are over.
        negotiation.cancel(tenant, sent.id());
        LocalDate then = LocalDate.ofInstant(clock.instant(), IST);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, then.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("30 days");
        // And on the last instant of the window it still could be.
        clock.set(windowEnds.minusNanos(1_000));
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).status())
                .isEqualTo(BookingStatus.AWAITING_HANDLER);
    }

    private BookingRequestResponse send(UUID tenant, LocalDate moveInDate) {
        return bookings.create(tenant,
                BookingFixtures.ask(fx.attendedEnquiry(property, tenant, today.minusDays(1)), room, moveInDate));
    }

    private String stored(UUID request) {
        return jdbc.queryForObject("SELECT status FROM booking.requests WHERE id = ?", String.class, request);
    }

    private Integer slotOf(UUID request) {
        return jdbc.queryForObject("SELECT visit_slot FROM booking.requests WHERE id = ?", Integer.class, request);
    }

    /** Beds reserved in the one room every request here asks for. */
    private int reserved() {
        return jdbc.queryForObject("SELECT reserved_count FROM property.rooms WHERE id = ?", Integer.class, room);
    }

    private String holdStateOf(UUID request) {
        return jdbc.queryForObject(
                "SELECT state FROM tenancy.bed_holds WHERE owner_kind = 'BOOKING' AND owner_id = ?",
                String.class, request);
    }
}
