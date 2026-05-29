package com.khatiyan.d_modules.payment.provider;

/**
 * Provider-neutral frontend return verification payload.
 *
 * <p>This validates the checkout return signature. Webhook verification still
 * remains the final source of truth for marking billing paid.
 */
public record VerifyProviderPaymentCommand(
        String providerOrderId,
        String providerPaymentId,
        String signature
) {
}
