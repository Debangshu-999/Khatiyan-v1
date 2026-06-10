package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Request body for changing the authenticated user's PIN.
 *
 * <p>The current PIN proves local knowledge of the credential, while the
 * PIN reset OTP proves phone ownership before the credential is replaced.
 */
public record ChangePinRequest(
        @NotBlank @Pattern(regexp = "\\d{6}") String currentPin,
        @NotBlank @Pattern(regexp = "\\d{6}") String otp,
        @NotBlank @Pattern(regexp = "\\d{6}") String newPin) {
}
