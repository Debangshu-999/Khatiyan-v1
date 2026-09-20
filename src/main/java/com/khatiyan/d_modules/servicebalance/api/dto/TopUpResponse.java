package com.khatiyan.d_modules.servicebalance.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUpStatus;

/**
 * One top-up attempt, as the app sees it.
 *
 * <p>Carries the gateway order and the publishable key so checkout can open
 * without a second call. The key secret never leaves the server, and the status
 * here is the server's view — the app polls this after checkout rather than
 * trusting what the checkout sheet told it, because only the webhook credits.
 */
public record TopUpResponse(
        UUID id,
        long amountPaise,
        ServiceBalanceTopUpStatus status,
        String providerOrderId,
        String providerKeyId,
        String currency,
        /**
         * Where the app sends the owner to pay.
         *
         * <p>A page this server renders, opened in the phone's own browser.
         * Razorpay's checkout is a web SDK, and the alternative — a native
         * checkout module — cannot run in Expo Go, which is how this app is
         * developed.
         */
        String checkoutUrl,
        Instant expiresAt,
        Instant paidAt) {

    public static TopUpResponse of(
            ServiceBalanceTopUp topUp, String providerKeyId, String currency, String checkoutUrl) {
        return new TopUpResponse(
                topUp.getId(),
                topUp.getAmountPaise(),
                topUp.getStatus(),
                topUp.getProviderOrderId(),
                providerKeyId,
                currency,
                checkoutUrl,
                topUp.getExpiresAt(),
                topUp.getPaidAt());
    }
}
