package com.khatiyan.d_modules.payment.provider;

/** Gateway acknowledgement of a refund to the original payment method. */
public record ProviderRefund(
        String providerRefundId,
        String status) {
}
