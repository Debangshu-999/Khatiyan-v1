package com.khatiyan.d_modules.billing.event;

import java.util.UUID;

/**
 * Raised when a tenant says they have paid a bill by UPI and asks the owner to
 * confirm it.
 *
 * <p>
 * The one event on the claim's path that somebody is <em>waiting</em> on. Until
 * this listener existed, a claim froze the bill's late-fee clock, moved the
 * cycle to {@code CONFIRMATION_PENDING} and appeared in the Live digest — and
 * told the owner nothing. They learnt about it by happening to open the right
 * screen, while the tenant sat believing their rent was settled.
 */
public record PaymentClaimRaisedEvent(
        UUID paymentIntentId,
        UUID billingCycleId,
        UUID propertyId,
        UUID tenantUserId,
        String tenantName,
        String referenceCode,
        long amountPaise,
        /** What the tenant typed from their UPI app, when they gave one. */
        String tenantReferenceText,
        boolean hasProof) {
}
