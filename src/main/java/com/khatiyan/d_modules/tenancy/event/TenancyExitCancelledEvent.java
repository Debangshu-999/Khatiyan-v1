package com.khatiyan.d_modules.tenancy.event;

import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * Raised when a tenant cancels their own pending exit request.
 */
public record TenancyExitCancelledEvent(
        UUID requestId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        TenancyExitRequestType type) {
}
