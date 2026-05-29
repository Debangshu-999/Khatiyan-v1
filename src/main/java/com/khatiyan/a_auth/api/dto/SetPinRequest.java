package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for setting a PIN for the first time.
 *
 * <p>The OTP is submitted with the new PIN so the flow stays stateless;
 * the server does not need to remember a temporary "OTP verified"
 * session between requests.
 */
public record SetPinRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Pattern(regexp = "\\d{6}") String otp,
    @NotBlank @Pattern(regexp = "\\d{6}") String pin
) {}
