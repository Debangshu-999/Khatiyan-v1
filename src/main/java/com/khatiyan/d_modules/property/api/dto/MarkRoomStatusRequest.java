package com.khatiyan.d_modules.property.api.dto;

import java.time.Instant;

import com.khatiyan.d_modules.property.model.RoomStatus;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request to mark a room vacant or under maintenance. {@code reason} and
 * {@code until} apply only when {@code status} is {@code MAINTENANCE}.
 */
public record MarkRoomStatusRequest(
    @NotNull RoomStatus status,
    @Size(max = 280) String reason,
    Instant until
) {
}
