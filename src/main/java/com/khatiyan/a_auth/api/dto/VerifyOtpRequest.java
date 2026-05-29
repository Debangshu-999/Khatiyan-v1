package com.khatiyan.a_auth.api.dto;

import com.khatiyan.a_auth.model.OtpPurpose;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for checking whether an OTP is valid.
 *
 * <p>This is useful for first-login flows where the client needs to
 * know whether the user must set a PIN after proving phone ownership.
 */
public record VerifyOtpRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Pattern(regexp = "\\d{6}") String otp,
    @NotNull OtpPurpose purpose
) {}
