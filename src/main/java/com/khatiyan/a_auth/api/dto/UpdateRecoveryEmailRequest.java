package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateRecoveryEmailRequest(
    @NotBlank @Email @Size(max = 254) String email
) {}