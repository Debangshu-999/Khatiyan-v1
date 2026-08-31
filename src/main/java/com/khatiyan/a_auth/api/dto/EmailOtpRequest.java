package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmailOtpRequest(
    @NotBlank @Email(message = "Enter a valid email address") @Size(max = 254) String email
) {}