package com.khatiyan.d_modules.verification.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record SubmitOtpRequest(
        @NotBlank(message = "Enter the code")
        @Pattern(regexp = "^[0-9]{6}$", message = "The code is 6 digits")
        String otp) {
}
