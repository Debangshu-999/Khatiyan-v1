package com.khatiyan.d_modules.payment.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Client-observed Razorpay checkout failure payload.
 *
 * <p>
 * This is useful for support/debug visibility, but it is not treated as the
 * final provider truth. Webhooks still remain authoritative for reconciliation.
 */
public record RecordClientPaymentFailureRequest(
        String providerOrderId,
        String providerPaymentId,
        @NotBlank String errorCode,
        String errorDescription,
        String errorSource,
        String errorStep,
        String errorReason
) {
}
