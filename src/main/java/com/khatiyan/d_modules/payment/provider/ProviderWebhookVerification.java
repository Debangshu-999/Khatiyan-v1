package com.khatiyan.d_modules.payment.provider;

import java.time.Instant;

import com.khatiyan.d_modules.payment.model.PaymentMethod;

/**
 * Result of verifying and extracting a provider webhook.
 *
 * <p>The payment service stores the raw webhook first, then uses this result
 * to decide whether the event should update a payment order/transaction.
 */
public record ProviderWebhookVerification(
        boolean signatureValid,
        String providerEventId,
        String eventType,
        String providerOrderId,
        String providerPaymentId,
        Long amountPaise,
        String currency,
        String providerStatus,
        PaymentMethod method,
        Instant paidAt,
        String failureCode,
        String failureReason,
        /** Populated for Route transfer/settlement events; null for payment events. */
        ProviderWebhookTransfer transfer
) {
    public static ProviderWebhookVerification invalid(String failureReason) {
        return new ProviderWebhookVerification(
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                failureReason,
                null);
    }
}
