package com.khatiyan.d_modules.payment.provider;

/**
 * Provider-neutral checkout order response.
 *
 * <p>The payment service stores the provider order id and returns checkout
 * references to the frontend for opening the provider checkout UI.
 */
public record ProviderPaymentOrder(
        String providerOrderId,
        String checkoutReference,
        String rawResponse
) {
}
