package com.khatiyan.d_modules.tenancy.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateRoomChangeRequest(
    @NotNull UUID targetRoomId,
    @Size(max = 500) String reason
) {
}
