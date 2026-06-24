package com.khatiyan.d_modules.property.api.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request to edit the reason / until-date of a room already under maintenance.
 */
public record UpdateRoomMaintenanceRequest(
    @NotBlank @Size(max = 280) String reason,
    Instant until
) {
}
