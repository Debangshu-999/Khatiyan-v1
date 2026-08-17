package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Owner-raised one-off bill: a charge that does not belong to any rent cycle.
 *
 * <p>
 * This exists because a live rent cycle is frozen — once its payment window
 * opens nothing can be added to it. Anything that cannot wait for the next
 * cycle has to become a bill of its own.
 */
public record CreateOneOffBillRequest(
    @NotBlank(message = "Reason is required")
    @Size(max = 120, message = "Reason must be at most 120 characters")
    String reason,

    @Min(value = 1, message = "Amount must be greater than zero")
    long amountPaise
) {
}
