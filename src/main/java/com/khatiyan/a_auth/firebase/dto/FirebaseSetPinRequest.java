package com.khatiyan.a_auth.firebase.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Request body for setting the first PIN after Firebase phone verification.
 */
public record FirebaseSetPinRequest(
    @NotBlank String idToken,
    @NotBlank @Pattern(regexp = "\\d{6}") String pin
) {}
