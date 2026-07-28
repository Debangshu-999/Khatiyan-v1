package com.khatiyan.d_modules.payment.provider;

import java.util.UUID;

/**
 * Request to move an owner's net share of a captured payment to their linked
 * account. Created after capture, so {@code amountPaise} is already net of the
 * gateway's real fee and the platform fee.
 */
public record CreateProviderTransferCommand(
        String providerPaymentId,
        String linkedAccountRef,
        long amountPaise,
        String currency,
        UUID billingCycleId,
        UUID paymentOrderId) {
}
