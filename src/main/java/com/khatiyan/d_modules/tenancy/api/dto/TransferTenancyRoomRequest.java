package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Request body for moving a tenant to another room.
 *
 * <p>
 * Room transfer keeps the same tenancy and billing/deposit identity. The new
 * rent is copied from the target room by the tenancy service.
 */
public record TransferTenancyRoomRequest(
    @NotNull UUID newRoomId,
    @NotNull LocalDate transferDate
) {
}
