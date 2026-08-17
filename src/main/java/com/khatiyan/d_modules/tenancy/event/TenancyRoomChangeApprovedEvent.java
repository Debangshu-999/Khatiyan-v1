package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/** Raised when owner/manager approves a room change request. */
public record TenancyRoomChangeApprovedEvent(
        UUID requestId,
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        UUID targetRoomId,
        LocalDate effectiveTransferDate) {
}
