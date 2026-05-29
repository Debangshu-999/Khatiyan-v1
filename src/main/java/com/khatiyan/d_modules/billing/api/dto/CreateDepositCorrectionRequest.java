package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Request to correct a tenant deposit balance from the deposit manager.
 *
 * <p>
 * Corrections are not billing-cycle payable lines. They directly create deposit
 * ledger movements after owner/manager review.
 */
public record CreateDepositCorrectionRequest(

    @NotBlank
    @Size(max = 300)
    String reason,

    @Positive
    long amountPaise
) {
}
