package com.khatiyan.d_modules.billing.event;

import java.util.UUID;

/**
 * A one-off bill was cancelled by management.
 *
 * <p>Carries the reason so the tenant is told why a bill they may already have
 * seen has gone. {@code tenantUserId} is null for a daily guest stay, which has
 * no account to notify.
 */
public record BillingCycleCancelledEvent(
        UUID billingCycleId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        long totalAmountPaise,
        String reason) {
}
