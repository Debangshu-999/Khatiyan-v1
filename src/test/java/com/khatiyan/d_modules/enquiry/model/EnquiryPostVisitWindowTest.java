package com.khatiyan.d_modules.enquiry.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.d_modules.enquiry.api.dto.PostVisitBookingEligibility;

class EnquiryPostVisitWindowTest {
    private static final Instant NOW = Instant.parse("2026-10-09T04:30:00Z");
    private static final LocalDate DAY = LocalDate.of(2026, 10, 9);

    private Enquiry enquiry() {
        return Enquiry.raise(UUID.randomUUID(), UUID.randomUUID(), "A room please", Set.of(), NOW.minusSeconds(86400));
    }

    @Test
    void attendanceEstablishesOriginalCalendarWindowAndIsIdempotent() {
        Enquiry enquiry = enquiry();
        UUID visit = UUID.randomUUID();
        Instant oldExpiry = enquiry.getExpiresAt();
        assertThat(enquiry.openPostVisitBookingWindow(visit, DAY, NOW)).isTrue();
        assertThat(enquiry.getPreVisitExpiresAt()).isEqualTo(oldExpiry);
        assertThat(enquiry.getExpiresAt()).isEqualTo(Instant.parse("2026-11-08T18:30:00Z"));
        assertThat(enquiry.openPostVisitBookingWindow(visit, DAY, NOW.plusSeconds(86400))).isFalse();
        assertThat(enquiry.getExpiresAt()).isEqualTo(PostVisitBookingWindow.expiresAt(DAY));
        assertThatThrownBy(() -> enquiry.openPostVisitBookingWindow(UUID.randomUUID(), DAY, NOW))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void eligibilityIncludesTheLastDayButNotTheFollowingMidnight() {
        Enquiry enquiry = enquiry();
        enquiry.openPostVisitBookingWindow(UUID.randomUUID(), DAY, NOW);
        Instant closes = enquiry.getExpiresAt();
        assertThat(PostVisitBookingEligibility.of(enquiry, closes.minusNanos(1)).eligible()).isTrue();
        assertThat(PostVisitBookingEligibility.of(enquiry, closes).reason()).isEqualTo("BOOKING_WINDOW_EXPIRED");
        assertThat(enquiry.isOver(closes)).isTrue();
    }

    @Test
    void neitherPositiveSentimentNorACompletedFormIsRequired() {
        Enquiry enquiry = enquiry();
        enquiry.setSentiment(EnquirySentiment.NOT_INTERESTED, UUID.randomUUID(), NOW);
        enquiry.openPostVisitBookingWindow(UUID.randomUUID(), DAY, NOW);
        assertThat(enquiry.notInterestedClosesAt()).isNull();
        assertThat(PostVisitBookingEligibility.of(enquiry, NOW).eligible()).isTrue();
    }

    /** The 30 days belong to the visitor: the property declines requests, it cannot remove the window. */
    @Test
    void closingTheEnquiryAfterAnAttendedVisitKeepsTheVisitorsWindow() {
        Enquiry enquiry = enquiry();
        assertThat(enquiry.openPostVisitBookingWindow(UUID.randomUUID(), DAY, NOW)).isTrue();
        assertThat(enquiry.end(UUID.randomUUID(), NOW.plusSeconds(60), false)).isTrue();
        PostVisitBookingEligibility closed = PostVisitBookingEligibility.of(enquiry, NOW.plusSeconds(120));
        assertThat(closed.eligible()).isTrue();
        assertThat(closed.reason()).isNull();
        assertThat(PostVisitBookingEligibility.of(enquiry, PostVisitBookingWindow.expiresAt(DAY)).reason())
                .isEqualTo("BOOKING_WINDOW_EXPIRED");
    }

    @Test
    void manualClosureAndReplacementAreNotResurrected() {
        Enquiry closed = enquiry();
        closed.end(UUID.randomUUID(), NOW, false);
        assertThat(closed.openPostVisitBookingWindow(UUID.randomUUID(), DAY, NOW)).isFalse();
        assertThat(PostVisitBookingEligibility.of(closed, NOW).reason()).isEqualTo("ENQUIRY_CLOSED");
        Enquiry replaced = enquiry();
        replaced.expireNow(NOW);
        assertThat(replaced.openPostVisitBookingWindow(UUID.randomUUID(), DAY, NOW)).isFalse();
    }

    @Test
    void cancelledBookingWindowCannotBeReopenedByAttendanceReplay() {
        Enquiry enquiry = enquiry();
        UUID visit = UUID.randomUUID();
        enquiry.openPostVisitBookingWindow(visit, DAY, NOW);
        assertThat(enquiry.closePostVisitBookingWindow(NOW.plusSeconds(1))).isTrue();
        assertThat(enquiry.closePostVisitBookingWindow(NOW.plusSeconds(2))).isFalse();
        assertThat(enquiry.openPostVisitBookingWindow(visit, DAY, NOW.plusSeconds(3))).isFalse();
        assertThat(PostVisitBookingEligibility.of(enquiry, NOW.plusSeconds(4)).reason()).isEqualTo("BOOKING_WINDOW_CLOSED");
        assertThat(enquiry.getBookingWindowClosedAt()).isEqualTo(NOW.plusSeconds(1));
    }

    @Test
    void futureOrOutOfWindowVisitDatesCannotEstablishEligibility() {
        assertThatThrownBy(() -> enquiry().openPostVisitBookingWindow(UUID.randomUUID(), DAY.plusDays(1), NOW))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> enquiry().openPostVisitBookingWindow(UUID.randomUUID(), DAY.minusDays(31), NOW))
                .isInstanceOf(ValidationException.class);
        assertThat(PostVisitBookingEligibility.of(enquiry(), NOW).reason()).isEqualTo("ATTENDED_VISIT_REQUIRED");
    }

    @Test
    void aNewlyAttendedAlreadyBookedVisitCanReplaceItsOldTimedDeadline() {
        Enquiry enquiry = Enquiry.raise(UUID.randomUUID(), UUID.randomUUID(), "A room", Set.of(), NOW.minusSeconds(40 * 86400));
        enquiry.markResponded(NOW.minusSeconds(35 * 86400));
        enquiry.markWindowClosed(NOW.minusSeconds(1));
        enquiry.markChatClosed(NOW.minusSeconds(1));
        enquiry.recordEndReason(EnquiryEndReason.VISIT_BOOKED);
        assertThat(enquiry.openPostVisitBookingWindow(UUID.randomUUID(), DAY, NOW)).isTrue();
        assertThat(enquiry.getWindowClosedAt()).isNull();
        assertThat(enquiry.getChatClosedAt()).isNull();
        assertThat(enquiry.getEndReason()).isNull();
        assertThat(PostVisitBookingEligibility.of(enquiry, NOW).eligible()).isTrue();
    }
}
