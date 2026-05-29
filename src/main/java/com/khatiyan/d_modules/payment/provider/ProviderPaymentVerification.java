package com.khatiyan.d_modules.payment.provider;

import java.time.Instant;

import com.khatiyan.d_modules.payment.model.PaymentMethod;

/**
 * Result of verifying a provider payment return payload.
 *
 * <p>A valid signature means the payload belongs to the provider, but the
 * service should still check amount/order consistency before updating billing.
 */
public record ProviderPaymentVerification(
        boolean valid,
        String providerOrderId,
        String providerPaymentId,
        String providerStatus,
        PaymentMethod method,
        Instant paidAt,
        String failureCode,
        String failureReason
) {
    public static ProviderPaymentVerification invalid(String failureReason) {
        return new ProviderPaymentVerification(
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                failureReason);
    }
}
