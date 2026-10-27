package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.enquiry.model.EnquiryOrigin;
import com.khatiyan.d_modules.enquiry.api.dto.PostVisitBookingEligibility;
import com.khatiyan.d_modules.booking.service.BookingConversionService;
import com.khatiyan.d_modules.booking.service.BookingNegotiationService;
import com.khatiyan.d_modules.booking.service.BookingRequestService;
import com.khatiyan.d_modules.booking.service.BookingSettingsService;
import com.khatiyan.d_modules.booking.service.BookingTokenService;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.PublishedEvents;

/**
 * The pipeline follows its bookings, through the real events (user's stages,
 * 2026-10-11).
 *
 * <p>The booking services are used as the app uses them. Each change they make
 * publishes one event, Spring Modulith delivers it on its own thread, and a
 * test waits for that before looking. So these also prove the listener is
 * wired, and that a booking change reaches its lead with nothing else telling
 * it.
 *
 * <p>Sunrise takes a Rs 2,000 token, so its bookings pass through terms agreed
 * and a token received before they are confirmed. Lakeview takes none, so
 * agreeing terms there confirms at once.
 *
 * <p>The visit is the one thing written by hand: the attended visit goes onto
 * the enquiry as the visit day leaves it, with the lead's own visit row beside
 * it. How it gets there is the visit suites' business. Moving in is written by
 * hand too, as the stay becoming active leaves the booking.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class LeadBookingIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingTokenService tokens;
    @Autowired private BookingConversionService conversion;
    @Autowired private BookingSettingsService settings;
    @Autowired private LeadPipelineService pipeline;
    @Autowired private LeadPipelineSchedulerService sweep;
    @Autowired private SettableClock clock;
    @Autowired private com.khatiyan.d_modules.enquiry.EnquiryModule enquiryModule;

    private BookingFixtures fx;
    private UUID sunrise;
    private UUID sunriseOwner;
    private UUID sunriseRoom;
    private UUID lakeview;
    private UUID lakeviewOwner;
    private UUID lakeviewRoom;
    private UUID tenant;
    private LocalDate today;

    @BeforeEach
    void seed() {
        clock.set(null);
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        sunrise = fx.property();
        sunriseOwner = fx.ownerOf(sunrise);
        sunriseRoom = fx.room(sunrise, 6, 0);
        fx.paymentDetails(sunrise, true, false);
        settings.create(sunriseOwner, sunrise, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
        lakeview = fx.property();
        lakeviewOwner = fx.ownerOf(lakeview);
        lakeviewRoom = fx.room(lakeview, 6, 0);
        fx.paymentDetails(lakeview, true, false);
        settings.create(lakeviewOwner, lakeview, new SaveBookingSettingsRequest(false, null, null, 21, true));
        tenant = fx.person();
    }

    @AfterEach
    void remove() {
        clock.set(null);
        fx.remove();
    }

    // ---- Straight from the property page (user, 2026-10-17) ------------------

    @Test
    void aStayBookedStraightFromThePropertyPageHasNoVisitAndIsAStrongLead() {
        UUID record = enquiryModule.openDirect(tenant, sunrise, EnquiryOrigin.DIRECT_BOOKING);
        PostVisitBookingEligibility eligibility = enquiryModule.bookingEligibilityFor(tenant, record);
        assertThat(eligibility.eligible()).isTrue();
        assertThat(eligibility.visitId()).isNull();
        assertThat(eligibility.windowExpiresAt()).isNotNull();

        BookingRequestResponse sent = act(() -> bookings.create(
                tenant, BookingFixtures.ask(record, sunriseRoom, today.plusDays(10))));

        assertThat(jdbc.queryForObject("SELECT visit_id FROM booking.requests WHERE id = ?", UUID.class, sent.id()))
                .isNull();
        assertThat(jdbc.queryForObject("SELECT visit_slot FROM booking.requests WHERE id = ?", Integer.class, sent.id()))
                .isEqualTo(1);
        Lead lead = onlyLead(sunrise);
        assertThat(lead.stage()).isEqualTo("ADVANCED_LEAD");
        assertThat(lead.becameLeadAt()).isNotNull();
        // Opening it again uses the same record: one conversation per person per property.
        assertThat(enquiryModule.openDirect(tenant, sunrise, EnquiryOrigin.DIRECT_BOOKING)).isEqualTo(record);

        // Their own cancellation is taken like one after a visit, with no visit behind it.
        act(() -> negotiation.cancel(tenant, sent.id()));
        assertThat(onlyLead(sunrise).state()).isEqualTo("OPEN");
    }

    // ---- Up the stages --------------------------------------------------------

    @Test
    void anAttendedVisitMakesAnAdvancedLead() {
        attended(sunrise, tenant);

        Lead lead = onlyLead(sunrise);
        assertThat(lead.stage()).isEqualTo("ADVANCED_LEAD");
        assertThat(lead.state()).isEqualTo("OPEN");
        // It is counted as a lead from here, whichever stage it reached first.
        assertThat(lead.becameLeadAt()).isNotNull();
        assertThat(lead.advancedLeadAt()).isNotNull();
        assertThat(lead.bookedAt()).isNull();
    }

    @Test
    void aRequestAgreedTermsAndAReceivedTokenLeaveItAdvancedAndOnlyConfirmationBooksIt() {
        UUID enquiry = attended(sunrise, tenant);

        BookingRequestResponse sent = act(() -> bookings.create(
                tenant, BookingFixtures.ask(enquiry, sunriseRoom, today.plusDays(10))));
        assertThat(onlyLead(sunrise).stage()).isEqualTo("ADVANCED_LEAD");

        BookingRequestResponse agreed = act(
                () -> negotiation.acceptForProperty(sunriseOwner, sunrise, sent.id(), 1));
        assertThat(agreed.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(onlyLead(sunrise).stage()).isEqualTo("ADVANCED_LEAD");

        BookingRequestResponse received = act(() -> tokens.markReceived(
                sunriseOwner, sunrise, sent.id(), ManualPaymentMethod.UPI, null, null));
        assertThat(received.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(onlyLead(sunrise).stage()).isEqualTo("ADVANCED_LEAD");

        act(() -> negotiation.confirmForProperty(sunriseOwner, sunrise, sent.id()));

        Lead booked = onlyLead(sunrise);
        assertThat(booked.stage()).isEqualTo("BOOKED");
        assertThat(booked.state()).isEqualTo("OPEN");
        assertThat(booked.bookedAt()).isNotNull();
        assertThat(bookingSteps(booked.id())).containsExactlyInAnyOrder(
                "BOOKING_REQUESTED", "BOOKING_AGREED", "BOOKING_CONFIRMED");

        // Hearing of the same booking again moves nothing and writes nothing.
        assertThat(pipeline.syncFromEnquiry(enquiry, sunrise, tenant)).isFalse();
        assertThat(pipeline.syncFromEnquiry(enquiry, sunrise, tenant)).isFalse();
        assertThat(onlyLead(sunrise).stage()).isEqualTo("BOOKED");
        assertThat(bookingSteps(booked.id())).hasSize(3);
    }

    @Test
    void theStayBecomingActiveConvertsTheLeadAndOnboardingAloneDoesNot() {
        UUID enquiry = attended(lakeview, tenant);
        BookingRequestResponse confirmed = confirmAtLakeview(enquiry);
        UUID stay = UUID.randomUUID();

        // Onboarded: the booking names its stay, and is still only a confirmed booking.
        jdbc.update("UPDATE booking.requests SET tenancy_id = ?, converted_at = now(), converted_by_user_id = ?"
                + " WHERE id = ?", stay, lakeviewOwner, confirmed.id());
        pipeline.syncFromEnquiry(enquiry, lakeview, tenant);
        assertThat(onlyLead(lakeview).stage()).isEqualTo("BOOKED");
        assertThat(onlyLead(lakeview).state()).isEqualTo("OPEN");

        // The stay is active.
        jdbc.update("UPDATE booking.requests SET status = 'MOVED_IN', closed_at = now(), end_cause = 'MOVED_IN'"
                + " WHERE id = ?", confirmed.id());
        assertThat(pipeline.syncFromEnquiry(enquiry, lakeview, tenant)).isTrue();

        Lead converted = onlyLead(lakeview);
        assertThat(converted.stage()).isEqualTo("MOVED_IN");
        assertThat(converted.state()).isEqualTo("CLOSED");
        assertThat(converted.closeReason()).isEqualTo("CONVERTED");
        assertThat(converted.convertedTenancyId()).isEqualTo(stay);
        assertThat(bookingSteps(converted.id())).contains("MOVED_IN").doesNotContain("BOOKING_ENDED");

        // A past tenant asking again is a new record, and not a resumed one.
        UUID again = askAgain(lakeview, enquiry);
        pipeline.syncFromEnquiry(again, lakeview, tenant);

        List<Lead> both = leadsOf(lakeview);
        assertThat(both).hasSize(2);
        assertThat(both.get(1).state()).isEqualTo("OPEN");
        assertThat(both.get(1).resumedFromLeadId()).isNull();
    }

    // ---- A booking that ends short of moving in ---------------------------------

    @Test
    void aBookingThePropertyCancelsEndsTheLeadAtOnceAndBookingAgainOpensIt() {
        UUID enquiry = attended(lakeview, tenant);
        BookingRequestResponse confirmed = confirmAtLakeview(enquiry);
        assertThat(onlyLead(lakeview).stage()).isEqualTo("BOOKED");

        act(() -> negotiation.cancelForProperty(
                lakeviewOwner, lakeview, confirmed.id(), "The room is being repaired"));

        // A dead lead at once, though the days after the visit are still open (user, 2026-10-27).
        Lead dead = onlyLead(lakeview);
        assertThat(dead.state()).isEqualTo("CLOSED");
        assertThat(dead.closeReason()).isEqualTo("BOOKING_CANCELLED_BY_PROPERTY");
        assertThat(dead.stage()).isEqualTo("ADVANCED_LEAD");
        assertThat(dead.bookedAt()).isNull();
        assertThat(dead.becameLeadAt()).isNotNull();
        assertThat(bookingSteps(dead.id())).contains("BOOKING_ENDED");

        // They book another bed from the same visit: the same record lives again.
        confirmAtLakeview(enquiry);
        Lead again = onlyLead(lakeview);
        assertThat(again.id()).isEqualTo(dead.id());
        assertThat(again.state()).isEqualTo("OPEN");
        assertThat(again.stage()).isEqualTo("BOOKED");
    }

    @Test
    void aGuestWhoDidNotArriveIsADeadLeadAtOnce() {
        UUID enquiry = attended(lakeview, tenant);
        BookingRequestResponse confirmed = confirmAtLakeview(enquiry);

        // The days after the visit stay open throughout, so only the booking can end the lead.
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().plus(60, ChronoUnit.DAYS)), enquiry);
        // Two days after the move-in day, the onboarding screen's Did not arrive.
        clock.set(today.plusDays(12).atTime(12, 0).atZone(IST).toInstant());
        act(() -> conversion.closeAsDidNotArrive(lakeviewOwner, lakeview, confirmed.id()));

        Lead dead = onlyLead(lakeview);
        assertThat(dead.state()).isEqualTo("CLOSED");
        assertThat(dead.closeReason()).isEqualTo("DID_NOT_ARRIVE");
        assertThat(dead.becameLeadAt()).isNotNull();
    }

    @Test
    void walkingAwayFromAConfirmedBedHeldForNothingEndsTheLeadAtOnce() {
        UUID enquiry = attended(lakeview, tenant);
        BookingRequestResponse confirmed = confirmAtLakeview(enquiry);

        // Cancelling a confirmed booking that cost them nothing closes the visit's window with it.
        act(() -> negotiation.cancel(tenant, confirmed.id()));

        Lead dead = onlyLead(lakeview);
        assertThat(dead.state()).isEqualTo("CLOSED");
        assertThat(dead.closeReason()).isEqualTo("BOOKING_CANCELLED_BY_TENANT");
        assertThat(dead.stage()).isEqualTo("ADVANCED_LEAD");
    }

    @Test
    void anAdvancedLeadWhoNeverBookedDiesWhenTheirDaysRunOutButNotWhileARequestIsLive() {
        UUID enquiry = attended(sunrise, tenant);
        BookingRequestResponse sent = act(() -> bookings.create(
                tenant, BookingFixtures.ask(enquiry, sunriseRoom, today.plusDays(10))));

        windowRunsOut(enquiry);
        sweep.levelOpenLeads();
        // The request is still being answered, so the lead is still going.
        assertThat(onlyLead(sunrise).state()).isEqualTo("OPEN");

        // Withdrawn, with no days left to ask again.
        act(() -> negotiation.cancel(tenant, sent.id()));

        Lead dead = onlyLead(sunrise);
        assertThat(dead.state()).isEqualTo("CLOSED");
        // It never held a confirmed bed, so it is the days that ran out.
        assertThat(dead.closeReason()).isEqualTo("BOOKING_WINDOW_EXPIRED");
        assertThat(dead.stage()).isEqualTo("ADVANCED_LEAD");
    }

    // ---- Coming back ------------------------------------------------------------

    @Test
    void comingBackAfterLettingTheDaysRunOutOpensADuplicateLinkedToIt() {
        UUID enquiry = attended(sunrise, tenant);
        windowRunsOut(enquiry);
        sweep.levelOpenLeads();
        Lead dead = onlyLead(sunrise);
        assertThat(dead.closeReason()).isEqualTo("BOOKING_WINDOW_EXPIRED");

        UUID again = askAgain(sunrise, enquiry);
        pipeline.syncFromEnquiry(again, sunrise, tenant);

        List<Lead> both = leadsOf(sunrise);
        assertThat(both).hasSize(2);
        // The days ran out on them, so it was their doing: a duplicate, not a resumed lead (user, 2026-10-17).
        Lead repeat = both.get(1);
        assertThat(repeat.state()).isEqualTo("OPEN");
        assertThat(repeat.stage()).isEqualTo("ENQUIRED");
        assertThat(repeat.resumedFromLeadId()).isNull();
        assertThat(jdbc.queryForObject(
                "SELECT duplicate_of_lead_id FROM lead.leads WHERE id = ?", UUID.class, repeat.id())).isEqualTo(dead.id());
        assertThat(jdbc.queryForObject(
                "SELECT earlier_walkaways FROM lead.leads WHERE id = ?", Integer.class, repeat.id())).isEqualTo(1);
        assertThat(types(repeat.id())).contains("ENQUIRY_RAISED", "MARKED_DUPLICATE").doesNotContain("RESUMED");
        // The record that died stays as it ended.
        assertThat(both.get(0).state()).isEqualTo("CLOSED");
    }

    // ---- Who handles it ---------------------------------------------------------

    @Test
    void whileABookingIsLiveItsHandlerIsTheLeads() {
        UUID anita = fx.manager(sunrise, "Anita");
        fx.grantBookings(sunrise, anita);
        UUID enquiry = attended(sunrise, tenant);
        // The enquiry's own handler, until a booking has one.
        assertThat(onlyLead(sunrise).handlerUserId()).isEqualTo(sunriseOwner);

        BookingRequestResponse sent = act(() -> bookings.create(
                tenant, BookingFixtures.ask(enquiry, sunriseRoom, today.plusDays(10))));
        // Opening it takes nothing. The first to answer it handles it (user, 2026-10-11).
        BookingRequestResponse answered = act(() -> negotiation.acceptForProperty(anita, sunrise, sent.id(), 1));
        assertThat(answered.handlerUserId()).isEqualTo(anita);

        Lead handled = onlyLead(sunrise);
        assertThat(handled.handlerUserId()).isEqualTo(anita);
        assertThat(handled.handlerAssignedBy()).isEqualTo("BOOKING");

        // A late word from the enquiry does not put its own handler back.
        pipeline.syncFromEnquiry(enquiry, sunrise, tenant);
        assertThat(onlyLead(sunrise).handlerUserId()).isEqualTo(anita);
    }

    // ---- Helpers ----------------------------------------------------------------

    private record Lead(
            UUID id, String stage, String state, String closeReason, UUID handlerUserId, String handlerAssignedBy,
            Timestamp becameLeadAt, Timestamp advancedLeadAt, Timestamp bookedAt, UUID convertedTenancyId,
            UUID resumedFromLeadId) {
    }

    /**
     * Someone whose visit was attended yesterday: an advanced lead, with the
     * days after the visit still open.
     *
     * @return their enquiry
     */
    private UUID attended(UUID property, UUID person) {
        UUID enquiry = fx.attendedEnquiry(property, person, today.minusDays(1));
        pipeline.syncFromEnquiry(enquiry, property, person);
        UUID lead = onlyLead(property).id();
        UUID visit = fx.visitOf(enquiry);
        jdbc.update("""
                INSERT INTO lead.visits (id, reference_code, lead_id, property_id, prospect_user_id, enquiry_id,
                    visit_date, slot_start_minute, slot_end_minute, booked_by, booked_by_user_id, status,
                    checked_in_at, checked_in_by_user_id, check_in_method)
                VALUES (?, ?, ?, ?, ?, ?, ?, 600, 660, 'TENANT', ?, 'VISITED', ?, ?, 'QR')
                """, visit, "VIS-T-" + visit.toString().substring(0, 12), lead, property, person, enquiry,
                today.minusDays(1), person, Timestamp.from(Instant.now().minus(1, ChronoUnit.DAYS)),
                fx.ownerOf(property));
        pipeline.syncFromEnquiry(enquiry, property, person);
        return enquiry;
    }

    /** A request at Lakeview, agreed by its owner. It takes no token, so that confirms it. */
    private BookingRequestResponse confirmAtLakeview(UUID enquiry) {
        BookingRequestResponse sent = act(() -> bookings.create(
                tenant, BookingFixtures.ask(enquiry, lakeviewRoom, today.plusDays(10))));
        BookingRequestResponse confirmed = act(
                () -> negotiation.acceptForProperty(lakeviewOwner, lakeview, sent.id(), 1));
        assertThat(confirmed.status()).isEqualTo(BookingStatus.CONFIRMED);
        return confirmed;
    }

    /** The days after the visit are over, with nothing having said so. */
    private void windowRunsOut(UUID enquiry) {
        awaitListeners();
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), enquiry);
    }

    /** A new enquiry from the same person, their earlier one being over. One is open per person per property. */
    private UUID askAgain(UUID property, UUID earlier) {
        awaitListeners();
        jdbc.update("UPDATE enquiry.enquiries SET status = 'EXPIRED', expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), earlier);
        return fx.enquiry(property, tenant);
    }

    /** Runs something on a booking, then waits for the pipeline to have heard of it. */
    private <T> T act(Supplier<T> action) {
        T result = action.get();
        awaitListeners();
        return result;
    }

    private void awaitListeners() {
        for (UUID property : List.of(sunrise, lakeview)) {
            PublishedEvents.awaitHandled(jdbc, "LeadBookingEventListener", property);
            PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
        }
    }

    private Lead onlyLead(UUID property) {
        List<Lead> all = leadsOf(property);
        assertThat(all).hasSize(1);
        return all.get(0);
    }

    /** The tenant's records at a property, oldest first. */
    private List<Lead> leadsOf(UUID property) {
        return jdbc.query("""
                SELECT id, stage, state, close_reason, handler_user_id, handler_assigned_by, became_lead_at,
                    advanced_lead_at, booked_at, converted_tenancy_id, resumed_from_lead_id
                FROM lead.leads
                WHERE property_id = ? AND prospect_user_id = ?
                ORDER BY created_at
                """, (row, at) -> new Lead(
                        row.getObject("id", UUID.class), row.getString("stage"), row.getString("state"),
                        row.getString("close_reason"), row.getObject("handler_user_id", UUID.class),
                        row.getString("handler_assigned_by"), row.getTimestamp("became_lead_at"),
                        row.getTimestamp("advanced_lead_at"), row.getTimestamp("booked_at"),
                        row.getObject("converted_tenancy_id", UUID.class),
                        row.getObject("resumed_from_lead_id", UUID.class)),
                property, tenant);
    }

    /** What a lead's timeline says of its bookings. */
    private List<String> bookingSteps(UUID lead) {
        return jdbc.queryForList(
                "SELECT type FROM lead.lead_activities WHERE lead_id = ? AND booking_request_id IS NOT NULL",
                String.class, lead);
    }

    private List<String> types(UUID lead) {
        return jdbc.queryForList("SELECT type FROM lead.lead_activities WHERE lead_id = ?", String.class, lead);
    }
}
