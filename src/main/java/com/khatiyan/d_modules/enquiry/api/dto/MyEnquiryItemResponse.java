package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/** One enquiry on the enquirer's own list (My enquiries, 2026-10-03). */
public record MyEnquiryItemResponse(
        UUID id,
        UUID propertyId,
        String propertyName,
        String message,
        Instant askedAt,
        Instant expiresAt,
        // When the property first reached them: the Answered tag. Null until then.
        Instant answeredAt,
        MyEnquiryState state,
        // When the property closed it. Null unless it did.
        Instant closedAt,
        // The conversation it was answered in, if it was answered in one.
        UUID chatThreadId,
        // The visit still booked on it, if any.
        LocalDate visitDate,
        LocalTime visitStart,
        // When its visit was cancelled, while none is booked again: "Visit cancelled".
        Instant visitCancelledAt,
        // Marked not interested and still open: when it closes by itself, and
        // whether they may still say they changed their mind.
        Instant notInterestedClosesAt,
        boolean canChangeMind,
        // Sent back as If-Match with "Changed your mind?".
        long version) {
}
