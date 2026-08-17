package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Raised when a tenant asks to move to another room.
 *
 * <p>Carries the reference code because notifications must never print a UUID,
 * and both room ids so the message can name where they are moving from and to
 * without the listener re-querying the tenancy.
 */
public record TenancyRoomChangeRequestedEvent(
        UUID requestId,
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        UUID currentRoomId,
        UUID targetRoomId,
        LocalDate effectiveTransferDate) {
}
