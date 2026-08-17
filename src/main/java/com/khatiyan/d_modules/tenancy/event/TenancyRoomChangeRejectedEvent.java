package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Raised when owner/manager rejects a room change request.
 *
 * <p>Includes the reason: a rejection the tenant cannot explain to themselves
 * only produces a second identical request.
 */
public record TenancyRoomChangeRejectedEvent(
        UUID requestId,
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        String reason) {
}
