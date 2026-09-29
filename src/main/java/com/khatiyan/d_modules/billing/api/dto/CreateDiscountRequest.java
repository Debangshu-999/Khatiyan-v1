package com.khatiyan.d_modules.billing.api.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Request to add a discount line to an unpaid billing cycle.
 *
 * <p>Given as a percentage of the bill's current total OR as an amount off,
 * exactly one of the two (2026-09-28). The server works out the money from a
 * percentage. The owner's screen fills the other field in as they type, but
 * only the one they typed is sent.
 */
public record CreateDiscountRequest(

    @NotBlank
    @Size(max = 120)
    String label,

    @Size(max = 500)
    String description,

    /**
     * A percentage of the bill's current total, under 100: a discount never
     * takes the whole bill. Null when an amount is given.
     */
    @Positive
    @DecimalMax(value = "100.0", inclusive = false)
    BigDecimal discountPercent,

    /**
     * An amount off, in paise. Null when a percentage is given. Boxed, so a
     * client that sends only the percentage is not refused for leaving it out.
     */
    @Positive
    Long discountAmountPaise
) {
}
