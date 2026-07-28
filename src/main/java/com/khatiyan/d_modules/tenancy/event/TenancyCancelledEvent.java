package com.khatiyan.d_modules.tenancy.event;

import java.util.UUID;

/**
 * Published when a {@code PENDING_ACCEPTANCE} tenancy is cancelled — the tenant
 * declined the agreement, or the acceptance window expired. The bed reserved at
 * creation must be freed; billing never started, so there is nothing to settle.
 */
public record TenancyCancelledEvent(
    UUID tenancyId,
    UUID userId,
    UUID propertyId,
    UUID roomId
) {}
