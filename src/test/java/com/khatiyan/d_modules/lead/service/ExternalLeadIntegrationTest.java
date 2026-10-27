package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingReachedVia;
import com.khatiyan.d_modules.booking.service.BookingExternalService;
import com.khatiyan.d_modules.booking.service.BookingNegotiationService;
import com.khatiyan.d_modules.booking.service.BookingSettingsService;
import com.khatiyan.d_modules.lead.api.dto.CreateExternalBookingRequest;
import com.khatiyan.d_modules.lead.api.dto.ExternalRecordResponse;
import com.khatiyan.d_modules.lead.api.dto.RecordExternalVisitRequest;
import com.khatiyan.d_modules.lead.model.VisitImpression;
import com.khatiyan.d_modules.lead.model.VisitInterest;
import com.khatiyan.d_modules.property.model.SharingType;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.PublishedEvents;

/**
 * External visits and bookings (user, 2026-10-19): people who reached the
 * property outside the app are recorded by it and count as leads. Just a
 * record, never an account, and nothing is sent to them.
 */
@IntegrationTest
class ExternalLeadIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ExternalLeadService external;
    @Autowired private BookingSettingsService settings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private VisitDayService visitDay;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private LocalDate today;

    @BeforeEach
    void seed() {
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerAccount(property);
        room = fx.room(property, 3, 0);
        fx.paymentDetails(property, true, false);
        settings.create(owner, property, new SaveBookingSettingsRequest(true, 200_000L, true, 21, true));
    }

    @AfterEach
    void remove() {
        PublishedEvents.awaitHandled(jdbc, "LeadBookingEventListener", property);
        jdbc.update("DELETE FROM lead.lead_activities WHERE lead_id IN (SELECT id FROM lead.leads WHERE property_id = ?)", property);
        jdbc.update("DELETE FROM lead.visits WHERE property_id = ?", property);
        jdbc.update("DELETE FROM lead.leads WHERE property_id = ?", property);
        jdbc.update("DELETE FROM lead.external_prospects WHERE property_id = ?", property);
        fx.remove();
    }

    @Test
    void aWalkInIsAStrongLeadAndTheSamePhoneComingAgainJoinsIt() {
        ExternalRecordResponse first = external.recordVisit(owner, property, visit("98300 12345", VisitInterest.YES));

        assertThat(first.leadStage()).isEqualTo("ADVANCED_LEAD");
        assertThat(first.leadState()).isEqualTo("OPEN");
        assertThat(first.leadReferenceCode()).startsWith("LEAD-");
        assertThat(jdbc.queryForObject("""
                SELECT prospect_user_id IS NULL AND external_prospect_id IS NOT NULL AND status = 'VISITED'
                   AND interest = 'YES' AND wanted_sharing = 'DOUBLE' AND budget_paise = 900000
                   AND slot_start_minute = 600 AND slot_end_minute = 720
                FROM lead.visits WHERE id = ?
                """, Boolean.class, first.visitId())).isTrue();
        // Nobody is made an account.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth.users WHERE phone = '+919830012345'", Integer.class)).isZero();

        // The same phone again: the same person and the same lead.
        ExternalRecordResponse again = external.recordVisit(owner, property, visit("+91 98300 12345", VisitInterest.NOT_SURE));
        assertThat(again.leadId()).isEqualTo(first.leadId());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM lead.external_prospects WHERE property_id = ?",
                Integer.class, property)).isOne();

        // On the property's visit history, with their name and marked external.
        var card = visitDay.propertyHistory(owner, property, 0, 12).items().stream()
                .filter(item -> item.visitId().equals(first.visitId())).findFirst();
        if (card.isPresent()) {
            assertThat(card.get().prospectName()).isEqualTo("Rahul Sen");
            assertThat(card.get().external()).isTrue();
        }
    }

    @Test
    void notInterestedClosesTheLeadAndAVisitIsOnlyRecordedOnceTheyCame() {
        ExternalRecordResponse no = external.recordVisit(owner, property, visit("98300 54321", VisitInterest.NO));
        assertThat(no.leadState()).isEqualTo("CLOSED");
        assertThat(jdbc.queryForObject("SELECT close_reason FROM lead.leads WHERE id = ?", String.class, no.leadId()))
                .isEqualTo("NOT_INTERESTED");

        assertThatThrownBy(() -> external.recordVisit(owner, property, new RecordExternalVisitRequest(
                "Rahul Sen", "98300 11111", today.plusDays(1), null, null, VisitImpression.LIKED, null, VisitInterest.YES, null, null, null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("once they have come");
        // A dislike needs its reason, and keeps it (user, 2026-10-19).
        assertThatThrownBy(() -> external.recordVisit(owner, property, new RecordExternalVisitRequest(
                "Rahul Sen", "98300 11111", today, null, null, VisitImpression.DISLIKED, " ", VisitInterest.NO,
                null, null, null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("did not like it");
        ExternalRecordResponse disliked = external.recordVisit(owner, property, new RecordExternalVisitRequest(
                "Rahul Sen", "98300 22222", today, null, null, VisitImpression.DISLIKED, "Too far from the metro",
                VisitInterest.NO, null, null, null));
        assertThat(jdbc.queryForObject("SELECT disliked_reason FROM lead.visits WHERE id = ?", String.class,
                disliked.visitId())).isEqualTo("Too far from the metro");
        // How it went is asked, never assumed.
        assertThatThrownBy(() -> external.recordVisit(owner, property, new RecordExternalVisitRequest(
                "Rahul Sen", "98300 11111", today, null, null, null, null, VisitInterest.YES, null, null, null)))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void anExternalBookingIsConfirmedWithItsTokenAndItsLeadIsBooked() {
        BookingExternalService.Options options = external.bookingOptions(owner, property);
        assertThat(options.open()).isTrue();
        assertThat(options.rooms()).extracting(BookingExternalService.RoomOption::roomId).contains(room);

        // Outside the 3 to 21 days every booking keeps to.
        assertThatThrownBy(() -> external.createBooking(owner, property, booking(today.plusDays(1))))
                .isInstanceOf(ValidationException.class);

        ExternalRecordResponse made = external.createBooking(owner, property, booking(today.plusDays(5)));
        assertThat(made.leadStage()).isEqualTo("BOOKED");
        assertThat(jdbc.queryForObject("""
                SELECT r.status = 'CONFIRMED' AND r.prospect_user_id IS NULL AND r.enquiry_id IS NULL
                   AND r.external_prospect_id IS NOT NULL AND r.reached_via = 'PHONE_CALL'
                   AND t.status = 'RECEIVED' AND t.received_method = 'UPI'
                FROM booking.requests r JOIN booking.tokens t ON t.request_id = r.id WHERE r.id = ?
                """, Boolean.class, made.bookingId())).isTrue();
        assertThat(jdbc.queryForObject(
                "SELECT state FROM tenancy.bed_holds WHERE owner_kind = 'BOOKING' AND owner_id = ?",
                String.class, made.bookingId())).isEqualTo("HELD");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth.users WHERE phone = '+919830098765'", Integer.class))
                .as("no account until move-in").isZero();

        // The property pulls out: its lead closes, and nothing is sent to someone with no app.
        negotiation.cancelForProperty(owner, property, made.bookingId(), "The room needs repairs.");
        assertThat(eventuallyClosed(made.leadId())).isTrue();
        assertThat(jdbc.queryForObject("SELECT close_reason FROM lead.leads WHERE id = ?", String.class, made.leadId()))
                .isEqualTo("BOOKING_CANCELLED_BY_PROPERTY");
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM booking.notices WHERE request_id = ? AND kind LIKE 'TENANT_%'",
                Integer.class, made.bookingId())).isZero();
    }

    private RecordExternalVisitRequest visit(String phone, VisitInterest interest) {
        return new RecordExternalVisitRequest("Rahul Sen", phone, today, LocalTime.of(10, 0), LocalTime.of(12, 0),
                VisitImpression.LIKED, null, interest,
                SharingType.DOUBLE, 900_000L, "Wants a window bed");
    }

    private CreateExternalBookingRequest booking(LocalDate moveIn) {
        return new CreateExternalBookingRequest("Asha Rao", "98300 98765", Gender.FEMALE, LocalDate.of(2000, 1, 1),
                BookingReachedVia.PHONE_CALL, room, moveIn, null, null, null, 200_000L, ManualPaymentMethod.UPI, "UTR9");
    }

    private boolean eventuallyClosed(UUID leadId) {
        for (int waited = 0; waited < 50; waited++) {
            if ("CLOSED".equals(jdbc.queryForObject("SELECT state FROM lead.leads WHERE id = ?", String.class, leadId))) {
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
