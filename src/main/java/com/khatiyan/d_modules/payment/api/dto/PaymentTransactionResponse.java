package com.khatiyan.d_modules.payment.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.payment.model.PaymentMethod;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;
import com.khatiyan.d_modules.payment.model.PaymentTransaction;
import com.khatiyan.d_modules.payment.model.PaymentTransactionStatus;

/**
 * API response for a provider-side payment attempt.
 *
 * <p>A payment order may have multiple attempts if the tenant retries checkout.
 */
public record PaymentTransactionResponse(
        UUID id,
        UUID paymentOrderId,
        PaymentProviderType provider,
        String providerOrderId,
        String providerPaymentId,
        long amountPaise,
        String currency,
        PaymentTransactionStatus status,
        PaymentMethod method,
        String providerStatus,
        String failureCode,
        String failureReason,
        Instant paidAt,
        Instant createdAt,
        Instant updatedAt) {

    public static PaymentTransactionResponse from(PaymentTransaction transaction) {
        return new PaymentTransactionResponse(
                transaction.getId(),
                transaction.getPaymentOrderId(),
                transaction.getProvider(),
                transaction.getProviderOrderId(),
                transaction.getProviderPaymentId(),
                transaction.getAmountPaise(),
                transaction.getCurrency(),
                transaction.getStatus(),
                transaction.getMethod(),
                transaction.getProviderStatus(),
                transaction.getFailureCode(),
                transaction.getFailureReason(),
                transaction.getPaidAt(),
                transaction.getCreatedAt(),
                transaction.getUpdatedAt());
    }
}
