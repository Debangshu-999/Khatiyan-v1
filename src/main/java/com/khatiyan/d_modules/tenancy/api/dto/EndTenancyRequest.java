package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record EndTenancyRequest(
    @NotNull LocalDate endDate,
    @Size(max = 500) String reason
) {}
