package com.khatiyan.d_modules.tenancy.event;

import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * Raised when owner/manager rejects a tenant exit request.
 */
public record TenancyExitRejectedEvent(
        UUID requestId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        TenancyExitRequestType type) {
}
