package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerAssignment;
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
        long version) {

    /** Whether nothing more can be done with it: ended by hand, or past its date. */
    public boolean isOver(Instant now) {
        return endedAt != null || status == EnquiryStatus.EXPIRED || !now.isBefore(expiresAt);
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
                enquiry.getVersion());
    }
}
