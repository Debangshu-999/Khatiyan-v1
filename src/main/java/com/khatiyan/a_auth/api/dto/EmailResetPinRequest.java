package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record EmailResetPinRequest(
    @NotBlank @Email(message = "Enter a valid email address") @Size(max = 254) String email,
    @NotBlank @Pattern(regexp = "\\d{6}") String otp,
    @NotBlank @Pattern(regexp = "\\d{6}") String newPin
) {}