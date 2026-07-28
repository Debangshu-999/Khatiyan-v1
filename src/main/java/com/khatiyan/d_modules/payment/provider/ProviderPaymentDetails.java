package com.khatiyan.d_modules.payment.provider;

/**
 * A captured payment as the gateway reports it.
 *
 * <p>{@code feePaise} is what the gateway actually charged for this payment,
 * GST included, and {@code taxPaise} is the GST portion inside it. Both are
 * facts about the individual payment — a UPI collection is typically free while
 * a card is not — so they cannot be derived from the amount.
 *
 * <p>{@code feeKnown} is false when the gateway has not published the fee yet.
 * Callers must defer rather than substitute an estimate: guessing here means
 * silently over-charging the owner.
 */
public record ProviderPaymentDetails(
        String providerPaymentId,
        long amountPaise,
        String currency,
        String method,
        String status,
        boolean feeKnown,
        long feePaise,
        long taxPaise) {

    public static ProviderPaymentDetails feeUnavailable(
            String providerPaymentId,
            long amountPaise,
            String currency,
            String method,
            String status) {
        return new ProviderPaymentDetails(
                providerPaymentId,
                amountPaise,
                currency,
                method,
                status,
                false,
                0L,
                0L);
    }
}
