package com.khatiyan.d_modules.payment.provider;

/** Gateway acknowledgement of a transfer request. */
public record ProviderTransfer(
        String providerTransferId,
        String status) {
}
