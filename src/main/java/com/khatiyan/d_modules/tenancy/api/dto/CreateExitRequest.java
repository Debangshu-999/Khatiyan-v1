package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.Size;

/**
 * Tenant request to end their tenancy — the single exit route.
 *
 * <p>Replaces the old normal/premature split, which asked the tenant to pick a
 * flow based on state they could not see.
 */
public record CreateExitRequest(
    /**
     * The tenant's preferred last day. Must fall inside the window returned by
     * {@code GET /me/exit-requests/checkout-window}. Null takes the earliest —
     * which for a whole-month notice period is the only date on offer anyway.
     */
    LocalDate chosenCheckoutDate,

    @Size(max = 500) String reason
) {
}
