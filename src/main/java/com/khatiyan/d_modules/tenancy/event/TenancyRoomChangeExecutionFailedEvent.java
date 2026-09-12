package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * An approved room change could not run on its transfer date and has been
 * cancelled, with its reserved bed released.
 *
 * @param reason why it could not run, for management. Never shown to the tenant.
 */
public record TenancyRoomChangeExecutionFailedEvent(
        UUID requestId,
        String requestReferenceCode,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        UUID targetRoomId,
        LocalDate effectiveTransferDate,
        String reason) {
}
