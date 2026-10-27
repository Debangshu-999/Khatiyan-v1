package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.api.dto.EnquirySummary;
import com.khatiyan.d_modules.enquiry.model.EnquiryEndReason;
import com.khatiyan.d_modules.enquiry.model.EnquiryOrigin;

/**
 * One of a lead's enquiries, as the lead details show it (2026-10-17). It is
 * answered from the Enquiries screen, or from Follow up.
 *
 * @param open      something can still be done with it
 * @param endReason why it ended, once it has
 * @param origin    an enquiry, or a visit or stay booked straight from the
 *                  property profile, which the lead details show as not available
 */
public record LeadEnquiryRef(
        UUID id,
        String message,
        Instant raisedAt,
        Instant respondedAt,
        Instant expiresAt,
        Instant endedAt,
        EnquiryEndReason endReason,
        boolean open,
        EnquiryOrigin origin) {

    public static LeadEnquiryRef of(EnquirySummary enquiry) {
        return new LeadEnquiryRef(
                enquiry.id(), enquiry.message(), enquiry.raisedAt(), enquiry.respondedAt(), enquiry.expiresAt(),
                enquiry.endedAt(), enquiry.endReason(), !enquiry.over(), enquiry.origin());
    }
}
