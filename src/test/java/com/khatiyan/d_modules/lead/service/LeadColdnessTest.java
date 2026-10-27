package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.enquiry.model.EnquiryOrigin;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.lead.api.dto.LeadGoingColdResponse;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadColdReason;

/**
 * When an advanced or a booked lead is going cold, and why (user, 2026-10-11).
 * The missed visit of an early lead needs a real visit row, and is covered
 * with the reads against the database.
 */
class LeadColdnessTest {

    /** 11:30 in the morning in India, on 11 October. */
    private static final Instant NOW = Instant.parse("2026-10-11T06:00:00Z");
    private static final LocalDate TODAY = LocalDate.ofInstant(NOW, ZoneId.of("Asia/Kolkata"));
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID PERSON = UUID.randomUUID();
    private static final UUID ENQUIRY = UUID.randomUUID();

    // ---- Before a booking: the days left to ask for one ---------------------

    @Test
    void anAdvancedLeadWithDaysToSpareIsNotCold() {
        assertThat(coldness(advanced(), windowEnding(days(10)))).isNull();
    }

    @Test
    void itGoesColdWhenTheDaysToBookHaveUnderFiveLeft() {
        Instant ends = NOW.plus(days(4));

        LeadGoingColdResponse cold = coldness(advanced(), windowEnding(days(4)));

        assertThat(cold.reason()).isEqualTo(LeadColdReason.BOOKING_WINDOW_CLOSING);
        assertThat(cold.by()).isEqualTo(ends);
        assertThat(cold.since()).isNull();
    }

    @Test
    void aWindowThatIsAlreadyClosedIsNotCoolingItIsOver() {
        EnquirySnapshot closed = new EnquirySnapshot(
                ENQUIRY, PROPERTY, PERSON, EnquiryStatus.RESPONDED, NOW.minus(days(20)), NOW.plus(days(2)),
                null, null, null, null, null, null, null, null,
                TODAY.minusDays(5), NOW.minus(days(1)), null, 0, EnquiryOrigin.ENQUIRY, null);

        assertThat(LeadColdness.of(advanced(), new LeadStanding(List.of(closed), List.of(), List.of()), NOW)).isNull();
    }

    // ---- A booking under way ------------------------------------------------

    @Test
    void aRequestJustSentIsNotColdThoughTheWindowIsNearlyOver() {
        // The window is not the worry while something has been asked for.
        BookingSnapshot sent = booking(BookingStatus.AWAITING_HANDLER, NOW.minus(Duration.ofHours(2)), null, false);

        assertThat(coldness(advanced(), windowEnding(days(2)), sent)).isNull();
    }

    @Test
    void aRequestThePropertyHasLeftForADayIsCold() {
        Instant lastTouched = NOW.minus(Duration.ofHours(25));
        BookingSnapshot waiting = booking(BookingStatus.AWAITING_HANDLER, lastTouched, null, false);

        LeadGoingColdResponse cold = coldness(advanced(), windowEnding(days(20)), waiting);

        assertThat(cold.reason()).isEqualTo(LeadColdReason.BOOKING_WAITING_ON_PROPERTY);
        assertThat(cold.since()).isEqualTo(lastTouched);
        // Its own clock: the request runs out then.
        assertThat(cold.by()).isEqualTo(waiting.expiresAt());
    }

    @Test
    void aRequestWaitingOnTheTenantIsNotThePropertysToChase() {
        BookingSnapshot theirs = booking(BookingStatus.AWAITING_TENANT, NOW.minus(days(3)), null, false);

        assertThat(coldness(advanced(), windowEnding(days(20)), theirs)).isNull();
    }

    @Test
    void aTokenFallingDueWithinADayIsCold() {
        Instant due = NOW.plus(Duration.ofHours(5));
        BookingSnapshot owed = booking(BookingStatus.AWAITING_TOKEN, NOW.minus(Duration.ofHours(43)), due, false);

        LeadGoingColdResponse cold = coldness(advanced(), windowEnding(days(20)), owed);

        assertThat(cold.reason()).isEqualTo(LeadColdReason.TOKEN_DUE_SOON);
        assertThat(cold.by()).isEqualTo(due);

        // With two days still to pay, nothing is running out.
        BookingSnapshot inTime = booking(
                BookingStatus.AWAITING_TOKEN, NOW.minus(Duration.ofHours(1)), NOW.plus(days(2)), false);
        assertThat(coldness(advanced(), windowEnding(days(20)), inTime)).isNull();
    }

    @Test
    void aPaymentTheTenantRecordedWaitsOnThePropertyNotOnTheClock() {
        Instant due = NOW.plus(Duration.ofHours(5));
        // They say they paid. The token clock has stopped, so it is not "due soon".
        BookingSnapshot justClaimed = booking(BookingStatus.AWAITING_TOKEN, NOW.minus(Duration.ofHours(1)), due, true);
        assertThat(coldness(advanced(), windowEnding(days(20)), justClaimed)).isNull();

        Instant claimed = NOW.minus(days(2));
        BookingSnapshot unanswered = booking(BookingStatus.AWAITING_TOKEN, claimed, due, true);
        LeadGoingColdResponse cold = coldness(advanced(), windowEnding(days(20)), unanswered);

        assertThat(cold.reason()).isEqualTo(LeadColdReason.BOOKING_WAITING_ON_PROPERTY);
        assertThat(cold.since()).isEqualTo(claimed);
        // Nothing ends it by itself. Somebody has to check the payment.
        assertThat(cold.by()).isNull();
    }

