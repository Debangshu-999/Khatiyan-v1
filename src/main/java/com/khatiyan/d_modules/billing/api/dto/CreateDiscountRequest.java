package com.khatiyan.d_modules.billing.api.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Request to add a discount line to an unpaid billing cycle.
 *
 * <p>The discount is given as a percentage and converted to a money amount
 * against the billing cycle's current total when applied.
 */
public record CreateDiscountRequest(

    @NotBlank
    @Size(max = 120)
    String label,

    @Size(max = 500)
    String description,

    @NotNull
    @Positive
    @DecimalMax(value = "100.0")
    BigDecimal discountPercent
) {
}
