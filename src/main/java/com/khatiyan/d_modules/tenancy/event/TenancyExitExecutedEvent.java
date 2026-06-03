package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * Raised when an approved exit request actually ends the tenancy.
 */
public record TenancyExitExecutedEvent(
        UUID requestId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        TenancyExitRequestType type,
        LocalDate checkoutDate) {
}
