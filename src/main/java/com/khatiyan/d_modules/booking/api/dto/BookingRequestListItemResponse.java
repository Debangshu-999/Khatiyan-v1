package com.khatiyan.d_modules.booking.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;

/**
 * A booking request as one row of a list. Built from the request alone: the
 * names it shows were copied onto it at submission, so a page costs one read.
 *
 * @param handledByReader whether the person reading is the one who handles it.
 *                        The card says "Handled by you", and a confirmed
 *                        booking is opened from its list by its handler alone
 */
public record BookingRequestListItemResponse(
        UUID id,
        String referenceCode,
        UUID propertyId,
        String propertyName,
        String roomNumber,
        String tenantName,
        BookingStatus status,
        LocalDate moveInDate,
        long listedRentPaise,
        long currentRentPaise,
        BookingParty currentOfferBy,
        UUID handlerUserId,
        String handlerName,
        boolean handledByReader,
        boolean canChat,
        /** For a confirmed booking: whether its bed is free for them now. Null otherwise (2026-10-27). */
        Boolean bedReady,
        Instant submittedAt,
        Instant expiresAt,
        long version) {

    public static BookingRequestListItemResponse of(BookingRequest request, Instant now, UUID handlerUserId,
            String handlerName, boolean handledByReader, boolean canChat, Boolean bedReady) {
        return new BookingRequestListItemResponse(
                request.getId(), request.getReferenceCode(), request.getPropertyId(), request.getPropertyName(),
                request.getRoomNumber(), request.getTenantName(), request.statusAt(now), request.getMoveInDate(),
                request.getListedRentPaise(), request.getCurrentRentPaise(), request.getCurrentOfferBy(),
                handlerUserId, handlerName, handledByReader, canChat, bedReady, request.getSubmittedAt(), request.getExpiresAt(),
                request.getVersion());
    }
}
