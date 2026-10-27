package com.khatiyan.d_modules.booking.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;

/**
 * A booking as it stands right now, for another module.
 *
 * <p>The leads pipeline reads this when a booking event arrives, instead of
 * trusting what the event carried. No rent, no token amount and no contact
 * details: nothing a lead needs, and nothing it should hold.
 *
 * @param status          with its clocks applied: a request whose time has run
 *                        out reads EXPIRED before the sweep has written it
 * @param endCause        why it ended, for one that held a bed and is over
 * @param currentOfferBy  whose offer is on the table. The other side's turn
 * @param endedAt         when it was over: closed, or the moment its clock ran
 *                        out. Null while it is still going
 * @param tenancyId       the stay it became, once the property onboarded them
 * @param lastChangedAt   the last time anything was written on it, by either side
 */
public record BookingSnapshot(
        UUID id,
        String referenceCode,
        UUID propertyId,
        UUID prospectUserId,
        UUID enquiryId,
        UUID visitId,
        BookingStatus status,
        BookingEndCause endCause,
        BookingParty currentOfferBy,
        UUID handlerUserId,
        Instant handlerAssignedAt,
        Instant submittedAt,
        Instant agreedAt,
        Instant confirmedAt,
        Instant endedAt,
        Instant expiresAt,
        Instant tokenDueAt,
        boolean tokenClaimWaiting,
        LocalDate moveInDate,
        UUID tenancyId,
        Instant convertedAt,
        Instant lastChangedAt,
        // The room asked for, for the lead details (2026-10-17).
        String roomNumber,
        // The lead module's external record, for a booking made outside the app (2026-10-19). Null otherwise.
        UUID externalProspectId) {

    /** Still going: a request being answered, terms agreed, or a confirmed booking. */
    public boolean isLive() {
        return status.holdsBed();
    }

    public static BookingSnapshot of(BookingRequest request, Instant now) {
        BookingStatus status = request.statusAt(now);
        Instant endedAt = status.holdsBed() ? null
                : request.getClosedAt() != null ? request.getClosedAt()
                : status == BookingStatus.EXPIRED ? request.getExpiresAt() : null;
        return new BookingSnapshot(
                request.getId(),
                request.getReferenceCode(),
                request.getPropertyId(),
                request.getProspectUserId(),
                request.getEnquiryId(),
                request.getVisitId(),
                status,
                request.getEndCause(),
                request.getCurrentOfferBy(),
                request.getHandlerUserId(),
                request.getHandlerAssignedAt(),
                request.getSubmittedAt(),
                request.getAgreedAt(),
                request.getConfirmedAt(),
                endedAt,
                request.getExpiresAt(),
                request.getTokenDueAt(),
                request.isTokenClaimWaiting(),
                request.getMoveInDate(),
                request.getTenancyId(),
                request.getConvertedAt(),
                request.getUpdatedAt(),
                request.getRoomNumber(),
                request.getExternalProspectId());
    }
}
