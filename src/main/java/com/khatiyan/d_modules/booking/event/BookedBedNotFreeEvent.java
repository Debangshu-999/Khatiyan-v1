package com.khatiyan.d_modules.booking.event;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A confirmed booking is due to start and the bed it booked is still
 * occupied. Published once a day for the move-in day and the three after it.
 *
 * <p>It carries who is to be told: the owner and the managers on the bookings
 * access list. A manager is never told merely because they manage the
 * property.
 *
 * @param moveInDate the day the booking was to start
 * @param today      the day this is being said. The same as {@code moveInDate}
 *                   on the first day
 */
public record BookedBedNotFreeEvent(
        UUID requestId,
        String referenceCode,
        UUID propertyId,
        UUID roomId,
        String roomNumber,
        String tenantName,
        LocalDate moveInDate,
        LocalDate today,
        List<UUID> recipientUserIds) {
}
