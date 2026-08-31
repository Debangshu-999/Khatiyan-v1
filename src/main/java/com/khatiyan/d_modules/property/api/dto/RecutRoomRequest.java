package com.khatiyan.d_modules.property.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/** Moving a room onto a different mold — the upgrade path. */
public record RecutRoomRequest(@NotNull UUID moldId) {
}
