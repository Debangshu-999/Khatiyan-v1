package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when a tenancy is ended.
 *
 * <p>Listeners typically: free the room in the property module,
 * trigger deposit refund flows in the payment module, send exit
 * notifications.
 */
public record TenancyEndedEvent(
    UUID tenancyId,
    UUID userId,
    UUID actorUserId,
    UUID propertyId,
    UUID roomId,
    LocalDate endDate,
    /**
     * A future booking claims the bed this stay frees. The property module
     * frees it and reserves it again in one step, so nobody else can take it
     * before the booking starts.
     */
    boolean holdBedForFutureBooking
) {
    public TenancyEndedEvent(UUID tenancyId, UUID userId, UUID actorUserId, UUID propertyId, UUID roomId,
            LocalDate endDate) {
        this(tenancyId, userId, actorUserId, propertyId, roomId, endDate, false);
    }
}
