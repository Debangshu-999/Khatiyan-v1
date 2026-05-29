package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Request to add an owner/manager extra charge to a billing cycle.
 */
public record CreateExtraChargeRequest(

    @NotBlank
    @Size(max = 120)
    String label,

    @Size(max = 500)
    String description,

    @Positive
    long amountPaise,

    boolean adjustFromDeposit
) {
}
