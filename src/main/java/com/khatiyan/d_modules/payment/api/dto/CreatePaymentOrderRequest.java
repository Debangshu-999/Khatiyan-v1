package com.khatiyan.d_modules.payment.api.dto;

import com.khatiyan.d_modules.payment.model.PaymentProviderType;

/**
 * Request to create a provider checkout order for a billing cycle.
 *
 * <p>The amount should not be accepted from the frontend. The service will
 * derive the payable amount from the billing cycle itself.
 */
public record CreatePaymentOrderRequest(
        PaymentProviderType provider,
        String idempotencyKey
) {
    public PaymentProviderType resolvedProvider(PaymentProviderType defaultProvider) {
        if (provider == null) {
            return defaultProvider;
        }

        return provider;
    }

    public String normalizedIdempotencyKey() {
        if (idempotencyKey == null) {
            return null;
        }

        return idempotencyKey.trim();
    }
}
