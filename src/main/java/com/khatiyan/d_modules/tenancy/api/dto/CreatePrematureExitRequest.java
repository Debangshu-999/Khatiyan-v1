package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Tenant request for a custom-date premature exit.
 */
public record CreatePrematureExitRequest(
    @NotNull LocalDate requestedCheckoutDate,
    @Size(max = 500) String reason
) {
}
