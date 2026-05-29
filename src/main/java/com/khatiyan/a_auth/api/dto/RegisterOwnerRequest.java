package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for owner self-registration.
 *
 * <p>Registration creates an owner user and starts the OTP flow.
 * The PIN is not set here; it is set only after OTP verification.
 */
public record RegisterOwnerRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Size(max = 120) String fullName
) {}
