package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for confirming a PIN reset.
 *
 * <p>The OTP must be a PIN reset OTP. A login OTP should not be valid
 * for this flow.
 */
public record ResetPinRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Pattern(regexp = "\\d{6}") String otp,
    @NotBlank @Pattern(regexp = "\\d{6}") String newPin
) {}
