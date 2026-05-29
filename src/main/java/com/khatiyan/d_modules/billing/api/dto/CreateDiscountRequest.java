package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Request to add a discount line to an unpaid billing cycle.
 */
public record CreateDiscountRequest(

    @NotBlank
    @Size(max = 120)
    String label,

    @Size(max = 500)
    String description,

    @Positive
    long amountPaise
) {
}
