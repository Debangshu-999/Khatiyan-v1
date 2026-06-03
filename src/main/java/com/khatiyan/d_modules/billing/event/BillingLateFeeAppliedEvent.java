package com.khatiyan.d_modules.billing.event;

import java.util.UUID;

/**
 * Raised when the system creates or updates a late-fee line on a billing cycle.
 */
public record BillingLateFeeAppliedEvent(
        UUID billingCycleId,
        UUID lineItemId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        long lateFeeAmountPaise) {
}
