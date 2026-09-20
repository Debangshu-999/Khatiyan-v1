package com.khatiyan.d_modules.billing.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Why a one-off bill is being cancelled. Shown to the tenant. */
public record CancelOneOffBillRequest(
    @NotBlank(message = "Give a reason for cancelling this bill")
    @Size(max = 200, message = "Reason must be at most 200 characters")
    String reason
) {
}
