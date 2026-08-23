package com.khatiyan.a_auth.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record EmailLoginConfirmRequest(
    @NotBlank @Email @Size(max = 254) String email,
    @NotBlank @Pattern(regexp = "\\d{6}") String otp,
    /**
     * The session to end before signing in, chosen from the list returned when
     * the device cap was hit.
     *
     * <p>Honoured on this request because the same call verifies credentials —
     * nothing is signed out unless the PIN or the e-mail code checks out first.
     */
    UUID signOutSessionId
) {}