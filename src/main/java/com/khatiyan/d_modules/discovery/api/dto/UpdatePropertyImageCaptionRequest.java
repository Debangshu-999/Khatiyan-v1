package com.khatiyan.d_modules.discovery.api.dto;

import jakarta.validation.constraints.Size;

/**
 * Renames what a listing photo is a photo of.
 *
 * <p>Blank and absent both mean "no caption" — clearing one is a normal edit,
 * not a separate endpoint.
 */
public record UpdatePropertyImageCaptionRequest(

    @Size(max = 50)
    String caption
) {
}
