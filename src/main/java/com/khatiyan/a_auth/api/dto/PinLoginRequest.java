package com.khatiyan.a_auth.api.dto;

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
    @NotBlank @Pattern(regexp = "\\d{6}") String pin
) {}
