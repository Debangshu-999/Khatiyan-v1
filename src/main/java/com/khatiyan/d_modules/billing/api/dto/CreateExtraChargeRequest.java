package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Request to add an owner/manager extra charge to a billing cycle. It is always
 * added to the bill (2026-09-28): the "adjust from deposit" option was removed,
 * because taking money from a deposit is the deposit manager's job.
 */
public record CreateExtraChargeRequest(

    @NotBlank
    @Size(max = 120)
    String label,

    @Size(max = 500)
    String description,

    @Positive
    long amountPaise
) {
}
