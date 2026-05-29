package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Owner/manager approval payload for normal or premature exit requests.
 */
public record ApproveTenancyExitRequest(
    LocalDate approvedCheckoutDate,
    @PositiveOrZero Long finalBillingAmountPaise,
    Boolean depositPayable,
    @PositiveOrZero Long depositSettlementAmountPaise,
    @Size(max = 500) String adminNotes
) {
}
