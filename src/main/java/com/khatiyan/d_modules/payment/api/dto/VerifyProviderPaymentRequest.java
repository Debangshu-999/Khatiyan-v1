package com.khatiyan.d_modules.payment.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Frontend return verification payload.
 *
 * <p>This is useful for instant UI confirmation, but provider webhooks remain
 * the final source of truth for marking billing paid.
 */
public record VerifyProviderPaymentRequest(
        @NotBlank String providerOrderId,
        @NotBlank String providerPaymentId,
        @NotBlank String signature
) {
}
