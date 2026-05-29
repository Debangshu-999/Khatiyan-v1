package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.Positive;

/**
 * Temporary request for manually marking a billing cycle as paid.
 *
 * <p>
 * The payment module will later call this flow after provider confirmation.
 * Until then, this request lets us test the cycle payment path.
 */
public record RecordPaymentSuccessRequest(

    @Positive
    long paidAmountPaise
) {
}
