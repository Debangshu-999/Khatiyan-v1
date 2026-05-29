package com.khatiyan.a_auth.firebase.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for Firebase-backed account registration.
 */
public record FirebaseRegisterRequest(
    @NotBlank String idToken,
    @NotBlank @Size(max = 120) String fullName
) {
}
