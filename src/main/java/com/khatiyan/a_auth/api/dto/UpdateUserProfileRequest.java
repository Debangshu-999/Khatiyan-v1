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
    String fullName
) {
}
