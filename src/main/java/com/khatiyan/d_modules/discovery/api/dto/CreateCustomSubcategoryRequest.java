package com.khatiyan.d_modules.discovery.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateCustomSubcategoryRequest(
        @NotNull UUID categoryId,
        @NotBlank @Size(max = 80) String name) {
}
