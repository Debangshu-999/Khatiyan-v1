package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.support.IntegrationTest;

/**
 * The bookings plan's reminders (chunk 7, 2026-10-19): each side hears it is
 * their turn before a request runs out, the property hears of a request or a
 * token claim that has waited a day and of a refund it owes, and the tenant of
 * a token about to lapse. Each once, however often the sweep runs.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingReminderIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingTokenService tokens;
    @Autowired private BookingSettingsService settings;
    @Autowired private BookingReminderService reminders;
    @Autowired private TenancyModule tenancies;
    @Autowired private SettableClock clock;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID tenant;
    private LocalDate today;

    @BeforeEach
    void seed() {
        clock.set(null);
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerAccount(property);
        room = fx.room(property, 6, 0);
        fx.paymentDetails(property, true, false);
        settings.create(owner, property, new SaveBookingSettingsRequest(true, 200_000L, true, 21, true));
        tenant = fx.appUser();
    }

    @AfterEach
    void remove() {
        clock.set(null);
        fx.remove();
    }

    @Test
    void thePropertyHearsOfARequestThatWaitedADayAndAgainWhenItsTurnIsRunningOut() {
        BookingRequestResponse sent = ask();
        assertThat(reminders.remindDue()).as("nothing is due yet").isZero();

        // A day on: the tenant's offer has waited a day.
        clock.set(Instant.now().plus(Duration.ofHours(25)));
        reminders.remindDue();
        assertThat(kinds(sent.id())).contains("PROPERTY_WAITING");

        // A day before the request runs out: the property's turn.
        clock.set(expiresAt(sent.id()).minus(Duration.ofHours(20)));
        reminders.remindDue();
        assertThat(kinds(sent.id())).contains("PROPERTY_WAITING", "PROPERTY_YOUR_TURN");
        // Once each, however often it runs.
        reminders.remindDue();
        assertThat(count(sent.id(), "PROPERTY_WAITING")).isOne();
        assertThat(count(sent.id(), "PROPERTY_YOUR_TURN")).isOne();
        assertThat(kinds(sent.id())).doesNotContain("TENANT_YOUR_TURN");
    }

    @Test
    void theTenantHearsOfTheOffersTurnAndOfATokenAboutToLapse() {
        // Asked below the listed rent, so the property has something to counter.
        BookingRequestResponse sent = ask(650_000L);
        negotiation.offer(owner, property, sent.id(), 1, 750_000L, true);
        // The property's offer is waiting on the tenant: told at once, by the change.
        assertThat(eventually(sent.id(), "TENANT_OFFER")).isTrue();

        clock.set(expiresAt(sent.id()).minus(Duration.ofHours(20)));
        reminders.remindDue();
        assertThat(kinds(sent.id())).contains("TENANT_YOUR_TURN").doesNotContain("PROPERTY_YOUR_TURN");

        clock.set(null);
        negotiation.accept(tenant, sent.id(), 2);
        assertThat(eventually(sent.id(), "TENANT_TERMS_AGREED")).isTrue();
        clock.set(tokenDueAt(sent.id()).minus(Duration.ofHours(6)));
        reminders.remindDue();
        reminders.remindDue();
        assertThat(count(sent.id(), "TENANT_TOKEN_LAPSING")).isOne();
    }

    @Test
    void anUnansweredTokenClaimIsThePropertysToHear() {
        BookingRequestResponse sent = ask();
        negotiation.acceptForProperty(owner, property, sent.id(), 1);
        tokens.claimPaid(tenant, sent.id(), ManualPaymentMethod.UPI, "UTR123", List.of());

        clock.set(Instant.now().plus(Duration.ofHours(25)));
        reminders.remindDue();
        reminders.remindDue();
        assertThat(count(sent.id(), "PROPERTY_CLAIM_WAITING")).isOne();
        // A refund owed is not followed or reminded of (user, 2026-10-28).
    }

    private BookingRequestResponse ask() {
        return ask(null);
    }

    private BookingRequestResponse ask(Long proposedRentPaise) {
        UUID enquiry = fx.attendedEnquiry(property, tenant, today.minusDays(1));
        return bookings.create(tenant, new CreateBookingRequest(enquiry, room, null, today.plusDays(5), proposedRentPaise, null,
                "Asha Rao", "9007433360", null, Gender.FEMALE, LocalDate.of(2000, 1, 1), UUID.randomUUID().toString()));
    }

    private Instant expiresAt(UUID request) {
        return jdbc.queryForObject("SELECT expires_at FROM booking.requests WHERE id = ?", Timestamp.class, request)
                .toInstant();
    }

    private Instant tokenDueAt(UUID request) {
        return jdbc.queryForObject("SELECT token_due_at FROM booking.requests WHERE id = ?", Timestamp.class, request)
                .toInstant();
    }

    private List<String> kinds(UUID request) {
        return jdbc.queryForList("SELECT kind FROM booking.notices WHERE request_id = ?", String.class, request);
    }

    private int count(UUID request, String kind) {
        return jdbc.queryForObject("SELECT count(*) FROM booking.notices WHERE request_id = ? AND kind = ?",
                Integer.class, request, kind);
    }

    /** A notice the booking's change tells, which happens after it commits. */
    private boolean eventually(UUID request, String kind) {
        for (int waited = 0; waited < 50; waited++) {
            if (count(request, kind) > 0) {
                return true;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }
}
