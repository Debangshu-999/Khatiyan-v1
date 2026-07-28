package com.khatiyan.d_modules.payment.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SetupPayoutAccountRequest(
        @NotBlank @Size(max = 160) String accountHolderName,
        @NotBlank @Pattern(regexp = "\\d{9,18}", message = "Enter a valid bank account number") String accountNumber,
        @NotBlank @Pattern(regexp = "[A-Za-z]{4}0[A-Za-z0-9]{6}", message = "Enter a valid IFSC code") String ifsc,
        // 5 letters, 4 digits, 1 letter. The 4th letter encodes the holder type
        // (P = individual, C = company, H = HUF, F = firm), which is what the
        // TDS threshold rule turns on.
        @NotBlank @Pattern(regexp = "[A-Za-z]{5}[0-9]{4}[A-Za-z]", message = "Enter a valid PAN") String pan) {
}
