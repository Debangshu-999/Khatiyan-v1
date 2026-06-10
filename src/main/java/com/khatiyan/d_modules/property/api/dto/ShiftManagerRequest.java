package com.khatiyan.d_modules.property.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Reassigns a manager from one owner-owned property to another.
 */
public record ShiftManagerRequest(
    @NotNull UUID targetPropertyId
) {
}
