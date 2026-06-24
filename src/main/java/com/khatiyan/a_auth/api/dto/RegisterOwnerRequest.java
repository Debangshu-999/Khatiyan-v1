package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterOwnerRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Email @Size(max = 254) String email,
    @NotBlank @Size(max = 120) String fullName
) {}