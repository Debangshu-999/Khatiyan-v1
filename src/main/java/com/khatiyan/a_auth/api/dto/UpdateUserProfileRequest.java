package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body used by the authenticated user to update their profile.
 *
 * <p>Phone number changes are intentionally excluded because they need
 * a separate OTP and re-verification flow.
 */
public record UpdateUserProfileRequest(

    @NotBlank
    @Size(max = 120)
    String fullName,

    /**
     * Stored photo URL, or blank to remove the photo.
     *
     * <p>Null means "leave it alone" and blank means "clear it" — two different
     * intentions that a single nullable field would otherwise conflate. The
     * screen that only renames someone sends null and keeps their photo.
     */
    @Size(max = 500)
    String profilePhotoUrl,

    /**
     * Cloudinary handle for the same upload. Stored beside the URL because
     * without it the old asset can never be deleted, only orphaned.
     */
    @Size(max = 255)
    String profilePhotoPublicId
) {
}
