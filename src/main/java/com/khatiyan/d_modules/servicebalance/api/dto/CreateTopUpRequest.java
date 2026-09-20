package com.khatiyan.d_modules.servicebalance.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * How much the owner wants to add.
 *
 * <p>Boxed rather than a primitive: a client that omits the field must be told
 * what is missing, and Jackson 3 refuses a missing primitive by rejecting the
 * whole body with no field name in it.
 *
 * <p>The real bounds live in configuration and are checked in the service. This
 * only rules out the nonsense cases.
 */
public record CreateTopUpRequest(
        @NotNull(message = "Enter an amount to add")
        @Positive(message = "Enter an amount to add")
        Long amountPaise) {
}