    @Test
    void aReceivedTokenLeftUnconfirmedForADayIsCold() {
        BookingSnapshot received = booking(BookingStatus.TOKEN_RECEIVED, NOW.minus(days(2)), null, false);

        LeadGoingColdResponse cold = coldness(advanced(), windowEnding(days(20)), received);

        assertThat(cold.reason()).isEqualTo(LeadColdReason.BOOKING_WAITING_ON_PROPERTY);
        assertThat(cold.by()).isNull();
    }

    // ---- Booked -------------------------------------------------------------

    @Test
    void aBookedLeadIsColdOnceItsMoveInDayHasPassedWithNobodyOnboarded() {
        BookingSnapshot due = confirmed(TODAY.minusDays(1), null);

        LeadGoingColdResponse cold = coldness(booked(), windowEnding(days(20)), due);

        assertThat(cold.reason()).isEqualTo(LeadColdReason.MOVE_IN_OVERDUE);
        // Overdue from the first moment of the day after.
        assertThat(cold.since()).isEqualTo(TODAY.atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant());
        assertThat(cold.by()).isNull();
    }

    @Test
    void theMoveInDayItselfIsNotLateAndNeitherIsSomeoneAlreadyOnboarded() {
        assertThat(coldness(booked(), windowEnding(days(20)), confirmed(TODAY, null))).isNull();
        assertThat(coldness(booked(), windowEnding(days(20)), confirmed(TODAY.minusDays(3), UUID.randomUUID())))
                .isNull();
    }

    // ---- Not a lead in play -------------------------------------------------

    @Test
    void aRecordThatIsNotAnOpenLeadIsNeverCold() {
        Lead enquiryOnly = Lead.openedByEnquiry("LEAD-1", PROPERTY, PERSON, ENQUIRY, NOW.minus(days(10)));
        assertThat(coldness(enquiryOnly, windowEnding(days(1)))).isNull();

        Lead dead = advanced();
        dead.close(LeadCloseReason.BOOKING_WINDOW_EXPIRED, NOW);
        assertThat(coldness(dead, windowEnding(days(1)))).isNull();
    }

    // ---- Helpers ------------------------------------------------------------

    private static Duration days(long days) {
        return Duration.ofDays(days);
    }

    private static Lead advanced() {
        Lead lead = Lead.openedByEnquiry("LEAD-1", PROPERTY, PERSON, ENQUIRY, NOW.minus(days(10)));
        lead.reachEarlyLead(NOW.minus(days(8)));
        lead.reachAdvancedLead(NOW.minus(days(5)));
        return lead;
    }

    private static Lead booked() {
        Lead lead = advanced();
        lead.reachBooked(NOW.minus(days(2)));
        return lead;
    }

    /** An enquiry whose visit was attended, with this long left to book from it. */
    private static EnquirySnapshot windowEnding(Duration left) {
        return new EnquirySnapshot(
                ENQUIRY, PROPERTY, PERSON, EnquiryStatus.RESPONDED, NOW.minus(days(20)), NOW.plus(left),
                null, null, null, null, null, null, null, null,
                TODAY.minusDays(5), null, null, 0, EnquiryOrigin.ENQUIRY, null);
    }

    private static LeadGoingColdResponse coldness(Lead lead, EnquirySnapshot enquiry, BookingSnapshot... bookings) {
        return LeadColdness.of(lead, new LeadStanding(List.of(enquiry), List.of(bookings), List.of()), NOW);
    }

    private static BookingSnapshot booking(
            BookingStatus status, Instant lastChangedAt, Instant tokenDueAt, boolean claimWaiting) {
        return new BookingSnapshot(
                UUID.randomUUID(), "BKG-1", PROPERTY, PERSON, ENQUIRY, UUID.randomUUID(), status, null,
                BookingParty.TENANT, null, null, NOW.minus(days(3)), status.isAgreed() ? NOW.minus(days(2)) : null,
                null, null, NOW.plus(days(4)), tokenDueAt, claimWaiting, TODAY.plusDays(10), null, null,
                lastChangedAt, "101", null);
    }

    private static BookingSnapshot confirmed(LocalDate moveInDate, UUID tenancyId) {
        return new BookingSnapshot(
                UUID.randomUUID(), "BKG-1", PROPERTY, PERSON, ENQUIRY, UUID.randomUUID(), BookingStatus.CONFIRMED,
                null, BookingParty.MANAGEMENT, null, null, NOW.minus(days(12)), NOW.minus(days(11)),
                NOW.minus(days(11)), null, NOW.minus(days(5)), null, false, moveInDate, tenancyId,
                tenancyId == null ? null : NOW.minus(days(1)), NOW.minus(days(11)), "101", null);
    }
}
