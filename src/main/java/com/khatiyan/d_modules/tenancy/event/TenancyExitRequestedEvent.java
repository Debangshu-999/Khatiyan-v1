package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * Raised when a tenant creates a normal or premature exit request.
 */
public record TenancyExitRequestedEvent(
        UUID requestId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        TenancyExitRequestType type,
        LocalDate requestedCheckoutDate) {
}
