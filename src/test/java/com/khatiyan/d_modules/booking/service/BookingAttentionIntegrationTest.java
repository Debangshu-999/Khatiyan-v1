package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingModule;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingAttentionFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingAttentionSummary;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryAttentionSummary;
import com.khatiyan.d_modules.lead.VisitModule;
import com.khatiyan.d_modules.lead.api.dto.VisitAttentionSummary;
import com.khatiyan.support.IntegrationTest;

/** Real PostgreSQL counts and click-through queues must agree, even after assignment or deadline sweeps lag. */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingAttentionIntegrationTest {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingModule bookings;
    @Autowired private BookingRequestService requests;
    @Autowired private EnquiryModule enquiries;
    @Autowired private VisitModule visits;
    @Autowired private SettableClock clock;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private LocalDate today;
    private Instant now;

    @BeforeEach
    void seed() {
        today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        now = today.atTime(12, 0).atZone(ZoneId.of("Asia/Kolkata")).toInstant();
        clock.set(now);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerOf(property);
        room = fx.room(property, 40, 0);
    }

    @AfterEach
    void remove() {
        clock.set(null);
        fx.remove();
    }

    @Test
    void workPersistsAfterAssignmentAndOnlyResolvedStepsLeaveTheCount() {
        UUID unanswered = booking("AWAITING_HANDLER", today.plusDays(1));
        UUID expired = booking("AWAITING_HANDLER", today.plusDays(1));
        jdbc.update("UPDATE booking.requests SET expires_at = ? WHERE id = ?", Timestamp.from(now), expired);
        booking("AWAITING_TENANT", today.plusDays(1)); // Tenant's turn, not management work.
        UUID claim = booking("AWAITING_TOKEN", today.plusDays(1));
        jdbc.update("UPDATE booking.requests SET token_claim_waiting = true, token_due_at = ? WHERE id = ?",
                Timestamp.from(now.minusSeconds(1)), claim); // A claim pauses its clock.
        booking("AWAITING_TOKEN", today.plusDays(1)); // Unpaid, no claim: tenant's turn.
        UUID received = booking("TOKEN_RECEIVED", today.plusDays(1));
        UUID due = booking("CONFIRMED", today.minusDays(1));
        // Today's arrival is not past due yet, nor is tomorrow's (user, 2026-10-27). It is today's.
        UUID todays = booking("CONFIRMED", today);
        booking("CONFIRMED", today.plusDays(1));
        UUID onboarded = booking("CONFIRMED", today);
        jdbc.update("UPDATE booking.requests SET tenancy_id = ?, converted_at = ?, converted_by_user_id = ? WHERE id = ?",
                UUID.randomUUID(), Timestamp.from(now), owner, onboarded);
        booking("MOVED_IN", today);
        // A no-show's token waits on the handler (2026-10-28). One owed back is not work: refunds are not followed.
        UUID pending = booking("EXPIRED", today);
        jdbc.update("""
                INSERT INTO booking.tokens (id, request_id, property_id, amount_paise, status, received_method,
                    received_by_user_id, received_at, receipt_code)
                VALUES (?, ?, ?, 200000, 'DECISION_PENDING', 'UPI', ?, now(), ?)
                """, UUID.randomUUID(), pending, property, owner, "TKN-" + pending);
        UUID refund = booking("EXPIRED", today);
        jdbc.update("""
                INSERT INTO booking.tokens (id, request_id, property_id, amount_paise, status, received_method,
                    received_by_user_id, received_at, receipt_code, refund_due_since)
                VALUES (?, ?, ?, 200000, 'REFUND_DUE', 'UPI', ?, now(), ?, now())
                """, UUID.randomUUID(), refund, property, owner, "TKN-" + refund);
        assertThat(bookings.attentionForProperty(property)).isEqualTo(new BookingAttentionSummary(1, 1, 1, 1, 1, 1));
        assertThat(bookings.attentionForProperty(fx.property())).isEqualTo(new BookingAttentionSummary(0, 0, 0, 0, 0, 0));

        assertQueue(BookingAttentionFilter.RESPONSE, unanswered);
        fx.assign(unanswered, owner);
        assertQueue(BookingAttentionFilter.RESPONSE, unanswered);
        assertQueue(BookingAttentionFilter.TOKEN_CLAIMS, claim);
        assertQueue(BookingAttentionFilter.CONFIRMATION, received);
        assertQueue(BookingAttentionFilter.MOVE_IN, due);
        assertQueue(BookingAttentionFilter.MOVE_IN_TODAY, todays);
        assertThat(bookings.attentionForProperty(property).awaitingResponse()).isEqualTo(1);
        assertThatThrownBy(() -> requests.pageForProperty(fx.person(), property, BookingListFilter.OPEN,
                null, false, false, BookingAttentionFilter.RESPONSE, null, 0, 20)).isInstanceOf(ForbiddenException.class);

        jdbc.update("UPDATE booking.requests SET status = 'AWAITING_TENANT' WHERE id = ?", unanswered);
        jdbc.update("UPDATE booking.requests SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ?", Timestamp.from(now), received);
        jdbc.update("UPDATE booking.requests SET token_claim_waiting = false WHERE id = ?", claim);
        jdbc.update("UPDATE booking.requests SET tenancy_id = ?, converted_at = ?, converted_by_user_id = ? WHERE id = ?",
                UUID.randomUUID(), Timestamp.from(now), owner, due);
        assertThat(bookings.attentionForProperty(property)).isEqualTo(new BookingAttentionSummary(0, 0, 0, 0, 1, 1));
    }

    @Test
    void enquiryPickupBecomesResponseWorkAndPendingCallsAreCountedOnlyOnce() {
        UUID fresh = fx.enquiry(property, fx.person());
        jdbc.update("UPDATE enquiry.enquiries SET handler_user_id = NULL, handler_assigned_by = NULL, handler_assigned_at = NULL WHERE id = ?", fresh);
        UUID assigned = fx.enquiry(property, fx.person());
        UUID call = fx.enquiry(property, fx.person());
        jdbc.update("""
                INSERT INTO enquiry.enquiry_responses (id, enquiry_id, channel, responded_by_user_id, outcome, created_at, updated_at)
                VALUES (?, ?, 'CALL_BACK', ?, 'OPEN', now(), now())
                """, UUID.randomUUID(), call, owner);
        UUID expired = fx.enquiry(property, fx.person());
        jdbc.update("UPDATE enquiry.enquiries SET expires_at = ? WHERE id = ?", Timestamp.from(now), expired);
        UUID closed = fx.enquiry(property, fx.person());
        jdbc.update("UPDATE enquiry.enquiries SET ended_at = now(), ended_by_user_id = ?, end_reason = 'NOT_INTERESTED' WHERE id = ?", owner, closed);
        assertThat(enquiries.attentionForProperty(property)).isEqualTo(new EnquiryAttentionSummary(1, 1, 1));
        jdbc.update("UPDATE enquiry.enquiries SET handler_user_id = ?, handler_assigned_by = 'FIRST_RESPONSE', handler_assigned_at = now() WHERE id = ?", owner, fresh);
        assertThat(enquiries.attentionForProperty(property)).isEqualTo(new EnquiryAttentionSummary(0, 2, 1));
        jdbc.update("UPDATE enquiry.enquiries SET status = 'RESPONDED', responded_at = now() WHERE id IN (?, ?)", assigned, fresh);
        jdbc.update("UPDATE enquiry.enquiry_responses SET outcome = 'FAILED', settled_at = now() WHERE enquiry_id = ?", call);
        jdbc.update("UPDATE enquiry.enquiries SET status = 'RESPONDED', responded_at = now() WHERE id = ?", call);
        assertThat(enquiries.attentionForProperty(property)).isEqualTo(new EnquiryAttentionSummary(0, 0, 0));
        assertThat(enquiries.attentionForProperty(fx.property())).isEqualTo(new EnquiryAttentionSummary(0, 0, 0));
    }

    @Test
    void visitsUseIndiaTodayAndSlotEndBoundaryAndExcludeCompletedOrHistoricalVisits() {
        UUID upcoming = visit(today, 721, "SCHEDULED");
        UUID earlier = visit(today, 720, "SCHEDULED");
        visit(today.minusDays(1), 720, "SCHEDULED");
        visit(today.plusDays(1), 720, "SCHEDULED");
        visit(today, 721, "CANCELLED");
        visit(today, 721, "VISITED");
        assertThat(visits.attentionForProperty(property)).isEqualTo(new VisitAttentionSummary(1, 1));
        assertThat(visits.attentionForProperty(fx.property())).isEqualTo(new VisitAttentionSummary(0, 0));
        jdbc.update("UPDATE lead.visits SET status = 'VISITED' WHERE id IN (?, ?)", upcoming, earlier);
        assertThat(visits.attentionForProperty(property)).isEqualTo(new VisitAttentionSummary(0, 0));
    }

    private void assertQueue(BookingAttentionFilter attention, UUID id) {
        // Action mode overrides the unassigned tab, a stale status and mine, and filters before pagination.
        var page = requests.pageForProperty(owner, property, BookingListFilter.HISTORY, BookingStatus.EXPIRED,
                true, true, attention, null, 0, 1);
        assertThat(page.totalElements()).isEqualTo(1);
        assertThat(page.items()).extracting(item -> item.id()).containsExactly(id);
    }

    private UUID booking(String status, LocalDate moveIn) {
        UUID id = UUID.randomUUID();
        UUID person = fx.person();
        UUID enquiry = fx.enquiry(property, person);
        boolean moved = status.equals("MOVED_IN");
        boolean agreed = moved || status.equals("AWAITING_TOKEN") || status.equals("TOKEN_RECEIVED") || status.equals("CONFIRMED");
        jdbc.update("""
                INSERT INTO booking.requests (id, reference_code, property_id, prospect_user_id, enquiry_id,
                    visit_id, visit_slot, idempotency_key, property_name, room_id, room_number,
                    listed_rent_paise, deposit_paise, token_required, token_amount_paise, token_refundable,
                    tenant_name, tenant_phone, tenant_gender, tenant_date_of_birth,
                    submitted_at, booking_date, earliest_move_in_date, latest_move_in_date,
                    original_move_in_date, move_in_date, expires_at, status,
                    current_offer_sequence, current_offer_by, current_rent_paise, current_offer_negotiable,
                    agreed_at, agreed_rent_paise, token_due_paise, token_due_at, confirmed_at,
                    tenancy_id, converted_at, converted_by_user_id, closed_at, end_cause)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'Attention PG', ?, '101', 800000, 1000000, true, 200000, true,
                    'Asha Rao', '+919000000000', 'FEMALE', DATE '2000-01-01', ?, ?, ?, ?, ?, ?, ?, ?,
                    1, 'TENANT', 800000, true, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, "BKG-" + id, property, person, enquiry, UUID.randomUUID(), id.toString(), room,
                Timestamp.from(now.minusSeconds(10 * 86400)), today.minusDays(10), today.minusDays(2), today.plusDays(11),
                moveIn, moveIn, Timestamp.from(now.plusSeconds(86400)), status,
                agreed ? Timestamp.from(now) : null, agreed ? 800000L : null, agreed ? 200000L : null,
                agreed ? Timestamp.from(now.plusSeconds(86400)) : null, status.equals("CONFIRMED") || moved ? Timestamp.from(now) : null,
                moved ? UUID.randomUUID() : null, moved ? Timestamp.from(now) : null, moved ? owner : null,
                moved || status.equals("EXPIRED") ? Timestamp.from(now) : null, moved ? "MOVED_IN" : null);
        return id;
    }

    private UUID visit(LocalDate date, int endMinute, String status) {
        UUID person = fx.person();
        UUID enquiry = fx.enquiry(property, person);
        UUID lead = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO lead.leads (id, reference_code, property_id, prospect_user_id, enquiry_id, stage, state,
                    enquired_at, early_lead_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'EARLY_LEAD', 'OPEN', now(), now(), now(), now())
                """, lead, "LD-" + lead, property, person, enquiry);
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO lead.visits (id, reference_code, lead_id, property_id, prospect_user_id, enquiry_id,
                    visit_date, slot_start_minute, slot_end_minute, booked_by, booked_by_user_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 600, ?, 'TENANT', ?, ?)
                """, id, "VIS-" + id, lead, property, person, enquiry, date, endMinute, person, status);
        return id;
    }
}
