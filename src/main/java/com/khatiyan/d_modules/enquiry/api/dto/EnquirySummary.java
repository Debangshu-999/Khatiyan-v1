package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.EnquiryEndReason;
import com.khatiyan.d_modules.enquiry.model.EnquiryOrigin;

/**
 * An enquiry in a line, for another module's screen: what was asked, when, and
 * whether it is still open (lead details, 2026-10-17). No contact details.
 *
 * @param over      nothing more can be done with it: ended by hand, or past its date
 * @param endReason why it ended, once it has
 * @param origin    an enquiry, or a visit or stay booked straight from the property profile
 */
public record EnquirySummary(
        UUID id,
        String message,
        Instant raisedAt,
        Instant respondedAt,
        Instant expiresAt,
        Instant endedAt,
        EnquiryEndReason endReason,
        boolean over,
        EnquiryOrigin origin) {
}
