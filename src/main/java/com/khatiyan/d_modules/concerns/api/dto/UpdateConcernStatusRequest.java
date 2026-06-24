package com.khatiyan.d_modules.concerns.api.dto;

import com.khatiyan.d_modules.concerns.model.ConcernStatus;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body used by management to move a concern through active states.
 */
public record UpdateConcernStatusRequest(

    @NotNull
    ConcernStatus status,

    @Size(max = 1000)
    String statusNote
) {
}
