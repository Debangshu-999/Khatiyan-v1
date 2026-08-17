package com.khatiyan.d_modules.discovery.api.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Images already uploaded to storage, being attached to a property.
 *
 * <p>A batch rather than one call per image: the client uploads everything the
 * owner picked before it calls this, so one round trip attaches the lot and the
 * ten-image ceiling is checked once against the real total.
 */
public record AddPropertyImagesRequest(
        @NotEmpty
        @Size(max = 10)
        @Valid
        List<Image> images
) {

    public record Image(
            @NotBlank
            @Size(max = 600)
            String url,

            /** Cloudinary handle. Absent only for legacy rows; new uploads always have one. */
            @Size(max = 255)
            String publicId
    ) {
    }
}
