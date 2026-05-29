package com.khatiyan.d_modules.concerns.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Image reference supplied by the frontend after direct upload.
 */
public record ConcernPhotoRequest(

    @NotBlank
    @Size(max = 500)
    String photoUrl,

    @Size(max = 200)
    String photoPublicId
) {
}
