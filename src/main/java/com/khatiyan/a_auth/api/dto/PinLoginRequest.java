package com.khatiyan.a_auth.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for daily login with phone and PIN.
 *
 * <p>Successful login returns a JWT access token. Wrong phone/PIN
 * combinations should receive a generic validation error.
 */
public record PinLoginRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Pattern(regexp = "\\d{6}") String pin,
    /**
     * The session to end before signing in, chosen from the list returned when
     * the device cap was hit.
     *
     * <p>Honoured on this request because the same call verifies credentials —
     * nothing is signed out unless the PIN or the e-mail code checks out first.
     */
    UUID signOutSessionId
) {}
