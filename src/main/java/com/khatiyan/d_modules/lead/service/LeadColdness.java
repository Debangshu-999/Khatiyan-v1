package com.khatiyan.d_modules.lead.service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;

import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.lead.api.dto.LeadGoingColdResponse;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadColdReason;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitStatus;

/**
 * Whether an open lead is going cold, and why (user, 2026-10-11).
 *
 * <p>A reading, not a state. It is worked out from the lead, its visits, its
 * bookings and its enquiries as they stand at this moment, so nothing is
 * stored, nothing has to be undone when the lead moves, and the thresholds
 * below can be tuned once real leads exist.
 *
 * <ul>
 * <li>An early lead: the visit was missed, and "still interested?" has under
 * three days left.
 * <li>An advanced lead: a token falls due within a day. Or its booking has sat
 * for a day waiting on the property. Or no booking is live and the days to
 * book have under five left.
 * <li>Booked: the move-in day has passed and nobody has onboarded them.
 * </ul>
 */
final class LeadColdness {

    static final Duration MISSED_VISIT_WITHIN = Duration.ofDays(3);
    static final Duration BOOKING_WINDOW_WITHIN = Duration.ofDays(5);
    static final Duration WAITED_ON_PROPERTY_FOR = Duration.ofDays(1);
    static final Duration TOKEN_DUE_WITHIN = Duration.ofDays(1);

    private LeadColdness() {
    }

    /** @return null when the lead is not going cold, or is not an open lead at all */
    static LeadGoingColdResponse of(Lead lead, LeadStanding standing, Instant now) {
        if (!lead.isOpen()) {
            return null;
        }
        return switch (lead.getStage()) {
            case EARLY_LEAD -> afterAMissedVisit(standing, now);
            case ADVANCED_LEAD -> beforeABooking(standing, now);
            case BOOKED -> afterTheMoveInDay(standing, now);
            case ENQUIRED, MOVED_IN -> null;
        };
    }

    private static LeadGoingColdResponse afterAMissedVisit(LeadStanding standing, Instant now) {
        Visit visit = standing.latestVisit();
        if (visit == null || visit.getStatus() != VisitStatus.NOT_VISITED || visit.getNoVisitAt() == null) {
            return null;
        }
        Instant until = visit.getNoVisitAt().plus(Visit.STILL_INTERESTED_FOR);
        return now.isBefore(until) && !now.isBefore(until.minus(MISSED_VISIT_WITHIN))
                ? new LeadGoingColdResponse(LeadColdReason.MISSED_VISIT_UNANSWERED, visit.getNoVisitAt(), until)
                : null;
    }

    private static LeadGoingColdResponse beforeABooking(LeadStanding standing, Instant now) {
        BookingSnapshot live = standing.liveBooking();
        if (live == null) {
            // Nothing asked for yet, or what was asked for is over: only the days left to ask again.
            Instant windowEnds = standing.enquiries().stream()
                    .filter(enquiry -> enquiry.bookingWindowOpen(now))
                    .map(EnquirySnapshot::expiresAt)
                    .max(Comparator.naturalOrder())
                    .orElse(null);
            return windowEnds != null && !now.isBefore(windowEnds.minus(BOOKING_WINDOW_WITHIN))
                    ? new LeadGoingColdResponse(LeadColdReason.BOOKING_WINDOW_CLOSING, null, windowEnds)
                    : null;
        }
        if (live.status() == BookingStatus.AWAITING_TOKEN && !live.tokenClaimWaiting() && live.tokenDueAt() != null
                && !now.isBefore(live.tokenDueAt().minus(TOKEN_DUE_WITHIN))) {
            return new LeadGoingColdResponse(LeadColdReason.TOKEN_DUE_SOON, null, live.tokenDueAt());
        }
        // The property's move: a request to answer, a payment the tenant says they made, or a received
        // token still to be confirmed. Cold once a day has gone by with nothing written on the booking.
        boolean propertysMove = live.status() == BookingStatus.AWAITING_HANDLER || live.tokenClaimWaiting()
                || live.status() == BookingStatus.TOKEN_RECEIVED;
        if (propertysMove && live.lastChangedAt() != null
                && !now.isBefore(live.lastChangedAt().plus(WAITED_ON_PROPERTY_FOR))) {
            return new LeadGoingColdResponse(LeadColdReason.BOOKING_WAITING_ON_PROPERTY, live.lastChangedAt(),
                    live.status().isPending() ? live.expiresAt() : null);
        }
        return null;
    }

    private static LeadGoingColdResponse afterTheMoveInDay(LeadStanding standing, Instant now) {
        BookingSnapshot live = standing.liveBooking();
        if (live == null || live.status() != BookingStatus.CONFIRMED || live.tenancyId() != null
                || live.moveInDate() == null) {
            return null;
        }
        LocalDate today = LocalDate.ofInstant(now, LeadVisitService.IST);
        return live.moveInDate().isBefore(today)
                ? new LeadGoingColdResponse(LeadColdReason.MOVE_IN_OVERDUE,
                        live.moveInDate().plusDays(1).atStartOfDay(LeadVisitService.IST).toInstant(), null)
                : null;
    }
}
