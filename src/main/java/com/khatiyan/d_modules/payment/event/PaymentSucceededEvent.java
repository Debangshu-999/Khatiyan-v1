package com.khatiyan.d_modules.payment.event;

import java.util.UUID;

/**
 * Raised once when a payment order is marked paid by checkout verification or
 * webhook processing.
 */
public record PaymentSucceededEvent(
        UUID paymentOrderId,
        UUID billingCycleId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID propertyId,
        long amountPaise,
        String currency,
        String providerPaymentId) {
}
