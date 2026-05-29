package com.khatiyan.d_modules.tenancy.api.dto;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Request body for correcting tenancy setup terms before billing starts.
 *
 * <p>Identity, room, property, start date, and status fields are intentionally
 * excluded because those belong to lifecycle flows.
 */
public record UpdateTenancyRequest(
    @Positive Long rentAmountPaise,
    @PositiveOrZero Long depositAmountPaise
) {
}
