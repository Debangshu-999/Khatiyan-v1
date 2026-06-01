package com.khatiyan.d_modules.payment.event;

import java.util.UUID;

/**
 * Raised when a payment order attempt is recorded as failed.
 */
public record PaymentFailedEvent(
        UUID paymentOrderId,
        UUID billingCycleId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        long amountPaise,
        String currency,
        String failureReason) {
}
