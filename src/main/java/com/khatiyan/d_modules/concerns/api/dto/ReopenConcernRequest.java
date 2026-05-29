package com.khatiyan.d_modules.concerns.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body used by a tenant to reopen a recently resolved concern.
 */
public record ReopenConcernRequest(

    @NotBlank
    @Size(max = 1000)
    String reopenReason
) {
}
