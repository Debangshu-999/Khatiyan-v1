package com.khatiyan.d_modules.concerns.api.dto;

import java.util.List;

import com.khatiyan.d_modules.concerns.model.ConcernCategory;
import com.khatiyan.d_modules.concerns.model.ConcernPriority;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body used by a tenant to raise a concern for their active tenancy.
 */
public record CreateConcernRequest(

    @NotNull
    ConcernCategory category,

    @NotNull
    ConcernPriority priority,

    @NotBlank
    @Size(max = 160)
    String title,

    @NotBlank
    @Size(max = 1000)
    String description,

    @Valid
    @Size(max = 4)
    List<ConcernPhotoRequest> photos
) {
}
