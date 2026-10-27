package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingStatus;

/**
 * A lead's booking, in as much as the lead shows of it. No rent and no token
 * amount: the booking itself is read and acted on from Bookings.
 *
 * @param status    with its clocks applied
 * @param endCause  why it ended, for one that is over
 * @param expiresAt when a request still being answered runs out
 * @param tenancyId the stay it became, once the property onboarded them
 */
public record LeadBookingRef(
        UUID id,
        String referenceCode,
        UUID enquiryId,
        String roomNumber,
        BookingStatus status,
        BookingEndCause endCause,
        LocalDate moveInDate,
        Instant submittedAt,
        Instant confirmedAt,
        Instant endedAt,
        Instant expiresAt,
        Instant tokenDueAt,
        boolean tokenClaimWaiting,
        UUID tenancyId) {

    public static LeadBookingRef of(BookingSnapshot booking) {
        return new LeadBookingRef(
                booking.id(),
                booking.referenceCode(),
                booking.enquiryId(),
                booking.roomNumber(),
                booking.status(),
                booking.endCause(),
                booking.moveInDate(),
                booking.submittedAt(),
                booking.confirmedAt(),
                booking.endedAt(),
                booking.status().isPending() ? booking.expiresAt() : null,
                booking.status() == BookingStatus.AWAITING_TOKEN ? booking.tokenDueAt() : null,
                booking.tokenClaimWaiting(),
                booking.tenancyId());
    }
}
