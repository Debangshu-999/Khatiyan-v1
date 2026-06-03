package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * Raised when owner/manager approves a tenant exit request.
 */
public record TenancyExitApprovedEvent(
        UUID requestId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        TenancyExitRequestType type,
        LocalDate approvedCheckoutDate) {
}
