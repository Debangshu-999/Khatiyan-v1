package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterUserRequest(
    @NotBlank @Size(max = 15) String phone,
    // Recovery email is optional for tenants — they can add it later in profile.
    // Still validated as an email when a value is provided (@Email allows blank).
    @Email(message = "Enter a valid email address") @Size(max = 254) String email,
    @NotBlank @Size(max = 120) String fullName
) {}