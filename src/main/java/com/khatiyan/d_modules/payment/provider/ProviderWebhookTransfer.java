package com.khatiyan.d_modules.payment.provider;

/**
 * Transfer/settlement details lifted out of a Route webhook.
 *
 * <p>Present only for transfer and settlement events; null on payment events,
 * which carry a payment entity instead.
 */
public record ProviderWebhookTransfer(
        String providerTransferId,
        String status,
        String failureReason) {
}
