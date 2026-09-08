package com.khatiyan.d_modules.billing.event;

import java.util.UUID;

/**
 * Raised when an owner could not find a tenant's claimed payment and sent the
 * bill back to unpaid.
 *
 * <p>
 * <b>There is no matching "approved" event, deliberately.</b> Verifying a claim
 * settles the bill through {@code recordManualPayment}, which already publishes
 * {@link BillingCyclePaidManuallyEvent} and already tells the tenant their
 * payment was recorded — that IS the answer to their claim, and a second
 * notification saying the same thing would arrive in the same second.
 *
 * <p>
 * A rejection has no such twin. Nothing else changes state the tenant can see:
 * the bill quietly returns to unpaid and the late-fee clock restarts. Without
 * this the first they would know is a late fee appearing on rent they believe
 * they have paid.
 */
public record PaymentClaimRejectedEvent(
        UUID paymentIntentId,
        UUID billingCycleId,
        UUID propertyId,
        UUID tenantUserId,
        String referenceCode,
        long amountPaise,
        UUID decidedByUserId) {
}
