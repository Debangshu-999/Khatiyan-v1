package com.khatiyan.d_modules.concerns.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body used by management to mark a concern resolved.
 */
public record ResolveConcernRequest(

    @NotBlank
    @Size(max = 1000)
    String resolutionNote
) {
}
