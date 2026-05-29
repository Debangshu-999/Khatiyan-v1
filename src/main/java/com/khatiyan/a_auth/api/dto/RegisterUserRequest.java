package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for normal user self-registration.
 *
 * <p>Registration creates a USER account and starts the first PIN setup
 * verification flow. The PIN is set only after OTP verification.
 */
public record RegisterUserRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Size(max = 120) String fullName
) {}
