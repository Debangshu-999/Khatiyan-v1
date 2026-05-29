package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request to settle a tenancy deposit account at exit/refund time.
 */
public record SettleDepositRequest(

    @NotBlank
    @Size(max = 300)
    String reason
) {
}
