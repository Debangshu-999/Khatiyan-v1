package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerAssignment;
import com.khatiyan.d_modules.enquiry.model.EnquiryOrigin;
import com.khatiyan.d_modules.enquiry.model.EnquirySentiment;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;

/**
 * An enquiry as it stands right now, for another module.
 *
 * <p>The leads pipeline reads this when an enquiry event arrives, instead of
 * trusting what the event carried. Events are delivered at least once and not
 * always in order. The current state is the same whichever event prompted the
 * read, so applying it twice, or late, changes nothing.
 *
 * <p>No message and no contact details: nothing another module needs, and
 * nothing it should hold.
 */
public record EnquirySnapshot(
        UUID id,
        UUID propertyId,
        UUID enquirerUserId,
        EnquiryStatus status,
        Instant raisedAt,
        Instant expiresAt,
        UUID handlerUserId,
        EnquiryHandlerAssignment handlerAssignedBy,
        Instant handlerAssignedAt,
        Instant respondedAt,
        EnquirySentiment sentiment,
        Instant endedAt,
        UUID chatThreadId,
        // When the enquirer took back a Not interested. Marking it so again closes it.
        Instant tenantChangedMindAt,
        // The day of the attended visit its booking window runs from. Null until a visit is attended.
        LocalDate bookingVisitDate,
        // When the tenant's own cancellation of a confirmed booking closed that window early.
        Instant bookingWindowClosedAt,
        // When a newer enquiry from the same person took its place.
        Instant replacedAt,
        long version,
        // How it began: an enquiry, or a visit or stay booked straight from the property profile (2026-10-17).
        EnquiryOrigin origin,
        // When booking without a visit was opened on it. Null for most.
        Instant directBookingAt) {

    public boolean isDirect() {
        return origin != null && origin.isDirect();
    }

    /** Whether nothing more can be done with it: ended by hand, or past its date. */
    public boolean isOver(Instant now) {
        return endedAt != null || status == EnquiryStatus.EXPIRED || !now.isBefore(expiresAt);
    }

    /**
     * Whether a booking request can still be raised from it: its visit was
     * attended, and the days after it have neither run out nor been closed.
     * The handler closing the enquiry does not take them away. The same test
     * as {@link PostVisitBookingEligibility}, for a module that is not asking
     * as the tenant.
     */
    public boolean bookingWindowOpen(Instant now) {
        return (bookingVisitDate != null || directBookingAt != null) && bookingWindowClosedAt == null && replacedAt == null
                && status != EnquiryStatus.EXPIRED && now.isBefore(expiresAt);
    }

    /**
     * Whether anything can still come of it: a visit booked on it while it is
     * live, or a booking raised from it while its window after the visit is
     * open. When this is false for every enquiry of a lead with nothing else
     * live, the lead has nowhere left to go.
     */
    public boolean canStillLeadSomewhere(Instant now) {
        return bookingVisitDate == null && directBookingAt == null
                ? !isOver(now) && replacedAt == null
                : bookingWindowOpen(now);
    }

    public static EnquirySnapshot of(Enquiry enquiry) {
        return new EnquirySnapshot(
                enquiry.getId(),
                enquiry.getPropertyId(),
                enquiry.getEnquirerUserId(),
                enquiry.getStatus(),
                enquiry.askedAt(),
                enquiry.getExpiresAt(),
                enquiry.getHandlerUserId(),
                enquiry.getHandlerAssignedBy(),
                enquiry.getHandlerAssignedAt(),
                enquiry.getRespondedAt(),
                enquiry.getSentiment(),
                enquiry.getEndedAt(),
                enquiry.getChatThreadId(),
                enquiry.getTenantChangedMindAt(),
                enquiry.getBookingVisitDate(),
                enquiry.getBookingWindowClosedAt(),
                enquiry.getReplacedAt(),
                enquiry.getVersion(),
                enquiry.getOrigin(),
                enquiry.getDirectBookingAt());
    }
}
