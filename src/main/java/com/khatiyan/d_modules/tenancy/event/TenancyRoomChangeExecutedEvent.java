package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/** Raised once the tenant has actually been moved into the new room. */
public record TenancyRoomChangeExecutedEvent(
        UUID requestId,
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        UUID targetRoomId,
        long newRentAmountPaise) {
}
