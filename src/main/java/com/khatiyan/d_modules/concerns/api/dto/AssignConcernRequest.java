package com.khatiyan.d_modules.concerns.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Request body used by management to assign a concern to an owner or manager.
 */
public record AssignConcernRequest(

    @NotNull
    UUID assignedToUserId
) {
}
